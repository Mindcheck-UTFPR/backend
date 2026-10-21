import { z } from 'zod'
import { env } from '../config/env.js'

const email = z
  .string({ error: 'Informe o e-mail.' })
  .trim()
  .toLowerCase()
  .max(255, 'O e-mail deve ter no máximo 255 caracteres.')
  .pipe(z.email('Informe um e-mail válido.'))

export const cadastroSchema = z.object({
  nome: z
    .string({ error: 'Informe o nome.' })
    .trim()
    .min(2, 'O nome deve ter no mínimo 2 caracteres.')
    .max(120, 'O nome deve ter no máximo 120 caracteres.'),
  email,
  senha: z
    .string({ error: 'Informe a senha.' })
    .min(8, 'A senha deve ter no mínimo 8 caracteres.')
    .max(128, 'A senha deve ter no máximo 128 caracteres.'),
  termosAceitos: z.literal(true, { error: 'É preciso aceitar os termos.' }),
  termosVersao: z.literal(env.TERMOS_VERSAO, { error: 'A versão dos termos não é a vigente.' }),
})

export const loginSchema = z.object({
  email,
  senha: z
    .string({ error: 'Informe a senha.' })
    .min(1, 'Informe a senha.')
    .max(128, 'A senha deve ter no máximo 128 caracteres.'),
})

export type CadastroEntrada = z.infer<typeof cadastroSchema>
export type LoginEntrada = z.infer<typeof loginSchema>

export const refreshSchema = z.object({
  refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Sessão inválida.'),
})
