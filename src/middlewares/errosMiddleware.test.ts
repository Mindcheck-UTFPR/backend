
import type { NextFunction, Request, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErroAplicacao, errosMiddleware } from './errosMiddleware.js'

function criarResponse(headersSent = false) {
  const response = {
    headersSent,
    status: vi.fn(),
    json: vi.fn(),
  }

  response.status.mockReturnValue(response)

  return response as unknown as Response & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
  }
}

function executarMiddleware(
  erro: unknown,
  response: Response,
  next: NextFunction = vi.fn(),
) {
  errosMiddleware(erro, {} as Request, response, next)
  return next
}

describe('errosMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('responde com os dados de um erro de aplicação', () => {
    const response = criarResponse()

    executarMiddleware(
      new ErroAplicacao(404, 'NAO_ENCONTRADO', 'Recurso não encontrado.'),
      response,
    )

    expect(response.status).toHaveBeenCalledWith(404)
    expect(response.json).toHaveBeenCalledWith({
      erro: {
        codigo: 'NAO_ENCONTRADO',
        mensagem: 'Recurso não encontrado.',
      },
    })
  })

  it('inclui detalhes quando o erro possui detalhes', () => {
    const response = criarResponse()
    const detalhes = [
      { campo: 'email', mensagem: 'E-mail inválido.' },
    ]

    executarMiddleware(
      new ErroAplicacao(400, 'ENTRADA_INVALIDA', 'Dados inválidos.', detalhes),
      response,
    )

    expect(response.status).toHaveBeenCalledWith(400)
    expect(response.json).toHaveBeenCalledWith({
      erro: {
        codigo: 'ENTRADA_INVALIDA',
        mensagem: 'Dados inválidos.',
        detalhes,
      },
    })
  })

  it('não inclui detalhes quando a lista está vazia', () => {
    const response = criarResponse()

    executarMiddleware(
      new ErroAplicacao(400, 'ENTRADA_INVALIDA', 'Dados inválidos.', []),
      response,
    )

    expect(response.json).toHaveBeenCalledWith({
      erro: {
        codigo: 'ENTRADA_INVALIDA',
        mensagem: 'Dados inválidos.',
      },
    })
  })

  it('responde 400 quando recebe um JSON malformado', () => {
    const response = criarResponse()
    const erro = Object.assign(new SyntaxError('JSON inválido'), {
      status: 400,
    })

    executarMiddleware(erro, response)

    expect(response.status).toHaveBeenCalledWith(400)
    expect(response.json).toHaveBeenCalledWith({
      erro: {
        codigo: 'ENTRADA_INVALIDA',
        mensagem: 'Os dados enviados s\u00e3o inv\u00e1lidos.',
      },
    })
  })

  it('não expõe detalhes de erros inesperados', () => {
    const response = criarResponse()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    executarMiddleware(
      new Error('Falha interna confidencial'),
      response,
    )

    expect(response.status).toHaveBeenCalledWith(500)
    expect(response.json).toHaveBeenCalledWith({
      erro: {
        codigo: 'ERRO_INTERNO',
        mensagem: 'N\u00e3o foi poss\u00edvel concluir a opera\u00e7\u00e3o.',
      },
    })

    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      'Falha interna confidencial',
    )
    expect(consoleSpy).toHaveBeenCalledWith('erro interno')
  })

  it('encaminha o erro quando os cabeçalhos já foram enviados', () => {
    const response = criarResponse(true)
    const erro = new Error('Falha após envio')
    const next = vi.fn()

    executarMiddleware(erro, response, next)

    expect(next).toHaveBeenCalledWith(erro)
    expect(response.status).not.toHaveBeenCalled()
    expect(response.json).not.toHaveBeenCalled()
  })
})
