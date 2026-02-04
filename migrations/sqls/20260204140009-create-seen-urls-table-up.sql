CREATE TABLE IF NOT EXISTS seen_urls (
  url TEXT PRIMARY KEY,
  seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seen_urls_seen_at ON seen_urls(seen_at);
