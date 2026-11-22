import { prisma } from '../config/prisma.js'

export interface UsuarioAdministracao {
  id: number
  nome: string
  email: string
  papel: 'usuario' | 'admin'
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

export async function listarAuditoria(): Promise<{
  administradorId: number
  ocorridoEm: string
  versaoId: number
  operacao: string
}[]> {
  const registros = await prisma.publicacao_questionario.findMany({
    orderBy: { ocorrido_em: 'desc' },
    select: { usuario_id: true, ocorrido_em: true, versao_id: true, operacao: true },
  })

  return registros.map((registro) => ({
    administradorId: registro.usuario_id,
    ocorridoEm: registro.ocorrido_em.toISOString(),
    versaoId: registro.versao_id,
    operacao: registro.operacao,
  }))
}
