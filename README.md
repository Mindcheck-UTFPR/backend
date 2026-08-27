# Mindcheck Backend

API do Mindcheck construída com Node.js, TypeScript, Express e PostgreSQL.

## Execução local

Requisitos: Node.js 22+, pnpm 10+ e Docker/Compose ou PostgreSQL 16 local.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm dev
```

A API estará em `http://localhost:3000`. Use `GET /health` para liveness e `GET /health/ready` para validar o PostgreSQL. Verificações: `pnpm lint`, `pnpm test` e `pnpm build`.

Nenhuma credencial real deve ser versionada; altere valores apenas no `.env` local.
