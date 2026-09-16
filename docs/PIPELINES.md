# Pipelines GitHub Actions

Três arquivos, três responsabilidades. Nenhum IP, senha ou chave SSH entra no repositório.

| Arquivo | Quando roda | O que faz |
| --- | --- | --- |
| `ci.yml` | PR e push em `main`/`develop` | lint, **testes automatizados (Vitest)** e build |
| `deploy.yml` | push em `main` ou disparo manual | testes + build + publicação na VM Oracle (SSH + Docker Compose) |
| `monitoring.yml` | a cada 15 min (UTC) e manual | `curl --fail` em `/health` e `/health/ready` já publicados |

## CI

Não publica. Garante que a API (Express + Prisma) lint, testa o endpoint `/health` e compila.

## Deploy

Reproduz o fluxo de `ORACLE-CLOUD.md`: VM com Docker Compose, Nginx na frente, API sem porta pública direta.

Segredos do repositório:

- `DEPLOY_HOST` — endereço da VM
- `DEPLOY_USER` — usuário SSH
- `DEPLOY_SSH_KEY` — chave privada
- `DEPLOY_PATH` — pasta do compose no servidor

Depois do `docker compose up`, o job confere `http://127.0.0.1:3000/health` e `/health/ready` **na própria VM**.

## Monitoring

Não faz build. Só pergunta se a aplicação publicada responde.

Variáveis do repositório (Settings → Secrets and variables → Actions → Variables):

- `HEALTH_URL` — ex.: `https://seu-dominio/api/health`
- `READY_URL` — ex.: `https://seu-dominio/api/health/ready`

O Nginx encaminha `/api` para o Express; `/health` é liveness (processo) e `/health/ready` valida o PostgreSQL.

Cron usado: `*/15 * * * *` (cinco campos). `"/15 * * *"` não é cron válido no GitHub Actions.
