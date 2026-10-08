import type { Response } from 'express'
import { ZodError } from 'zod'

function detalhesDeValidacao(erro: ZodError): { campo: string; mensagem: string }[] {
  return erro.issues.map((issue) => ({
    campo: issue.path.map(String).join('.') || 'corpo',
    mensagem: issue.message,
  }))
}

export function entradaInvalidaResponder(response: Response, erro: ZodError): void {
  response.status(400).json({
    erro: {
      codigo: 'ENTRADA_INVALIDA',
      mensagem: 'Os dados enviados são inválidos.',
      detalhes: detalhesDeValidacao(erro),
    },
  })
}
