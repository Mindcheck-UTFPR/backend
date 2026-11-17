import type { NextFunction, Response } from 'express'
import type { RequisicaoAutenticada } from '../middlewares/autenticacaoMiddleware.js'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import {
  consultarCheckinPorData,
  consultarCheckinPorId,
  criarCheckin,
  editarCheckin,
  ErroCheckinDuplicado,
  listarHistoricoCheckins,
} from '../services/checkinService.js'
import { entradaInvalidaResponder } from '../utils/erro.js'
import { hojeEmBrasilia } from '../utils/dataBrasil.js'
import {
  consultarCheckinsQuerySchema,
  criarCheckinSchema,
  editarCheckinSchema,
  parametroDataSchema,
} from '../validators/checkinValidator.js'

export class CheckinController {
  hoje = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.usuario) throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      response.json({ checkin: await consultarCheckinPorData(request.usuario.id, hojeEmBrasilia()) })
    } catch (erro) {
      next(erro)
    }
  }

  consultar = async (
    request: RequisicaoAutenticada,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!request.usuario) {
        throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      }

      const query = consultarCheckinsQuerySchema.safeParse(request.query)
      if (!query.success) {
        entradaInvalidaResponder(response, query.error)
        return
      }

      if (query.data.data) {
        const checkin = await consultarCheckinPorData(request.usuario.id, query.data.data)
        response.status(200).json({ checkin })
        return
      }

      const resultado = await listarHistoricoCheckins(request.usuario.id, {
        ...(query.data.dataInicio !== undefined ? { dataInicio: query.data.dataInicio } : {}),
        ...(query.data.dataFim !== undefined ? { dataFim: query.data.dataFim } : {}),
        ...(query.data.limite !== undefined ? { limite: query.data.limite } : {}),
        ...(query.data.pagina !== undefined ? { pagina: query.data.pagina } : {}),
        ...(query.data.humor !== undefined ? { humor: query.data.humor } : {}),
      })

      response.status(200).json(resultado)
    } catch (erro) {
      next(erro)
    }
  }

  detalhar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.usuario) throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      const id = Number(request.params.id)
      if (!/^\d+$/.test(String(request.params.id)) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
        throw new ErroAplicacao(400, 'ENTRADA_INVALIDA', 'Identificador inválido.')
      }
      response.json({ checkin: await consultarCheckinPorId(request.usuario.id, id) })
    } catch (erro) {
      next(erro)
    }
  }

  criar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.usuario) {
        throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      }

      const entrada = criarCheckinSchema.safeParse(request.body)
      if (!entrada.success) {
        entradaInvalidaResponder(response, entrada.error)
        return
      }

      const checkin = await criarCheckin(request.usuario.id, entrada.data)
      response.status(201).json({ checkin })
    } catch (erro) {
      if (erro instanceof ErroCheckinDuplicado) {
        response.status(409).json({
          erro: {
            codigo: 'CHECKIN_JA_EXISTE',
            mensagem: erro.message,
          },
          checkin: erro.checkin,
        })
        return
      }
      next(erro)
    }
  }

  editar = async (request: RequisicaoAutenticada, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.usuario) {
        throw new ErroAplicacao(401, 'SESSAO_INVALIDA', 'Entre para continuar.')
      }

      const parametro = parametroDataSchema.safeParse(request.params)
      if (!parametro.success) {
        entradaInvalidaResponder(response, parametro.error)
        return
      }

      const entrada = editarCheckinSchema.safeParse(request.body)
      if (!entrada.success) {
        entradaInvalidaResponder(response, entrada.error)
        return
      }

      const checkin = await editarCheckin(request.usuario.id, parametro.data.data, entrada.data)
      response.status(200).json({ checkin })
    } catch (erro) {
      next(erro)
    }
  }
}
