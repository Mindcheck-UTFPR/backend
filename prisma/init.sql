-- Mindcheck MVP — PostgreSQL 16
-- Rode no banco `mindcheck` e depois: pnpm prisma:pull && pnpm prisma:generate

CREATE TYPE humor_nivel AS ENUM (
  'muito_baixo',
  'baixo',
  'neutro',
  'bom',
  'muito_bom'
);

CREATE TYPE pergunta_tipo AS ENUM (
  'escala',
  'polar',
  'escolha_unica',
  'aberta'
);

CREATE TABLE usuario (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome               VARCHAR(120) NOT NULL,
  email              VARCHAR(255) NOT NULL,
  senha_hash         VARCHAR(255) NOT NULL,
  termos_aceitos_em  TIMESTAMPTZ NOT NULL,
  termos_versao      VARCHAR(20) NOT NULL,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usuario_email_unique UNIQUE (email)
);

CREATE TABLE sessao (
  id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id           INTEGER NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  refresh_token_hash   VARCHAR(64) NOT NULL,
  expira_em            TIMESTAMPTZ NOT NULL,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sessao_refresh_token_hash_unique UNIQUE (refresh_token_hash)
);

CREATE INDEX sessao_usuario_id_idx ON sessao (usuario_id);

CREATE TABLE checkin_diario (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id        INTEGER NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  data              DATE NOT NULL,
  humor             humor_nivel NOT NULL,
  intensidade       SMALLINT NOT NULL,
  sono_horas        NUMERIC(3, 1),
  estudou           BOOLEAN,
  atividade_fisica  BOOLEAN,
  relacoes          SMALLINT,
  eventos           VARCHAR(280),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  editado_em        TIMESTAMPTZ,
  CONSTRAINT checkin_diario_usuario_data_unique UNIQUE (usuario_id, data),
  CONSTRAINT checkin_diario_intensidade_chk CHECK (intensidade BETWEEN 1 AND 5),
  CONSTRAINT checkin_diario_sono_horas_chk CHECK (sono_horas IS NULL OR (sono_horas >= 0 AND sono_horas <= 24)),
  CONSTRAINT checkin_diario_relacoes_chk CHECK (relacoes IS NULL OR relacoes BETWEEN 1 AND 5)
);

CREATE TABLE questionario (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome      VARCHAR(80) NOT NULL,
  descricao TEXT,
  ordem     SMALLINT NOT NULL,
  ativo     BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT questionario_nome_unique UNIQUE (nome)
);

CREATE TABLE questionario_versao (
  id                         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  questionario_id            INTEGER NOT NULL REFERENCES questionario (id) ON DELETE CASCADE,
  versao                     VARCHAR(20) NOT NULL,
  ativa                      BOOLEAN NOT NULL DEFAULT FALSE,
  periodo_reaplicacao_dias   SMALLINT NOT NULL,
  criado_em                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT questionario_versao_questionario_versao_unique UNIQUE (questionario_id, versao),
  CONSTRAINT questionario_versao_periodo_chk CHECK (periodo_reaplicacao_dias > 0)
);

CREATE UNIQUE INDEX questionario_versao_uma_ativa_idx
  ON questionario_versao (questionario_id)
  WHERE ativa IS TRUE;

CREATE TABLE pergunta (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  versao_id    INTEGER NOT NULL REFERENCES questionario_versao (id) ON DELETE CASCADE,
  texto        TEXT NOT NULL,
  tipo         pergunta_tipo NOT NULL,
  ordem        SMALLINT NOT NULL,
  obrigatoria  BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT pergunta_versao_ordem_unique UNIQUE (versao_id, ordem)
);

CREATE TABLE opcao_pergunta (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pergunta_id     INTEGER NOT NULL REFERENCES pergunta (id) ON DELETE CASCADE,
  texto           VARCHAR(200) NOT NULL,
  valor_numerico  SMALLINT NOT NULL,
  ordem           SMALLINT NOT NULL,
  CONSTRAINT opcao_pergunta_pergunta_ordem_unique UNIQUE (pergunta_id, ordem)
);

CREATE TABLE faixa_interpretacao (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  versao_id           INTEGER NOT NULL REFERENCES questionario_versao (id) ON DELETE CASCADE,
  minimo              SMALLINT NOT NULL,
  maximo              SMALLINT NOT NULL,
  codigo              VARCHAR(40) NOT NULL,
  rotulo              VARCHAR(80) NOT NULL,
  texto_orientativo   TEXT NOT NULL,
  CONSTRAINT faixa_interpretacao_intervalo_chk CHECK (maximo >= minimo),
  CONSTRAINT faixa_interpretacao_versao_codigo_unique UNIQUE (versao_id, codigo)
);

CREATE TABLE avaliacao (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  versao_id   INTEGER NOT NULL REFERENCES questionario_versao (id) ON DELETE RESTRICT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX avaliacao_usuario_id_idx ON avaliacao (usuario_id);
CREATE INDEX avaliacao_versao_id_idx ON avaliacao (versao_id);

CREATE TABLE resposta (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  avaliacao_id  INTEGER NOT NULL REFERENCES avaliacao (id) ON DELETE CASCADE,
  pergunta_id   INTEGER NOT NULL REFERENCES pergunta (id) ON DELETE RESTRICT,
  opcao_id      INTEGER REFERENCES opcao_pergunta (id) ON DELETE RESTRICT,
  texto         TEXT,
  CONSTRAINT resposta_avaliacao_pergunta_unique UNIQUE (avaliacao_id, pergunta_id),
  CONSTRAINT resposta_conteudo_chk CHECK (
    (opcao_id IS NOT NULL AND texto IS NULL)
    OR (opcao_id IS NULL AND texto IS NOT NULL)
  )
);

CREATE TABLE resultado (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  avaliacao_id   INTEGER NOT NULL REFERENCES avaliacao (id) ON DELETE CASCADE,
  pontuacao      SMALLINT NOT NULL,
  faixa_id       INTEGER NOT NULL REFERENCES faixa_interpretacao (id) ON DELETE RESTRICT,
  calculado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT resultado_avaliacao_unique UNIQUE (avaliacao_id)
);

COMMENT ON TABLE usuario IS 'Conta do universitário e aceite de termos.';
COMMENT ON TABLE sessao IS 'Refresh token. Logout apaga a linha.';
COMMENT ON TABLE checkin_diario IS 'Hábito diário. Um registro por usuário por dia. Não usa pergunta/resposta.';
COMMENT ON TABLE questionario IS 'Catálogo (ex.: PHQ-9). Não é o envio do aluno.';
COMMENT ON TABLE questionario_versao IS 'Versão do questionário, não do aplicativo.';
COMMENT ON TABLE pergunta IS 'Pergunta aberta não possui opcao_pergunta.';
COMMENT ON TABLE opcao_pergunta IS 'Peso da pontuação automática em valor_numerico.';
COMMENT ON TABLE faixa_interpretacao IS 'Critério da versão. Não é criado no envio do aluno.';
COMMENT ON TABLE avaliacao IS 'Um envio do aluno. Não é diagnóstico.';
COMMENT ON TABLE resposta IS 'opcao_id para pergunta fechada; texto para aberta.';
COMMENT ON TABLE resultado IS 'Score automático (soma + faixa). Não é diagnóstico.';
