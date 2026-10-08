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
}
