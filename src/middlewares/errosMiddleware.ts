import type { ErrorRequestHandler } from 'express'

type DetalheCampo = {
  campo: string
  mensagem: string
}

export class ErroAplicacao extends Error {
  readonly status: number
  readonly codigo: string
  readonly detalhes?: DetalheCampo[]

  constructor(status: number, codigo: string, mensagem: string, detalhes?: DetalheCampo[]) {
    super(mensagem)
    this.name = 'ErroAplicacao'
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }
}

function jsonInvalido(erro: unknown): boolean {
  return erro instanceof SyntaxError && 'status' in erro && (erro as { status?: number }).status === 400
}

export const errosMiddleware: ErrorRequestHandler = (erro, _request, response, next) => {
  if (response.headersSent) {
    next(erro)
    return
  }

  if (erro instanceof ErroAplicacao) {
    response.status(erro.status).json({
      erro: {
        codigo: erro.codigo,
        mensagem: erro.message,
        ...(erro.detalhes && erro.detalhes.length > 0 ? { detalhes: erro.detalhes } : {}),
      },
    })
    return
  }

  if (jsonInvalido(erro)) {
    response.status(400).json({
      erro: {
        codigo: 'ENTRADA_INVALIDA',
        mensagem: 'Os dados enviados são inválidos.',
      },
    })
    return
  }

  console.error('erro interno')
  response.status(500).json({
    erro: {
      codigo: 'ERRO_INTERNO',
      mensagem: 'Não foi possível concluir a operação.',
    },
  })
}
