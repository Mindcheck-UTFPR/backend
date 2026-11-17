import { Router } from 'express'
import { CadastroController, LoginController } from '../controllers/autenticacaoController.js'
import { CheckinController } from '../controllers/checkinController.js'
import { autenticacaoMiddleware } from '../middlewares/autenticacaoMiddleware.js'
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

/** Check-in diário */
const oRotasCheckin = Router()
const checkinController = new CheckinController()
oRotasCheckin.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next() })
oRotasCheckin.use(autenticacaoMiddleware)
oRotasCheckin.get('/', checkinController.consultar)
oRotasCheckin.get('/hoje', checkinController.hoje)
oRotasCheckin.get('/:id', checkinController.detalhar)
oRotasCheckin.post('/', checkinController.criar)
oRotasCheckin.patch('/:data', checkinController.editar)

oRotas.use('/checkins', oRotasCheckin)


export default oRotas
