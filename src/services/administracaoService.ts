import { prisma } from '../config/prisma.js'

export interface QuestionarioAdministracao {
  id: number
  nome: string
  ativo: boolean
  versoes: {
    id: number
    versao: string
    ativa: boolean
  }[]
}

export interface UsuarioAdministracao {
  id: number
  nome: string
  email: string
  papel: 'usuario' | 'admin'
}

export async function listarQuestionarios(): Promise<QuestionarioAdministracao[]> {
  const registros = await prisma.questionario.findMany({
    orderBy: { ordem: 'asc' },
    select: {
      id: true,
      nome: true,
      ativo: true,
      questionario_versao: {
        orderBy: { id: 'asc' },
        select: { id: true, versao: true, ativa: true },
      },
    },
  })

  return registros.map((registro) => ({
    id: registro.id,
    nome: registro.nome,
    ativo: registro.ativo,
    versoes: registro.questionario_versao,
  }))
}

export async function listarUsuarios(): Promise<UsuarioAdministracao[]> {
  const registros = await prisma.usuario.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, nome: true, email: true, papel: true },
  })

  return registros.map((registro) => ({
    id: registro.id,
    nome: registro.nome,
    email: registro.email,
    papel: registro.papel,
  }))
}

export function listarAuditoria(): [] {
  return []
}
