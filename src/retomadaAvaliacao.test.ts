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
    questionario: { findFirst: vi.fn() },
    avaliacao: { findFirst: vi.fn(), findFirstOrThrow: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    resposta: { deleteMany: vi.fn(), createMany: vi.fn() },
    resultado: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

const { prisma } = await import('./config/prisma.js')
const { app } = await import('./app.js')
const { emitirAccessToken } = await import('./utils/tokens.js')

const estudante = { id: 7, nome: 'Estudante', email: 'estudante@example.test', papel: 'usuario' as const }

const versao = {
  id: 11,
  questionario_id: 3,
  periodo_reaplicacao_dias: 14,
  pergunta: [{
    id: 1,
    texto: 'Pergunta fechada',
    tipo: 'escala',
    ordem: 1,
    obrigatoria: true,
    opcao_pergunta: [{ id: 5, texto: 'Vários dias', valor_numerico: 1, ordem: 1 }],
  }],
  faixa_interpretacao: [
    { id: 9, minimo: 1, maximo: 1, codigo: 'um', rotulo: 'Um', texto_orientativo: 'Texto orientativo de teste.' },
  ],
}

function rascunho(revisao: number, respostas: unknown[] = []) {
  return {
    id: 20,
    versao_id: 11,
    revisao,
    concluida_em: null,
    criado_em: new Date('2026-11-22T15:00:00.000Z'),
    questionario_versao: versao,
    resposta: respostas,
    resultado: null,
  }
}

describe('retomada do rascunho', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue({
      id: 4,
      usuario_id: 7,
      usuario: estudante,
      expira_em: new Date(Date.now() + 86400000),
    } as never)
    vi.mocked(prisma.$transaction).mockImplementation((async (operacao: (transacao: typeof prisma) => Promise<unknown>) => operacao(prisma)) as never)
    vi.mocked(prisma.questionario.findFirst).mockResolvedValue({
      id: 3,
      nome: 'Instrumento de teste',
      descricao: null,
      questionario_versao: [versao],
    } as never)
  })

  it('abre um rascunho vazio', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.avaliacao.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.avaliacao.create).mockResolvedValue(rascunho(1) as never)

    const resposta = await request(app).post('/questionarios/3/rascunho').auth(token, { type: 'bearer' })

    expect(resposta.status).toBe(201)
    expect(resposta.body.avaliacao).toMatchObject({ id: 20, revisao: 1, resultado: null, respostas: [] })
    expect(prisma.avaliacao.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { usuario_id: 7, versao_id: 11 },
    }))
  })

  it('grava resposta parcial e recusa revisão antiga', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.avaliacao.findFirst).mockResolvedValue(rascunho(1) as never)
    vi.mocked(prisma.avaliacao.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked(prisma.avaliacao.findFirstOrThrow).mockResolvedValue(rascunho(2, [{
      pergunta_id: 1,
      opcao_id: 5,
      texto: null,
      pergunta: { ordem: 1 },
      opcao_pergunta: { texto: 'Vários dias' },
    }]) as never)

    const gravada = await request(app).put('/avaliacoes/20').auth(token, { type: 'bearer' }).send({
      revisao: 1,
      respostas: [{ perguntaId: 1, opcaoId: 5 }],
    })

    expect(gravada.status).toBe(200)
    expect(gravada.body.avaliacao.revisao).toBe(2)
    expect(prisma.resposta.deleteMany).toHaveBeenCalled()

    vi.mocked(prisma.avaliacao.findFirst).mockResolvedValue(rascunho(2) as never)
    const conflito = await request(app).put('/avaliacoes/20').auth(token, { type: 'bearer' }).send({
      revisao: 1,
      respostas: [{ perguntaId: 1, opcaoId: 5 }],
    })

    expect(conflito.status).toBe(409)
    expect(conflito.body.erro.codigo).toBe('CONFLITO_AVALIACAO')
  })

  it('conclui o rascunho uma vez e devolve o mesmo resultado na repetição', async () => {
    const token = await emitirAccessToken(estudante, 4)
    const concluida = {
      ...rascunho(2, [{
        pergunta_id: 1,
        opcao_id: 5,
        texto: null,
        pergunta: { ordem: 1 },
        opcao_pergunta: { texto: 'Vários dias' },
      }]),
      concluida_em: new Date('2026-11-22T16:00:00.000Z'),
      resultado: {
        pontuacao: 1,
        faixa_interpretacao: { codigo: 'um', rotulo: 'Um', texto_orientativo: 'Texto orientativo de teste.' },
      },
    }
    vi.mocked(prisma.avaliacao.findFirst).mockResolvedValueOnce(rascunho(1, [{
      pergunta_id: 1,
      opcao_id: 5,
      texto: null,
      pergunta: { ordem: 1 },
      opcao_pergunta: { texto: 'Vários dias' },
    }]) as never)
    vi.mocked(prisma.avaliacao.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked(prisma.avaliacao.findFirstOrThrow).mockResolvedValue(concluida as never)

    const primeira = await request(app).post('/avaliacoes/20/concluir').auth(token, { type: 'bearer' }).send({ revisao: 1 })

    expect(primeira.status).toBe(200)
    expect(primeira.body.avaliacao.resultado.pontuacao).toBe(1)
    expect(prisma.resultado.create).toHaveBeenCalledWith({
      data: { avaliacao_id: 20, pontuacao: 1, faixa_id: 9 },
    })

    vi.mocked(prisma.avaliacao.findFirst).mockResolvedValue(concluida as never)
    const segunda = await request(app).post('/avaliacoes/20/concluir').auth(token, { type: 'bearer' }).send({ revisao: 2 })

    expect(segunda.status).toBe(200)
    expect(segunda.body.avaliacao.resultado.pontuacao).toBe(1)
    expect(prisma.resultado.create).toHaveBeenCalledTimes(1)
  })
})
