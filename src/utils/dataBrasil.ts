const FUSO_BRASILIA = 'America/Sao_Paulo'

const formatadorDataBrasil = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_BRASILIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function hojeEmBrasilia(referencia: Date = new Date()): string {
  return formatadorDataBrasil.format(referencia)
}

export function dataIsoValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [ano, mes, dia] = valor.split('-').map(Number)
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  )
}

export function dataStringParaDateBanco(dataIso: string): Date {
  return new Date(`${dataIso}T00:00:00.000Z`)
}

export function dateBancoParaDataString(data: Date): string {
  return data.toISOString().slice(0, 10)
}

export function podeEditarCheckin(dataCheckin: string, referencia: Date = new Date()): boolean {
  return dataCheckin === hojeEmBrasilia(referencia)
}