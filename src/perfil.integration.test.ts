import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { senhaConfere } from './utils/senha.js'

describe.runIf(process.env.RUN_DB_TESTS === '1')('perfil com PostgreSQL real', () => {
  let app: typeof import('./app.js').app
  let prisma: typeof import('./config/prisma.js').prisma
  let tokenA: string
  let tokenB: string
  let usuarioA = 0
  let usuarioB = 0
  const emailA = `perfil-a-${randomUUID()}@example.test`
  const emailB = `perfil-b-${randomUUID()}@example.test`
  const senhaA = 'Senha-conta-a-teste-123'
  const senhaB = 'Senha-conta-b-teste-123'
  const senhaNova = 'Senha-nova-conta-a-456'

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || '')
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/mindcheck_test') {
      throw new Error('Banco de integração não autorizado')
    }
    ;({ app } = await import('./app.js'))
    ;({ prisma } = await import('./config/prisma.js'))
    const termos = { termosAceitos: true, termosVersao: process.env.TERMOS_VERSAO || '1.0' }
    const cadastroA = await request(app).post('/auth/cadastro').send({ nome: 'Conta Sintética A', email: emailA, senha: senhaA, ...termos })
    const cadastroB = await request(app).post('/auth/cadastro').send({ nome: 'Conta Sintética B', email: emailB, senha: senhaB, ...termos })
    expect(cadastroA.status).toBe(201)
    expect(cadastroB.status).toBe(201)
    usuarioA = cadastroA.body.usuario.id
    usuarioB = cadastroB.body.usuario.id
    const loginA = await request(app).post('/auth/login').send({ email: emailA, senha: senhaA })
    const loginB = await request(app).post('/auth/login').send({ email: emailB, senha: senhaB })
    tokenA = loginA.body.accessToken
    tokenB = loginB.body.accessToken
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.usuario.deleteMany({ where: { id: { in: [usuarioA, usuarioB].filter((id) => id > 0) } } })
      await prisma.$disconnect()
    }
  })

  it('persiste nome e e-mail da própria conta e deixa a outra intacta', async () => {
    const editado = await request(app)
      .patch('/auth/me')
      .auth(tokenA, { type: 'bearer' })
      .send({ nome: 'Nome Persistido A', email: `persistido-${emailA}` })
    expect(editado.status).toBe(200)
    expect(editado.body.usuario).toMatchObject({ id: usuarioA, nome: 'Nome Persistido A', email: `persistido-${emailA}`, papel: 'usuario' })
    expect(editado.body.usuario).not.toHaveProperty('senha_hash')

    const consultaA = await request(app).get('/auth/me').auth(tokenA, { type: 'bearer' })
    expect(consultaA.body.usuario.email).toBe(`persistido-${emailA}`)
    const consultaB = await request(app).get('/auth/me').auth(tokenB, { type: 'bearer' })
    expect(consultaB.body.usuario).toMatchObject({ id: usuarioB, nome: 'Conta Sintética B', email: emailB })

    const invasao = await request(app)
      .patch('/auth/me')
      .auth(tokenA, { type: 'bearer' })
      .send({ id: usuarioB, nome: 'Não pode', email: emailB, papel: 'admin' })
    expect(invasao.status).toBe(400)
    const linhaB = await prisma.usuario.findUnique({ where: { id: usuarioB } })
    expect(linhaB).toMatchObject({ nome: 'Conta Sintética B', email: emailB, papel: 'usuario' })

    const conflito = await request(app)
      .patch('/auth/me')
      .auth(tokenA, { type: 'bearer' })
      .send({ nome: 'Nome Persistido A', email: emailB })
    expect(conflito.status).toBe(409)
    expect(conflito.body.erro.codigo).toBe('EMAIL_EM_USO')
    expect((await prisma.usuario.findUnique({ where: { id: usuarioA } }))?.email).toBe(`persistido-${emailA}`)
  })

  it('troca a senha persistida e mantém a senha da outra conta', async () => {
    const troca = await request(app)
      .post('/auth/senha')
      .auth(tokenA, { type: 'bearer' })
      .send({ senhaAtual: senhaA, novaSenha: senhaNova })
    expect(troca.status).toBe(204)

    const gravada = await prisma.usuario.findUnique({ where: { id: usuarioA } })
    expect(gravada?.senha_hash).not.toContain(senhaNova)
    expect(await senhaConfere(senhaNova, gravada?.senha_hash ?? '')).toBe(true)
    expect((await request(app).post('/auth/login').send({ email: `persistido-${emailA}`, senha: senhaA })).status).toBe(401)
    expect((await request(app).post('/auth/login').send({ email: `persistido-${emailA}`, senha: senhaNova })).status).toBe(200)
    expect((await request(app).post('/auth/login').send({ email: emailB, senha: senhaB })).status).toBe(200)

    const incorreta = await request(app)
      .post('/auth/senha')
      .auth(tokenB, { type: 'bearer' })
      .send({ senhaAtual: senhaA, novaSenha: 'Senha-que-nao-grava-789' })
    expect(incorreta.status).toBe(401)
    expect(await senhaConfere(senhaB, (await prisma.usuario.findUnique({ where: { id: usuarioB } }))?.senha_hash ?? '')).toBe(true)
  })

  it('recusa edição com sessão expirada e não altera a linha', async () => {
    const antes = await prisma.usuario.findUnique({ where: { id: usuarioB } })
    await prisma.sessao.updateMany({ where: { usuario_id: usuarioB }, data: { expira_em: new Date(0) } })
    const response = await request(app)
      .patch('/auth/me')
      .auth(tokenB, { type: 'bearer' })
      .send({ nome: 'Alterado sem sessão', email: `expirado-${emailB}` })
    expect(response.status).toBe(401)
    expect(response.body.erro.codigo).toBe('SESSAO_INVALIDA')
    const depois = await prisma.usuario.findUnique({ where: { id: usuarioB } })
    expect(depois).toMatchObject({ nome: antes?.nome, email: antes?.email })
    expect((await request(app).patch('/auth/me').send({ nome: 'Sem token', email: 'sem-token@example.test' })).status).toBe(401)
  })
})
