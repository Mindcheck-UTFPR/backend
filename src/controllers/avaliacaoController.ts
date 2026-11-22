import type { NextFunction, Response } from 'express'
import type { RequisicaoAutenticada } from '../middlewares/autenticacaoMiddleware.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import {
  abrirRascunho,
  concluirAvaliacao,
  consultarAvaliacao,
  detalharParaResponder,
  enviarAvaliacao,
  listarHistorico,
  listarParaResponder,
  salvarRascunho,
} from '../services/avaliacaoService.js'
import { entradaInvalidaResponder } from '../utils/erro.js'
import {
  concluirAvaliacaoSchema,
  enviarAvaliacaoSchema,
  historicoAvaliacaoQuerySchema,
  idAvaliacaoSchema,
  salvarRascunhoAvaliacaoSchema,
} from '../validators/avaliacaoValidator.js'
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

  abrir = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      const usuario = exigirUsuario(request)
      const params = idsQuestionarioSchema.safeParse(request.params)
      if (!params.success) {
        entradaInvalidaResponder(response, params.error)
        return
      }
      const resultado = await abrirRascunho(usuario.id, params.data.questionarioId)
      response.status(resultado.criada ? 201 : 200).json({ avaliacao: resultado.avaliacao })
    } catch (erro) {
      next(erro)
    }
  }

  salvar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      const usuario = exigirUsuario(request)
      const params = idAvaliacaoSchema.safeParse(request.params)
      if (!params.success) {
        entradaInvalidaResponder(response, params.error)
        return
      }
      const entrada = salvarRascunhoAvaliacaoSchema.safeParse(request.body)
      if (!entrada.success) {
        entradaInvalidaResponder(response, entrada.error)
        return
      }
      response.json({ avaliacao: await salvarRascunho(usuario.id, params.data.avaliacaoId, entrada.data) })
    } catch (erro) {
      next(erro)
    }
  }

  concluir = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      const usuario = exigirUsuario(request)
      const params = idAvaliacaoSchema.safeParse(request.params)
      if (!params.success) {
        entradaInvalidaResponder(response, params.error)
        return
      }
      const entrada = concluirAvaliacaoSchema.safeParse(request.body)
      if (!entrada.success) {
        entradaInvalidaResponder(response, entrada.error)
        return
      }
      response.json({ avaliacao: await concluirAvaliacao(usuario.id, params.data.avaliacaoId, entrada.data.revisao) })
    } catch (erro) {
      next(erro)
    }
  }

  historico = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      const usuario = exigirUsuario(request)
      const consulta = historicoAvaliacaoQuerySchema.safeParse(request.query)
      if (!consulta.success) {
        entradaInvalidaResponder(response, consulta.error)
        return
      }
      response.json(await listarHistorico(usuario.id, consulta.data))
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
