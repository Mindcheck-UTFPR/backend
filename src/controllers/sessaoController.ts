import type { NextFunction, Request, Response } from 'express'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import { renovar, sair, usuarioDaSessao } from '../services/autenticacaoService.js'
import { refreshSchema } from '../validators/autenticacaoValidator.js'
import { entradaInvalidaResponder } from '../utils/erro.js'

export class SessaoController {
  me = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1]
      if (!token) throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      response.json({ usuario: await usuarioDaSessao(token) })
    } catch (erro) { next(erro) }
  }

  refresh = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const entrada = refreshSchema.safeParse(request.body)
      if (!entrada.success) { entradaInvalidaResponder(response, entrada.error); return }
      response.json(await renovar(entrada.data.refreshToken))
    } catch (erro) { next(erro) }
  }

  logout = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const entrada = refreshSchema.safeParse(request.body)
      if (!entrada.success) { entradaInvalidaResponder(response, entrada.error); return }
      const accessToken = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1]
      await sair(entrada.data.refreshToken, accessToken)
      response.status(204).end()
    } catch (erro) { next(erro) }
  }
}
