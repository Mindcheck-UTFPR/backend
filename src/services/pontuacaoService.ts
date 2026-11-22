import { ErroAplicacao } from '../middlewares/errosMiddleware.js'

interface PerguntaPontuavel {
  id: number
  tipo: string
  opcoes: { id: number; valor_numerico: number }[]
}

interface RespostaPontuavel {
  perguntaId: number
  opcaoId: number | null
}

interface FaixaPontuavel {
  id: number
  minimo: number
  maximo: number
  codigo: string
  rotulo: string
  texto_orientativo: string
}

export function calcularPontuacao(
  perguntas: PerguntaPontuavel[],
  respostas: RespostaPontuavel[],
  faixas: FaixaPontuavel[],
) {
  let pontuacao = 0

  for (const pergunta of perguntas) {
    if (pergunta.tipo === 'aberta') continue
    const resposta = respostas.find((item) => item.perguntaId === pergunta.id && item.opcaoId !== null)
    if (!resposta || resposta.opcaoId === null) continue
    const opcao = pergunta.opcoes.find((item) => item.id === resposta.opcaoId)
    if (!opcao) continue
    pontuacao += opcao.valor_numerico
  }

  const faixa = faixas.find((item) => pontuacao >= item.minimo && pontuacao <= item.maximo)
  if (!faixa) {
    throw new ErroAplicacao(500, 'RESULTADO_INDISPONIVEL', 'Não foi possível calcular o resultado desta versão.')
  }

  return { pontuacao, faixa }
}
