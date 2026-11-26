import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import { gerarHashSenha, senhaConfere } from '../utils/senha.js'
import type { AlterarSenhaEntrada, EditarPerfilEntrada } from '../validators/perfilValidator.js'

type UsuarioPublico = {
  id: number
  nome: string
  email: string
  papel: 'usuario' | 'admin'
}

function publico(usuario: UsuarioPublico): UsuarioPublico {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    papel: usuario.papel,
  }
}

export async function atualizarPerfil(usuarioId: number, entrada: EditarPerfilEntrada): Promise<UsuarioPublico> {
  try {
    const usuario = await prisma.usuario.update({
      where: { id: usuarioId },
      data: { nome: entrada.nome, email: entrada.email },
      select: { id: true, nome: true, email: true, papel: true },
    })
    return publico(usuario)
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroAplicacao(409, 'EMAIL_EM_USO', 'Este e-mail já está cadastrado.')
    }
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2025') {
      throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Sua sessão expirou. Entre novamente.')
    }
    throw erro
  }
}

export async function alterarSenha(usuarioId: number, entrada: AlterarSenhaEntrada): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { senha_hash: true },
  })
  if (!usuario) {
    throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Sua sessão expirou. Entre novamente.')
  }

  const confere = await senhaConfere(entrada.senhaAtual, usuario.senha_hash)
  if (!confere) {
    throw new ErroAplicacao(401, 'SENHA_ATUAL_INVALIDA', 'A senha atual está incorreta.')
  }

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { senha_hash: await gerarHashSenha(entrada.novaSenha) },
  })
}
