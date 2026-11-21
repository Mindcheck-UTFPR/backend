# Contrato do ciclo de publicação do questionário (MIND-22)

Status: **proposta** para alinhamento com o frontend. Ainda não está acordado.

Relacionados: MIND-21 (história-pai), MIND-20 (modelo já no banco), MIND-32 (painel), MIND-58 (bloqueio da versão publicada) e MIND-59 (validação da publicação). O modelo está em `prisma/init.sql` e `prisma/schema.prisma`.

Esta tarefa **define** o contrato do ciclo. Não cria rota, não altera o banco e não grava o PHQ-9.

## Regras gerais

- **Autenticação:** `Authorization: Bearer <accessToken>`. O administrador é o `papel` da sessão. O corpo não escolhe `usuarioId` nem `papel`.
- **Acesso:** só `papel = admin` publica, edita rascunho ou cria nova versão. Quem não é administrador recebe `403 ACESSO_NEGADO`, no sentido de `docs/CONTRATO-ACESSO-ADMIN.md`.
- **Uma versão ativa por questionário:** o índice `questionario_versao_uma_ativa_idx` já garante no máximo uma linha com `ativa = true` para cada `questionario_id`.
- **Pontuação:** a soma usa só o `valor_numerico` da alternativa escolhida nas perguntas fechadas daquela versão. Pergunta `aberta` não entra na soma. O check-in diário não entra na soma nem no `texto_orientativo`.
- **Texto orientativo:** é o `texto_orientativo` da faixa da versão. Não é conduta clínica e não afirma diagnóstico.
- **Formato de erro:** `{ "erro": { "codigo", "mensagem", "detalhes" } }`, no mesmo formato da API de `/auth`. `detalhes` só aparece quando há lista de falhas.
- **Registro e log:** a publicação grava quem publicou, quando e qual versão. Log e registro não levam texto de pergunta, alternativa, resposta, humor ou faixa.

## Ciclo

Há três situações. Rascunho e versão já substituída ficam com `ativa = false`. Só a publicada corrente fica com `ativa = true`.

1. **Rascunho.** Pode ser salvo incompleto e editado. Nasce com `ativa = false`. O banco já exige `periodo_reaplicacao_dias > 0` e `versao` única no questionário (`questionario_versao_questionario_versao_unique`).
2. **Publicar.** Exige a estrutura completa abaixo. A versão publicada passa a ser a única `ativa`. A publicada anterior, se existir, deixa de ser a ativa e não é apagada.
3. **Nova versão.** Versão publicada não se edita. A mudança cria outra linha em `questionario_versao`, em rascunho, com outro valor de `versao`, copiando perguntas, alternativas e faixas. As linhas da versão publicada permanecem. A nova começa com `ativa = false` até ser publicada.

MIND-58 recusa a edição da publicada (`403 VERSAO_IMUTAVEL`). MIND-59 recusa publicar estrutura incompleta (`400 PUBLICACAO_INVALIDA`). Este contrato só fixa a regra e o erro.

### Lacuna do banco

`ativa` não separa rascunho de versão já substituída: as duas ficam falsas. Falta um campo de situação. Este contrato não cria esse campo. A issue que alterar o banco é quem o adiciona. Até lá, a regra de negócio continua a das três situações acima.

## Estrutura completa

A publicação só conclui quando tudo isto vale para a versão. MIND-59 aplica a checagem.

- Há pelo menos uma pergunta. A ordem é única na versão (`pergunta_versao_ordem_unique`).
- Pergunta `escala`, `polar` ou `escolha_unica` tem ao menos uma alternativa, com `valor_numerico`. A ordem da alternativa é única na pergunta.
- Pergunta `aberta` não tem alternativa.
- Há pelo menos uma faixa. Cada faixa tem `maximo >= minimo` (`faixa_interpretacao_intervalo_chk`) e `codigo` único na versão.
- As faixas não se sobrepõem. Todo inteiro entre a menor soma possível e a maior soma possível cai em exatamente uma faixa. A menor soma é a soma do menor `valor_numerico` de cada pergunta fechada. A maior soma é a soma do maior. Sem pergunta fechada, a soma possível é 0 e alguma faixa contém 0.
- `periodo_reaplicacao_dias` é maior que zero.

Salvar rascunho não exige essa lista. Publicar exige.

## Avaliações antigas

`avaliacao.versao_id` referencia `questionario_versao` com `ON DELETE RESTRICT`. `resultado.faixa_id` referencia a faixa com `ON DELETE RESTRICT`. Publicar outra versão não regrava `avaliacao` nem `resultado`. A resposta antiga continua na versão e na faixa em que foi calculada.

Apagar a versão publicada, ou a faixa usada por um resultado, não faz parte deste ciclo.

## Registro da operação

Cada publicação bem-sucedida grava:

- o administrador da sessão;
- o instante em UTC, ISO 8601;
- o identificador da versão publicada.

O registro não inclui enunciado, alternativa, resposta, humor nem texto da faixa. Este contrato não cria a tabela. A issue que implementar a publicação é quem persiste esses três dados.

## Erros

| Status | Código | Quando ocorre |
|---|---|---|
| `400` | `PUBLICACAO_INVALIDA` | A versão não cumpre a estrutura completa. `detalhes` lista cada falha. |
| `401` | `SESSAO_INVALIDA` | Token ausente, inválido ou expirado. Mensagem: "Entre para continuar." |
| `403` | `ACESSO_NEGADO` | A sessão não tem papel `admin`. Mensagem: "Esta área é restrita a administradores." |
| `403` | `VERSAO_IMUTAVEL` | Tentativa de alterar pergunta, alternativa ou faixa de uma versão já publicada. A saída é criar nova versão. |

`detalhes` usa `{ "campo", "mensagem" }`. O campo aponta a parte da estrutura (`perguntas`, `faixas` ou o identificador da faixa), não o texto clínico.

### Publicação recusada

```json
{
  "erro": {
    "codigo": "PUBLICACAO_INVALIDA",
    "mensagem": "A versão não está completa para publicação.",
    "detalhes": [
      {
        "campo": "faixas",
        "mensagem": "Todo valor possível da soma precisa cair em exatamente uma faixa."
      }
    ]
  }
}
```

### Versão publicada

```json
{
  "erro": {
    "codigo": "VERSAO_IMUTAVEL",
    "mensagem": "Versão publicada não pode ser alterada. Crie uma nova versão."
  }
}
```

## Exemplo de versão completa

O PHQ-9 ilustra a estrutura, sem copiar os enunciados para este repositório.

- Nove perguntas fechadas.
- Cada uma com quatro alternativas de peso 0, 1, 2 e 3.
- A soma vai de 0 a 27.
- Cinco faixas, sem buraco e sem sobreposição: 0–4, 5–9, 10–14, 15–19 e 20–27.

A pergunta de dificuldade do formulário oficial (nenhuma, alguma, muita, extrema) não entra na soma nem nesta versão. A coluna de conduta clínica do manual não é `texto_orientativo`. Este contrato não define fluxo para o caso de a pessoa indicar pensamento de morte ou de se ferir.
