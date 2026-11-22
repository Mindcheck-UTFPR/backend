import { z } from 'zod'

const tipos = ['escala', 'polar', 'escolha_unica', 'aberta'] as const

const opcao = z.strictObject({
  texto: z.string().trim().min(1, 'Informe o texto da alternativa.').max(200),
  valorNumerico: z.number().int('O peso da alternativa deve ser inteiro.'),
  ordem: z.number().int().min(1, 'A ordem da alternativa começa em 1.'),
})

const pergunta = z.strictObject({
  texto: z.string().trim().min(1, 'Informe o texto da pergunta.'),
  tipo: z.enum(tipos, { error: 'O tipo da pergunta é inválido.' }),
  ordem: z.number().int().min(1, 'A ordem da pergunta começa em 1.'),
  obrigatoria: z.boolean().optional().default(true),
  opcoes: z.array(opcao).optional().default([]),
}).superRefine((valor, contexto) => {
  const ordens = new Set<number>()
  for (const item of valor.opcoes) {
    if (ordens.has(item.ordem)) {
      contexto.addIssue({ code: 'custom', path: ['opcoes'], message: 'A ordem da alternativa deve ser única na pergunta.' })
    }
    ordens.add(item.ordem)
  }
})

const faixa = z.strictObject({
  minimo: z.number().int(),
  maximo: z.number().int(),
  codigo: z.string().trim().min(1).max(40),
  rotulo: z.string().trim().min(1).max(80),
  textoOrientativo: z.string().trim().min(1, 'Informe o texto orientativo da faixa.'),
})

export const criarQuestionarioSchema = z.strictObject({
  nome: z.string().trim().min(1, 'Informe o nome do questionário.').max(80),
  descricao: z.string().trim().min(1).nullable().optional().default(null),
  ordem: z.number().int().min(1, 'A ordem do questionário começa em 1.'),
  versao: z.string().trim().min(1, 'Informe a versão.').max(20),
  periodoReaplicacaoDias: z.number().int().positive('O prazo de reaplicação deve ser maior que zero.'),
})

export const salvarRascunhoSchema = z.strictObject({
  perguntas: z.array(pergunta),
  faixas: z.array(faixa),
}).superRefine((valor, contexto) => {
  const ordens = new Set<number>()
  for (const item of valor.perguntas) {
    if (ordens.has(item.ordem)) {
      contexto.addIssue({ code: 'custom', path: ['perguntas'], message: 'A ordem da pergunta deve ser única na versão.' })
    }
    ordens.add(item.ordem)
  }
  const codigos = new Set<string>()
  for (const item of valor.faixas) {
    if (codigos.has(item.codigo)) {
      contexto.addIssue({ code: 'custom', path: ['faixas'], message: 'O código da faixa deve ser único na versão.' })
    }
    codigos.add(item.codigo)
  }
})

export const novaVersaoSchema = z.strictObject({
  versao: z.string().trim().min(1, 'Informe a versão.').max(20),
})

export const idsQuestionarioSchema = z.object({
  questionarioId: z.coerce.number().int().positive(),
})

export const idsVersaoSchema = idsQuestionarioSchema.extend({
  versaoId: z.coerce.number().int().positive(),
})

export type CriarQuestionarioEntrada = z.infer<typeof criarQuestionarioSchema>
export type SalvarRascunhoEntrada = z.infer<typeof salvarRascunhoSchema>
export type NovaVersaoEntrada = z.infer<typeof novaVersaoSchema>
