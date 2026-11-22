const DIA_MS = 24 * 60 * 60 * 1000

export function disponibilidade(ultimaRespostaEm: Date | null, periodoDias: number, agora = new Date()) {
  if (!ultimaRespostaEm) {
    return { podeResponder: true, disponivelEm: null as string | null }
  }

  const liberaEm = new Date(ultimaRespostaEm.getTime() + periodoDias * DIA_MS)
  if (agora.getTime() >= liberaEm.getTime()) {
    return { podeResponder: true, disponivelEm: null }
  }

  return { podeResponder: false, disponivelEm: liberaEm.toISOString() }
}
