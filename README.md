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

O acesso ao banco usa Prisma (`src/config/prisma.ts`). Crie as tabelas e sincronize o schema:

```bash
docker compose up -d postgres
psql "$DATABASE_URL" -f prisma/init.sql
pnpm prisma:pull
pnpm prisma:generate
```

## Documentação

- [Arquitetura do backend](docs/ARCHITECTURE.md)
- [Hospedagem na Oracle Cloud](docs/ORACLE-CLOUD.md)

Nenhuma credencial, IP privado, token ou chave SSH deve ser versionado; altere valores apenas no `.env` local ou no gerenciador de segredos do ambiente.
