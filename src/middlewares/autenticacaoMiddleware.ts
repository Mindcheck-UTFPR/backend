import type { NextFunction, Request, Response } from 'express'
import { ErroAplicacao } from './errosMiddleware.js'
import { usuarioDaSessao } from '../services/autenticacaoService.js'

declare global {
  namespace Express {
    interface Request {
      usuario?: Awaited<ReturnType<typeof usuarioDaSessao>>
    }
  }
}

export async function autenticacaoMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1]
    if (!token) {
      throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
    }
    request.usuario = await usuarioDaSessao(token)
    next()
  } catch (erro) {
    next(erro)
  }
}