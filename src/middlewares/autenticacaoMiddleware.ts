import type { NextFunction, Request, Response } from 'express'
import { ErroAplicacao } from './errosMiddleware.js'
import { usuarioDaSessao } from '../services/autenticacaoService.js'

export type UsuarioAutenticado = Awaited<ReturnType<typeof usuarioDaSessao>>

export interface RequisicaoAutenticada extends Request {
  usuario?: UsuarioAutenticado
}

export async function autenticacaoMiddleware(
  request: RequisicaoAutenticada,
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