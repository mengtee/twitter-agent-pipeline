CREATE TABLE IF NOT EXISTS session_analyses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  trending_topics TEXT[] DEFAULT '{}',
  topics_with_tweets JSONB DEFAULT '[]',
  content_ideas JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
