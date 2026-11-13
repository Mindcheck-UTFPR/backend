-- Torna a coluna intensidade opcional na tabela checkin_diario (MIND-60)
ALTER TABLE checkin_diario
  ALTER COLUMN intensidade DROP NOT NULL;

ALTER TABLE checkin_diario
  DROP CONSTRAINT IF EXISTS checkin_diario_intensidade_chk;

ALTER TABLE checkin_diario
  ADD CONSTRAINT checkin_diario_intensidade_chk
  CHECK (intensidade IS NULL OR intensidade BETWEEN 1 AND 5);