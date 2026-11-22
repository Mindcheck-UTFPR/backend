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
    questionario: { findMany: vi.fn(), findFirst: vi.fn() },
    avaliacao: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

const { prisma } = await import('./config/prisma.js')
const { app } = await import('./app.js')
const { emitirAccessToken } = await import('./utils/tokens.js')

const estudante = { id: 7, nome: 'Estudante', email: 'estudante@example.test', papel: 'usuario' as const }
const outro = { id: 8, nome: 'Outra', email: 'outra@example.test', papel: 'usuario' as const }

const versaoPublicada = {
  id: 11,
  versao: '1.0',
  periodo_reaplicacao_dias: 14,
  pergunta: [
    {
      id: 1,
      texto: 'Pergunta fechada',
      tipo: 'escala',
      ordem: 1,
      obrigatoria: true,
      opcao_pergunta: [
        { id: 5, texto: 'Vários dias', valor_numerico: 1, ordem: 1 },
        { id: 6, texto: 'Nenhum dia', valor_numerico: 0, ordem: 2 },
      ],
    },
    {
      id: 2,
      texto: 'Comentário',
      tipo: 'aberta',
      ordem: 2,
      obrigatoria: false,
      opcao_pergunta: [],
    },
  ],
  faixa_interpretacao: [
    { id: 8, minimo: 0, maximo: 0, codigo: 'zero', rotulo: 'Zero', texto_orientativo: 'Faixa zero.' },
    { id: 9, minimo: 1, maximo: 1, codigo: 'um', rotulo: 'Um', texto_orientativo: 'Texto orientativo de teste.' },
  ],
}

function sessaoDe(usuario: typeof estudante, sessaoId: number) {
  return { id: sessaoId, usuario_id: usuario.id, usuario, expira_em: new Date(Date.now() + 86400000) }
}

describe('envio da avaliação', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.sessao.findUnique).mockImplementation((({ where }: { where: { id: number } }) => {
      if (where.id === 4) return Promise.resolve(sessaoDe(estudante, 4))
      if (where.id === 5) return Promise.resolve(sessaoDe(outro, 5))
      return Promise.resolve(null)
    }) as never)
    vi.mocked(prisma.$transaction).mockImplementation((async (operacao: (transacao: typeof prisma) => Promise<unknown>) => operacao(prisma)) as never)
    vi.mocked(prisma.avaliacao.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.avaliacao.findMany).mockResolvedValue([])
  })

  it('lista só questionário ativo com versão publicada', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.questionario.findMany).mockResolvedValue([
      {
        id: 3,
        nome: 'Instrumento de teste',
        descricao: null,
        ordem: 1,
        questionario_versao: [{ id: 11, versao: '1.0', periodo_reaplicacao_dias: 14 }],
      },
    ] as never)

    const resposta = await request(app).get('/questionarios').auth(token, { type: 'bearer' })

    expect(resposta.status).toBe(200)
    expect(resposta.headers['cache-control']).toBe('no-store')
    expect(resposta.body).toEqual({
      questionarios: [{
        id: 3,
        nome: 'Instrumento de teste',
        descricao: null,
        ordem: 1,
        versao: { id: 11, versao: '1.0', periodoReaplicacaoDias: 14 },
        podeResponder: true,
        disponivelEm: null,
        rascunhoId: null,
      }],
    })
    expect(prisma.questionario.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        ativo: true,
        questionario_versao: { some: { ativa: true, publicada_em: { not: null } } },
      },
    }))
    expect(JSON.stringify(resposta.body)).not.toContain('valor_numerico')
  })

  it('grava a avaliação e devolve a faixa calculada no servidor', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.questionario.findFirst).mockResolvedValue({
      id: 3,
      nome: 'Instrumento de teste',
      descricao: null,
      questionario_versao: [versaoPublicada],
    } as never)
    vi.mocked(prisma.avaliacao.create).mockResolvedValue({
      id: 20,
      versao_id: 11,
      criado_em: new Date('2026-11-22T15:00:00.000Z'),
      questionario_versao: { questionario_id: 3 },
      resposta: [{
        pergunta_id: 1,
        opcao_id: 5,
        texto: null,
        pergunta: { ordem: 1 },
        opcao_pergunta: { texto: 'Vários dias' },
      }],
      resultado: {
        pontuacao: 1,
        faixa_interpretacao: { codigo: 'um', rotulo: 'Um', texto_orientativo: 'Texto orientativo de teste.' },
      },
    } as never)

    const resposta = await request(app).post('/questionarios/3/avaliacoes').auth(token, { type: 'bearer' }).send({
      respostas: [{ perguntaId: 1, opcaoId: 5 }],
    })

    expect(resposta.status).toBe(201)
    expect(resposta.body.avaliacao.resultado).toEqual({
      pontuacao: 1,
      faixa: { codigo: 'um', rotulo: 'Um', textoOrientativo: 'Texto orientativo de teste.' },
    })
    expect(prisma.avaliacao.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        usuario_id: 7,
        versao_id: 11,
        resultado: { create: { pontuacao: 1, faixa_id: 9 } },
      }),
    }))
    expect(JSON.stringify(resposta.body)).not.toContain('valor_numerico')
  })

  it('recusa o envio sem a pergunta fechada', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.questionario.findFirst).mockResolvedValue({
      id: 3,
      nome: 'Instrumento de teste',
      descricao: null,
      questionario_versao: [versaoPublicada],
    } as never)

    const resposta = await request(app).post('/questionarios/3/avaliacoes').auth(token, { type: 'bearer' }).send({
      respostas: [],
    })

    expect(resposta.status).toBe(400)
    expect(resposta.body.erro.codigo).toBe('RESPOSTA_INVALIDA')
    expect(prisma.avaliacao.create).not.toHaveBeenCalled()
  })

  it('recusa nova resposta dentro do prazo de reaplicação', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.questionario.findFirst).mockResolvedValue({
      id: 3,
      nome: 'Instrumento de teste',
      descricao: null,
      questionario_versao: [versaoPublicada],
    } as never)
    vi.mocked(prisma.avaliacao.findFirst).mockImplementation((async ({ where }: { where: { concluida_em?: unknown } }) => {
      if (where.concluida_em && typeof where.concluida_em === 'object') {
        return { concluida_em: new Date() }
      }
      return null
    }) as never)

    const resposta = await request(app).post('/questionarios/3/avaliacoes').auth(token, { type: 'bearer' }).send({
      respostas: [{ perguntaId: 1, opcaoId: 5 }],
    })

    expect(resposta.status).toBe(409)
    expect(resposta.body.erro.codigo).toBe('REAPLICACAO_INDISPONIVEL')
    expect(prisma.avaliacao.create).not.toHaveBeenCalled()
  })

  it('não devolve a avaliação de outra pessoa', async () => {
    const token = await emitirAccessToken(outro, 5)
    vi.mocked(prisma.avaliacao.findFirst).mockResolvedValue(null)

    const resposta = await request(app).get('/avaliacoes/20').auth(token, { type: 'bearer' })

    expect(resposta.status).toBe(404)
    expect(resposta.body.erro.codigo).toBe('AVALIACAO_NAO_ENCONTRADA')
    expect(prisma.avaliacao.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 20, usuario_id: 8 },
    }))
  })
})
