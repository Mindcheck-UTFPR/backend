-- Registro de quem publicou uma versão do questionário (MIND-22)
CREATE TABLE IF NOT EXISTS publicacao_questionario (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id   INTEGER NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  versao_id    INTEGER NOT NULL REFERENCES questionario_versao (id) ON DELETE RESTRICT,
  operacao     VARCHAR(20) NOT NULL,
  ocorrido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
