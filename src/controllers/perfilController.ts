import type { NextFunction, Request, Response } from 'express'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import { usuarioDaSessao } from '../services/autenticacaoService.js'
import { alterarSenha as alterarSenhaDaConta, atualizarPerfil } from '../services/perfilService.js'
import { entradaInvalidaResponder } from '../utils/erro.js'
import { alterarSenhaSchema, editarPerfilSchema, validarPerfil } from '../validators/perfilValidator.js'

function tokenBearer(request: Request): string | undefined {
  return /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1]
}

export class PerfilController {
  editar = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const token = tokenBearer(request)
      if (!token) throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      const usuario = await usuarioDaSessao(token)
      const entrada = validarPerfil(editarPerfilSchema, request.body)
      if (!entrada.success) {
        entradaInvalidaResponder(response, entrada.error)
        return
      }
      response.json({ usuario: await atualizarPerfil(usuario.id, entrada.data) })
    } catch (erro) {
      next(erro)
    }
  }

  alterarSenha = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const token = tokenBearer(request)
      if (!token) throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      const usuario = await usuarioDaSessao(token)
      const entrada = validarPerfil(alterarSenhaSchema, request.body)
      if (!entrada.success) {
        entradaInvalidaResponder(response, entrada.error)
        return
      }
      await alterarSenhaDaConta(usuario.id, entrada.data)
      response.status(204).end()
    } catch (erro) {
      next(erro)
    }
  }
}
