CREATE TABLE IF NOT EXISTS session_selected_tweets (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tweet_id TEXT NOT NULL,
  PRIMARY KEY (session_id, tweet_id)
);
