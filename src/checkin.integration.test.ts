import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe.runIf(process.env.RUN_DB_TESTS === '1')('check-in com PostgreSQL real', () => {
  let app: typeof import('./app.js').app
  let prisma: typeof import('./config/prisma.js').prisma
  let tokenA: string
  let tokenB: string
  const usuarios: number[] = []

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || '')
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/mindcheck_test') throw new Error('Banco de integração não autorizado')
    ;({ app } = await import('./app.js'))
    ;({ prisma } = await import('./config/prisma.js'))
    const { emitirAccessToken } = await import('./utils/tokens.js')
    const tokens: string[] = []
    for (let i = 0; i < 2; i++) {
      const user = await prisma.usuario.create({ data: { nome: 'Conta de Teste', email: `${randomUUID()}@example.test`, senha_hash: 'teste', termos_aceitos_em: new Date(), termos_versao: '1.0' } })
      usuarios.push(user.id)
      const sessao = await prisma.sessao.create({ data: { usuario_id: user.id, refresh_token_hash: randomUUID(), expira_em: new Date(Date.now() + 3600000) } })
      tokens.push(await emitirAccessToken(user, sessao.id))
    }
    ;[tokenA, tokenB] = tokens
  })
  afterAll(async () => {
    if (prisma) {
      await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } })
      await prisma.$disconnect()
    }
  })
  it('cria, consulta, edita, filtra e impede acesso de outra conta', async () => {
    const criado = await request(app).post('/checkins').auth(tokenA, { type: 'bearer' }).send({ humor: 'bom', observacao: 'dado sintético' })
    expect(criado.status).toBe(201)
    expect(criado.body.checkin).toMatchObject({ intensidade: null, observacao: 'dado sintético' })
    const { id, data } = criado.body.checkin
    expect((await request(app).post('/checkins').auth(tokenA, { type: 'bearer' }).send({ humor: 'bom' })).status).toBe(409)
    const hoje = await request(app).get('/checkins/hoje').auth(tokenA, { type: 'bearer' })
    expect(hoje.body.checkin.id).toBe(id)
    const editado = await request(app).patch(`/checkins/${data}`).auth(tokenA, { type: 'bearer' }).send({ observacao: null })
    expect(editado.body.checkin).toMatchObject({ id, humor: 'bom', observacao: null })
    expect((await request(app).get(`/checkins/${id}`).auth(tokenB, { type: 'bearer' })).status).toBe(404)
    const lista = await request(app).get('/checkins?humor=bom&pagina=1&limite=1').auth(tokenA, { type: 'bearer' })
    expect(lista.body).toMatchObject({ checkins: [{ id }], temProxima: false })
    expect((await request(app).get('/checkins/hoje')).status).toBe(401)
  })
})
