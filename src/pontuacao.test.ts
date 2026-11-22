import { describe, expect, it } from 'vitest'
import { ErroAplicacao } from './middlewares/errosMiddleware.js'
import { calcularPontuacao } from './services/pontuacaoService.js'
import { disponibilidade } from './services/reaplicacaoService.js'

const faixas = [
  { id: 1, minimo: 0, maximo: 1, codigo: 'baixa', rotulo: 'Baixa', texto_orientativo: 'Acompanhe o período.' },
  { id: 2, minimo: 2, maximo: 3, codigo: 'alta', rotulo: 'Alta', texto_orientativo: 'Procure o serviço de apoio da universidade.' },
]

describe('pontuação da avaliação', () => {
  it('soma só as perguntas fechadas e escolhe a faixa da versão', () => {
    const resultado = calcularPontuacao(
      [
        { id: 1, tipo: 'escala', opcoes: [{ id: 10, valor_numerico: 0 }, { id: 11, valor_numerico: 1 }] },
        { id: 2, tipo: 'escolha_unica', opcoes: [{ id: 20, valor_numerico: 2 }] },
        { id: 3, tipo: 'aberta', opcoes: [] },
      ],
      [
        { perguntaId: 1, opcaoId: 11 },
        { perguntaId: 2, opcaoId: 20 },
        { perguntaId: 3, opcaoId: null },
      ],
      faixas,
    )

    expect(resultado.pontuacao).toBe(3)
    expect(resultado.faixa.codigo).toBe('alta')
  })

  it('recusa uma soma que não cai em faixa', () => {
    expect(() => calcularPontuacao(
      [{ id: 1, tipo: 'escala', opcoes: [{ id: 10, valor_numerico: 9 }] }],
      [{ perguntaId: 1, opcaoId: 10 }],
      faixas,
    )).toThrow(ErroAplicacao)
  })
})

describe('prazo de reaplicação', () => {
  const agora = new Date('2026-11-22T15:00:00.000Z')

  it('libera a primeira resposta', () => {
    expect(disponibilidade(null, 14, agora)).toEqual({ podeResponder: true, disponivelEm: null })
  })

  it('bloqueia dentro do prazo e libera quando o prazo acaba', () => {
    const ontem = new Date('2026-11-21T15:00:00.000Z')
    expect(disponibilidade(ontem, 14, agora).podeResponder).toBe(false)
    expect(disponibilidade(new Date('2026-11-08T15:00:00.000Z'), 14, agora)).toEqual({
      podeResponder: true,
      disponivelEm: null,
    })
  })
})
