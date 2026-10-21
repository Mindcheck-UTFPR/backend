import { Router } from 'express'
import { CadastroController, LoginController } from '../controllers/autenticacaoController.js'
import { errosMiddleware } from '../middlewares/errosMiddleware.js'
import { SessaoController } from '../controllers/sessaoController.js'
import { env } from '../config/env.js'

const oCadastroController = new CadastroController()
const oLoginController = new LoginController()

/** Gerenciador de rotas */
const oRotas = Router()

/** Autenticação */
const oRotasAutenticacao = Router()
const sessaoController = new SessaoController()
oRotasAutenticacao.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next() })
oRotasAutenticacao.get('/config', (_request, response) => { response.json({ termosVersao: env.TERMOS_VERSAO, termosUrl: env.TERMOS_URL }) })
oRotasAutenticacao.post('/cadastro', oCadastroController.handle)
oRotasAutenticacao.post('/login', oLoginController.handle)
oRotasAutenticacao.get('/me', sessaoController.me)
oRotasAutenticacao.post('/refresh', sessaoController.refresh)
oRotasAutenticacao.post('/logout', sessaoController.logout)

/** Rotas sem validação de autenticação */
oRotas.use('/auth', oRotasAutenticacao)

oRotas.use(errosMiddleware)

export default oRotas
