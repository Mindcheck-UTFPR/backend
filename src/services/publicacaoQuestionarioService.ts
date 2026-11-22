const TIPOS_FECHADOS = new Set(['escala', 'polar', 'escolha_unica'])

export interface EstruturaPublicacao {
  periodo_reaplicacao_dias: number
  perguntas: { tipo: string; opcoes: { valor_numerico: number }[] }[]
  faixas: { minimo: number; maximo: number }[]
}

export function falhasDePublicacao(versao: EstruturaPublicacao): { campo: string; mensagem: string }[] {
  const falhas: { campo: string; mensagem: string }[] = []

  if (versao.periodo_reaplicacao_dias <= 0) {
    falhas.push({
      campo: 'periodoReaplicacaoDias',
      mensagem: 'O prazo de reaplicação deve ser maior que zero.',
    })
  }

  if (versao.perguntas.length === 0) {
    falhas.push({ campo: 'perguntas', mensagem: 'A versão precisa de pelo menos uma pergunta.' })
  }

  versao.perguntas.forEach((pergunta, indice) => {
    if (pergunta.tipo === 'aberta' && pergunta.opcoes.length > 0) {
      falhas.push({
        campo: `perguntas.${indice}`,
        mensagem: 'Pergunta aberta não possui alternativa.',
      })
    }
    if (TIPOS_FECHADOS.has(pergunta.tipo) && pergunta.opcoes.length === 0) {
      falhas.push({
        campo: `perguntas.${indice}`,
        mensagem: 'Pergunta fechada precisa de pelo menos uma alternativa.',
      })
    }
  })

  if (versao.faixas.length === 0) {
    falhas.push({ campo: 'faixas', mensagem: 'A versão precisa de pelo menos uma faixa.' })
  }

  const faixaInvalida = versao.faixas.some((faixa) => faixa.maximo < faixa.minimo)
  if (faixaInvalida) {
    falhas.push({ campo: 'faixas', mensagem: 'O máximo da faixa não pode ser menor que o mínimo.' })
  }

  const ordenadas = [...versao.faixas].sort((a, b) => a.minimo - b.minimo || a.maximo - b.maximo)
  const sobrepoe = ordenadas.some((faixa, indice) => indice > 0 && faixa.minimo <= ordenadas[indice - 1].maximo)
  if (sobrepoe) {
    falhas.push({ campo: 'faixas', mensagem: 'As faixas não podem se sobrepor.' })
  }

  const fechadas = versao.perguntas.filter((pergunta) => pergunta.tipo !== 'aberta')
  const fechadasCompletas = fechadas.every((pergunta) => pergunta.opcoes.length > 0)
  if (versao.faixas.length > 0 && !faixaInvalida && fechadasCompletas) {
    const minimo = fechadas.length === 0
      ? 0
      : fechadas.reduce((soma, pergunta) => soma + Math.min(...pergunta.opcoes.map((opcao) => opcao.valor_numerico)), 0)
    const maximo = fechadas.length === 0
      ? 0
      : fechadas.reduce((soma, pergunta) => soma + Math.max(...pergunta.opcoes.map((opcao) => opcao.valor_numerico)), 0)
    let descoberta = false
    for (let valor = minimo; valor <= maximo; valor += 1) {
      const faixasDoValor = versao.faixas.filter((faixa) => valor >= faixa.minimo && valor <= faixa.maximo)
      if (faixasDoValor.length !== 1) {
        descoberta = true
        break
      }
    }
    if (descoberta) {
      falhas.push({
        campo: 'faixas',
        mensagem: 'Todo valor possível da soma precisa cair em exatamente uma faixa.',
      })
    }
  }

  return falhas
}
