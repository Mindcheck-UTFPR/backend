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
    questionario: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    questionario_versao: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    pergunta: { deleteMany: vi.fn(), create: vi.fn() },
    faixa_interpretacao: { deleteMany: vi.fn(), createMany: vi.fn() },
    publicacao_questionario: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

const { prisma } = await import('./config/prisma.js')
const { app } = await import('./app.js')
const { emitirAccessToken } = await import('./utils/tokens.js')

const estudante = { id: 7, nome: 'Estudante', email: 'estudante@example.test', papel: 'usuario' as const }
const administrador = { id: 9, nome: 'Admin', email: 'admin@example.test', papel: 'admin' as const }

describe('cadastro de questionário pelo administrador', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.sessao.findUnique).mockImplementation((({ where }: { where: { id: number } }) => {
      if (where.id === 4) {
        return Promise.resolve({ id: 4, usuario_id: 7, usuario: estudante, expira_em: new Date(Date.now() + 86400000) })
      }
      if (where.id === 6) {
        return Promise.resolve({ id: 6, usuario_id: 9, usuario: administrador, expira_em: new Date(Date.now() + 86400000) })
      }
      return Promise.resolve(null)
    }) as never)
    vi.mocked(prisma.$transaction).mockImplementation((async (operacao: (transacao: typeof prisma) => Promise<unknown>) => operacao(prisma)) as never)
  })

  it('recusa o estudante que tenta criar um questionário', async () => {
    const token = await emitirAccessToken(estudante, 4)
    const resposta = await request(app).post('/admin/questionarios').auth(token, { type: 'bearer' }).send({
      nome: 'Instrumento de teste',
      ordem: 1,
      versao: '1.0',
      periodoReaplicacaoDias: 14,
    })

    expect(resposta.status).toBe(403)
    expect(resposta.body.erro.codigo).toBe('ACESSO_NEGADO')
    expect(prisma.questionario.create).not.toHaveBeenCalled()
  })

  it('lista o resumo dos questionários para o administrador', async () => {
    const token = await emitirAccessToken(administrador, 6)
    vi.mocked(prisma.questionario.findMany).mockResolvedValue([
      {
        id: 3,
        nome: 'Instrumento de teste',
        ativo: true,
        questionario_versao: [{ id: 11, versao: '1.0', ativa: false, publicada_em: null }],
      },
    ] as never)

    const resposta = await request(app).get('/admin/questionarios').auth(token, { type: 'bearer' })

    expect(resposta.status).toBe(200)
    expect(resposta.headers['cache-control']).toBe('no-store')
    expect(resposta.body).toEqual({
      questionarios: [
        {
          id: 3,
          nome: 'Instrumento de teste',
          ativo: true,
          versoes: [{ id: 11, versao: '1.0', ativa: false, publicadaEm: null }],
        },
      ],
    })
    expect(resposta.body.questionarios[0]).not.toHaveProperty('situacao')
    expect(prisma.questionario.findMany).toHaveBeenCalledWith({
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        nome: true,
        ativo: true,
        questionario_versao: {
          orderBy: { id: 'asc' },
          select: { id: true, versao: true, ativa: true, publicada_em: true },
        },
      },
    })
  })

  it('cria um rascunho vazio para o administrador', async () => {
    const token = await emitirAccessToken(administrador, 6)
    vi.mocked(prisma.questionario.create).mockResolvedValue({
      id: 3,
      nome: 'Instrumento de teste',
      descricao: null,
      ordem: 1,
      ativo: true,
      questionario_versao: [{
        id: 11,
        versao: '1.0',
        ativa: false,
        publicada_em: null,
        periodo_reaplicacao_dias: 14,
        pergunta: [],
        faixa_interpretacao: [],
      }],
    } as never)

    const resposta = await request(app).post('/admin/questionarios').auth(token, { type: 'bearer' }).send({
      nome: 'Instrumento de teste',
      ordem: 1,
      versao: '1.0',
      periodoReaplicacaoDias: 14,
    })

    expect(resposta.status).toBe(201)
    expect(resposta.body.questionario).toMatchObject({
      id: 3,
      nome: 'Instrumento de teste',
      versoes: [{ id: 11, versao: '1.0', ativa: false, publicadaEm: null, perguntas: [], faixas: [] }],
    })
  })

  it('recusa gravar perguntas numa versão já publicada', async () => {
    const token = await emitirAccessToken(administrador, 6)
    vi.mocked(prisma.questionario_versao.findUnique).mockResolvedValue({
      id: 11,
      questionario_id: 3,
      publicada_em: new Date('2026-11-21T15:00:00.000Z'),
      pergunta: [],
      faixa_interpretacao: [],
    } as never)

    const resposta = await request(app).put('/admin/questionarios/3/versoes/11').auth(token, { type: 'bearer' }).send({
      perguntas: [],
      faixas: [],
    })

    expect(resposta.status).toBe(403)
    expect(resposta.body.erro).toMatchObject({
      codigo: 'VERSAO_IMUTAVEL',
      mensagem: 'Versão publicada não pode ser alterada. Crie uma nova versão.',
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('recusa publicar um rascunho sem perguntas', async () => {
    const token = await emitirAccessToken(administrador, 6)
    vi.mocked(prisma.questionario_versao.findUnique).mockResolvedValue({
      id: 11,
      questionario_id: 3,
      publicada_em: null,
      periodo_reaplicacao_dias: 14,
      pergunta: [],
      faixa_interpretacao: [],
    } as never)

    const resposta = await request(app).post('/admin/questionarios/3/versoes/11/publicar').auth(token, { type: 'bearer' })

    expect(resposta.status).toBe(400)
    expect(resposta.body.erro.codigo).toBe('PUBLICACAO_INVALIDA')
    expect(resposta.body.erro.detalhes.length).toBeGreaterThan(0)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
