import { z } from 'zod'

const respostaFechada = z.strictObject({
  perguntaId: z.number().int().positive(),
  opcaoId: z.number().int().positive(),
})

const respostaAberta = z.strictObject({
  perguntaId: z.number().int().positive(),
  texto: z.string().trim().min(1, 'Informe o texto da resposta.').max(2000, 'A resposta deve ter no máximo 2000 caracteres.'),
})

export const enviarAvaliacaoSchema = z.strictObject({
  respostas: z.array(z.union([respostaFechada, respostaAberta])),
}).superRefine((valor, contexto) => {
  const ids = new Set<number>()
  for (const resposta of valor.respostas) {
    if (ids.has(resposta.perguntaId)) {
      contexto.addIssue({ code: 'custom', path: ['respostas'], message: 'Cada pergunta só pode ter uma resposta.' })
    }
    ids.add(resposta.perguntaId)
  }
})

export const idAvaliacaoSchema = z.object({
  avaliacaoId: z.coerce.number().int().positive(),
})

export type EnviarAvaliacaoEntrada = z.infer<typeof enviarAvaliacaoSchema>
