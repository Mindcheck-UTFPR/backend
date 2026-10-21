import { Router } from 'express'
import { CadastroController, LoginController } from '../controllers/autenticacaoController.js'
import { errosMiddleware } from '../middlewares/errosMiddleware.js'

const oCadastroController = new CadastroController()
const oLoginController = new LoginController()

/** Gerenciador de rotas */
const oRotas = Router()

/** Autenticação */
const oRotasAutenticacao = Router()
oRotasAutenticacao.post('/cadastro', oCadastroController.handle)
oRotasAutenticacao.post('/login', oLoginController.handle)

/** Rotas sem validação de autenticação */
oRotas.use('/auth', oRotasAutenticacao)

oRotas.use(errosMiddleware)

export default oRotas
