import 'dotenv/config'

function ler(nome: string): string {
  const valor = process.env[nome]
  if (!valor) {
    throw new Error(`${nome} não está definido no .env`)
  }
  return valor
}

export const env = {
  NODE_ENV: ler('NODE_ENV'),
  PORT: Number(ler('PORT')),
  CORS_ORIGIN: ler('CORS_ORIGIN'),
  DATABASE_URL: ler('DATABASE_URL'),
  JWT_SEGREDO: ler('JWT_SEGREDO'),
  JWT_ACCESS_SEGUNDOS: Number(ler('JWT_ACCESS_SEGUNDOS')),
  REFRESH_DIAS: Number(ler('REFRESH_DIAS')),
  TERMOS_VERSAO: ler('TERMOS_VERSAO'),
  TERMOS_URL: process.env.TERMOS_URL || null,
}

if (env.JWT_SEGREDO.length < 32) throw new Error('JWT_SEGREDO deve ter pelo menos 32 caracteres')
if (!Number.isSafeInteger(env.JWT_ACCESS_SEGUNDOS) || env.JWT_ACCESS_SEGUNDOS < 30 || env.JWT_ACCESS_SEGUNDOS > 3600) throw new Error('JWT_ACCESS_SEGUNDOS deve estar entre 30 e 3600')
if (!Number.isSafeInteger(env.REFRESH_DIAS) || env.REFRESH_DIAS < 1 || env.REFRESH_DIAS > 30) throw new Error('REFRESH_DIAS deve estar entre 1 e 30')
if (env.TERMOS_URL && new URL(env.TERMOS_URL).protocol !== 'https:') throw new Error('TERMOS_URL deve usar HTTPS')
