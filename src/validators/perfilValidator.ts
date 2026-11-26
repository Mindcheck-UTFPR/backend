import { z, type ZodType } from 'zod'

const email = z
  .string({ error: 'Informe o e-mail.' })
  .trim()
  .toLowerCase()
  .max(255, 'O e-mail deve ter no máximo 255 caracteres.')
  .pipe(z.email('Informe um e-mail válido.'))

const nome = z
  .string({ error: 'Informe o nome.' })
  .trim()
  .min(2, 'O nome deve ter no mínimo 2 caracteres.')
  .max(120, 'O nome deve ter no máximo 120 caracteres.')

const senhaNova = z
  .string({ error: 'Informe a senha.' })
  .min(8, 'A senha deve ter no mínimo 8 caracteres.')
  .max(128, 'A senha deve ter no máximo 128 caracteres.')

export const editarPerfilSchema = z.strictObject({
  nome,
  email,
})

export const alterarSenhaSchema = z.strictObject({
  senhaAtual: z
    .string({ error: 'Informe sua senha atual.' })
    .min(1, 'Informe sua senha atual.')
    .max(128, 'A senha deve ter no máximo 128 caracteres.'),
  novaSenha: senhaNova,
})

export type EditarPerfilEntrada = z.infer<typeof editarPerfilSchema>
export type AlterarSenhaEntrada = z.infer<typeof alterarSenhaSchema>

export function validarPerfil<T>(schema: ZodType<T>, entrada: unknown) {
  const resultado = schema.safeParse(entrada)
  if (resultado.success) return resultado

  const issues = resultado.error.issues.flatMap((issue) => {
    if (issue.code !== 'unrecognized_keys') return [issue]
    return issue.keys.map((chave) => ({
      code: 'custom' as const,
      path: [chave],
      message: 'Este campo não pode ser alterado.',
      input: entrada,
    }))
  })

  return { success: false as const, error: new z.ZodError(issues) }
}
