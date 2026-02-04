CREATE TABLE IF NOT EXISTS leaderboard_tweets (
  id TEXT NOT NULL,
  leaderboard_id TEXT NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
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
  source_type TEXT NOT NULL,
  source_value TEXT NOT NULL,
  engagement_score INTEGER NOT NULL,
  rank INTEGER,
  PRIMARY KEY (id, leaderboard_id)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_tweets_leaderboard_id ON leaderboard_tweets(leaderboard_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_tweets_rank ON leaderboard_tweets(leaderboard_id, rank);
