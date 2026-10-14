# MIND-18 — contrato de sessão necessário à integração

## Plano

PR empilhada na branch `feature/MIND-17-cadastro-login`, sem fechar ou mesclar a PR #4. A MIND-18 depende desta base e de novas correções futuras do time. Incorporar essas correções por merge normal antes da integração final.

Completar sessão → testar contra PostgreSQL real no CI → integrar frontend em ambiente de teste → revisão das PRs → publicar apenas quando liberado pelo PO. Não concluir MIND-18 antes da validação HTTPS com backend e frontend integrados.

## Endpoints

Prefixo interno `/auth`; Nginx publica `/api/auth`.

| Método | Rota | Contrato |
| --- | --- | --- |
| GET | /config | termosVersao e termosUrl pública HTTPS ou null |
| POST | /cadastro | contrato MIND-17; sem TERMOS_URL retorna 503 TERMOS_INDISPONIVEIS |
| POST | /login | accessToken JWT, refreshToken opaco, expiraEm do refresh e usuario público |
| GET | /me | Bearer JWT; usuario público somente com sessão válida no banco |
| POST | /refresh | corpo refreshToken; rotação compare-and-swap, 401 se expirado/reutilizado |
| POST | /logout | corpo refreshToken e preferencialmente Bearer; 204 idempotente |

JWT contém subject, sid, papel, emissor mindcheck, audiência mindcheck-api e expiração. Consulta de /me nunca confia no papel do JWT: retorna papel atual do usuário no banco. Rotação mantém prazo absoluto e só um consumo vence. Logout com JWT assinado identifica sessão por sid/subject, inclusive se o JWT expirou, APENAS para revogação: jamais concede acesso. Assim, logout concorre com refresh sem depender de hash antigo. Remover a sessão invalida todos os access tokens dela no próximo acesso a /me.

Todas as respostas auth usam Cache-Control no-store. Senhas, refresh e parâmetros de queries não são registrados. A emissão de papel admin por cadastro continua proibida. Rate limits, headers adicionais e auditoria continuam na MIND-34 e impedem tratar esta PR como hardening completo.

## Configuração e publicação futura

- JWT_SEGREDO: pelo menos 32 caracteres fortes, criado/armazenado na VM; nunca usar fixture do CI em produção.
- JWT_ACCESS_SEGUNDOS: 30–3600, padrão Compose 900.
- REFRESH_DIAS: 1–30, padrão Compose 7.
- TERMOS_VERSAO: versão do documento aprovado.
- TERMOS_URL: documento aprovado do Mindcheck em HTTPS. Ausente: cadastro indisponível tanto na UI como na API. Não há documento aprovado encontrado nesta entrega.

Não é usado Prisma Migrate neste ciclo. Publish faz backup privado pg_dump antes de aplicar o patch aditivo 001-usuario-papel.sql em transação; não apaga ou reinicializa volume. A coluna adicional é compatível com rollback da API anterior. Compose valida segredo antes de iniciar publicação. É necessário configurar o .env da VM antes de promover esta entrega; isso ainda não foi feito.

Os valores JWT/termos em workflows são fixtures somente do runner de testes, nunca variáveis passadas à API de produção. `example.test` não é documento real nem libera cadastro de produção.

## Testes

Lint, Vitest e build TypeScript/Prisma. CI provisiona PostgreSQL 16 em banco mindcheck_test, aplica init.sql e testa cadastro/login, concorrência de refresh, replay e logout invalidando JWT. A suíte real recusa banco remoto ou nome diferente; limpa exclusivamente a conta aleatória criada por ela.

Local sem PostgreSQL: três testes de integração são explicitamente ignorados; não confundir testes mockados com evidência de banco real. Executar a suíte completa no CI antes do aceite. Sem merge/deploy nesta tarefa por orientação do PO.
