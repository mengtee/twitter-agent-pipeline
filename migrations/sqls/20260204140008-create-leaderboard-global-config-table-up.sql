CREATE TABLE IF NOT EXISTS leaderboard_global_config (
  id TEXT PRIMARY KEY DEFAULT 'global',
  scrape_interval_hours INTEGER DEFAULT 24,
  cron_enabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default global config
INSERT INTO leaderboard_global_config (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;
