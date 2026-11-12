# Contrato do check-in diário (MIND-23)

Status: **proposta**. Os itens marcados com *(a confirmar)* dependem de decisão do PO, do Eduardo (frontend) ou do time.

Relacionados: MIND-24 (história), MIND-60 (gravação e edição), MIND-62 (histórico), PR #13 do frontend (`docs/INTEGRACAO-CHECKIN.md`) e `prisma/init.sql` (tabela `checkin_diario`).

Esta tarefa **define** o contrato. Não implementa endpoints (MIND-60 e MIND-62).

## Regras gerais

- **Autenticação:** `Authorization: Bearer <accessToken>`. O usuário vem do token. O corpo nunca contém `usuarioId`.
- **Um check-in por usuário e data:** garantido no banco por `UNIQUE (usuario_id, data)`.
- **Data (`data`):** dia local do usuário, formato `YYYY-MM-DD`, enviado pelo frontend. Não pode ser futura *(a confirmar: tolerância de 1 dia por causa do fuso)*.
- **Janela de edição (`podeEditar`):** o check-in pode ser editado apenas até o fim do próprio dia (`data` igual ao dia atual, conforme fluxo definido no Figma). Após virar o dia, `podeEditar` passa a ser `false`.
- **Timestamps (`criadoEm`, `editadoEm`):** UTC, ISO 8601.
- **Ownership:** cada usuário lê e edita só os seus check-ins. Check-in inexistente e check-in de outro usuário respondem igual (`404`), para não revelar que o registro existe.
- **Formato de erro:** `{ "erro": { "codigo": "...", "mensagem": "..." } }`, o mesmo já usado em `/auth`.
- **Prefixo:** as rotas internas são `/checkins`. O Nginx publica `/api/checkins`, como já acontece com `/auth` (`/api/auth`).
- **Cache:** todas as respostas de check-in usam `Cache-Control: no-store`, como as respostas de `/auth`, porque são dados sensíveis.
- **Logs:** não registrar humor, observação nem qualquer campo do check-in.
- **Sem pontuação nem diagnóstico** no check-in.

## Campos

| JSON | Coluna | Tipo e regra | Obrigatório |
|---|---|---|---|
| `data` | `data` | `YYYY-MM-DD`, não futura | sim no `POST` |
| `humor` | `humor` | `muito_baixo`, `baixo`, `neutro`, `bom` ou `muito_bom` | sim |
| `intensidade` | `intensidade` | inteiro de 1 a 5 | *(a confirmar)* |
| `sonoHoras` | `sono_horas` | número de 0 a 24, uma casa decimal, ou `null` | não |
| `estudou` | `estudou` | `true`, `false` ou `null` | não |
| `atividadeFisica` | `atividade_fisica` | `true`, `false` ou `null` | não |
| `relacoes` | `relacoes` | inteiro de 1 a 5, ou `null` | não *(reservado para versões futuras; não coletado na UI atual)* |
| `observacao` | `eventos` | texto de até 280 caracteres, ou `null` | não *(a confirmar o mapeamento)* |

Campos opcionais não respondidos são `null`. Campos desconhecidos no corpo são rejeitados (`400`).

Campos só de resposta: `podeEditar` (boolean, `true` apenas no dia atual), `criadoEm`, `editadoEm` (`null` se nunca editado).

## Operações

Caminhos *(a confirmar com o Eduardo)*.

| Operação | Caminho | Sucesso | Erros |
|---|---|---|---|
| Ler o check-in de uma data (padrão: hoje) | `GET /checkins?data=YYYY-MM-DD` | `200` com `{ "checkin": {...} }` ou `{ "checkin": null }` se não houver registro | `400`, `401` |
| Criar | `POST /checkins` | `201` com `{ "checkin": {...} }` | `400`, `401`, `409` |
| Editar | `PUT /checkins/:data` | `200` com `{ "checkin": {...} }` | `400`, `401`, `404` |

- A leitura **diferencia ausência de registro** (`200` com `checkin: null`) de **erro** (`4xx` ou `5xx`).
- No `PUT`, o corpo traz o check-in completo. Opcionais omitidos viram `null` *(a confirmar: `PUT` ou `PATCH`)*.
- Histórico e listagem ficam na MIND-62.

## Erros

| Status | Código | Quando |
|---|---|---|
| `400` | `ENTRADA_INVALIDA` | campo fora da regra, data inválida ou futura, campo desconhecido. Inclui `detalhes` por campo (gerado por `detalhesDeValidacao`, o mesmo do cadastro) |
| `401` | `SESSAO_INVALIDA` | token ausente, inválido ou expirado; sessão encerrada. Mensagem: "Entre para continuar." (igual ao `GET /auth/me`) |
| `404` | `CHECKIN_NAO_ENCONTRADO` | não existe check-in na data, ou pertence a outro usuário |
| `409` | `CHECKIN_JA_EXISTE` | já existe check-in do usuário na data. A resposta inclui o registro existente |

O `409` vem da violação de unicidade do banco (no Prisma, `P2002`). Ao receber o conflito, o frontend recupera o registro existente antes de permitir a edição.

## Exemplos

Criar:

```json
{
  "data": "2026-11-11",
  "humor": "bom",
  "sonoHoras": 7.5,
  "estudou": true,
  "atividadeFisica": null,
  "observacao": "Dia tranquilo"
}
```

Resposta (`201`):

```json
{
  "checkin": {
    "data": "2026-11-11",
    "humor": "bom",
    "intensidade": null,
    "sonoHoras": 7.5,
    "estudou": true,
    "atividadeFisica": null,
    "relacoes": null,
    "observacao": "Dia tranquilo",
    "podeEditar": true,
    "criadoEm": "2026-11-11T22:10:00Z",
    "editadoEm": null
  }
}
```

Erro de validação (`400`):

```json
{
  "erro": {
    "codigo": "ENTRADA_INVALIDA",
    "mensagem": "Os dados enviados são inválidos.",
    "detalhes": "(formato definido por detalhesDeValidacao)"
  }
}
```

Conflito (`409`):

```json
{
  "erro": { "codigo": "CHECKIN_JA_EXISTE", "mensagem": "Já existe check-in nesta data." },
  "checkin": { "data": "2026-11-11", "humor": "bom", "podeEditar": true }
}
```

## A confirmar

1. **Intensidade:** a coluna é `NOT NULL` e o formulário do frontend não a coleta. O frontend não a deriva do humor. Opções: (1) tornar opcional no banco e no contrato *(recomendado)*; (2) o frontend passa a coletar, com o campo no Figma. Decisão necessária antes da MIND-60.
2. **`observacao` e `eventos`:** o frontend envia `observacao` (280). O banco tem `eventos` (280). Confirmar que são o mesmo campo.
3. **Tolerância de data futura** por causa do fuso.
4. **Caminhos** das rotas e `PUT` x `PATCH`.
5. **Dependência (middleware de sessão):** as rotas precisam de um middleware que valide o `Bearer` JWT e confirme no banco que a sessão (`sid`) ainda existe, como o `GET /auth/me` já faz (MIND-18). O papel nunca vem do JWT, e um JWT expirado nunca concede acesso. A função `usuarioDaSessao(token)` já faz essa validação e é chamada de dentro do `sessaoController`. O middleware pode reaproveitá-la, e será criado na MIND-60.

## Casos de teste para a MIND-60 e a MIND-62

- Usuário A não lê nem edita o check-in do usuário B (`404`).
- Requisição sem token ou com token expirado (`401`).
- Data futura e data em formato inválido (`400`).
- Humor fora do enum, `sonoHoras` fora de 0 a 24, observação com mais de 280 caracteres (`400`).
- Campo desconhecido no corpo (`400`).
- Segundo `POST` na mesma data (`409`, devolvendo o registro existente).
- `GET` sem registro (`200` com `checkin: null`).
- `PUT` em data sem registro (`404`).
- `podeEditar` retorna `true` no dia atual e `false` para check-ins de dias anteriores.
- Testes de integração com PostgreSQL real (o CI usa o banco `mindcheck_test` criado com o `init.sql`) e dados sintéticos, sem dados reais.
- Se a intensidade virar opcional, a mudança vai nos três lugares do guia do banco: `prisma/init.sql` (o CI usa esse arquivo), um novo `prisma/patches/002-...sql` e o `prisma/schema.prisma`, seguido de `prisma:generate`.