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
    avaliacao: { findMany: vi.fn() },
  },
}))

const { prisma } = await import('./config/prisma.js')
const { app } = await import('./app.js')
const { emitirAccessToken } = await import('./utils/tokens.js')

const estudante = { id: 7, nome: 'Estudante', email: 'estudante@example.test', papel: 'usuario' as const }

function item(id: number, quando: string) {
  return {
    id,
    versao_id: 11,
    concluida_em: new Date(quando),
    questionario_versao: {
      versao: '1.0',
      questionario_id: 3,
      questionario: { nome: 'Instrumento de teste' },
    },
    resultado: {
      pontuacao: id,
      faixa_interpretacao: {
        codigo: 'um',
        rotulo: 'Um',
        texto_orientativo: 'Texto orientativo de teste.',
      },
    },
  }
}

describe('histórico de avaliações', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue({
      id: 4,
      usuario_id: 7,
      usuario: estudante,
      expira_em: new Date(Date.now() + 86400000),
    } as never)
  })

  it('devolve só as conclusões da própria pessoa, da mais recente para a mais antiga', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.avaliacao.findMany).mockResolvedValue([
      item(22, '2026-11-22T16:00:00.000Z'),
      item(20, '2026-11-08T16:00:00.000Z'),
    ] as never)

    const resposta = await request(app).get('/avaliacoes').auth(token, { type: 'bearer' })

    expect(resposta.status).toBe(200)
    expect(resposta.headers['cache-control']).toBe('no-store')
    expect(resposta.body).toEqual({
      avaliacoes: [
        {
          id: 22,
          questionarioId: 3,
          questionarioNome: 'Instrumento de teste',
          versaoId: 11,
          versao: '1.0',
          concluidaEm: '2026-11-22T16:00:00.000Z',
          resultado: {
            pontuacao: 22,
            faixa: { codigo: 'um', rotulo: 'Um', textoOrientativo: 'Texto orientativo de teste.' },
          },
        },
        {
          id: 20,
          questionarioId: 3,
          questionarioNome: 'Instrumento de teste',
          versaoId: 11,
          versao: '1.0',
          concluidaEm: '2026-11-08T16:00:00.000Z',
          resultado: {
            pontuacao: 20,
            faixa: { codigo: 'um', rotulo: 'Um', textoOrientativo: 'Texto orientativo de teste.' },
          },
        },
      ],
      temProxima: false,
    })
    expect(JSON.stringify(resposta.body)).not.toContain('respostas')
    expect(JSON.stringify(resposta.body)).not.toContain('humor')
    expect(prisma.avaliacao.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { usuario_id: 7, concluida_em: { not: null } },
      orderBy: { concluida_em: 'desc' },
    }))
  })

  it('indica que existe outra página', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.avaliacao.findMany).mockResolvedValue([
      item(22, '2026-11-22T16:00:00.000Z'),
      item(20, '2026-11-08T16:00:00.000Z'),
    ] as never)

    const resposta = await request(app).get('/avaliacoes?limite=1').auth(token, { type: 'bearer' })

    expect(resposta.status).toBe(200)
    expect(resposta.body.avaliacoes).toHaveLength(1)
    expect(resposta.body.avaliacoes[0].id).toBe(22)
    expect(resposta.body.temProxima).toBe(true)
  })

  it('devolve lista vazia quando não há conclusão', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.avaliacao.findMany).mockResolvedValue([])

    const resposta = await request(app).get('/avaliacoes').auth(token, { type: 'bearer' })

    expect(resposta.status).toBe(200)
    expect(resposta.body).toEqual({ avaliacoes: [], temProxima: false })
  })
})
