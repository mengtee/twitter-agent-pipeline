CREATE TABLE IF NOT EXISTS session_tweets (
  id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  author TEXT NOT NULL,
  handle TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  url TEXT NOT NULL,
  image_urls TEXT[] DEFAULT '{}',
  posted_at TIMESTAMPTZ NOT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  search_name TEXT NOT NULL,
  PRIMARY KEY (id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_tweets_session_id ON session_tweets(session_id);
