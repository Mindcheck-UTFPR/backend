import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import { gerarHashSenha, hashSenhaInexistente, senhaConfere } from '../utils/senha.js'
import { emitirAccessToken, emitirRefreshToken, expiracaoRefresh, hashRefreshToken, verificarAccessToken, verificarTokenRevogacao } from '../utils/tokens.js'
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
  const sessao = await prisma.sessao.create({
    data: {
      usuario_id: usuario.id,
      refresh_token_hash: refresh.hash,
      expira_em: expiraEm,
    },
  })

  const accessToken = await emitirAccessToken({ id: usuario.id, papel: usuario.papel }, sessao.id)
  return {
    accessToken,
    refreshToken: refresh.token,
    expiraEm: expiraEm.toISOString(),
    usuario: publico(usuario),
  }
}

function sessaoInvalida() {
  return new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Sua sessão expirou. Entre novamente.')
}

export async function usuarioDaSessao(accessToken: string): Promise<UsuarioPublico> {
  let identidade: Awaited<ReturnType<typeof verificarAccessToken>>
  try { identidade = await verificarAccessToken(accessToken) } catch { throw sessaoInvalida() }
  const sessao = await prisma.sessao.findUnique({ where: { id: identidade.sessaoId }, include: { usuario: true } })
  if (!sessao || sessao.usuario_id !== identidade.usuarioId || sessao.expira_em <= new Date()) throw sessaoInvalida()
  return publico(sessao.usuario)
}

export async function renovar(refreshToken: string) {
  const hash = hashRefreshToken(refreshToken)
  const agora = new Date()
  const sessao = await prisma.sessao.findUnique({ where: { refresh_token_hash: hash }, include: { usuario: true } })
  if (!sessao || sessao.expira_em <= agora) throw sessaoInvalida()
  const refresh = emitirRefreshToken()
  // Compare-and-swap: somente um pedido pode consumir este refresh, sem prolongar a validade absoluta.
  const atualizadas = await prisma.sessao.updateMany({
    where: { id: sessao.id, refresh_token_hash: hash, expira_em: { gt: agora } },
    data: { refresh_token_hash: refresh.hash },
  })
  if (atualizadas.count !== 1) throw sessaoInvalida()
  return {
    accessToken: await emitirAccessToken(sessao.usuario, sessao.id),
    refreshToken: refresh.token,
    expiraEm: sessao.expira_em.toISOString(),
    usuario: publico(sessao.usuario),
  }
}

export async function sair(refreshToken: string, accessToken?: string): Promise<void> {
  if (accessToken) {
    let identidade: Awaited<ReturnType<typeof verificarTokenRevogacao>> | undefined
    try { identidade = await verificarTokenRevogacao(accessToken) } catch { /* O refresh continua sendo uma credencial alternativa. */ }
    if (identidade) {
      // Não depende do hash atual: logout também vence a corrida com refresh em outra aba.
      await prisma.sessao.deleteMany({ where: { id: identidade.sessaoId, usuario_id: identidade.usuarioId } })
      return
    }
  }
  // Idempotente. A exclusão invalida também os JWTs que referenciam esta sessão.
  await prisma.sessao.deleteMany({ where: { refresh_token_hash: hashRefreshToken(refreshToken) } })
}
