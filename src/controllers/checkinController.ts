import type { NextFunction, Request, Response } from 'express'
import { ErroAplicacao } from '../middlewares/errosMiddleware.js'
import {
  criarCheckin,
  editarCheckin,
  ErroCheckinDuplicado,
} from '../services/checkinService.js'
import { entradaInvalidaResponder } from '../utils/erro.js'
import {
  criarCheckinSchema,
  editarCheckinSchema,
  parametroDataSchema,
} from '../validators/checkinValidator.js'

export class CheckinController {
  criar = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
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

  editar = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
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