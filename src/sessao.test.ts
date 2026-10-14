import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT } from 'jose'
process.env.NODE_ENV ??= 'test'
process.env.PORT ??= '3000'
process.env.CORS_ORIGIN ??= 'http://localhost:5173'
process.env.DATABASE_URL ??= 'postgresql://mindcheck:mindcheck@localhost:5432/mindcheck'
process.env.JWT_SEGREDO ??= 'segredo-de-teste-com-32-caracteres-ok'
process.env.JWT_ACCESS_SEGUNDOS ??= '900'
process.env.REFRESH_DIAS ??= '7'
process.env.TERMOS_VERSAO ??= '1.0'
vi.mock('./config/prisma.js', () => ({ prisma: { sessao: { findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() } } }))
const { prisma } = await import('./config/prisma.js')
const { app } = await import('./app.js')
const { emitirAccessToken, hashRefreshToken } = await import('./utils/tokens.js')
const usuario = { id: 7, nome: 'Conta Teste', email: 'teste@example.test', papel: 'usuario' as const, senha_hash: 'privado' }
const refreshToken = 'A'.repeat(43)
const sessao = { id: 4, usuario_id: 7, usuario, refresh_token_hash: hashRefreshToken(refreshToken), expira_em: new Date(Date.now() + 86400000) }

describe('sessão', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue(sessao as never)
    vi.mocked(prisma.sessao.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked(prisma.sessao.deleteMany).mockResolvedValue({ count: 1 })
  })
  it('retorna somente dados públicos de /me com JWT e sessão válidos', async () => {
    const response = await request(app).get('/auth/me').auth(await emitirAccessToken(usuario, 4), { type: 'bearer' })
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.usuario).toEqual({ id: 7, nome: usuario.nome, email: usuario.email, papel: 'usuario' })
    expect(JSON.stringify(response.body)).not.toContain('privado')
  })
  it.each([undefined, 'inventado'])('recusa credencial ausente ou falsa (%s)', async token => {
    const response = await request(app).get('/auth/me').set('Authorization', token ? `Bearer ${token}` : '')
    expect(response.status).toBe(401)
    expect(prisma.sessao.findUnique).not.toHaveBeenCalled()
  })
  it('recusa sessão apagada pelo logout mesmo com JWT assinado', async () => {
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue(null)
    expect((await request(app).get('/auth/me').auth(await emitirAccessToken(usuario, 4), { type: 'bearer' })).status).toBe(401)
  })
  it('recusa JWT expirado, emissor/audiência errados e usuário divergente', async () => {
    for (const extra of [{ exp: 1, iss: 'mindcheck', aud: 'mindcheck-api' }, { exp: 9999999999, iss: 'outro', aud: 'mindcheck-api' }, { exp: 9999999999, iss: 'mindcheck', aud: 'outro' }]) {
      const token = await new SignJWT({ sub: '7', sid: 4, ...extra }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(process.env.JWT_SEGREDO))
      expect((await request(app).get('/auth/me').auth(token, { type: 'bearer' })).status).toBe(401)
    }
    expect((await request(app).get('/auth/me').auth(await emitirAccessToken({ ...usuario, id: 9 }, 4), { type: 'bearer' })).status).toBe(401)
  })
  it('renova com rotação condicional e validade absoluta preservada', async () => {
    const response = await request(app).post('/auth/refresh').send({ refreshToken })
    expect(response.status).toBe(200)
    expect(response.body.refreshToken).not.toBe(refreshToken)
    expect(response.body.expiraEm).toBe(sessao.expira_em.toISOString())
    expect(prisma.sessao.updateMany).toHaveBeenCalledWith({
      where: { id: 4, refresh_token_hash: hashRefreshToken(refreshToken), expira_em: { gt: expect.any(Date) } },
      data: { refresh_token_hash: hashRefreshToken(response.body.refreshToken) },
    })
  })
  it('recusa replay e disputa de rotação', async () => {
    vi.mocked(prisma.sessao.updateMany).mockResolvedValue({ count: 0 })
    expect((await request(app).post('/auth/refresh').send({ refreshToken })).status).toBe(401)
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue(null)
    expect((await request(app).post('/auth/refresh').send({ refreshToken })).status).toBe(401)
  })
  it('recusa refresh expirado sem atualizar', async () => {
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue({ ...sessao, expira_em: new Date(0) } as never)
    expect((await request(app).post('/auth/refresh').send({ refreshToken })).status).toBe(401)
    expect(prisma.sessao.updateMany).not.toHaveBeenCalled()
  })
  it('logout idempotente exclui somente o hash recebido', async () => {
    expect((await request(app).post('/auth/logout').send({ refreshToken })).status).toBe(204)
    expect(prisma.sessao.deleteMany).toHaveBeenCalledWith({ where: { refresh_token_hash: hashRefreshToken(refreshToken) } })
    vi.mocked(prisma.sessao.deleteMany).mockResolvedValue({ count: 0 })
    expect((await request(app).post('/auth/logout').send({ refreshToken })).status).toBe(204)
  })
  it('JWT expirado só pode revogar a própria sessão, nunca acessar /me', async () => {
    const token = await new SignJWT({ sub: '7', sid: 4, iss: 'mindcheck', aud: 'mindcheck-api', exp: 1 })
      .setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(process.env.JWT_SEGREDO))
    expect((await request(app).get('/auth/me').auth(token, { type: 'bearer' })).status).toBe(401)
    expect((await request(app).post('/auth/logout').auth(token, { type: 'bearer' }).send({ refreshToken })).status).toBe(204)
    expect(prisma.sessao.deleteMany).toHaveBeenCalledWith({ where: { id: 4, usuario_id: 7 } })
  })
  it.each(['/auth/refresh', '/auth/logout'])('valida %s sem ecoar o token', async path => {
    const response = await request(app).post(path).send({ refreshToken: 'segredo-invalido' })
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).not.toContain('segredo-invalido')
  })
})
