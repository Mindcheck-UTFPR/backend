-- Banco que já executou prisma/init.sql antes da coluna papel.
-- Volume novo não precisa deste arquivo: o init já cria a coluna.

DO $$
BEGIN
  CREATE TYPE papel_usuario AS ENUM ('usuario', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS papel papel_usuario NOT NULL DEFAULT 'usuario';
