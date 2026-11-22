import type { NextFunction, Response } from 'express'
import type { RequisicaoAutenticada } from '../middlewares/autenticacaoMiddleware.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import {
  criarNovaVersao,
  criarQuestionario,
  detalharQuestionario,
  listarQuestionarios,
  publicarVersao,
  salvarRascunho,
} from '../services/questionarioService.js'
import { entradaInvalidaResponder } from '../utils/erro.js'
import {
  criarQuestionarioSchema,
  idsQuestionarioSchema,
  idsVersaoSchema,
  novaVersaoSchema,
  salvarRascunhoSchema,
} from '../validators/questionarioValidator.js'

function exigirUsuario(request: RequisicaoAutenticada) {
  if (!request.usuario) {
    throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
  }
  return request.usuario
}

export class QuestionarioController {
  listar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      exigirUsuario(request)
      response.json({ questionarios: await listarQuestionarios() })
    } catch (erro) {
      next(erro)
    }
  }

  detalhar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      exigirUsuario(request)
      const params = idsQuestionarioSchema.safeParse(request.params)
      if (!params.success) {
        entradaInvalidaResponder(response, params.error)
        return
      }
      response.json({ questionario: await detalharQuestionario(params.data.questionarioId) })
    } catch (erro) {
      next(erro)
    }
  }

  criar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      exigirUsuario(request)
      const entrada = criarQuestionarioSchema.safeParse(request.body)
      if (!entrada.success) {
        entradaInvalidaResponder(response, entrada.error)
        return
      }
      response.status(201).json({ questionario: await criarQuestionario(entrada.data) })
    } catch (erro) {
      next(erro)
    }
  }

  salvar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      exigirUsuario(request)
      const params = idsVersaoSchema.safeParse(request.params)
      if (!params.success) {
        entradaInvalidaResponder(response, params.error)
        return
      }
      const entrada = salvarRascunhoSchema.safeParse(request.body)
      if (!entrada.success) {
        entradaInvalidaResponder(response, entrada.error)
        return
      }
      response.json({
        questionario: await salvarRascunho(params.data.questionarioId, params.data.versaoId, entrada.data),
      })
    } catch (erro) {
      next(erro)
    }
  }

  publicar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      const usuario = exigirUsuario(request)
      const params = idsVersaoSchema.safeParse(request.params)
      if (!params.success) {
        entradaInvalidaResponder(response, params.error)
        return
      }
      response.json({
        questionario: await publicarVersao(params.data.questionarioId, params.data.versaoId, usuario.id),
      })
    } catch (erro) {
      next(erro)
    }
  }

  novaVersao = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      exigirUsuario(request)
      const params = idsQuestionarioSchema.safeParse(request.params)
      if (!params.success) {
        entradaInvalidaResponder(response, params.error)
        return
      }
      const entrada = novaVersaoSchema.safeParse(request.body)
      if (!entrada.success) {
        entradaInvalidaResponder(response, entrada.error)
        return
      }
      response.status(201).json({
        questionario: await criarNovaVersao(params.data.questionarioId, entrada.data),
      })
    } catch (erro) {
      next(erro)
    }
  }
}
