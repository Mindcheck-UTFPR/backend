import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import type { EnviarAvaliacaoEntrada, SalvarRascunhoAvaliacaoEntrada } from '../validators/avaliacaoValidator.js'
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

async function ultimaConclusaoEm(usuarioId: number, questionarioId: number) {
  const ultima = await prisma.avaliacao.findFirst({
    where: {
      usuario_id: usuarioId,
      concluida_em: { not: null },
      questionario_versao: { questionario_id: questionarioId },
    },
    orderBy: { concluida_em: 'desc' },
    select: { concluida_em: true },
  })
  return ultima?.concluida_em ?? null
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
  versao: {
    pergunta: { id: number; tipo: string; obrigatoria: boolean; opcao_pergunta: { id: number }[] }[]
  },
  respostas: EnviarAvaliacaoEntrada['respostas'],
  exigirCompleta: boolean,
) {
  const porPergunta = new Map(respostas.map((resposta) => [resposta.perguntaId, resposta]))
  const falhas: { campo: string; mensagem: string }[] = []
  const idsDaVersao = new Set(versao.pergunta.map((pergunta) => pergunta.id))

  for (const pergunta of versao.pergunta) {
    const resposta = porPergunta.get(pergunta.id)
    const fechada = pergunta.tipo !== 'aberta'
    const campo = `perguntas.${pergunta.id}`
    if (!resposta) {
      if (exigirCompleta && (fechada || pergunta.obrigatoria)) {
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
  const avaliacoes = ids.length === 0
    ? []
    : await prisma.avaliacao.findMany({
      where: { usuario_id: usuarioId, questionario_versao: { questionario_id: { in: ids } } },
      orderBy: { criado_em: 'desc' },
      select: {
        id: true,
        concluida_em: true,
        questionario_versao: { select: { id: true, questionario_id: true } },
      },
    })
  const conclusaoPorQuestionario = new Map<number, Date>()
  const rascunhoPorQuestionario = new Map<number, { id: number; versaoId: number }>()
  for (const item of avaliacoes) {
    const questionarioId = item.questionario_versao.questionario_id
    if (item.concluida_em && !conclusaoPorQuestionario.has(questionarioId)) {
      conclusaoPorQuestionario.set(questionarioId, item.concluida_em)
    }
    if (!item.concluida_em && !rascunhoPorQuestionario.has(questionarioId)) {
      rascunhoPorQuestionario.set(questionarioId, { id: item.id, versaoId: item.questionario_versao.id })
    }
  }

  return registros.flatMap((registro) => {
    const versao = registro.questionario_versao[0]
    if (!versao) return []
    const rascunho = rascunhoPorQuestionario.get(registro.id)
    const rascunhoId = rascunho?.versaoId === versao.id ? rascunho.id : null
    const prazo = disponibilidade(conclusaoPorQuestionario.get(registro.id) ?? null, versao.periodo_reaplicacao_dias)
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
      podeResponder: prazo.podeResponder || rascunhoId !== null,
      disponivelEm: prazo.disponivelEm,
      rascunhoId,
    }]
  })
}

export async function detalharParaResponder(usuarioId: number, questionarioId: number) {
  const { questionario, versao } = await carregarPublicado(questionarioId)
  const prazo = disponibilidade(await ultimaConclusaoEm(usuarioId, questionarioId), versao.periodo_reaplicacao_dias)
  const rascunho = await prisma.avaliacao.findFirst({
    where: { usuario_id: usuarioId, versao_id: versao.id, concluida_em: null },
    include: includeAvaliacao,
  })
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
    podeResponder: prazo.podeResponder || rascunho !== null,
    disponivelEm: prazo.disponivelEm,
    rascunho: rascunho ? apresentarAvaliacao(rascunho) : null,
  }
}

function apresentarAvaliacao(registro: {
  id: number
  versao_id: number
  revisao?: number
  concluida_em?: Date | null
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
  return {
    id: registro.id,
    questionarioId: registro.questionario_versao.questionario_id,
    versaoId: registro.versao_id,
    revisao: registro.revisao ?? 1,
    concluidaEm: registro.concluida_em ? registro.concluida_em.toISOString() : null,
    criadoEm: registro.criado_em.toISOString(),
    respostas: [...registro.resposta]
      .sort((a, b) => a.pergunta.ordem - b.pergunta.ordem)
      .map((resposta) => ({
        perguntaId: resposta.pergunta_id,
        opcaoId: resposta.opcao_id,
        textoOpcao: resposta.opcao_pergunta?.texto ?? null,
        texto: resposta.texto,
      })),
    resultado: registro.resultado
      ? {
        pontuacao: registro.resultado.pontuacao,
        faixa: {
          codigo: registro.resultado.faixa_interpretacao.codigo,
          rotulo: registro.resultado.faixa_interpretacao.rotulo,
          textoOrientativo: registro.resultado.faixa_interpretacao.texto_orientativo,
        },
      }
      : null,
  }
}

export async function enviarAvaliacao(usuarioId: number, questionarioId: number, entrada: EnviarAvaliacaoEntrada) {
  const { versao } = await carregarPublicado(questionarioId)
  const rascunhoAberto = await prisma.avaliacao.findFirst({
    where: { usuario_id: usuarioId, versao_id: versao.id, concluida_em: null },
    select: { id: true },
  })
  if (rascunhoAberto) {
    throw new ErroAplicacao(409, 'RASCUNHO_ABERTO', 'Há um rascunho em andamento. Continue por ele para concluir.')
  }
  exigirPrazo(versao.periodo_reaplicacao_dias, await ultimaConclusaoEm(usuarioId, questionarioId))

  const falhas = falhasDeResposta(versao, entrada.respostas, true)
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
      where: {
        usuario_id: usuarioId,
        concluida_em: { not: null },
        questionario_versao: { questionario_id: questionarioId },
      },
      orderBy: { concluida_em: 'desc' },
      select: { concluida_em: true },
    })
    exigirPrazo(versao.periodo_reaplicacao_dias, ultima?.concluida_em ?? null)

    return transacao.avaliacao.create({
      data: {
        usuario_id: usuarioId,
        versao_id: versao.id,
        concluida_em: new Date(),
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

  const apresentada = apresentarAvaliacao(criada)
  if (!apresentada.resultado) {
    throw new ErroAplicacao(500, 'RESULTADO_INDISPONIVEL', 'Não foi possível calcular o resultado desta versão.')
  }
  return apresentada
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
  return apresentarAvaliacao(registro)
}

const includeAvaliacao = {
  questionario_versao: {
    select: {
      questionario_id: true,
      periodo_reaplicacao_dias: true,
      pergunta: {
        orderBy: { ordem: 'asc' as const },
        include: { opcao_pergunta: { orderBy: { ordem: 'asc' as const } } },
      },
      faixa_interpretacao: { orderBy: { minimo: 'asc' as const } },
    },
  },
  resposta: {
    include: {
      pergunta: { select: { ordem: true } },
      opcao_pergunta: { select: { texto: true } },
    },
  },
  resultado: { include: { faixa_interpretacao: true } },
} as const

function conflitoUnico(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002'
}

function dadosResposta(respostas: EnviarAvaliacaoEntrada['respostas']) {
  return respostas.map((resposta) => ({
    pergunta_id: resposta.perguntaId,
    opcao_id: 'opcaoId' in resposta ? resposta.opcaoId : null,
    texto: 'texto' in resposta ? resposta.texto : null,
  }))
}

async function carregarDoUsuario(usuarioId: number, avaliacaoId: number) {
  const registro = await prisma.avaliacao.findFirst({
    where: { id: avaliacaoId, usuario_id: usuarioId },
    include: includeAvaliacao,
  })
  if (!registro) {
    throw new ErroAplicacao(404, 'AVALIACAO_NAO_ENCONTRADA', 'Avaliação não encontrada.')
  }
  return registro
}

export async function abrirRascunho(usuarioId: number, questionarioId: number) {
  const { versao } = await carregarPublicado(questionarioId)
  const existente = await prisma.avaliacao.findFirst({
    where: { usuario_id: usuarioId, versao_id: versao.id, concluida_em: null },
    include: includeAvaliacao,
  })
  if (existente) {
    return { avaliacao: apresentarAvaliacao(existente), criada: false }
  }

  exigirPrazo(versao.periodo_reaplicacao_dias, await ultimaConclusaoEm(usuarioId, questionarioId))

  try {
    const criada = await prisma.avaliacao.create({
      data: { usuario_id: usuarioId, versao_id: versao.id },
      include: includeAvaliacao,
    })
    return { avaliacao: apresentarAvaliacao(criada), criada: true }
  } catch (erro) {
    if (!conflitoUnico(erro)) throw erro
    const repetida = await prisma.avaliacao.findFirst({
      where: { usuario_id: usuarioId, versao_id: versao.id, concluida_em: null },
      include: includeAvaliacao,
    })
    if (!repetida) throw erro
    return { avaliacao: apresentarAvaliacao(repetida), criada: false }
  }
}

export async function salvarRascunho(usuarioId: number, avaliacaoId: number, entrada: SalvarRascunhoAvaliacaoEntrada) {
  const registro = await carregarDoUsuario(usuarioId, avaliacaoId)
  if (registro.concluida_em) {
    throw new ErroAplicacao(409, 'AVALIACAO_CONCLUIDA', 'A avaliação já foi concluída.')
  }
  if (registro.revisao !== entrada.revisao) {
    throw new ErroAplicacao(409, 'CONFLITO_AVALIACAO', 'O rascunho foi atualizado em outro envio. Recarregue para continuar.')
  }

  const falhas = falhasDeResposta(registro.questionario_versao, entrada.respostas, false)
  if (falhas.length > 0) {
    throw new ErroAplicacao(400, 'RESPOSTA_INVALIDA', 'A resposta está incompleta.', falhas)
  }

  const gravada = await prisma.$transaction(async (transacao) => {
    await transacao.resposta.deleteMany({ where: { avaliacao_id: avaliacaoId } })
    if (entrada.respostas.length > 0) {
      await transacao.resposta.createMany({
        data: dadosResposta(entrada.respostas).map((resposta) => ({ ...resposta, avaliacao_id: avaliacaoId })),
      })
    }
    const atualizada = await transacao.avaliacao.updateMany({
      where: { id: avaliacaoId, usuario_id: usuarioId, revisao: entrada.revisao, concluida_em: null },
      data: { revisao: { increment: 1 } },
    })
    if (atualizada.count === 0) {
      throw new ErroAplicacao(409, 'CONFLITO_AVALIACAO', 'O rascunho foi atualizado em outro envio. Recarregue para continuar.')
    }
    return transacao.avaliacao.findFirstOrThrow({
      where: { id: avaliacaoId },
      include: includeAvaliacao,
    })
  })

  return apresentarAvaliacao(gravada)
}

export async function concluirAvaliacao(usuarioId: number, avaliacaoId: number, revisao: number) {
  const registro = await carregarDoUsuario(usuarioId, avaliacaoId)
  if (registro.concluida_em && registro.resultado) {
    return apresentarAvaliacao(registro)
  }
  if (registro.revisao !== revisao) {
    throw new ErroAplicacao(409, 'CONFLITO_AVALIACAO', 'O rascunho foi atualizado em outro envio. Recarregue para continuar.')
  }

  const respostas = registro.resposta.map((resposta) => (
    resposta.opcao_id !== null
      ? { perguntaId: resposta.pergunta_id, opcaoId: resposta.opcao_id }
      : { perguntaId: resposta.pergunta_id, texto: resposta.texto ?? '' }
  ))
  const falhas = falhasDeResposta(registro.questionario_versao, respostas, true)
  if (falhas.length > 0) {
    throw new ErroAplicacao(400, 'RESPOSTA_INVALIDA', 'A resposta está incompleta.', falhas)
  }

  const calculo = calcularPontuacao(
    registro.questionario_versao.pergunta.map((pergunta) => ({
      id: pergunta.id,
      tipo: pergunta.tipo,
      opcoes: pergunta.opcao_pergunta.map((opcao) => ({ id: opcao.id, valor_numerico: opcao.valor_numerico })),
    })),
    respostas.map((resposta) => ({
      perguntaId: resposta.perguntaId,
      opcaoId: 'opcaoId' in resposta && typeof resposta.opcaoId === 'number' ? resposta.opcaoId : null,
    })),
    registro.questionario_versao.faixa_interpretacao,
  )

  const concluida = await prisma.$transaction(async (transacao) => {
    const atualizada = await transacao.avaliacao.updateMany({
      where: { id: avaliacaoId, usuario_id: usuarioId, revisao, concluida_em: null },
      data: { revisao: { increment: 1 }, concluida_em: new Date() },
    })
    if (atualizada.count === 0) {
      const atual = await transacao.avaliacao.findFirst({
        where: { id: avaliacaoId, usuario_id: usuarioId },
        include: includeAvaliacao,
      })
      if (atual?.concluida_em && atual.resultado) return atual
      throw new ErroAplicacao(409, 'CONFLITO_AVALIACAO', 'O rascunho foi atualizado em outro envio. Recarregue para continuar.')
    }
    await transacao.resultado.create({
      data: { avaliacao_id: avaliacaoId, pontuacao: calculo.pontuacao, faixa_id: calculo.faixa.id },
    })
    return transacao.avaliacao.findFirstOrThrow({
      where: { id: avaliacaoId },
      include: includeAvaliacao,
    })
  })

  const apresentada = apresentarAvaliacao(concluida)
  if (!apresentada.resultado) {
    throw new ErroAplicacao(500, 'RESULTADO_INDISPONIVEL', 'Não foi possível calcular o resultado desta versão.')
  }
  return apresentada
}
