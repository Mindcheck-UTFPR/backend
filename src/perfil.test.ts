import { Prisma } from '@prisma/client'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gerarHashSenha, senhaConfere } from './utils/senha.js'

process.env.NODE_ENV ??= 'test'
process.env.PORT ??= '3000'
process.env.CORS_ORIGIN ??= 'http://localhost:5173'
process.env.DATABASE_URL ??= 'postgresql://mindcheck:mindcheck@localhost:5432/mindcheck'
process.env.JWT_SEGREDO ??= 'segredo-de-teste-com-32-caracteres-ok'
process.env.JWT_ACCESS_SEGUNDOS ??= '900'
process.env.REFRESH_DIAS ??= '7'
process.env.TERMOS_VERSAO ??= '1.0'

vi.mock('./config/prisma.js', () => ({
  prisma: {
    sessao: { findUnique: vi.fn() },
    usuario: { update: vi.fn(), findUnique: vi.fn() },
  },
}))

const { prisma } = await import('./config/prisma.js')
const { app } = await import('./app.js')
const { emitirAccessToken } = await import('./utils/tokens.js')

const usuarioA = {
  id: 7,
  nome: 'Conta Teste A',
  email: 'teste-a@example.test',
  papel: 'usuario' as const,
  senha_hash: 'privado',
}
const usuarioB = {
  id: 8,
  nome: 'Conta Teste B',
  email: 'teste-b@example.test',
  papel: 'usuario' as const,
  senha_hash: 'privado-b',
}
const sessaoA = { id: 4, usuario_id: 7, usuario: usuarioA, expira_em: new Date(Date.now() + 86400000) }
const sessaoB = { id: 5, usuario_id: 8, usuario: usuarioB, expira_em: new Date(Date.now() + 86400000) }

function sessaoPorId(id: number) {
  if (id === 4) return sessaoA
  if (id === 5) return sessaoB
  return null
}

describe('edição do próprio perfil', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.sessao.findUnique).mockImplementation((({ where }: { where: { id: number } }) => {
      return Promise.resolve(sessaoPorId(where.id))
    }) as never)
    vi.mocked(prisma.usuario.update).mockImplementation((async (args: { where: { id: number }; data: { nome?: string; email?: string; senha_hash?: string } }) => {
      const base = args.where.id === 8 ? usuarioB : usuarioA
      return { ...base, ...args.data, id: args.where.id }
    }) as never)
  })

  it('atualiza somente nome e e-mail da sessão e devolve o usuário público', async () => {
    const token = await emitirAccessToken(usuarioA, 4)
    const response = await request(app)
      .patch('/auth/me')
      .auth(token, { type: 'bearer' })
      .send({ nome: '  Nome Novo  ', email: 'Novo@Example.Test' })

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.usuario).toEqual({ id: 7, nome: 'Nome Novo', email: 'novo@example.test', papel: 'usuario' })
    expect(JSON.stringify(response.body)).not.toContain('privado')
    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { nome: 'Nome Novo', email: 'novo@example.test' },
      select: { id: true, nome: true, email: true, papel: true },
    })
  })

  it('não grava outra conta nem papel, senha ou foto enviados no corpo', async () => {
    const token = await emitirAccessToken(usuarioA, 4)
    const response = await request(app)
      .patch('/auth/me')
      .auth(token, { type: 'bearer' })
      .send({ id: 8, nome: 'Invasor', email: 'invasor@example.test', papel: 'admin', senha: 'outra-senha', foto: 'avatar' })

    expect(response.status).toBe(400)
    expect(response.body.erro.codigo).toBe('ENTRADA_INVALIDA')
    expect(response.body.erro.detalhes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: 'id', mensagem: 'Este campo não pode ser alterado.' }),
        expect.objectContaining({ campo: 'papel', mensagem: 'Este campo não pode ser alterado.' }),
        expect.objectContaining({ campo: 'senha', mensagem: 'Este campo não pode ser alterado.' }),
        expect.objectContaining({ campo: 'foto', mensagem: 'Este campo não pode ser alterado.' }),
      ]),
    )
    expect(prisma.usuario.update).not.toHaveBeenCalled()
  })

  it('recusa nome e e-mail fora da regra do cadastro', async () => {
    const token = await emitirAccessToken(usuarioA, 4)
    const response = await request(app)
      .patch('/auth/me')
      .auth(token, { type: 'bearer' })
      .send({ nome: 'A', email: 'sem-arroba' })

    expect(response.status).toBe(400)
    expect(response.body.erro).toMatchObject({ codigo: 'ENTRADA_INVALIDA', mensagem: 'Os dados enviados são inválidos.' })
    expect(response.body.erro.detalhes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: 'nome', mensagem: 'O nome deve ter no mínimo 2 caracteres.' }),
        expect.objectContaining({ campo: 'email', mensagem: 'Informe um e-mail válido.' }),
      ]),
    )
    expect(prisma.usuario.update).not.toHaveBeenCalled()
  })

  it('responde 409 quando o e-mail pertence a outra conta', async () => {
    vi.mocked(prisma.usuario.update).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.19.3' }),
    )
    const token = await emitirAccessToken(usuarioA, 4)
    const response = await request(app)
      .patch('/auth/me')
      .auth(token, { type: 'bearer' })
      .send({ nome: 'Conta Teste A', email: usuarioB.email })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      erro: { codigo: 'EMAIL_EM_USO', mensagem: 'Este e-mail já está cadastrado.' },
    })
    expect(prisma.usuario.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }))
  })

  it.each([
    ['ausente', ''],
    ['falsa', 'Bearer inventado'],
  ])('recusa sessão %s na edição', async (_caso, authorization) => {
    const response = await request(app).patch('/auth/me').set('Authorization', authorization).send({ nome: 'Nome Valido', email: 'valido@example.test' })
    expect(response.status).toBe(401)
    expect(response.body.erro.codigo).toBe('SESSAO_INVALIDA')
    expect(prisma.usuario.update).not.toHaveBeenCalled()
  })

  it('recusa sessão expirada antes de gravar', async () => {
    sessaoA.expira_em = new Date(0)
    const token = await emitirAccessToken(usuarioA, 4)
    const response = await request(app).patch('/auth/me').auth(token, { type: 'bearer' }).send({ nome: 'A', email: 'invalido' })
    expect(response.status).toBe(401)
    expect(response.body.erro).toMatchObject({ codigo: 'SESSAO_INVALIDA', mensagem: 'Sua sessão expirou. Entre novamente.' })
    expect(prisma.usuario.update).not.toHaveBeenCalled()
    sessaoA.expira_em = new Date(Date.now() + 86400000)
  })

  it('grava a conta do token, nunca a conta citada por outro identificador válido', async () => {
    const tokenB = await emitirAccessToken(usuarioB, 5)
    const response = await request(app)
      .patch('/auth/me')
      .auth(tokenB, { type: 'bearer' })
      .send({ nome: 'Somente B', email: 'somente-b@example.test' })

    expect(response.status).toBe(200)
    expect(response.body.usuario.id).toBe(8)
    expect(prisma.usuario.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 8 } }))
    expect(prisma.usuario.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }))
  })

  it('troca a senha da própria conta sem devolver o segredo', async () => {
    const hashAtual = await gerarHashSenha('senha-atual-ok')
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ senha_hash: hashAtual } as never)
    const token = await emitirAccessToken(usuarioA, 4)
    const response = await request(app)
      .post('/auth/senha')
      .auth(token, { type: 'bearer' })
      .send({ senhaAtual: 'senha-atual-ok', novaSenha: 'senha-nova-ok' })

    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    const gravado = vi.mocked(prisma.usuario.update).mock.calls[0]?.[0] as { where: { id: number }; data: { senha_hash: string } }
    expect(gravado.where).toEqual({ id: 7 })
    expect(gravado.data.senha_hash).not.toBe('senha-nova-ok')
    expect(await senhaConfere('senha-nova-ok', gravado.data.senha_hash)).toBe(true)
    expect(gravado.data).not.toHaveProperty('email')
    expect(gravado.data).not.toHaveProperty('papel')
  })

  it('recusa senha atual incorreta e não grava hash novo', async () => {
    const hashAtual = await gerarHashSenha('senha-atual-ok')
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ senha_hash: hashAtual } as never)
    const token = await emitirAccessToken(usuarioA, 4)
    const response = await request(app)
      .post('/auth/senha')
      .auth(token, { type: 'bearer' })
      .send({ senhaAtual: 'senha-errada-ok', novaSenha: 'senha-nova-ok' })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({
      erro: { codigo: 'SENHA_ATUAL_INVALIDA', mensagem: 'A senha atual está incorreta.' },
    })
    expect(JSON.stringify(response.body)).not.toContain('senha-errada-ok')
    expect(prisma.usuario.update).not.toHaveBeenCalled()
  })

  it('recusa senha fora da regra e campos que não fazem parte da troca', async () => {
    const token = await emitirAccessToken(usuarioA, 4)
    const response = await request(app)
      .post('/auth/senha')
      .auth(token, { type: 'bearer' })
      .send({ senhaAtual: '', novaSenha: 'curta', confirmacao: 'curta', email: 'outro@example.test' })

    expect(response.status).toBe(400)
    expect(response.body.erro.codigo).toBe('ENTRADA_INVALIDA')
    expect(response.body.erro.detalhes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: 'senhaAtual', mensagem: 'Informe sua senha atual.' }),
        expect.objectContaining({ campo: 'novaSenha', mensagem: 'A senha deve ter no mínimo 8 caracteres.' }),
        expect.objectContaining({ campo: 'confirmacao', mensagem: 'Este campo não pode ser alterado.' }),
        expect.objectContaining({ campo: 'email', mensagem: 'Este campo não pode ser alterado.' }),
      ]),
    )
    expect(JSON.stringify(response.body)).not.toContain('curta')
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
    expect(prisma.usuario.update).not.toHaveBeenCalled()
  })

  it('recusa troca de senha sem sessão e não consulta o hash', async () => {
    const response = await request(app).post('/auth/senha').send({ senhaAtual: 'senha-atual-ok', novaSenha: 'senha-nova-ok' })
    expect(response.status).toBe(401)
    expect(response.body.erro.codigo).toBe('SESSAO_INVALIDA')
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
    expect(JSON.stringify(response.body)).not.toContain('senha-atual-ok')
  })
})
