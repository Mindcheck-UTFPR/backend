# Contrato do check-in diário (MIND-23)

Status: **acordado** com o frontend.

Relacionados: MIND-24 (história), MIND-60 (gravação e edição), MIND-62 (histórico), PR #13 do frontend (`docs/INTEGRACAO-CHECKIN.md`) e `prisma/init.sql` (tabela `checkin_diario`).

Esta tarefa **define** o contrato da API. Não implementa os endpoints (MIND-60 e MIND-62).

## Regras gerais

- **Autenticação:** `Authorization: Bearer <accessToken>`. O usuário é identificado exclusivamente pelo token de sessão. O corpo da requisição nunca contém `usuarioId`.
- **Um check-in por usuário e data:** garantido no banco por constraint `UNIQUE (usuario_id, data)`.
- **Data e fuso horário (`data`):** formato `YYYY-MM-DD`. O fuso oficial de referência é o Horário de Brasília (`America/Sao_Paulo`), utilizado para determinar a data atual (`hoje`) e a expiração da janela de edição.
- **Janela de edição (`podeEditar`):** um check-in só pode ser criado ou editado durante o seu próprio dia local (`America/Sao_Paulo`). À meia-noite, a janela fecha e `podeEditar` passa a ser `false`. A API valida e bloqueia edições fora da janela.
- **Timestamps (`criadoEm`, `editadoEm`):** UTC em formato ISO 8601.
- **Ownership e privacidade:** cada usuário acessa e altera apenas seus próprios registros. Registros inexistentes e registros de outros usuários retornam `404` para evitar enumeração de dados.
- **Formato de erro:** padronizado em `{ "erro": { "codigo": "...", "mensagem": "...", "detalhes": [...] } }`, mantendo consistência com a API de `/auth`.
- **Prefixo:** rotas internas em `/checkins`. Publicadas pelo Nginx sob `/api/checkins`.
- **Cache:** todas as respostas contêm `Cache-Control: no-store` por tratarem de dados pessoais de saúde mental.
- **Logs:** é proibido registrar conteúdo de `humor`, `observacao` ou qualquer outro dado pessoal nos logs da aplicação.

## Campos

| JSON | Coluna | Tipo e regra | Obrigatório |
|---|---|---|---|
| `id` | `id` | `string` (UUID), identificador único do registro | apenas resposta |
| `data` | `data` | `YYYY-MM-DD`, não futura (`America/Sao_Paulo`) | sim no `POST` |
| `humor` | `humor` | `muito_baixo`, `baixo`, `neutro`, `bom` ou `muito_bom` | sim |
| `intensidade` | `intensidade` | inteiro de 1 a 5, ou `null` | não (opcional; migration na MIND-60) |
| `sonoHoras` | `sono_horas` | número de 0 a 24, até uma casa decimal, ou `null` | não |
| `estudou` | `estudou` | `true`, `false` ou `null` | não |
| `atividadeFisica` | `atividade_fisica` | `true`, `false` ou `null` | não |
| `relacoes` | `relacoes` | inteiro de 1 a 5, ou `null` | não (reservado para expansões futuras) |
| `observacao` | `eventos` | texto de até 280 caracteres, ou `null` | não (mapeado para a coluna `eventos`) |

- Campos opcionais não informados no `POST` assumem o valor `null`.
- Campos desconhecidos enviados no corpo são rejeitados (`400 ENTRADA_INVALIDA`).
- Campos exclusivos de resposta: `id`, `podeEditar` (`boolean`), `criadoEm`, `editadoEm` (`null` enquanto não for editado).

## Operações

| Operação | Caminho | Sucesso | Erros |
|---|---|---|---|
| Consultar por data | `GET /checkins?data=YYYY-MM-DD` | `200` com `{ "checkin": {...} }` ou `{ "checkin": null }` | `400`, `401` |
| Criar | `POST /checkins` | `201` com `{ "checkin": {...} }` | `400`, `401`, `409` |
| Editar (parcial) | `PATCH /checkins/:data` | `200` com `{ "checkin": {...} }` | `400`, `401`, `403`, `404` |

### Detalhes das operações

1. **`GET /checkins?data=YYYY-MM-DD`:** Se `data` for omitido na query, assume a data atual em `America/Sao_Paulo`. Retorna `200` com `{ "checkin": null }` caso o usuário ainda não possua registro no dia (diferenciando consulta sem dados de erros HTTP).
2. **`POST /checkins`:** Cria o registro do dia. Se o usuário já tiver registrado check-in na data, retorna `409 CHECKIN_JA_EXISTE`.
3. **`PATCH /checkins/:data`:** Realiza atualização parcial do check-in da data informada.
   - Campos omitidos no JSON mantêm os valores atuais gravados no banco.
   - Campos passados explicitamente como `null` limpam o valor no banco.
   - Tentativa de edição após o fim do dia (`America/Sao_Paulo`) retorna `403 CHECKIN_NAO_EDITAVEL`.

## Erros

| Status | Código | Quando ocorre |
|---|---|---|
| `400` | `ENTRADA_INVALIDA` | Dados fora da regra (formato de data, enum inválido, texto > 280 chars) ou campo desconhecido. `detalhes` contém a lista de erros por campo. |
| `401` | `SESSAO_INVALIDA` | Token ausente, inválido ou expirado. Mensagem: "Entre para continuar." |
| `403` | `CHECKIN_NAO_EDITAVEL` | Tentativa de alterar um check-in fora do prazo permitido (após o término do dia de referência). |
| `404` | `CHECKIN_NAO_ENCONTRADO` | Nenhum registro encontrado para a data informada ou pertence a outro usuário. |
| `409` | `CHECKIN_JA_EXISTE` | Já existe check-in cadastrado para a data. O payload de erro devolve o objeto do `checkin` existente. |

## Exemplos de Payload

### Criar (`POST /checkins`)

**Requisição:**
```json
{
  "data": "2026-11-12",
  "humor": "bom",
  "sonoHoras": 7.5,
  "estudou": true,
  "atividadeFisica": false,
  "observacao": "Dia produtivo"
}
```

**Resposta de Sucesso (`201 Created`):**
```json
{
  "checkin": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "data": "2026-11-12",
    "humor": "bom",
    "intensidade": null,
    "sonoHoras": 7.5,
    "estudou": true,
    "atividadeFisica": false,
    "relacoes": null,
    "observacao": "Dia produtivo",
    "podeEditar": true,
    "criadoEm": "2026-11-12T21:00:00Z",
    "editadoEm": null
  }
}
```

### Editar (`PATCH /checkins/2026-11-12`)

**Requisição (atualização parcial da observação):**
```json
{
  "observacao": "Dia produtivo e leve"
}
```

**Resposta de Sucesso (`200 OK`):**
```json
{
  "checkin": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "data": "2026-11-12",
    "humor": "bom",
    "intensidade": null,
    "sonoHoras": 7.5,
    "estudou": true,
    "atividadeFisica": false,
    "relacoes": null,
    "observacao": "Dia produtivo e leve",
    "podeEditar": true,
    "criadoEm": "2026-11-12T21:00:00Z",
    "editadoEm": "2026-11-12T22:15:00Z"
  }
}
```

### Erro de Validação (`400 Bad Request`)

```json
{
  "erro": {
    "codigo": "ENTRADA_INVALIDA",
    "mensagem": "Os dados enviados são inválidos.",
    "detalhes": [
      {
        "campo": "sonoHoras",
        "mensagem": "O valor de sonoHoras deve ser entre 0 e 24."
      }
    ]
  }
}
```

### Conflito de Registro Duplicado (`409 Conflict`)

```json
{
  "erro": {
    "codigo": "CHECKIN_JA_EXISTE",
    "mensagem": "Já existe check-in cadastrado nesta data."
  },
  "checkin": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "data": "2026-11-12",
    "humor": "bom",
    "podeEditar": true
  }
}
```

### Edição Bloqueada por Prazo Expirado (`403 Forbidden`)

```json
{
  "erro": {
    "codigo": "CHECKIN_NAO_EDITAVEL",
    "mensagem": "O check-in não pode mais ser editado pois a janela do dia encerrou."
  }
}
```

## Arquitetura & Implementação (MIND-60 / MIND-62)

1. **Alteração de Schema (MIND-60):** alterar a coluna `intensidade` da tabela `checkin_diario` de `NOT NULL` para `NULL` (opcional). Aplicar nos 3 arquivos de referência:
   - `prisma/init.sql` (banco de dados inicial e CI)
   - `prisma/patches/002-checkin-intensidade-opcional.sql` (patch de migração)
   - `prisma/schema.prisma` (schema do ORM + `npx prisma generate`)
2. **Middleware de Autenticação:** reaproveitar a função `usuarioDaSessao(token)` do `sessaoController` para validar o token JWT de sessão e extrair o `usuarioId`.

## Casos de Teste (Integration & Unit)

- Garantir isolamento de ownership: Usuário A não visualiza nem altera o check-in do Usuário B (`404`).
- Rejeitar requisições sem `Bearer token` válido (`401`).
- Rejeitar datas futuras (baseadas no fuso `America/Sao_Paulo`) ou formatos fora de `YYYY-MM-DD` (`400`).
- Validar limites de campos (`sonoHoras` entre 0 e 24, `observacao` até 280 caracteres, enum de `humor`) com retorno no formato de array em `detalhes` (`400`).
- Rejeitar criação duplicada para a mesma data (`409`, retornando o registro existente).
- Permitir atualizações parciais via `PATCH`, garantindo que campos não informados preservam o valor original no banco.
- Bloquear edições via `PATCH` quando executadas fora da janela do dia (`403 CHECKIN_NAO_EDITAVEL`).
- Retornar `{ "checkin": null }` com status `200` ao consultar uma data válida que não possui check-in.