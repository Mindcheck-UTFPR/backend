import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV ??= 'test'
process.env.PORT ??= '3000'
process.env.CORS_ORIGIN ??= 'http://localhost:5173'
process.env.DATABASE_URL ??= 'postgresql://mindcheck:mindcheck@localhost:5432/mindcheck'
process.env.JWT_SEGREDO ??= 'segredo-de-teste-com-32-caracteres-ok'
process.env.JWT_ACCESS_SEGUNDOS ??= '900'
process.env.REFRESH_DIAS ??= '7'
process.env.TERMOS_VERSAO ??= '1.0'

vi.mock('./config/prisma.js', () => ({
  prisma: {
    sessao: {
      findUnique: vi.fn(),
    },
    checkin_diario: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

const { prisma } = await import('./config/prisma.js')
const { app } = await import('./app.js')
const { emitirAccessToken } = await import('./utils/tokens.js')
const { hojeEmBrasilia, podeEditarCheckin } = await import('./utils/dataBrasil.js')

const usuarioA = {
  id: 7,
  nome: 'Conta Teste A',
  email: 'teste-a@example.test',
  papel: 'usuario' as const,
}

const usuarioB = {
  id: 8,
  nome: 'Conta Teste B',
  email: 'teste-b@example.test',
  papel: 'usuario' as const,
}

const sessaoA = {
  id: 4,
  usuario_id: 7,
  usuario: usuarioA,
  expira_em: new Date(Date.now() + 86400000),
}

const sessaoB = {
  id: 5,
  usuario_id: 8,
  usuario: usuarioB,
  expira_em: new Date(Date.now() + 86400000),
}

describe('check-in diário (MIND-60)', () => {
  const hoje = hojeEmBrasilia()

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.sessao.findUnique).mockImplementation((({ where }: { where: { id: number } }) => {
      if (where.id === 4) return Promise.resolve(sessaoA)
      if (where.id === 5) return Promise.resolve(sessaoB)
      return Promise.resolve(null)
    }) as never)
  })

  it('calcula o dia atual e a janela de edição no fuso America/Sao_Paulo', () => {
    const antesDaMeiaNoiteSp = new Date('2026-11-13T02:30:00.000Z')
    const depoisDaMeiaNoiteSp = new Date('2026-11-13T03:05:00.000Z')

    expect(hojeEmBrasilia(antesDaMeiaNoiteSp)).toBe('2026-11-12')
    expect(podeEditarCheckin('2026-11-12', antesDaMeiaNoiteSp)).toBe(true)

    expect(hojeEmBrasilia(depoisDaMeiaNoiteSp)).toBe('2026-11-13')
    expect(podeEditarCheckin('2026-11-12', depoisDaMeiaNoiteSp)).toBe(false)
    expect(podeEditarCheckin('2026-11-13', depoisDaMeiaNoiteSp)).toBe(true)
  })

  it('rejeita requisições sem Bearer token válido com 401 e Cache-Control: no-store', async () => {
    const semToken = await request(app).post('/checkins').send({
      data: hoje,
      humor: 'bom',
    })
    expect(semToken.status).toBe(401)
    expect(semToken.headers['cache-control']).toBe('no-store')
    expect(semToken.body).toEqual({
      erro: {
        codigo: 'SESSAO_INVALIDA',
        mensagem: 'Entre para continuar.',
      },
    })

    const tokenInvalido = await request(app)
      .patch(`/checkins/${hoje}`)
      .auth('token-falso', { type: 'bearer' })
      .send({ observacao: 'Teste' })
    expect(tokenInvalido.status).toBe(401)
    expect(tokenInvalido.body.erro.codigo).toBe('SESSAO_INVALIDA')
  })

  it('rejeita datas futuras, formatos inválidos, limites e campos desconhecidos com 400 e detalhes', async () => {
    const token = await emitirAccessToken(usuarioA, 4)

    const resposta = await request(app)
      .post('/checkins')
      .auth(token, { type: 'bearer' })
      .send({
        data: '2099-12-31',
        humor: 'invalido',
        sonoHoras: 25,
        observacao: 'x'.repeat(281),
        usuarioId: 7,
      })

    expect(resposta.status).toBe(400)
    expect(resposta.headers['cache-control']).toBe('no-store')
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA')
    expect(Array.isArray(resposta.body.erro.detalhes)).toBe(true)
    expect(resposta.body.erro.detalhes.length).toBeGreaterThanOrEqual(4)
    expect(prisma.checkin_diario.create).not.toHaveBeenCalled()
  })

  it('cria check-in com intensidade opcional (201) usando usuarioId da sessão', async () => {
    const token = await emitirAccessToken(usuarioA, 4)
    const criadoEm = new Date('2026-11-12T21:00:00.000Z')

    vi.mocked(prisma.checkin_diario.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.checkin_diario.create).mockResolvedValue({
      id: 42,
      usuario_id: 7,
      data: new Date(`${hoje}T00:00:00.000Z`),
      humor: 'bom',
      intensidade: null,
      sono_horas: '7.5' as never,
      estudou: true,
      atividade_fisica: false,
      relacoes: null,
      eventos: 'Dia produtivo',
      criado_em: criadoEm,
      editado_em: null,
    })

    const resposta = await request(app)
      .post('/checkins')
      .auth(token, { type: 'bearer' })
      .send({
        data: hoje,
        humor: 'bom',
        sonoHoras: 7.5,
        estudou: true,
        atividadeFisica: false,
        observacao: 'Dia produtivo',
      })

    expect(resposta.status).toBe(201)
    expect(resposta.headers['cache-control']).toBe('no-store')
    expect(resposta.body).toEqual({
      checkin: {
        id: '42',
        data: hoje,
        humor: 'bom',
        intensidade: null,
        sonoHoras: 7.5,
        estudou: true,
        atividadeFisica: false,
        relacoes: null,
        observacao: 'Dia produtivo',
        podeEditar: true,
        criadoEm: criadoEm.toISOString(),
        editadoEm: null,
      },
    })
  })

  it('retorna 409 CHECKIN_JA_EXISTE com o objeto do registro existente quando duplicado', async () => {
    const token = await emitirAccessToken(usuarioA, 4)
    const criadoEm = new Date('2026-11-12T21:00:00.000Z')

    vi.mocked(prisma.checkin_diario.findUnique).mockResolvedValue({
      id: 42,
      usuario_id: 7,
      data: new Date(`${hoje}T00:00:00.000Z`),
      humor: 'bom',
      intensidade: null,
      sono_horas: null,
      estudou: null,
      atividade_fisica: null,
      relacoes: null,
      eventos: null,
      criado_em: criadoEm,
      editado_em: null,
    })

    const resposta = await request(app)
      .post('/checkins')
      .auth(token, { type: 'bearer' })
      .send({ data: hoje, humor: 'neutro' })

    expect(resposta.status).toBe(409)
    expect(resposta.body.erro.codigo).toBe('CHECKIN_JA_EXISTE')
    expect(resposta.body.checkin).toMatchObject({
      id: '42',
      data: hoje,
      humor: 'bom',
      podeEditar: true,
    })
    expect(prisma.checkin_diario.create).not.toHaveBeenCalled()
  })

  it('permite edição parcial via PATCH mantendo campos omitidos e limpando campos enviados como null', async () => {
    const token = await emitirAccessToken(usuarioA, 4)
    const criadoEm = new Date('2026-11-12T21:00:00.000Z')
    const editadoEm = new Date('2026-11-12T22:15:00.000Z')

    vi.mocked(prisma.checkin_diario.findUnique).mockResolvedValue({
      id: 42,
      usuario_id: 7,
      data: new Date(`${hoje}T00:00:00.000Z`),
      humor: 'bom',
      intensidade: 4,
      sono_horas: '7.5' as never,
      estudou: true,
      atividade_fisica: false,
      relacoes: 3,
      eventos: 'Dia produtivo',
      criado_em: criadoEm,
      editado_em: null,
    })

    vi.mocked(prisma.checkin_diario.update).mockResolvedValue({
      id: 42,
      usuario_id: 7,
      data: new Date(`${hoje}T00:00:00.000Z`),
      humor: 'bom',
      intensidade: 4,
      sono_horas: null,
      estudou: true,
      atividade_fisica: false,
      relacoes: 3,
      eventos: 'Dia produtivo e leve',
      criado_em: criadoEm,
      editado_em: editadoEm,
    })

    const resposta = await request(app)
      .patch(`/checkins/${hoje}`)
      .auth(token, { type: 'bearer' })
      .send({
        observacao: 'Dia produtivo e leve',
        sonoHoras: null,
      })

    expect(resposta.status).toBe(200)
    expect(prisma.checkin_diario.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        editado_em: expect.any(Date),
        sono_horas: null,
        eventos: 'Dia produtivo e leve',
      },
    })
    expect(resposta.body.checkin).toMatchObject({
      id: '42',
      humor: 'bom',
      intensidade: 4,
      sonoHoras: null,
      estudou: true,
      observacao: 'Dia produtivo e leve',
      editadoEm: editadoEm.toISOString(),
    })
  })

  it('retorna 404 quando o check-in não existe ou pertence a outro usuário (ownership)', async () => {
    const tokenB = await emitirAccessToken(usuarioB, 5)
    vi.mocked(prisma.checkin_diario.findUnique).mockResolvedValue(null)

    const resposta = await request(app)
      .patch(`/checkins/${hoje}`)
      .auth(tokenB, { type: 'bearer' })
      .send({ observacao: 'Tentativa indevida' })

    expect(resposta.status).toBe(404)
    expect(resposta.body.erro.codigo).toBe('CHECKIN_NAO_ENCONTRADO')
    expect(prisma.checkin_diario.update).not.toHaveBeenCalled()
  })

  it('retorna 403 CHECKIN_NAO_EDITAVEL quando o check-in é de data passada', async () => {
    const token = await emitirAccessToken(usuarioA, 4)
    const dataPassada = '2026-01-10'

    vi.mocked(prisma.checkin_diario.findUnique).mockResolvedValue({
      id: 10,
      usuario_id: 7,
      data: new Date(`${dataPassada}T00:00:00.000Z`),
      humor: 'neutro',
      intensidade: null,
      sono_horas: null,
      estudou: null,
      atividade_fisica: null,
      relacoes: null,
      eventos: null,
      criado_em: new Date('2026-01-10T15:00:00.000Z'),
      editado_em: null,
    })

    const resposta = await request(app)
      .patch(`/checkins/${dataPassada}`)
      .auth(token, { type: 'bearer' })
      .send({ observacao: 'Fora do prazo' })

    expect(resposta.status).toBe(403)
    expect(resposta.body.erro).toEqual({
      codigo: 'CHECKIN_NAO_EDITAVEL',
      mensagem: 'O check-in não pode mais ser editado pois a janela do dia encerrou.',
    })
    expect(prisma.checkin_diario.update).not.toHaveBeenCalled()
  })
})