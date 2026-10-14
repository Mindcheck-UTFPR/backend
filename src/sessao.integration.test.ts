import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const enabled = process.env.RUN_DB_TESTS === '1'
describe.runIf(enabled)('sessão com PostgreSQL real', () => {
  let app: typeof import('./app.js').app
  let prisma: typeof import('./config/prisma.js').prisma
  let userId: number | undefined
  const email = `mind18-${randomUUID()}@example.test`
  const senha = 'Senha-isolada-teste-123'
  let accessToken: string
  let refreshToken: string
  beforeAll(async () => {
    // Não permitir que esta suíte faça mutações em qualquer banco fora do ambiente isolado.
    const url = new URL(process.env.DATABASE_URL || '')
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/mindcheck_test') throw new Error('Banco de integração não autorizado')
    ;({ app } = await import('./app.js'))
    ;({ prisma } = await import('./config/prisma.js'))
  })
  afterAll(async () => {
    if (userId) await prisma.usuario.delete({ where: { id: userId } })
    if (prisma) await prisma.$disconnect()
  })
  it('cadastra sem escalada, impede duplicação e verifica senha incorreta', async () => {
    const body = { nome: 'Conta de Integração', email, senha, termosAceitos: true, termosVersao: process.env.TERMOS_VERSAO || '1.0', papel: 'admin' }
    const signup = await request(app).post('/auth/cadastro').send(body)
    expect(signup.status).toBe(201)
    userId = signup.body.usuario.id
    expect(signup.body.usuario.papel).toBe('usuario')
    expect((await request(app).post('/auth/cadastro').send(body)).status).toBe(409)
    expect((await request(app).post('/auth/login').send({ email, senha: 'incorreta' })).status).toBe(401)
    const login = await request(app).post('/auth/login').send({ email, senha })
    expect(login.status).toBe(200)
    accessToken = login.body.accessToken; refreshToken = login.body.refreshToken
    expect((await request(app).get('/auth/me').auth(accessToken, { type: 'bearer' })).body.usuario.id).toBe(userId)
  })
  it('consome refresh uma única vez sob concorrência, sem expor dados sensíveis', async () => {
    const old = refreshToken
    const results = await Promise.all([1, 2].map(() => request(app).post('/auth/refresh').send({ refreshToken: old })))
    expect(results.map(r => r.status).sort()).toEqual([200, 401])
    const success = results.find(r => r.status === 200)!
    refreshToken = success.body.refreshToken
    expect(success.body.usuario).not.toHaveProperty('senha_hash')
    expect((await request(app).post('/auth/refresh').send({ refreshToken: old })).status).toBe(401)
  })
  it('logout revoga refresh e o access token anterior, de forma idempotente', async () => {
    // Mesmo com refresh antigo, JWT identifica a sessão rotacionada para revogação.
    expect((await request(app).post('/auth/logout').auth(accessToken, { type: 'bearer' }).send({ refreshToken: 'A'.repeat(43) })).status).toBe(204)
    expect((await request(app).get('/auth/me').auth(accessToken, { type: 'bearer' })).status).toBe(401)
    expect((await request(app).post('/auth/refresh').send({ refreshToken })).status).toBe(401)
    expect((await request(app).post('/auth/logout').send({ refreshToken })).status).toBe(204)
  })
})
