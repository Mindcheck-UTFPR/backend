# Mindcheck Backend

API do Mindcheck construída com Node.js, TypeScript, Express e PostgreSQL.

O backend atende a aplicação React no navegador e o aplicativo Android empacotado com Capacitor/WebView. A proposta de produção usa Docker Compose e Nginx em uma VM gratuita da Oracle Cloud.

## Execução local

Requisitos: Node.js 22+, pnpm 10+ e Docker/Compose ou PostgreSQL 16 local.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm dev
```

A API estará em `http://localhost:3000`. Use `GET /health` para liveness e `GET /health/ready` para validar o PostgreSQL. Verificações: `pnpm lint`, `pnpm test` e `pnpm build`.

## Imagem Docker (v0.1.0)

A API vira o container `mindcheck-backend:0.1.0`. O hostname `postgres` no `DATABASE_URL` é o serviço do Compose, não `localhost`.

```bash
docker compose build api
docker compose up -d
curl http://localhost:3000/health
```

Só a imagem, sem Compose:

```bash
docker build -t mindcheck-backend:0.1.0 .
```

Volume novo do Postgres aplica `prisma/init.sql` na primeira subida. Volume antigo não reexecuta esse SQL.

## Prisma (sem Docker da API)

```bash
docker compose up -d postgres
psql "$DATABASE_URL" -f prisma/init.sql
pnpm prisma:pull
pnpm prisma:generate
```

## Documentação

- [Arquitetura do backend](docs/ARCHITECTURE.md)
- [Hospedagem na Oracle Cloud](docs/ORACLE-CLOUD.md)
- [Pipelines (CI, deploy, monitoring)](docs/PIPELINES.md)

Nenhuma credencial, IP privado, token ou chave SSH deve ser versionado; altere valores apenas no `.env` local ou no gerenciador de segredos do ambiente.
