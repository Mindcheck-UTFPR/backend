import { describe, expect, it } from 'vitest'
import { ErroAplicacao } from './middlewares/errosMiddleware.js'
import { exigirVersaoEditavel } from './services/versaoQuestionarioService.js'

describe('versão imutável (MIND-58)', () => {
  it('permite editar o rascunho', () => {
    expect(() => exigirVersaoEditavel({ publicada_em: null })).not.toThrow()
  })

  it('recusa a versão publicada corrente', () => {
    expect(() => exigirVersaoEditavel({ publicada_em: new Date('2026-11-21T15:00:00.000Z') })).toThrow(
      ErroAplicacao,
    )

    try {
      exigirVersaoEditavel({ publicada_em: new Date('2026-11-21T15:00:00.000Z') })
    } catch (erro) {
      expect(erro).toMatchObject({
        status: 403,
        codigo: 'VERSAO_IMUTAVEL',
        message: 'Versão publicada não pode ser alterada. Crie uma nova versão.',
      })
    }
  })

  it('recusa a versão publicada que já deixou de ser a ativa', () => {
    try {
      exigirVersaoEditavel({ publicada_em: new Date('2026-11-01T12:00:00.000Z') })
      expect.unreachable('a versão substituída deveria ser imutável')
    } catch (erro) {
      expect(erro).toMatchObject({
        status: 403,
        codigo: 'VERSAO_IMUTAVEL',
        message: 'Versão publicada não pode ser alterada. Crie uma nova versão.',
      })
    }
  })
})
