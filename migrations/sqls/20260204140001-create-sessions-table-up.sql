CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'created',
  search_names TEXT[] NOT NULL DEFAULT '{}',
  user_prompt TEXT NOT NULL DEFAULT '',
  persona_slug TEXT,
  chosen_sample_id TEXT,
  final_text TEXT,
  scrape_tokens_input INTEGER DEFAULT 0,
  scrape_tokens_output INTEGER DEFAULT 0,
  analyze_tokens_input INTEGER DEFAULT 0,
  analyze_tokens_output INTEGER DEFAULT 0,
  generate_tokens_input INTEGER DEFAULT 0,
  generate_tokens_output INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
