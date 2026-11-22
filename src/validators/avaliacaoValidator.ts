import { z } from 'zod'

const respostaFechada = z.strictObject({
  perguntaId: z.number().int().positive(),
  opcaoId: z.number().int().positive(),
})

const respostaAberta = z.strictObject({
  perguntaId: z.number().int().positive(),
  texto: z.string().trim().min(1, 'Informe o texto da resposta.').max(2000, 'A resposta deve ter no máximo 2000 caracteres.'),
})

const respostas = z.array(z.union([respostaFechada, respostaAberta]))

function respostasUnicas(valor: { respostas: { perguntaId: number }[] }, contexto: z.RefinementCtx) {
  const ids = new Set<number>()
  for (const resposta of valor.respostas) {
    if (ids.has(resposta.perguntaId)) {
      contexto.addIssue({ code: 'custom', path: ['respostas'], message: 'Cada pergunta só pode ter uma resposta.' })
    }
    ids.add(resposta.perguntaId)
  }
}

export const enviarAvaliacaoSchema = z.strictObject({
  respostas,
}).superRefine(respostasUnicas)

export const salvarRascunhoAvaliacaoSchema = z.strictObject({
  revisao: z.number().int().positive('Informe a revisão do rascunho.'),
  respostas,
}).superRefine(respostasUnicas)

export const concluirAvaliacaoSchema = z.strictObject({
  revisao: z.number().int().positive('Informe a revisão do rascunho.'),
})

export const idAvaliacaoSchema = z.object({
  avaliacaoId: z.coerce.number().int().positive(),
})

export const historicoAvaliacaoQuerySchema = z.strictObject({
  questionarioId: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().min(1, 'O limite deve ser entre 1 e 50.').max(50, 'O limite deve ser entre 1 e 50.').optional(),
  pagina: z.coerce.number().int().min(1).max(10000).optional(),
})

export type EnviarAvaliacaoEntrada = z.infer<typeof enviarAvaliacaoSchema>
export type SalvarRascunhoAvaliacaoEntrada = z.infer<typeof salvarRascunhoAvaliacaoSchema>
export type ConcluirAvaliacaoEntrada = z.infer<typeof concluirAvaliacaoSchema>
