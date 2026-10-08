import { createHash, randomBytes } from 'node:crypto'
import { SignJWT } from 'jose'
import { env } from '../config/env.js'

const segredo = new TextEncoder().encode(env.JWT_SEGREDO)

export async function emitirAccessToken(usuario: { id: number; papel: 'usuario' | 'admin' }): Promise<string> {
  return new SignJWT({ papel: usuario.papel })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(usuario.id))
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_SEGUNDOS}s`)
    .sign(segredo)
}

export function emitirRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  return { token, hash }
}

export function expiracaoRefresh(agora = new Date()): Date {
  const expira = new Date(agora.getTime())
  expira.setUTCDate(expira.getUTCDate() + env.REFRESH_DIAS)
  return expira
}
