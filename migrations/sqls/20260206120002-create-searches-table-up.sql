CREATE TABLE IF NOT EXISTS searches (
  name TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  time_window TEXT DEFAULT '24h',
  min_views INTEGER,
  min_likes INTEGER,
  max_results INTEGER DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
