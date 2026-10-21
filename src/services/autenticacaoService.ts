import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import { gerarHashSenha, hashSenhaInexistente, senhaConfere } from '../utils/senha.js'
import { emitirAccessToken, emitirRefreshToken, expiracaoRefresh } from '../utils/tokens.js'
import type { CadastroEntrada, LoginEntrada } from '../validators/autenticacaoValidator.js'

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

export async function cadastrar(entrada: CadastroEntrada): Promise<UsuarioPublico> {
  const senhaHash = await gerarHashSenha(entrada.senha)

  try {
    const usuario = await prisma.usuario.create({
      data: {
        nome: entrada.nome,
        email: entrada.email,
        senha_hash: senhaHash,
        papel: 'usuario',
        termos_aceitos_em: new Date(),
        termos_versao: entrada.termosVersao,
      },
    })
    return publico(usuario)
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroAplicacao(409, 'EMAIL_EM_USO', 'Este e-mail já está cadastrado.')
    }
    throw erro
  }
}

export async function entrar(entrada: LoginEntrada) {
  const usuario = await prisma.usuario.findUnique({ where: { email: entrada.email } })
  const confere = await senhaConfere(entrada.senha, usuario?.senha_hash ?? hashSenhaInexistente)

  if (!usuario || !confere) {
    throw new ErroAplicacao(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos.')
  }

  const refresh = emitirRefreshToken()
  const expiraEm = expiracaoRefresh()
  await prisma.sessao.create({
    data: {
      usuario_id: usuario.id,
      refresh_token_hash: refresh.hash,
      expira_em: expiraEm,
    },
  })

  const accessToken = await emitirAccessToken({ id: usuario.id, papel: usuario.papel })
  return {
    accessToken,
    refreshToken: refresh.token,
    expiraEm: expiraEm.toISOString(),
    usuario: publico(usuario),
  }
}
