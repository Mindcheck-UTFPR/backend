import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { jwtVerify } from 'jose'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gerarHashSenha, senhaConfere } from './utils/senha.js'

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
    usuario: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    sessao: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

const { prisma } = await import('./config/prisma.js')
const { app } = await import('./app.js')

const senhaValida = 'senha-segura-1'

function corpoCadastro(sobrepor: Record<string, unknown> = {}) {
  return {
    nome: 'Ana Souza',
    email: 'Ana@UTFPR.edu.br',
    senha: senhaValida,
    termosAceitos: true,
    termosVersao: '1.0',
    ...sobrepor,
  }
}

function dadosGravados() {
  const argumentos = vi.mocked(prisma.usuario.create).mock.calls[0]?.[0] as {
    data: { nome: string; email: string; senha_hash: string; papel: string }
  }
  return argumentos.data
}

describe('cadastro e login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.usuario.create).mockResolvedValue({
      id: 1,
      nome: 'Ana Souza',
      email: 'ana@utfpr.edu.br',
      papel: 'usuario',
    } as never)
    vi.mocked(prisma.sessao.create).mockResolvedValue({ id: 1 } as never)
  })

  it('cadastra com hash, papel usuario e sem devolver a senha', async () => {
    const response = await request(app).post('/auth/cadastro').send(corpoCadastro())

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      usuario: {
        id: 1,
        nome: 'Ana Souza',
        email: 'ana@utfpr.edu.br',
        papel: 'usuario',
      },
    })
    expect(response.body).not.toHaveProperty('accessToken')

    const gravado = dadosGravados()
    expect(gravado.email).toBe('ana@utfpr.edu.br')
    expect(gravado.papel).toBe('usuario')
    expect(gravado.senha_hash).not.toBe(senhaValida)
    expect(gravado.senha_hash).toContain('.')
    expect(await senhaConfere(senhaValida, gravado.senha_hash)).toBe(true)
    expect(JSON.stringify(response.body)).not.toContain(senhaValida)
    expect(response.body.usuario).not.toHaveProperty('senha_hash')
  })

  it('recusa e-mail inválido sem ecoar a senha', async () => {
    const response = await request(app)
      .post('/auth/cadastro')
      .send(corpoCadastro({ email: 'nao-e-email', senha: 'curta' }))

    expect(response.status).toBe(400)
    expect(response.body.erro.codigo).toBe('ENTRADA_INVALIDA')
    expect(JSON.stringify(response.body)).not.toContain('curta')
    expect(prisma.usuario.create).not.toHaveBeenCalled()
  })

  it('recusa senha curta sem ecoar o valor', async () => {
    const response = await request(app).post('/auth/cadastro').send(corpoCadastro({ senha: 'curta' }))

    expect(response.status).toBe(400)
    expect(response.body.erro.codigo).toBe('ENTRADA_INVALIDA')
    expect(response.body.erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'senha' })]),
    )
    expect(JSON.stringify(response.body)).not.toContain('curta')
  })

  it('recusa termos não aceitos', async () => {
    const response = await request(app).post('/auth/cadastro').send(corpoCadastro({ termosAceitos: false }))

    expect(response.status).toBe(400)
    expect(response.body.erro).toMatchObject({ codigo: 'ENTRADA_INVALIDA' })
    expect(response.body.erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'termosAceitos' })]),
    )
  })

  it('responde 409 quando o e-mail já existe', async () => {
    vi.mocked(prisma.usuario.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    )

    const response = await request(app).post('/auth/cadastro').send(corpoCadastro())

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      erro: {
        codigo: 'EMAIL_EM_USO',
        mensagem: 'Este e-mail já está cadastrado.',
      },
    })
    expect(JSON.stringify(response.body)).not.toContain(senhaValida)
  })

  it('ignora papel admin enviado no cadastro', async () => {
    const response = await request(app).post('/auth/cadastro').send(corpoCadastro({ papel: 'admin' }))

    expect(response.status).toBe(201)
    expect(response.body.usuario.papel).toBe('usuario')
    expect(dadosGravados().papel).toBe('usuario')
  })

  it('entra e grava só o hash do refresh token', async () => {
    const senhaHash = await gerarHashSenha(senhaValida)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
      id: 7,
      nome: 'Ana Souza',
      email: 'ana@utfpr.edu.br',
      senha_hash: senhaHash,
      papel: 'usuario',
    } as never)

    const response = await request(app).post('/auth/login').send({
      email: 'ana@utfpr.edu.br',
      senha: senhaValida,
    })

    expect(response.status).toBe(200)
    expect(response.body.usuario).toEqual({
      id: 7,
      nome: 'Ana Souza',
      email: 'ana@utfpr.edu.br',
      papel: 'usuario',
    })
    expect(response.body.accessToken).toEqual(expect.any(String))
    expect(response.body.refreshToken).toEqual(expect.any(String))
    expect(response.body).not.toHaveProperty('senha_hash')

    const gravado = vi.mocked(prisma.sessao.create).mock.calls[0]?.[0] as {
      data: { refresh_token_hash: string; usuario_id: number }
    }
    const hashEsperado = createHash('sha256').update(response.body.refreshToken).digest('hex')
    expect(gravado.data.usuario_id).toBe(7)
    expect(gravado.data.refresh_token_hash).toBe(hashEsperado)
    expect(gravado.data.refresh_token_hash).not.toBe(response.body.refreshToken)
    expect(gravado.data.refresh_token_hash).toHaveLength(64)
  })

  it('devolve o papel admin de quem já é admin', async () => {
    const senhaHash = await gerarHashSenha(senhaValida)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
      id: 3,
      nome: 'Admin',
      email: 'admin@utfpr.edu.br',
      senha_hash: senhaHash,
      papel: 'admin',
    } as never)

    const response = await request(app).post('/auth/login').send({
      email: 'admin@utfpr.edu.br',
      senha: senhaValida,
    })

    expect(response.status).toBe(200)
    expect(response.body.usuario.papel).toBe('admin')
    const { payload } = await jwtVerify(
      response.body.accessToken,
      new TextEncoder().encode(process.env.JWT_SEGREDO),
    )
    expect(payload.sub).toBe('3')
    expect(payload.papel).toBe('admin')
  })

  it('usa a mesma mensagem para e-mail inexistente e senha errada', async () => {
    const senhaHash = await gerarHashSenha(senhaValida)
    vi.mocked(prisma.usuario.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 7,
        nome: 'Ana Souza',
        email: 'ana@utfpr.edu.br',
        senha_hash: senhaHash,
        papel: 'usuario',
      } as never)

    const desconhecido = await request(app).post('/auth/login').send({
      email: 'ninguem@utfpr.edu.br',
      senha: senhaValida,
    })
    const senhaErrada = await request(app).post('/auth/login').send({
      email: 'ana@utfpr.edu.br',
      senha: 'outra-senha-123',
    })

    expect(desconhecido.status).toBe(401)
    expect(senhaErrada.body).toEqual(desconhecido.body)
    expect(desconhecido.body).toEqual({
      erro: {
        codigo: 'CREDENCIAIS_INVALIDAS',
        mensagem: 'E-mail ou senha incorretos.',
      },
    })
    expect(prisma.sessao.create).not.toHaveBeenCalled()
  })
})
