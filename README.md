# Mindcheck Backend

API do **Mindcheck**: plataforma mobile-first de autoconhecimento e triagem de bem-estar para universitários. Combina check-in diário de humor, questionários psicológicos validados e um dashboard simples.

A API **não faz diagnóstico**. Os scores são orientativos; qualquer diagnóstico cabe a um profissional habilitado.

Versão atual da imagem Docker: **`mindcheck-backend:0.1.0`**.

## O que o sistema faz (MVP)

1. Conta + aceite de termos e privacidade  
2. Check-in diário curto (humor, sono, estudos, atividade física, relações, eventos)  
3. Um ou mais questionários versionados (ex.: PHQ-9), com pontuação automática  
4. Dashboard com linha do humor e último resultado do questionário  

Check-in **não** é um formulário genérico. Questionário **não** passa pelo check-in. A pontuação é soma dos pesos da versão + faixa já cadastrada (sem IA).

Público: React (navegador) e o mesmo app no Android via Capacitor/WebView.

## Arquitetura

```text
Android (Capacitor/WebView) ou navegador
                    |
                  HTTPS
                    |
                  Nginx
           /                 \
     frontend React          /api
                               |
                      Node.js + Express
                               |
                          PrismaClient
                          (Singleton)
                               |
                          PostgreSQL 16
```

Em produção a proposta é Docker Compose numa VM Oracle Cloud Free Tier. O Nginx é a porta pública (HTTPS + estáticos + proxy `/api`). O PostgreSQL **não** fica exposto na internet.

### Stack

| Camada | Tecnologia |
| --- | --- |
| Linguagem | TypeScript (Node 22) |
| HTTP | Express |
| Validação | Zod |
| ORM | Prisma 6 (`@prisma/client`) |
| Banco | PostgreSQL 16 |
| Empacote | Docker (`Dockerfile` + Compose) |
| Testes | Vitest + Supertest |
| Pacotes | pnpm 10 |

### Estilo de código (MVC)

Pastas por camada, nomes em português:

```text
src/
  app.ts                 # Express, CORS, /health e /health/ready
  server.ts              # listen na PORT
  config/
    env.ts               # Zod: NODE_ENV, PORT, CORS_ORIGIN, DATABASE_URL
    prisma.ts            # PrismaClient singleton
prisma/
  schema.prisma          # models geradas pelo db pull
  init.sql               # cria enums e tabelas no Postgres
```

Fluxo previsto quando as rotas de negócio existirem:

```text
rota → Controller (HTTP + Zod) → Service (regra) → Prisma → JSON
```

Não haverá `PontuacaoController`. A soma do questionário é um service chamado no envio da avaliação.

Hoje a API só expõe health checks. Controllers de usuário, check-in, questionário, avaliação e dashboard ainda não foram implementados.

### Endpoints atuais

| Método | Caminho | Função |
| --- | --- | --- |
| `GET` | `/health` | processo vivo (liveness) |
| `GET` | `/health/ready` | `SELECT 1` no Postgres via Prisma (readiness) |

## Banco de dados

Fonte da verdade das tabelas: `prisma/init.sql`. O Prisma **espelha** o banco com `db pull` (não usamos migrate neste ciclo).

### Regras de domínio

- **Check-in diário** (`checkin_diario`): um por usuário por dia. Colunas fixas (humor, intensidade, fatores opcionais). Sem `pergunta`/`resposta`.
- **Questionário** (`questionario` + `questionario_versao`): catálogo (PHQ-9, etc.). A versão é do instrumento, não do app Android.
- **Avaliação** (`avaliacao` + `resposta`): um envio do aluno. Não é diagnóstico.
- **Resultado** (`resultado`): soma automática + faixa. Calculado no backend na hora do envio.
- **Faixas** (`faixa_interpretacao`): critério da **versão**, cadastrado no seed/SQL. O aluno não cria faixa ao responder.

### Tabelas

| Tabela | Papel |
| --- | --- |
| `usuario` | conta, hash de senha, aceite de termos |
| `sessao` | refresh token; logout apaga a linha |
| `checkin_diario` | hábito diário |
| `questionario` | catálogo visível no app (`ativo`, `ordem`) |
| `questionario_versao` | versão `1.0`, flag `ativa`, prazo de reaplicação |
| `pergunta` | `escala`, `polar`, `escolha_unica` ou `aberta` |
| `opcao_pergunta` | texto + `valor_numerico` (peso). Aberta não tem opção |
| `faixa_interpretacao` | `minimo`–`maximo`, `codigo`, `rotulo`, texto orientativo |
| `avaliacao` | envelope de um envio |
| `resposta` | `opcao_id` (fechada) **ou** `texto` (aberta) |
| `resultado` | `pontuacao` + `faixa_id` (1:1 com avaliação) |

Enums: `humor_nivel`, `pergunta_tipo`.

Relacionamentos principais: usuário 1:N check-in/avaliação/sessão; questionário 1:N versões; versão 1:N perguntas e faixas; avaliação 1:N respostas e 1:1 resultado.

### Prisma

| Arquivo | Função |
| --- | --- |
| `prisma/init.sql` | `CREATE TYPE` / `CREATE TABLE` |
| `prisma/schema.prisma` | models TypeScript (depois do pull) |
| `src/config/prisma.ts` | uma instância de `PrismaClient` (evita pool duplicado no `tsx watch`) |

Fluxo:

1. Sobe o Postgres  
2. Roda o SQL (Compose faz isso em volume **novo**)  
3. `prisma db pull` atualiza o `schema.prisma`  
4. `prisma generate` gera o client  

Não commitar `.env`. `DATABASE_URL` no PC usa `localhost`; **dentro** do container da API usa o host `postgres`.

## Requisitos

- Node.js 22+
- pnpm 10 (ou `npx pnpm@10.34.5` / `npm run …` se o `pnpm` não estiver no PATH do Windows)
- Docker Desktop **ou** PostgreSQL 16 local
- Copiar `.env.example` → `.env` com um `DATABASE_URL` que o Postgres aceite (usuário/senha iguais ao pgAdmin)

## Comandos

No Windows, se `pnpm` não for reconhecido:

```powershell
npx pnpm@10.34.5 install
npm run dev
npm run prisma:pull
```

### API em modo desenvolvimento (código local + Postgres no Docker)

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm dev
```

API: `http://localhost:3000`

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

### Tudo no Docker (imagem v0.1.0)

```bash
docker compose build api
docker compose up -d
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

Só gerar a imagem:

```bash
docker build -t mindcheck-backend:0.1.0 .
```

Não use `docker run` sozinho na primeira vez: a API procura o host `postgres`, que só existe na rede do Compose.

```bash
docker compose ps
docker compose logs -f api
docker compose down
```

Volume antigo do Postgres **não** reexecuta `init.sql`. Volume novo sim (`./prisma/init.sql` montado em `docker-entrypoint-initdb.d`).

### Prisma

Se o SQL ainda não rodou (Postgres instalado no Windows, sem Compose):

```bash
psql "$DATABASE_URL" -f prisma/init.sql
```

Sincronizar o ORM com as tabelas:

```bash
pnpm prisma:pull      # prisma db pull
pnpm prisma:generate  # client TypeScript
pnpm prisma:studio    # UI opcional
```

`prisma:pull` precisa de `DATABASE_URL` válido. Erro `P1000` = usuário/senha/banco errados, não é falha do Prisma.

### Qualidade

```bash
pnpm lint
pnpm test
pnpm build
```

`pnpm test` cobre `GET /health`. `pnpm build` roda `prisma generate` + `tsc`.

| Script | O que faz |
| --- | --- |
| `dev` | `tsx watch` na API |
| `start` | `node dist/server.js` (produção) |
| `prisma:pull` | introspecta o Postgres |
| `prisma:generate` | gera `@prisma/client` |
| `prisma:studio` | explorador gráfico |

## GitHub Actions

Três arquivos, três papéis. Nenhum IP ou chave SSH no Git.

| Arquivo | Quando | Faz |
| --- | --- | --- |
| `.github/workflows/ci.yml` | PR e push `main`/`develop` | lint, **testes Vitest**, build |
| `.github/workflows/deploy.yml` | push `main` ou manual | testa, builda, SSH + `docker compose up --build`, curl local de health |
| `.github/workflows/monitoring.yml` | a cada 15 min (UTC) e manual | `curl --fail` na URL **já publicada** |

Segredos de deploy: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`.  
Variáveis de monitoramento: `HEALTH_URL` (ex. `https://dominio/api/health`), `READY_URL` (`…/api/health/ready`).

Detalhes: [docs/PIPELINES.md](docs/PIPELINES.md). VM: [docs/ORACLE-CLOUD.md](docs/ORACLE-CLOUD.md).

## Privacidade

- Dados de humor e respostas psicológicas são sensíveis (LGPD).  
- Não versionar `.env`, tokens, IPs privados ou chaves SSH.  
- Logs não devem incluir senha, token, humor ou respostas.  
- Cada usuário só acessa os próprios registros (quando as rotas existirem).

## Documentação

- [Arquitetura do backend](docs/ARCHITECTURE.md)
- [Hospedagem na Oracle Cloud](docs/ORACLE-CLOUD.md)
- [Pipelines](docs/PIPELINES.md)
- Modelo ER: `../.github/docs/uml/` (`mindcheck-modelo.dbml`, PlantUML)
