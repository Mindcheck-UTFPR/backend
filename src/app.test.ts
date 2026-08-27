import request from 'supertest'
import { describe, expect, it } from 'vitest'
process.env.DATABASE_URL ??= 'postgresql://mindcheck:mindcheck@localhost:5432/mindcheck'
const { app } = await import('./app.js')
describe('health endpoint', () => { it('reports that the API process is healthy', async () => { const response = await request(app).get('/health'); expect(response.status).toBe(200); expect(response.body).toEqual({ status: 'ok', service: 'mindcheck-backend' }) }) })
