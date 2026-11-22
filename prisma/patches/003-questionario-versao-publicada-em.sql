-- Marca a versão já publicada, independente de ainda ser a ativa (MIND-58)
ALTER TABLE questionario_versao
  ADD COLUMN IF NOT EXISTS publicada_em TIMESTAMPTZ;
