ALTER TABLE avaliacao ADD COLUMN IF NOT EXISTS revisao INTEGER NOT NULL DEFAULT 1;
ALTER TABLE avaliacao ADD COLUMN IF NOT EXISTS concluida_em TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS avaliacao_rascunho_usuario_versao_idx
  ON avaliacao (usuario_id, versao_id)
  WHERE concluida_em IS NULL;
