import { Prisma, type checkin_diario } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import {
  dataStringParaDateBanco,
  dateBancoParaDataString,
  podeEditarCheckin,
} from '../utils/dataBrasil.js'
import type { CriarCheckinEntrada, EditarCheckinEntrada } from '../validators/checkinValidator.js'

export interface CheckinResposta {
  id: string
  data: string
  humor: checkin_diario['humor']
  intensidade: number | null
  sonoHoras: number | null
  estudou: boolean | null
  atividadeFisica: boolean | null
  relacoes: number | null
  observacao: string | null
  podeEditar: boolean
  criadoEm: string
  editadoEm: string | null
}

function formatarCheckin(registro: checkin_diario): CheckinResposta {
  const data = dateBancoParaDataString(registro.data)
  return {
    id: String(registro.id),
    data,
    humor: registro.humor,
    intensidade: registro.intensidade,
    sonoHoras: registro.sono_horas !== null ? Number(registro.sono_horas) : null,
    estudou: registro.estudou,
    atividadeFisica: registro.atividade_fisica,
    relacoes: registro.relacoes,
    observacao: registro.eventos,
    podeEditar: podeEditarCheckin(data),
    criadoEm: registro.criado_em.toISOString(),
    editadoEm: registro.editado_em ? registro.editado_em.toISOString() : null,
  }
}

export async function criarCheckin(
  usuarioId: number,
  entrada: CriarCheckinEntrada,
): Promise<CheckinResposta> {
  const dataBanco = dataStringParaDateBanco(entrada.data)

  const existente = await prisma.checkin_diario.findUnique({
    where: {
      usuario_id_data: {
        usuario_id: usuarioId,
        data: dataBanco,
      },
    },
  })

  if (existente) {
    throw new ErroCheckinDuplicado(formatarCheckin(existente))
  }

  try {
    const criado = await prisma.checkin_diario.create({
      data: {
        usuario_id: usuarioId,
        data: dataBanco,
        humor: entrada.humor,
        intensidade: entrada.intensidade,
        sono_horas: entrada.sonoHoras,
        estudou: entrada.estudou,
        atividade_fisica: entrada.atividadeFisica,
        relacoes: entrada.relacoes,
        eventos: entrada.observacao,
      },
    })

    return formatarCheckin(criado)
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      const registroConcorrente = await prisma.checkin_diario.findUnique({
        where: {
          usuario_id_data: {
            usuario_id: usuarioId,
            data: dataBanco,
          },
        },
      })
      if (registroConcorrente) {
        throw new ErroCheckinDuplicado(formatarCheckin(registroConcorrente))
      }
    }
    throw erro
  }
}

export async function editarCheckin(
  usuarioId: number,
  data: string,
  entrada: EditarCheckinEntrada,
): Promise<CheckinResposta> {
  const dataBanco = dataStringParaDateBanco(data)

  const existente = await prisma.checkin_diario.findUnique({
    where: {
      usuario_id_data: {
        usuario_id: usuarioId,
        data: dataBanco,
      },
    },
  })

  if (!existente) {
    throw new ErroAplicacao(404, 'CHECKIN_NAO_ENCONTRADO', 'Check-in não encontrado para esta data.')
  }

  if (!podeEditarCheckin(data)) {
    throw new ErroAplicacao(
      403,
      'CHECKIN_NAO_EDITAVEL',
      'O check-in não pode mais ser editado pois a janela do dia encerrou.',
    )
  }

  const dadosAtualizacao: Prisma.checkin_diarioUpdateInput = {
    editado_em: new Date(),
  }

  if (entrada.humor !== undefined) dadosAtualizacao.humor = entrada.humor
  if (entrada.intensidade !== undefined) dadosAtualizacao.intensidade = entrada.intensidade
  if (entrada.sonoHoras !== undefined) dadosAtualizacao.sono_horas = entrada.sonoHoras
  if (entrada.estudou !== undefined) dadosAtualizacao.estudou = entrada.estudou
  if (entrada.atividadeFisica !== undefined) {
    dadosAtualizacao.atividade_fisica = entrada.atividadeFisica
  }
  if (entrada.relacoes !== undefined) dadosAtualizacao.relacoes = entrada.relacoes
  if (entrada.observacao !== undefined) dadosAtualizacao.eventos = entrada.observacao

  const atualizado = await prisma.checkin_diario.update({
    where: { id: existente.id },
    data: dadosAtualizacao,
  })

  return formatarCheckin(atualizado)
}

export class ErroCheckinDuplicado extends Error {
  readonly checkin: CheckinResposta

  constructor(checkin: CheckinResposta) {
    super('Já existe check-in cadastrado nesta data.')
    this.name = 'ErroCheckinDuplicado'
    this.checkin = checkin
  }
}