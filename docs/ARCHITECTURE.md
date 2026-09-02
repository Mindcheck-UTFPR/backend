# Arquitetura do backend

## Responsabilidade

A API Node.js concentra autenticação, autorização, diário de humor, questionários, pontuação, dashboard, histórico e encaminhamentos. O cálculo e as regras de acesso ficam no backend; o frontend apenas envia dados e apresenta resultados.

## Organização sugerida

```text
src/
  app.ts
  server.ts
  config/
  modules/
    identity/
    mood/
    questionnaires/
    assessments/
    scoring/
    dashboard/
    referrals/
    admin/
  shared/
```

Dentro de cada módulo, usar uma separação simples: rota, validação Zod, caso de uso e acesso ao PostgreSQL.

## Produção

O backend roda em container sem porta pública direta. Nginx recebe HTTPS e encaminha `/api` para a API. PostgreSQL fica apenas na rede interna do Docker Compose, com volume persistente e backup.

## Regras importantes

- Cada usuário acessa somente os próprios registros.
- Questionários publicados são versionados.
- A pontuação é calculada no backend e testada com exemplos.
- Logs não incluem respostas, humor, senha ou token.
- `/health` verifica o processo e `/health/ready` verifica o banco.
