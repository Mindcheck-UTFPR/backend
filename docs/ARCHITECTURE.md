# Arquitetura do backend

## Responsabilidade

A API Node.js concentra autenticação, autorização, diário de humor, questionários, pontuação, dashboard, histórico e encaminhamentos. O cálculo e as regras de acesso ficam no backend; o frontend apenas envia dados e apresenta resultados.

## Organização

Camadas MVC. Sem pasta `src/modules`.

```text
src/
  app.ts
  server.ts
  config/
  routes/          # rotas.ts agrega os routers
  controllers/     # uma classe por ação, método handle
  validators/      # Zod
  services/
  middlewares/
  utils/
prisma/
  init.sql         # banco novo
  patches/         # banco que já existia
  schema.prisma    # espelho do Postgres
```

O nome do arquivo é o assunto em português, em camelCase, com o papel no final (`autenticacaoController.ts`). `config/env.ts` só lê o `.env`.

Fluxo: `routes/rotas.ts` → `Controller.handle` → validação → service → Prisma.

Como subir a API e atualizar o banco: [GUIA.md](GUIA.md).

## Produção

O backend roda em container sem porta pública direta. Nginx recebe HTTPS e encaminha `/api` para a API. PostgreSQL fica apenas na rede interna do Docker Compose, com volume persistente e backup.

## Regras importantes

- Cada usuário acessa somente os próprios registros.
- Questionários publicados são versionados.
- A pontuação é calculada no backend e testada com exemplos.
- Logs não incluem respostas, humor, senha ou token.
- `/health` verifica o processo e `/health/ready` verifica o banco.
- Neste ciclo o schema não usa Prisma Migrate.
