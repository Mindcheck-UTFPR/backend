import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'
import { cadastrar as cadastrarUsuario, entrar as entrarUsuario } from '../services/autenticacaoService.js'
import { entradaInvalidaResponder } from '../utils/erro.js'
import {
  cadastroSchema,
  loginSchema,
  type CadastroEntrada,
  type LoginEntrada,
} from '../validators/autenticacaoValidator.js'

export class CadastroController {
  private readonly oBodyEsquema: ZodType<CadastroEntrada>

  constructor() {
    this.oBodyEsquema = cadastroSchema
  }

  handle = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { success, data, error } = this.oBodyEsquema.safeParse(request.body)

      if (!success) {
        entradaInvalidaResponder(response, error)
        return
      }

      const oUsuario = await cadastrarUsuario(data)
      response.status(201).json({ usuario: oUsuario })
    } catch (erro) {
      next(erro)
    }
  }
}

export class LoginController {
  private readonly oBodyEsquema: ZodType<LoginEntrada>

  constructor() {
    this.oBodyEsquema = loginSchema
  }

  handle = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { success, data, error } = this.oBodyEsquema.safeParse(request.body)

      if (!success) {
        entradaInvalidaResponder(response, error)
        return
      }

      const oSessao = await entrarUsuario(data)
      response.status(200).json(oSessao)
    } catch (erro) {
      next(erro)
    }
  }
}
