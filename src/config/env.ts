import 'dotenv/config'
import { z } from 'zod'
const schema = z.object({ NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().positive().default(3000), CORS_ORIGIN: z.string().default('http://localhost:5173'), DATABASE_URL: z.string().url() })
export const env = schema.parse(process.env)
