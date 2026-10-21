# Guia do backend

Passo a passo para quem vai rodar a API e alterar o banco. O processo de issue, branch e Pull Request continua em `.github/docs/DEVELOPMENT.md`.

## Subir o projeto

Requisitos: Node.js 22, pnpm 10, e PostgreSQL 16. O Postgres pode ser o do Docker Compose ou um instalado na máquina.

Na pasta `backend`:

```powershell
copy .env.example .env
```

Abra o `.env` e confira duas coisas:

- `DATABASE_URL` aponta para o Postgres que você realmente subiu. No Compose o usuário é `mindcheck` e a senha é `mindcheck`, no host `localhost`. Um Postgres instalado no Windows costuma usar o usuário `postgres`.
- `JWT_SEGREDO` tem pelo menos 32 caracteres. Troque o valor de exemplo.

O arquivo `.env` não entra no Git.

Suba só o banco, se for usar o Compose:

```powershell
docker compose up -d postgres
```

Instale e rode a API na máquina:

```powershell
pnpm install
pnpm dev
```

No Windows, se `pnpm` não for reconhecido: `npx pnpm@10.34.5 install` e `npm run dev`.

A API fica em `http://localhost:3000`.

- `GET /health` responde se o processo está no ar.
- `GET /health/ready` responde se o Postgres conectou.
- Cadastro e login estão na collection `postman/Mindcheck-autenticacao.postman_collection.json`.

Antes do primeiro cadastro, o banco precisa ter as tabelas. Veja a seção seguinte.

## Banco de dados

Neste ciclo **não usamos Prisma Migrate**. Não existe `prisma migrate dev`. A fonte da tabela nova é o SQL. O Prisma só espelha o que já está no Postgres.

| Arquivo ou comando | Para que serve |
| --- | --- |
| `prisma/init.sql` | Cria o banco inteiro. O Docker executa isso só quando o volume é novo. |
| `prisma/patches/` | Altera um banco que já existia e por isso não roda o `init.sql` de novo. |
| `prisma/schema.prisma` | Modelo que o TypeScript usa. Deve bater com o banco. |
| `pnpm prisma:generate` | Gera o client do Prisma a partir do `schema.prisma`. Não mexe no banco. |
| `pnpm prisma:pull` | Lê o banco e reescreve o `schema.prisma`. Não cria coluna. |

### Banco novo

O Compose com volume vazio já aplica o `init.sql`. Se o Postgres está instalado na máquina e ainda não tem as tabelas:

```powershell
psql "postgresql://USUARIO:SENHA@localhost:5432/mindcheck" -f prisma/init.sql
pnpm prisma:generate
```

### Banco que já existia

Mudou uma tabela depois que o volume foi criado? O `init.sql` não roda de novo. Quem já tem o banco aplica o patch:

```powershell
psql "postgresql://USUARIO:SENHA@localhost:5432/mindcheck" -f prisma/patches/001-usuario-papel.sql
```

Troque a URL pela `DATABASE_URL` do seu `.env`. Esse patch cria a coluna `papel`. Sem ele, o cadastro responde erro interno: `The column papel does not exist`.

### Quando a tabela mudar de novo

1. Atualize `prisma/init.sql`, para quem criar o banco do zero.
2. Crie o próximo arquivo em `prisma/patches/`, para quem já tem banco.
3. Atualize `prisma/schema.prisma` com a mesma coluna ou enum.
4. Rode `pnpm prisma:generate`.
5. Rode o patch no seu Postgres.

`pnpm prisma:pull` entra quando alguém alterou o banco na mão e quer que o `schema.prisma` copie essa alteração. O caminho normal do time é escrever o SQL e o schema juntos.

## Onde o código fica

Camadas, uma pasta por papel. Sem `src/modules`.

```text
src/
  app.ts                 # Express, CORS, JSON, /health
  server.ts              # sobe a porta
  config/env.ts          # lê o .env; não inventa valor padrão
  config/prisma.ts
  routes/rotas.ts        # junta as rotas e o middleware de erro
  controllers/           # uma classe por ação, método handle
  validators/            # Zod
  services/              # regra e Prisma
  middlewares/
  utils/
```

O nome do arquivo é o assunto em português, em camelCase, com o papel no final: `autenticacaoController.ts`, `autenticacaoService.ts`. A pasta já diz a camada.

Fluxo de uma rota:

```text
routes/rotas.ts → Controller.handle → validação Zod → service → Prisma → JSON
```

O `handle` valida o corpo. Entrada inválida responde `400` ali. Falha de regra e erro inesperado seguem para o middleware, que devolve:

```json
{ "erro": { "codigo": "ENTRADA_INVALIDA", "mensagem": "..." } }
```

Log sem senha, token, humor ou resposta de questionário.

## Verificação

```powershell
pnpm lint
pnpm test
pnpm build
```
