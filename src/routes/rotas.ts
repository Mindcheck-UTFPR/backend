import { Router } from 'express'
import { AdministracaoController } from '../controllers/administracaoController.js'
import { AvaliacaoController } from '../controllers/avaliacaoController.js'
import { QuestionarioController } from '../controllers/questionarioController.js'
import { CadastroController, LoginController } from '../controllers/autenticacaoController.js'
import { CheckinController } from '../controllers/checkinController.js'
import { autenticacaoMiddleware } from '../middlewares/autenticacaoMiddleware.js'
import { autorizacaoAdminMiddleware } from '../middlewares/autorizacaoMiddleware.js'
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

/** Painel administrativo */
const oRotasAdmin = Router()
const administracaoController = new AdministracaoController()
const questionarioController = new QuestionarioController()
oRotasAdmin.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next() })
oRotasAdmin.use(autenticacaoMiddleware)
oRotasAdmin.use(autorizacaoAdminMiddleware)
oRotasAdmin.post('/questionarios', questionarioController.criar)
oRotasAdmin.get('/questionarios', questionarioController.listar)
oRotasAdmin.get('/questionarios/:questionarioId', questionarioController.detalhar)
oRotasAdmin.put('/questionarios/:questionarioId/versoes/:versaoId', questionarioController.salvar)
oRotasAdmin.post('/questionarios/:questionarioId/versoes', questionarioController.novaVersao)
oRotasAdmin.post('/questionarios/:questionarioId/versoes/:versaoId/publicar', questionarioController.publicar)
oRotasAdmin.get('/usuarios', administracaoController.usuarios)
oRotasAdmin.get('/auditoria', administracaoController.auditoria)

oRotas.use('/admin', oRotasAdmin)

/** Questionário publicado e envio do aluno */
const oRotasQuestionario = Router()
const avaliacaoController = new AvaliacaoController()
oRotasQuestionario.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next() })
oRotasQuestionario.use(autenticacaoMiddleware)
oRotasQuestionario.get('/', avaliacaoController.catalogo)
oRotasQuestionario.get('/:questionarioId', avaliacaoController.estrutura)
oRotasQuestionario.post('/:questionarioId/avaliacoes', avaliacaoController.enviar)

const oRotasAvaliacao = Router()
oRotasAvaliacao.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next() })
oRotasAvaliacao.use(autenticacaoMiddleware)
oRotasAvaliacao.get('/:avaliacaoId', avaliacaoController.consultar)

oRotas.use('/questionarios', oRotasQuestionario)
oRotas.use('/avaliacoes', oRotasAvaliacao)

export default oRotas
