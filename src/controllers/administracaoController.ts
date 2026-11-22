import type { NextFunction, Response } from 'express'
import type { RequisicaoAutenticada } from '../middlewares/autenticacaoMiddleware.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import {
  listarAuditoria,
  listarUsuarios,
} from '../services/administracaoService.js'

export class AdministracaoController {
  usuarios = async (
    request: RequisicaoAutenticada,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!request.usuario) {
        throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      }

      response.json({ usuarios: await listarUsuarios() })
    } catch (erro) {
      next(erro)
    }
  }

  auditoria = async (
    request: RequisicaoAutenticada,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!request.usuario) {
        throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      }

      response.json({ registros: await listarAuditoria() })
    } catch (erro) {
      next(erro)
    }
  }
}
