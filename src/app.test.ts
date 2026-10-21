import request from 'supertest'
import { describe, expect, it } from 'vitest'
process.env.NODE_ENV ??= 'test'
process.env.PORT ??= '3000'
process.env.CORS_ORIGIN ??= 'http://localhost:5173'
process.env.DATABASE_URL ??= 'postgresql://mindcheck:mindcheck@localhost:5432/mindcheck'
process.env.JWT_SEGREDO ??= 'segredo-de-teste-com-32-caracteres-ok'
process.env.JWT_ACCESS_SEGUNDOS ??= '900'
process.env.REFRESH_DIAS ??= '7'
process.env.TERMOS_VERSAO ??= '1.0'
const { app } = await import('./app.js')
describe('health endpoint', () => { it('reports that the API process is healthy', async () => { const response = await request(app).get('/health'); expect(response.status).toBe(200); expect(response.body).toEqual({ status: 'ok', service: 'mindcheck-backend' }) }) })
