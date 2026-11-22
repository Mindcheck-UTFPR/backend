import type { NextFunction, Response } from 'express'
import type { RequisicaoAutenticada } from './autenticacaoMiddleware.js'
import { ErroAplicacao } from './errosMiddleware.js'

export function autorizacaoAdminMiddleware(
  request: RequisicaoAutenticada,
  _response: Response,
  next: NextFunction,
): void {
  if (!request.usuario) {
    next(new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.'))
    return
  }

  if (request.usuario.papel !== 'admin') {
    next(new ErroAplicacao(403, 'ACESSO_NEGADO', 'Esta área é restrita a administradores.'))
    return
  }

  next()
}
