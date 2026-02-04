CREATE TABLE IF NOT EXISTS session_samples (
  id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  confidence INTEGER CHECK (confidence >= 1 AND confidence <= 10),
  hashtags TEXT[] DEFAULT '{}',
  image_suggestion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_samples_session_id ON session_samples(session_id);
