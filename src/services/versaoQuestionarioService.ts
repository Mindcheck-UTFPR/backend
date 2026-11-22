import { ErroAplicacao } from '../middlewares/errosMiddleware.js'

// Vale para pergunta, alternativa e faixa. Trocar `ativa` quando outra versão assume o lugar não passa por aqui.
export function exigirVersaoEditavel(versao: { publicada_em: Date | null }): void {
  if (versao.publicada_em !== null) {
    throw new ErroAplicacao(
      403,
      'VERSAO_IMUTAVEL',
      'Versão publicada não pode ser alterada. Crie uma nova versão.',
    )
  }
}
