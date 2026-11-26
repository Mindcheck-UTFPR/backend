# Contrato de consulta e edição do próprio perfil

Status: **proposta desta entrega**, alinhada à tela já existente e às regras de campo do cadastro (MIND-17).

A consulta autenticada já existe em `GET /auth/me` (MIND-17 / MIND-18). Esta entrega não recria cadastro, login, renovação nem logout. A tela de perfil (frontend, MIND-104 / MIND-129) já mostra nome e e-mail da sessão. O adaptador `servicoPerfil` ainda não chama a API; a ligação fica na MIND-136.

Fora desta entrega: foto, recuperação de senha (MIND-100), exportação e exclusão da conta (MIND-33) e revogação das outras sessões ao trocar a senha (endurecimento na MIND-34).

## Regras gerais

- **Autenticação:** `Authorization: Bearer <accessToken>`. A conta é a da sessão válida no banco. O corpo não traz `usuarioId` nem `id`.
- **Consulta:** `GET /auth/me`. Não há um segundo endpoint de leitura.
- **Edição de dados:** `PATCH /auth/me`, somente `nome` e `email`.
- **Troca de senha:** `POST /auth/senha`, com a senha atual. A confirmação da nova senha fica só no formulário e não é enviada.
- **Papel:** o cadastro continua impedindo escalada. Na edição, `papel` é campo desconhecido e a requisição inteira é recusada.
- **Formato de erro:** `{ "erro": { "codigo", "mensagem", "detalhes"? } }`, igual ao restante de `/auth`.
- **Prefixo:** rotas internas em `/auth`. O Nginx publica `/api/auth`.
- **Cache:** `Cache-Control: no-store`.
- **Logs:** sem senha, hash, token ou corpo desses pedidos.

Limites iguais aos do cadastro e aos da tela:

| Campo | Tela | API |
| --- | --- | --- |
| Nome | 2 a 120 caracteres, sem espaços nas pontas | as mesmas mensagens do cadastro |
| E-mail | formato válido, até 255 | minúsculas, mesmas mensagens do cadastro |
| Senha atual | obrigatória | 1 a 128 caracteres; conferida com o hash |
| Nova senha | 8 a 128 | mesmas mensagens do cadastro |
| Confirmação | as duas senhas iguais | não faz parte do contrato |
| Foto | botão desabilitado | campo `foto` recusado |

## Operações

| Operação | Caminho | Sucesso | Erros |
| --- | --- | --- | --- |
| Consultar a própria conta | `GET /auth/me` | `200` `{ "usuario": { id, nome, email, papel } }` | `401` |
| Salvar nome e e-mail | `PATCH /auth/me` | `200` com o mesmo `usuario` público já gravado | `400`, `401`, `409` |
| Trocar a senha | `POST /auth/senha` | `204` sem corpo | `400`, `401` |

`papel` na resposta é o papel atual da conta, só leitura. A tela usa `nome` e `email`. Depois do `PATCH`, o cliente pode chamar de novo `GET /auth/me`, como a página de edição já prevê.

## Erros

| Status | Código | Quando ocorre |
| --- | --- | --- |
| `400` | `ENTRADA_INVALIDA` | Campo ausente, fora do limite ou e-mail inválido. Chave não permitida (`id`, `papel`, `senha`, `foto`, `confirmacao`) vem em `detalhes` com a mensagem `Este campo não pode ser alterado.` |
| `401` | `SESSAO_INVALIDA` | Token ausente (`Entre para continuar.`) ou sessão inválida/expirada (`Sua sessão expirou. Entre novamente.`). Nada é gravado. |
| `401` | `SENHA_ATUAL_INVALIDA` | Senha atual não confere. Mensagem: `A senha atual está incorreta.` |
| `409` | `EMAIL_EM_USO` | E-mail já usado por outra conta. Mensagem: `Este e-mail já está cadastrado.` O nome também não muda. |

## Exemplos

### Salvar dados (`PATCH /auth/me`)

```json
{ "nome": "Ana Souza", "email": "ana@example.test" }
```

```json
{ "usuario": { "id": 7, "nome": "Ana Souza", "email": "ana@example.test", "papel": "usuario" } }
```

E-mail em uso:

```json
{ "erro": { "codigo": "EMAIL_EM_USO", "mensagem": "Este e-mail já está cadastrado." } }
```

Nome curto:

```json
{
  "erro": {
    "codigo": "ENTRADA_INVALIDA",
    "mensagem": "Os dados enviados são inválidos.",
    "detalhes": [{ "campo": "nome", "mensagem": "O nome deve ter no mínimo 2 caracteres." }]
  }
}
```

### Trocar a senha (`POST /auth/senha`)

```json
{ "senhaAtual": "senha-atual-ok", "novaSenha": "senha-nova-ok" }
```

Sucesso: `204` e corpo vazio. A sessão usada no pedido continua válida. Outras sessões da mesma conta não são encerradas aqui.

Senha atual incorreta:

```json
{ "erro": { "codigo": "SENHA_ATUAL_INVALIDA", "mensagem": "A senha atual está incorreta." } }
```

## O que o cliente precisa fazer na MIND-136

- `salvar` envia `PATCH /api/auth/me` e devolve `usuario.nome` e `usuario.email` da resposta.
- `alterarSenha` envia `POST /api/auth/senha` e trata `204` como sucesso.
- O `http` já transforma `erro.mensagem` em `Error.message` e `detalhes` em campos. A frase genérica de indisponibilidade do adaptador atual deixa de ser usada quando a chamada existir.
- Conflito de e-mail preserva o que a pessoa digitou; a tela já faz isso quando a promessa rejeita.
