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

describe('resultado atual do questionário', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue({
      id: 4,
      usuario_id: 7,
      usuario: estudante,
      expira_em: new Date(Date.now() + 86400000),
    } as never)
  })

  it('devolve a conclusão mais recente da própria pessoa', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.avaliacao.findMany).mockResolvedValue([{
      id: 22,
      versao_id: 11,
      concluida_em: new Date('2026-11-22T16:00:00.000Z'),
      questionario_versao: {
        versao: '1.0',
        questionario_id: 3,
        questionario: { nome: 'Instrumento de teste' },
      },
      resultado: {
        pontuacao: 4,
        faixa_interpretacao: {
          codigo: 'baixa',
          rotulo: 'Baixa',
          texto_orientativo: 'Texto orientativo de teste.',
        },
      },
    }] as never)

    const resposta = await request(app).get('/questionarios/3/resultado').auth(token, { type: 'bearer' })

    expect(resposta.status).toBe(200)
    expect(resposta.headers['cache-control']).toBe('no-store')
    expect(resposta.body.resultado).toMatchObject({
      id: 22,
      questionarioId: 3,
      aviso: 'Este resultado é orientativo e não é um diagnóstico.',
      resultado: {
        pontuacao: 4,
        faixa: { codigo: 'baixa', rotulo: 'Baixa', textoOrientativo: 'Texto orientativo de teste.' },
      },
    })
    expect(JSON.stringify(resposta.body)).not.toContain('humor')
    expect(JSON.stringify(resposta.body)).not.toContain('respostas')
    expect(prisma.avaliacao.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        usuario_id: 7,
        concluida_em: { not: null },
        questionario_versao: { questionario_id: 3 },
      },
      orderBy: { concluida_em: 'desc' },
      take: 2,
    }))
  })

  it('responde 404 quando a pessoa ainda não concluiu o questionário', async () => {
    const token = await emitirAccessToken(estudante, 4)
    vi.mocked(prisma.avaliacao.findMany).mockResolvedValue([])

    const resposta = await request(app).get('/questionarios/3/resultado').auth(token, { type: 'bearer' })

    expect(resposta.status).toBe(404)
    expect(resposta.body.erro.codigo).toBe('RESULTADO_NAO_ENCONTRADO')
  })
})
