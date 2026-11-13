import { z } from 'zod'
import { dataIsoValida, hojeEmBrasilia } from '../utils/dataBrasil.js'

const HUMORES_VALIDOS = ['muito_baixo', 'baixo', 'neutro', 'bom', 'muito_bom'] as const

const dataCheckin = z
  .string({ error: 'Informe a data do check-in.' })
  .refine(dataIsoValida, 'Informe uma data válida no formato YYYY-MM-DD.')
  .refine(
    (valor) => valor <= hojeEmBrasilia(),
    'Não é permitido registrar check-in em data futura.',
  )

const humor = z.enum(HUMORES_VALIDOS, {
  error: 'Informe um nível de humor válido (muito_baixo, baixo, neutro, bom ou muito_bom).',
})

const intensidade = z
  .number({ error: 'A intensidade deve ser um número inteiro entre 1 e 5.' })
  .int('A intensidade deve ser um número inteiro entre 1 e 5.')
  .min(1, 'A intensidade deve ser entre 1 e 5.')
  .max(5, 'A intensidade deve ser entre 1 e 5.')
  .nullable()

const sonoHoras = z
  .number({ error: 'O valor de sonoHoras deve ser numérico.' })
  .min(0, 'O valor de sonoHoras deve ser entre 0 e 24.')
  .max(24, 'O valor de sonoHoras deve ser entre 0 e 24.')
  .refine(
    (valor) => Math.round(valor * 10) === valor * 10,
    'O valor de sonoHoras deve ter no máximo uma casa decimal.',
  )
  .nullable()

const booleanoOpcional = z
  .boolean({ error: 'O valor deve ser verdadeiro ou falso.' })
  .nullable()

const relacoes = z
  .number({ error: 'O valor de relacoes deve ser um número inteiro entre 1 e 5.' })
  .int('O valor de relacoes deve ser um número inteiro entre 1 e 5.')
  .min(1, 'O valor de relacoes deve ser entre 1 e 5.')
  .max(5, 'O valor de relacoes deve ser entre 1 e 5.')
  .nullable()

const observacao = z
  .string({ error: 'A observação deve ser um texto.' })
  .max(280, 'A observação deve ter no máximo 280 caracteres.')
  .nullable()

export const parametroDataSchema = z.object({
  data: z
    .string({ error: 'Informe a data.' })
    .refine(dataIsoValida, 'Informe uma data válida no formato YYYY-MM-DD.'),
})

export const criarCheckinSchema = z.strictObject(
  {
    data: dataCheckin,
    humor,
    intensidade: intensidade.optional().default(null),
    sonoHoras: sonoHoras.optional().default(null),
    estudou: booleanoOpcional.optional().default(null),
    atividadeFisica: booleanoOpcional.optional().default(null),
    relacoes: relacoes.optional().default(null),
    observacao: observacao.optional().default(null),
  },
  { error: 'Campo não permitido na requisição.' },
)

export const editarCheckinSchema = z.strictObject(
  {
    humor: humor.optional(),
    intensidade: intensidade.optional(),
    sonoHoras: sonoHoras.optional(),
    estudou: booleanoOpcional.optional(),
    atividadeFisica: booleanoOpcional.optional(),
    relacoes: relacoes.optional(),
    observacao: observacao.optional(),
  },
  { error: 'Campo não permitido na requisição.' },
)

export type CriarCheckinEntrada = z.infer<typeof criarCheckinSchema>
export type EditarCheckinEntrada = z.infer<typeof editarCheckinSchema>