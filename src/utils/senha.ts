import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const TAMANHO_CHAVE = 64
const TAMANHO_SALT = 16

export async function gerarHashSenha(senha: string): Promise<string> {
  const salt = randomBytes(TAMANHO_SALT).toString('hex')
  const derivado = (await scryptAsync(senha, salt, TAMANHO_CHAVE)) as Buffer
  return `${salt}.${derivado.toString('hex')}`
}

export async function senhaConfere(senha: string, armazenada: string): Promise<boolean> {
  const ponto = armazenada.indexOf('.')
  if (ponto <= 0) return false

  const salt = armazenada.slice(0, ponto)
  const hashHex = armazenada.slice(ponto + 1)
  const derivado = (await scryptAsync(senha, salt, TAMANHO_CHAVE)) as Buffer
  const esperado = Buffer.from(hashHex, 'hex')
  if (esperado.length !== derivado.length) return false

  return timingSafeEqual(derivado, esperado)
}

export const hashSenhaInexistente = await gerarHashSenha('usuario-ausente')
