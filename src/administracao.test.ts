import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    usuario: { findMany: vi.fn() },
    questionario: { findMany: vi.fn() },
  },
}))

const { prisma } = await import('./config/prisma.js')
const { app } = await import('./app.js')
const { emitirAccessToken } = await import('./utils/tokens.js')

const usuario = {
  id: 7,
  nome: 'Conta Estudante',
  email: 'estudante@example.test',
  papel: 'usuario' as const,
}

const administrador = {
  id: 9,
  nome: 'Conta Admin',
  email: 'admin@example.test',
  papel: 'admin' as const,
}

const sessaoUsuario = {
  id: 4,
  usuario_id: 7,
  usuario,
  expira_em: new Date(Date.now() + 86400000),
}

const sessaoAdmin = {
  id: 6,
  usuario_id: 9,
  usuario: administrador,
  expira_em: new Date(Date.now() + 86400000),
}

const caminhos = ['/admin/questionarios', '/admin/usuarios', '/admin/auditoria'] as const

describe('autorização do painel (MIND-77)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.sessao.findUnique).mockImplementation((({ where }: { where: { id: number } }) => {
      if (where.id === 4) return Promise.resolve(sessaoUsuario)
      if (where.id === 6) return Promise.resolve(sessaoAdmin)
      return Promise.resolve(null)
    }) as never)
  })

  it('recusa os três caminhos sem token com 401 e Cache-Control: no-store', async () => {
    for (const caminho of caminhos) {
      const resposta = await request(app).get(caminho)

      expect(resposta.status).toBe(401)
      expect(resposta.headers['cache-control']).toBe('no-store')
      expect(resposta.body).toEqual({
        erro: {
          codigo: 'SESSAO_INVALIDA',
          mensagem: 'Entre para continuar.',
        },
      })
    }

    expect(prisma.usuario.findMany).not.toHaveBeenCalled()
    expect(prisma.questionario.findMany).not.toHaveBeenCalled()
  })

  it('recusa papel usuario com 403 ACESSO_NEGADO nos três caminhos', async () => {
    const token = await emitirAccessToken(usuario, 4)

    for (const caminho of caminhos) {
      const resposta = await request(app).get(caminho).auth(token, { type: 'bearer' })

      expect(resposta.status).toBe(403)
      expect(resposta.headers['cache-control']).toBe('no-store')
      expect(resposta.body).toEqual({
        erro: {
          codigo: 'ACESSO_NEGADO',
          mensagem: 'Esta área é restrita a administradores.',
        },
      })
    }

    expect(prisma.usuario.findMany).not.toHaveBeenCalled()
    expect(prisma.questionario.findMany).not.toHaveBeenCalled()
  })

  it('devolve questionários, usuários e auditoria vazia para o administrador', async () => {
    const token = await emitirAccessToken(administrador, 6)

    vi.mocked(prisma.questionario.findMany).mockResolvedValue([
      {
        id: 3,
        nome: 'Instrumento de teste',
        ativo: true,
        questionario_versao: [{ id: 11, versao: '1.0', ativa: false }],
      },
    ] as never)
    vi.mocked(prisma.usuario.findMany).mockResolvedValue([
      {
        id: 9,
        nome: 'Conta Admin',
        email: 'admin@example.test',
        papel: 'admin',
        senha_hash: 'nao-pode-sair',
        termos_aceitos_em: new Date(),
        termos_versao: '1.0',
      },
    ] as never)

    const questionarios = await request(app).get('/admin/questionarios').auth(token, { type: 'bearer' })
    const usuarios = await request(app).get('/admin/usuarios').auth(token, { type: 'bearer' })
    const auditoria = await request(app).get('/admin/auditoria').auth(token, { type: 'bearer' })

    expect(questionarios.status).toBe(200)
    expect(questionarios.headers['cache-control']).toBe('no-store')
    expect(questionarios.body).toEqual({
      questionarios: [
        {
          id: 3,
          nome: 'Instrumento de teste',
          ativo: true,
          versoes: [{ id: 11, versao: '1.0', ativa: false }],
        },
      ],
    })
    expect(questionarios.body.questionarios[0]).not.toHaveProperty('situacao')
    expect(prisma.questionario.findMany).toHaveBeenCalledWith({
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        nome: true,
        ativo: true,
        questionario_versao: {
          orderBy: { id: 'asc' },
          select: { id: true, versao: true, ativa: true },
        },
      },
    })

    expect(usuarios.status).toBe(200)
    expect(usuarios.body).toEqual({
      usuarios: [
        { id: 9, nome: 'Conta Admin', email: 'admin@example.test', papel: 'admin' },
      ],
    })
    expect(JSON.stringify(usuarios.body)).not.toContain('senha_hash')
    expect(JSON.stringify(usuarios.body)).not.toContain('termos')
    expect(prisma.usuario.findMany).toHaveBeenCalledWith({
      orderBy: { id: 'asc' },
      select: { id: true, nome: true, email: true, papel: true },
    })

    expect(auditoria.status).toBe(200)
    expect(auditoria.body).toEqual({ registros: [] })
  })
})
