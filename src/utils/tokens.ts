import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, compactVerify, jwtVerify, type JWTPayload } from 'jose'
import { env } from '../config/env.js'

const segredo = new TextEncoder().encode(env.JWT_SEGREDO)

export async function emitirAccessToken(usuario: { id: number; papel: 'usuario' | 'admin' }, sessaoId: number): Promise<string> {
  return new SignJWT({ papel: usuario.papel, sid: sessaoId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(usuario.id))
    .setIssuer('mindcheck')
    .setAudience('mindcheck-api')
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_SEGUNDOS}s`)
    .sign(segredo)
}

export async function verificarAccessToken(token: string) {
  const { payload } = await jwtVerify(token, segredo, {
    algorithms: ['HS256'], issuer: 'mindcheck', audience: 'mindcheck-api',
  })
  return identidade(payload)
}

function identidade(payload: JWTPayload) {
  if (!payload.sub || !Number.isSafeInteger(Number(payload.sub)) || Number(payload.sub) < 1 ||
    !Number.isSafeInteger(payload.sid) || Number(payload.sid) < 1) throw new Error('Token inválido')
  return { usuarioId: Number(payload.sub), sessaoId: Number(payload.sid) }
}

// Um JWT expirado continua sendo prova de propriedade APENAS para revogar sua própria sessão.
// Nunca usar esta função para conceder acesso ou renovar credenciais.
export async function verificarTokenRevogacao(token: string) {
  const signed = await compactVerify(token, segredo, { algorithms: ['HS256'] })
  const payload = JSON.parse(new TextDecoder().decode(signed.payload)) as JWTPayload
  if (payload.iss !== 'mindcheck' || payload.aud !== 'mindcheck-api') throw new Error('Token inválido')
  return identidade(payload)
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function emitirRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  const hash = hashRefreshToken(token)
  return { token, hash }
}

export function expiracaoRefresh(agora = new Date()): Date {
  const expira = new Date(agora.getTime())
  expira.setUTCDate(expira.getUTCDate() + env.REFRESH_DIAS)
  return expira
}
