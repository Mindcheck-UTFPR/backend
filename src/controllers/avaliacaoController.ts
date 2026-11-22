import type { NextFunction, Response } from 'express'
import type { RequisicaoAutenticada } from '../middlewares/autenticacaoMiddleware.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import {
  consultarAvaliacao,
  detalharParaResponder,
  enviarAvaliacao,
  listarParaResponder,
} from '../services/avaliacaoService.js'
import { entradaInvalidaResponder } from '../utils/erro.js'
import { idAvaliacaoSchema, enviarAvaliacaoSchema } from '../validators/avaliacaoValidator.js'
import { idsQuestionarioSchema } from '../validators/questionarioValidator.js'

function exigirUsuario(request: RequisicaoAutenticada) {
  if (!request.usuario) {
    throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
  }
  return request.usuario
}

export class AvaliacaoController {
  catalogo = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      const usuario = exigirUsuario(request)
      response.json({ questionarios: await listarParaResponder(usuario.id) })
    } catch (erro) {
      next(erro)
    }
  }

  estrutura = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      const usuario = exigirUsuario(request)
      const params = idsQuestionarioSchema.safeParse(request.params)
      if (!params.success) {
        entradaInvalidaResponder(response, params.error)
        return
      }
      response.json({ questionario: await detalharParaResponder(usuario.id, params.data.questionarioId) })
    } catch (erro) {
      next(erro)
    }
  }

  enviar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      const usuario = exigirUsuario(request)
      const params = idsQuestionarioSchema.safeParse(request.params)
      if (!params.success) {
        entradaInvalidaResponder(response, params.error)
        return
      }
      const entrada = enviarAvaliacaoSchema.safeParse(request.body)
      if (!entrada.success) {
        entradaInvalidaResponder(response, entrada.error)
        return
      }
      response.status(201).json({
        avaliacao: await enviarAvaliacao(usuario.id, params.data.questionarioId, entrada.data),
      })
    } catch (erro) {
      next(erro)
    }
  }

  consultar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      const usuario = exigirUsuario(request)
      const params = idAvaliacaoSchema.safeParse(request.params)
      if (!params.success) {
        entradaInvalidaResponder(response, params.error)
        return
      }
      response.json({ avaliacao: await consultarAvaliacao(usuario.id, params.data.avaliacaoId) })
    } catch (erro) {
      next(erro)
    }
  }
}
