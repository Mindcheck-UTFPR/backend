# Contrato de acesso administrativo (MIND-32)

Status: **proposta** para alinhamento com o frontend. Ainda não está acordado.

Relacionados: MIND-21 (história-pai), MIND-22 (ciclo de publicação, `docs/CONTRATO-PUBLICACAO.md`), MIND-77 (autorização das rotas) e MIND-82 (menu e home no frontend, com a Dariely).

Esta tarefa **define** papéis, rotas e erros do acesso administrativo. Não implementa a autorização (MIND-77), não desenha a tela (MIND-82) e não altera o banco.

## Papéis

O enum `papel_usuario` já tem `usuario` e `admin`.

- O cadastro público grava sempre `papel = usuario`. Um `papel: admin` no corpo do cadastro é ignorado. Isso já vale em `cadastrar`.
- O papel vem da sessão (`Authorization: Bearer <accessToken>`). O corpo e a query não escolhem papel.
- `admin` acessa o prefixo abaixo. `usuario` não acessa, mesmo sendo dono dos próprios check-ins e avaliações.
- Esta issue não promove conta a `admin` e não rebaixa administrador.

## Rotas

Prefixo interno `/admin`. O Nginx publica `/api/admin`. Todas exigem sessão de `admin`. A MIND-77 aplica esse bloqueio. Resposta com `Cache-Control: no-store`.

| Atalho da home | Caminho | Sucesso | Quem usa |
|---|---|---|---|
| Questionários | `GET /admin/questionarios` | `200` `{ "questionarios": [...] }` | lista do painel |
| Usuários autorizados | `GET /admin/usuarios` | `200` `{ "usuarios": [...] }` | contas do sistema |
| Auditoria básica | `GET /admin/auditoria` | `200` `{ "registros": [...] }` | publicações gravadas |

Lista vazia responde `200` com o array vazio. Não é erro.

Fora deste contrato: profissionais, serviços e conteúdos de orientação. Não há rota para isso.

### Questionários

A lista é a do administrador. Inclui rascunho, versão publicada corrente e versão já substituída, como no ciclo de `docs/CONTRATO-PUBLICACAO.md`. O catálogo do estudante, só com a versão ativa, não é esta rota.

Cada item:

| JSON | Origem | Regra |
|---|---|---|
| `id` | `questionario.id` | número |
| `nome` | `questionario.nome` | texto |
| `ativo` | `questionario.ativo` | se o catálogo mostra o instrumento |
| `versoes` | `questionario_versao` | `id`, `versao`, `ativa` e a situação do ciclo |

A situação (rascunho, publicada corrente, substituída) é a lacuna já registrada na MIND-22: `ativa` sozinha não separa rascunho de versão substituída. A lista não inventa essa distinção antes do campo existir.

### Usuários autorizados

Contas já gravadas em `usuario`. Cada item é o recorte público que o login já devolve: `id`, `nome`, `email`, `papel`. Sem `senha_hash`, sem token e sem aceite de termos.

Não cria conta, não altera papel e não apaga usuário.

### Auditoria básica

Lê o registro de publicação definido na MIND-22. Cada item tem só:

- `administradorId`
- `ocorridoEm` (UTC, ISO 8601)
- `versaoId`
- `operacao` (`publicar`)

Sem enunciado, alternativa, resposta, humor ou texto de faixa. Enquanto a publicação não persistir esse registro, a lista volta vazia. A auditoria ampla de titular (MIND-33 e MIND-34) não entra aqui.

## Erros

O formato é `{ "erro": { "codigo", "mensagem" } }`.

| Status | Código | Quando ocorre |
|---|---|---|
| `401` | `SESSAO_INVALIDA` | Token ausente: "Entre para continuar." Token inválido ou expirado: "Sua sessão expirou. Entre novamente." |
| `403` | `ACESSO_NEGADO` | A sessão existe e o papel não é `admin`. Mensagem: "Esta área é restrita a administradores." |

`ACESSO_NEGADO` é o mesmo código do ciclo de publicação. Lá ele cobre publicar, editar rascunho e criar nova versão. Aqui ele cobre qualquer caminho de `/admin`.

```json
{
  "erro": {
    "codigo": "ACESSO_NEGADO",
    "mensagem": "Esta área é restrita a administradores."
  }
}
```

Log dessas rotas não leva nome, e-mail, humor, resposta, enunciado nem token.

## O que a MIND-77 e a MIND-82 herdam

- MIND-77: recusar `/admin` sem sessão (`401`) e com papel `usuario` (`403`); deixar passar só `admin`. Testar os três casos com conta sintética.
- MIND-82: a home do administrador tem três atalhos, para os três caminhos desta tabela. Estados de carregamento, vazio, erro, offline e sessão expirada ficam na tela. Sem bloco de profissionais, serviços ou orientação.
