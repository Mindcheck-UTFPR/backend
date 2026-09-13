import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { prisma } from './config/prisma.js'

export const app = express()

app.disable('x-powered-by')
app.use(cors({ origin: env.CORS_ORIGIN }))
app.use(express.json())

app.get('/health', (_request, response) => {
  response.json({ status: 'ok', service: 'mindcheck-backend' })
})

app.get('/health/ready', async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    response.json({ status: 'ready', database: 'connected' })
  } catch {
    response.status(503).json({ status: 'not-ready', database: 'disconnected' })
  }
})
