CREATE TABLE IF NOT EXISTS personas (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personas_is_default ON personas(is_default) WHERE is_default = TRUE;
