import { describe, expect, it } from 'vitest'
import { falhasDePublicacao, type EstruturaPublicacao } from './services/publicacaoQuestionarioService.js'

function estruturaPhq9(): EstruturaPublicacao {
  return {
    periodo_reaplicacao_dias: 14,
    perguntas: Array.from({ length: 9 }, () => ({
      tipo: 'escala',
      opcoes: [0, 1, 2, 3].map((valor) => ({ valor_numerico: valor })),
    })),
    faixas: [
      { minimo: 0, maximo: 4 },
      { minimo: 5, maximo: 9 },
      { minimo: 10, maximo: 14 },
      { minimo: 15, maximo: 19 },
      { minimo: 20, maximo: 27 },
    ],
  }
}

describe('validação da publicação (MIND-59)', () => {
  it('aceita a estrutura do PHQ-9', () => {
    expect(falhasDePublicacao(estruturaPhq9())).toEqual([])
  })

  it('recusa versão sem pergunta e sem faixa que cubra a soma', () => {
    const falhas = falhasDePublicacao({
      periodo_reaplicacao_dias: 14,
      perguntas: [],
      faixas: [{ minimo: 1, maximo: 2 }],
    })

    expect(falhas.map((falha) => falha.campo)).toEqual(['perguntas', 'faixas'])
    expect(falhas[1]?.mensagem).toBe('Todo valor possível da soma precisa cair em exatamente uma faixa.')
  })

  it('recusa pergunta aberta com alternativa e pergunta fechada sem alternativa', () => {
    const falhas = falhasDePublicacao({
      periodo_reaplicacao_dias: 14,
      perguntas: [
        { tipo: 'aberta', opcoes: [{ valor_numerico: 0 }] },
        { tipo: 'escolha_unica', opcoes: [] },
      ],
      faixas: [{ minimo: 0, maximo: 0 }],
    })

    expect(falhas.map((falha) => falha.mensagem)).toEqual([
      'Pergunta aberta não possui alternativa.',
      'Pergunta fechada precisa de pelo menos uma alternativa.',
    ])
  })
})
