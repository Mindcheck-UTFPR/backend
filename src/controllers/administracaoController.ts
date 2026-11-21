import type { NextFunction, Response } from 'express'
import type { RequisicaoAutenticada } from '../middlewares/autenticacaoMiddleware.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import {
  listarAuditoria,
  listarQuestionarios,
  listarUsuarios,
} from '../services/administracaoService.js'

export class AdministracaoController {
  questionarios = async (
    request: RequisicaoAutenticada,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!request.usuario) {
        throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      }

      response.json({ questionarios: await listarQuestionarios() })
    } catch (erro) {
      next(erro)
    }
  }

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

      response.json({ registros: listarAuditoria() })
    } catch (erro) {
      next(erro)
    }
  }
}
