CREATE TABLE IF NOT EXISTS leaderboards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]',
  max_tweets_per_source INTEGER DEFAULT 10,
  min_views INTEGER,
  min_likes INTEGER,
  time_window TEXT DEFAULT '24h',
  last_scraped_at TIMESTAMPTZ,
  next_scheduled_at TIMESTAMPTZ,
  is_scraping_now BOOLEAN DEFAULT FALSE,
  last_error TEXT,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboards_updated_at ON leaderboards(updated_at DESC);
