import { prisma } from '../config/prisma.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import type { EnviarAvaliacaoEntrada } from '../validators/avaliacaoValidator.js'
import { calcularPontuacao } from './pontuacaoService.js'
import { disponibilidade } from './reaplicacaoService.js'

const versaoPublicada = {
  where: { ativa: true, publicada_em: { not: null } },
  include: {
    pergunta: {
      orderBy: { ordem: 'asc' as const },
      include: { opcao_pergunta: { orderBy: { ordem: 'asc' as const } } },
    },
    faixa_interpretacao: { orderBy: { minimo: 'asc' as const } },
  },
}

async function carregarPublicado(questionarioId: number) {
  const registro = await prisma.questionario.findFirst({
    where: {
      id: questionarioId,
      ativo: true,
      questionario_versao: { some: { ativa: true, publicada_em: { not: null } } },
    },
    include: { questionario_versao: versaoPublicada },
  })
  const versao = registro?.questionario_versao[0]
  if (!registro || !versao) {
    throw new ErroAplicacao(404, 'QUESTIONARIO_NAO_ENCONTRADO', 'Questionário não encontrado.')
  }
  return { questionario: registro, versao }
}

async function ultimaRespostaEm(usuarioId: number, questionarioId: number) {
  const ultima = await prisma.avaliacao.findFirst({
    where: { usuario_id: usuarioId, questionario_versao: { questionario_id: questionarioId } },
    orderBy: { criado_em: 'desc' },
    select: { criado_em: true },
  })
  return ultima?.criado_em ?? null
}

function apresentarPerguntas(versao: Awaited<ReturnType<typeof carregarPublicado>>['versao']) {
  return versao.pergunta.map((pergunta) => ({
    id: pergunta.id,
    texto: pergunta.texto,
    tipo: pergunta.tipo,
    ordem: pergunta.ordem,
    obrigatoria: pergunta.obrigatoria,
    opcoes: pergunta.opcao_pergunta.map((opcao) => ({
      id: opcao.id,
      texto: opcao.texto,
      ordem: opcao.ordem,
    })),
  }))
}

function falhasDeResposta(
  versao: Awaited<ReturnType<typeof carregarPublicado>>['versao'],
  respostas: EnviarAvaliacaoEntrada['respostas'],
) {
  const porPergunta = new Map(respostas.map((resposta) => [resposta.perguntaId, resposta]))
  const falhas: { campo: string; mensagem: string }[] = []
  const idsDaVersao = new Set(versao.pergunta.map((pergunta) => pergunta.id))

  for (const pergunta of versao.pergunta) {
    const resposta = porPergunta.get(pergunta.id)
    const fechada = pergunta.tipo !== 'aberta'
    const campo = `perguntas.${pergunta.id}`
    if (!resposta) {
      if (fechada || pergunta.obrigatoria) {
        falhas.push({ campo, mensagem: 'Falta a resposta desta pergunta.' })
      }
      continue
    }
    if (fechada && !('opcaoId' in resposta)) {
      falhas.push({ campo, mensagem: 'Pergunta fechada precisa de uma alternativa.' })
      continue
    }
    if (!fechada && 'opcaoId' in resposta) {
      falhas.push({ campo, mensagem: 'Pergunta aberta não usa alternativa.' })
      continue
    }
    if ('opcaoId' in resposta) {
      const opcao = pergunta.opcao_pergunta.find((item) => item.id === resposta.opcaoId)
      if (!opcao) {
        falhas.push({ campo, mensagem: 'A alternativa não pertence à pergunta.' })
      }
    }
  }

  for (const resposta of respostas) {
    if (!idsDaVersao.has(resposta.perguntaId)) {
      falhas.push({ campo: 'respostas', mensagem: 'A pergunta não pertence a esta versão.' })
    }
  }

  return falhas
}

function exigirPrazo(periodoDias: number, ultima: Date | null) {
  const prazo = disponibilidade(ultima, periodoDias)
  if (!prazo.podeResponder) {
    throw new ErroAplicacao(409, 'REAPLICACAO_INDISPONIVEL', 'Ainda não dá para responder este questionário de novo.', [
      { campo: 'disponivelEm', mensagem: prazo.disponivelEm ?? '' },
    ])
  }
}

export async function listarParaResponder(usuarioId: number) {
  const registros = await prisma.questionario.findMany({
    where: {
      ativo: true,
      questionario_versao: { some: { ativa: true, publicada_em: { not: null } } },
    },
    orderBy: { ordem: 'asc' },
    select: {
      id: true,
      nome: true,
      descricao: true,
      ordem: true,
      questionario_versao: {
        where: { ativa: true, publicada_em: { not: null } },
        select: { id: true, versao: true, periodo_reaplicacao_dias: true },
      },
    },
  })

  const ids = registros.map((registro) => registro.id)
  const ultimas = ids.length === 0
    ? []
    : await prisma.avaliacao.findMany({
      where: { usuario_id: usuarioId, questionario_versao: { questionario_id: { in: ids } } },
      orderBy: { criado_em: 'desc' },
      select: { criado_em: true, questionario_versao: { select: { questionario_id: true } } },
    })
  const porQuestionario = new Map<number, Date>()
  for (const item of ultimas) {
    const questionarioId = item.questionario_versao.questionario_id
    if (!porQuestionario.has(questionarioId)) porQuestionario.set(questionarioId, item.criado_em)
  }

  return registros.flatMap((registro) => {
    const versao = registro.questionario_versao[0]
    if (!versao) return []
    const prazo = disponibilidade(porQuestionario.get(registro.id) ?? null, versao.periodo_reaplicacao_dias)
    return [{
      id: registro.id,
      nome: registro.nome,
      descricao: registro.descricao,
      ordem: registro.ordem,
      versao: {
        id: versao.id,
        versao: versao.versao,
        periodoReaplicacaoDias: versao.periodo_reaplicacao_dias,
      },
      podeResponder: prazo.podeResponder,
      disponivelEm: prazo.disponivelEm,
    }]
  })
}

export async function detalharParaResponder(usuarioId: number, questionarioId: number) {
  const { questionario, versao } = await carregarPublicado(questionarioId)
  const prazo = disponibilidade(await ultimaRespostaEm(usuarioId, questionarioId), versao.periodo_reaplicacao_dias)
  return {
    id: questionario.id,
    nome: questionario.nome,
    descricao: questionario.descricao,
    versao: {
      id: versao.id,
      versao: versao.versao,
      periodoReaplicacaoDias: versao.periodo_reaplicacao_dias,
      perguntas: apresentarPerguntas(versao),
    },
    podeResponder: prazo.podeResponder,
    disponivelEm: prazo.disponivelEm,
  }
}

function apresentarResultado(registro: {
  id: number
  versao_id: number
  criado_em: Date
  questionario_versao: { questionario_id: number }
  resposta: {
    pergunta_id: number
    opcao_id: number | null
    texto: string | null
    pergunta: { ordem: number }
    opcao_pergunta: { texto: string } | null
  }[]
  resultado: {
    pontuacao: number
    faixa_interpretacao: { codigo: string; rotulo: string; texto_orientativo: string }
  } | null
}) {
  if (!registro.resultado) {
    throw new ErroAplicacao(500, 'RESULTADO_INDISPONIVEL', 'Não foi possível calcular o resultado desta versão.')
  }
  return {
    id: registro.id,
    questionarioId: registro.questionario_versao.questionario_id,
    versaoId: registro.versao_id,
    criadoEm: registro.criado_em.toISOString(),
    respostas: [...registro.resposta]
      .sort((a, b) => a.pergunta.ordem - b.pergunta.ordem)
      .map((resposta) => ({
        perguntaId: resposta.pergunta_id,
        opcaoId: resposta.opcao_id,
        textoOpcao: resposta.opcao_pergunta?.texto ?? null,
        texto: resposta.texto,
      })),
    resultado: {
      pontuacao: registro.resultado.pontuacao,
      faixa: {
        codigo: registro.resultado.faixa_interpretacao.codigo,
        rotulo: registro.resultado.faixa_interpretacao.rotulo,
        textoOrientativo: registro.resultado.faixa_interpretacao.texto_orientativo,
      },
    },
  }
}

export async function enviarAvaliacao(usuarioId: number, questionarioId: number, entrada: EnviarAvaliacaoEntrada) {
  const { versao } = await carregarPublicado(questionarioId)
  exigirPrazo(versao.periodo_reaplicacao_dias, await ultimaRespostaEm(usuarioId, questionarioId))

  const falhas = falhasDeResposta(versao, entrada.respostas)
  if (falhas.length > 0) {
    throw new ErroAplicacao(400, 'RESPOSTA_INVALIDA', 'A resposta está incompleta.', falhas)
  }

  const calculo = calcularPontuacao(
    versao.pergunta.map((pergunta) => ({
      id: pergunta.id,
      tipo: pergunta.tipo,
      opcoes: pergunta.opcao_pergunta.map((opcao) => ({ id: opcao.id, valor_numerico: opcao.valor_numerico })),
    })),
    entrada.respostas.map((resposta) => ({
      perguntaId: resposta.perguntaId,
      opcaoId: 'opcaoId' in resposta ? resposta.opcaoId : null,
    })),
    versao.faixa_interpretacao,
  )

  const criada = await prisma.$transaction(async (transacao) => {
    const ultima = await transacao.avaliacao.findFirst({
      where: { usuario_id: usuarioId, questionario_versao: { questionario_id: questionarioId } },
      orderBy: { criado_em: 'desc' },
      select: { criado_em: true },
    })
    exigirPrazo(versao.periodo_reaplicacao_dias, ultima?.criado_em ?? null)

    return transacao.avaliacao.create({
      data: {
        usuario_id: usuarioId,
        versao_id: versao.id,
        resposta: {
          create: entrada.respostas.map((resposta) => ({
            pergunta_id: resposta.perguntaId,
            opcao_id: 'opcaoId' in resposta ? resposta.opcaoId : null,
            texto: 'texto' in resposta ? resposta.texto : null,
          })),
        },
        resultado: {
          create: { pontuacao: calculo.pontuacao, faixa_id: calculo.faixa.id },
        },
      },
      include: {
        questionario_versao: { select: { questionario_id: true } },
        resposta: {
          include: {
            pergunta: { select: { ordem: true } },
            opcao_pergunta: { select: { texto: true } },
          },
        },
        resultado: { include: { faixa_interpretacao: true } },
      },
    })
  })

  return apresentarResultado(criada)
}

export async function consultarAvaliacao(usuarioId: number, avaliacaoId: number) {
  const registro = await prisma.avaliacao.findFirst({
    where: { id: avaliacaoId, usuario_id: usuarioId },
    include: {
      questionario_versao: { select: { questionario_id: true } },
      resposta: {
        include: {
          pergunta: { select: { ordem: true } },
          opcao_pergunta: { select: { texto: true } },
        },
      },
      resultado: { include: { faixa_interpretacao: true } },
    },
  })
  if (!registro) {
    throw new ErroAplicacao(404, 'AVALIACAO_NAO_ENCONTRADA', 'Avaliação não encontrada.')
  }
  return apresentarResultado(registro)
}
