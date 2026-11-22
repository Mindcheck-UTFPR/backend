import { Prisma, type faixa_interpretacao, type opcao_pergunta, type pergunta, type questionario, type questionario_versao } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import { exigirVersaoEditavel } from './versaoQuestionarioService.js'
import { falhasDePublicacao } from './publicacaoQuestionarioService.js'
import type { CriarQuestionarioEntrada, NovaVersaoEntrada, SalvarRascunhoEntrada } from '../validators/questionarioValidator.js'

const versaoCompleta = {
  pergunta: {
    orderBy: { ordem: 'asc' as const },
    include: { opcao_pergunta: { orderBy: { ordem: 'asc' as const } } },
  },
  faixa_interpretacao: { orderBy: { minimo: 'asc' as const } },
}

type VersaoCarregada = questionario_versao & {
  pergunta: (pergunta & { opcao_pergunta: opcao_pergunta[] })[]
  faixa_interpretacao: faixa_interpretacao[]
}

function apresentarVersao(versao: VersaoCarregada) {
  return {
    id: versao.id,
    versao: versao.versao,
    ativa: versao.ativa,
    publicadaEm: versao.publicada_em ? versao.publicada_em.toISOString() : null,
    periodoReaplicacaoDias: versao.periodo_reaplicacao_dias,
    perguntas: versao.pergunta.map((item) => ({
      id: item.id,
      texto: item.texto,
      tipo: item.tipo,
      ordem: item.ordem,
      obrigatoria: item.obrigatoria,
      opcoes: item.opcao_pergunta.map((opcao) => ({
        id: opcao.id,
        texto: opcao.texto,
        valorNumerico: opcao.valor_numerico,
        ordem: opcao.ordem,
      })),
    })),
    faixas: versao.faixa_interpretacao.map((faixa) => ({
      id: faixa.id,
      minimo: faixa.minimo,
      maximo: faixa.maximo,
      codigo: faixa.codigo,
      rotulo: faixa.rotulo,
      textoOrientativo: faixa.texto_orientativo,
    })),
  }
}

function apresentarQuestionario(registro: questionario & { questionario_versao: VersaoCarregada[] }) {
  return {
    id: registro.id,
    nome: registro.nome,
    descricao: registro.descricao,
    ordem: registro.ordem,
    ativo: registro.ativo,
    versoes: registro.questionario_versao.map(apresentarVersao),
  }
}

export interface QuestionarioResumo {
  id: number
  nome: string
  ativo: boolean
  versoes: {
    id: number
    versao: string
    ativa: boolean
    publicadaEm: string | null
  }[]
}

export async function listarQuestionarios(): Promise<QuestionarioResumo[]> {
  const registros = await prisma.questionario.findMany({
    orderBy: { ordem: 'asc' },
    select: {
      id: true,
      nome: true,
      ativo: true,
      questionario_versao: {
        orderBy: { id: 'asc' },
        select: { id: true, versao: true, ativa: true, publicada_em: true },
      },
    },
  })

  return registros.map((registro) => ({
    id: registro.id,
    nome: registro.nome,
    ativo: registro.ativo,
    versoes: registro.questionario_versao.map((versao) => ({
      id: versao.id,
      versao: versao.versao,
      ativa: versao.ativa,
      publicadaEm: versao.publicada_em ? versao.publicada_em.toISOString() : null,
    })),
  }))
}

async function carregarQuestionario(questionarioId: number) {
  const registro = await prisma.questionario.findUnique({
    where: { id: questionarioId },
    include: { questionario_versao: { orderBy: { id: 'asc' }, include: versaoCompleta } },
  })
  if (!registro) {
    throw new ErroAplicacao(404, 'QUESTIONARIO_NAO_ENCONTRADO', 'Questionário não encontrado.')
  }
  return registro
}

async function carregarVersao(questionarioId: number, versaoId: number) {
  const versao = await prisma.questionario_versao.findUnique({
    where: { id: versaoId },
    include: versaoCompleta,
  })
  if (!versao || versao.questionario_id !== questionarioId) {
    throw new ErroAplicacao(404, 'VERSAO_NAO_ENCONTRADA', 'Versão não encontrada.')
  }
  return versao
}

function conflitoUnico(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002'
}

export async function detalharQuestionario(questionarioId: number) {
  return apresentarQuestionario(await carregarQuestionario(questionarioId))
}

export async function criarQuestionario(entrada: CriarQuestionarioEntrada) {
  try {
    const criado = await prisma.questionario.create({
      data: {
        nome: entrada.nome,
        descricao: entrada.descricao,
        ordem: entrada.ordem,
        questionario_versao: {
          create: {
            versao: entrada.versao,
            ativa: false,
            periodo_reaplicacao_dias: entrada.periodoReaplicacaoDias,
          },
        },
      },
      include: { questionario_versao: { include: versaoCompleta } },
    })
    return apresentarQuestionario(criado)
  } catch (erro) {
    if (conflitoUnico(erro)) {
      throw new ErroAplicacao(409, 'QUESTIONARIO_JA_EXISTE', 'Já existe um questionário com esse nome ou versão.')
    }
    throw erro
  }
}

export async function salvarRascunho(questionarioId: number, versaoId: number, entrada: SalvarRascunhoEntrada) {
  const versao = await carregarVersao(questionarioId, versaoId)
  exigirVersaoEditavel(versao)

  await prisma.$transaction(async (transacao) => {
    await transacao.pergunta.deleteMany({ where: { versao_id: versaoId } })
    await transacao.faixa_interpretacao.deleteMany({ where: { versao_id: versaoId } })
    for (const item of entrada.perguntas) {
      await transacao.pergunta.create({
        data: {
          versao_id: versaoId,
          texto: item.texto,
          tipo: item.tipo,
          ordem: item.ordem,
          obrigatoria: item.obrigatoria,
          opcao_pergunta: {
            create: item.opcoes.map((opcao) => ({
              texto: opcao.texto,
              valor_numerico: opcao.valorNumerico,
              ordem: opcao.ordem,
            })),
          },
        },
      })
    }
    if (entrada.faixas.length > 0) {
      await transacao.faixa_interpretacao.createMany({
        data: entrada.faixas.map((faixa) => ({
          versao_id: versaoId,
          minimo: faixa.minimo,
          maximo: faixa.maximo,
          codigo: faixa.codigo,
          rotulo: faixa.rotulo,
          texto_orientativo: faixa.textoOrientativo,
        })),
      })
    }
  })

  return apresentarQuestionario(await carregarQuestionario(questionarioId))
}

export async function publicarVersao(questionarioId: number, versaoId: number, administradorId: number) {
  const versao = await carregarVersao(questionarioId, versaoId)
  exigirVersaoEditavel(versao)

  const falhas = falhasDePublicacao({
    periodo_reaplicacao_dias: versao.periodo_reaplicacao_dias,
    perguntas: versao.pergunta.map((item) => ({
      tipo: item.tipo,
      opcoes: item.opcao_pergunta.map((opcao) => ({ valor_numerico: opcao.valor_numerico })),
    })),
    faixas: versao.faixa_interpretacao.map((faixa) => ({ minimo: faixa.minimo, maximo: faixa.maximo })),
  })
  if (falhas.length > 0) {
    throw new ErroAplicacao(400, 'PUBLICACAO_INVALIDA', 'A versão não está completa para publicação.', falhas)
  }

  const publicadaEm = new Date()
  await prisma.$transaction(async (transacao) => {
    await transacao.questionario_versao.updateMany({
      where: { questionario_id: questionarioId, ativa: true },
      data: { ativa: false },
    })
    await transacao.questionario_versao.update({
      where: { id: versaoId },
      data: { ativa: true, publicada_em: publicadaEm },
    })
    await transacao.publicacao_questionario.create({
      data: { usuario_id: administradorId, versao_id: versaoId, operacao: 'publicar' },
    })
  })

  return apresentarQuestionario(await carregarQuestionario(questionarioId))
}

export async function criarNovaVersao(questionarioId: number, entrada: NovaVersaoEntrada) {
  const questionario = await carregarQuestionario(questionarioId)
  const origem = questionario.questionario_versao.find((versao) => versao.ativa && versao.publicada_em)
  if (!origem) {
    throw new ErroAplicacao(404, 'VERSAO_NAO_ENCONTRADA', 'Não há versão publicada para copiar.')
  }

  try {
    await prisma.questionario_versao.create({
      data: {
        questionario_id: questionarioId,
        versao: entrada.versao,
        ativa: false,
        periodo_reaplicacao_dias: origem.periodo_reaplicacao_dias,
        pergunta: {
          create: origem.pergunta.map((item) => ({
            texto: item.texto,
            tipo: item.tipo,
            ordem: item.ordem,
            obrigatoria: item.obrigatoria,
            opcao_pergunta: {
              create: item.opcao_pergunta.map((opcao) => ({
                texto: opcao.texto,
                valor_numerico: opcao.valor_numerico,
                ordem: opcao.ordem,
              })),
            },
          })),
        },
        faixa_interpretacao: {
          create: origem.faixa_interpretacao.map((faixa) => ({
            minimo: faixa.minimo,
            maximo: faixa.maximo,
            codigo: faixa.codigo,
            rotulo: faixa.rotulo,
            texto_orientativo: faixa.texto_orientativo,
          })),
        },
      },
    })
  } catch (erro) {
    if (conflitoUnico(erro)) {
      throw new ErroAplicacao(409, 'VERSAO_JA_EXISTE', 'Essa versão já existe neste questionário.')
    }
    throw erro
  }

  return apresentarQuestionario(await carregarQuestionario(questionarioId))
}
