import { query } from "./query.js";
import { isDatabaseConfigured } from "./pool.js";

/**
 * Initialize the database schema.
 * Creates all tables if they don't exist.
 * Safe to run multiple times (idempotent).
 */
export async function initSchema(): Promise<void> {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL not configured. Set it in your .env file.");
  }

  console.log("[DB] Initializing schema...");

  // Sessions table
  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'created' CHECK (stage IN ('created', 'scraped', 'analyzed', 'selected', 'generated', 'completed')),
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
    )
  `);
  console.log("[DB] Created table: sessions");

  // Session tweets table
  await query(`
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
    )
  `);
  console.log("[DB] Created table: session_tweets");

  // Session analysis table
  await query(`
    CREATE TABLE IF NOT EXISTS session_analyses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      trending_topics TEXT[] DEFAULT '{}',
      topics_with_tweets JSONB DEFAULT '[]',
      content_ideas JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("[DB] Created table: session_analyses");

  // Session selected tweets junction table
  await query(`
    CREATE TABLE IF NOT EXISTS session_selected_tweets (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tweet_id TEXT NOT NULL,
      PRIMARY KEY (session_id, tweet_id)
    )
  `);
  console.log("[DB] Created table: session_selected_tweets");

  // Session samples table
  await query(`
    CREATE TABLE IF NOT EXISTS session_samples (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      confidence INTEGER CHECK (confidence >= 1 AND confidence <= 10),
      hashtags TEXT[] DEFAULT '{}',
      image_suggestion TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (id, session_id)
    )
  `);
  console.log("[DB] Created table: session_samples");

  // Leaderboards table
  await query(`
    CREATE TABLE IF NOT EXISTS leaderboards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sources JSONB NOT NULL DEFAULT '[]',
      max_tweets_per_source INTEGER DEFAULT 10,
      min_views INTEGER,
      min_likes INTEGER,
      time_window TEXT DEFAULT '48h',
      last_scraped_at TIMESTAMPTZ,
      next_scheduled_at TIMESTAMPTZ,
      is_scraping_now BOOLEAN DEFAULT FALSE,
      last_error TEXT,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("[DB] Created table: leaderboards");

  // Leaderboard tweets table
  await query(`
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
    )
  `);
  console.log("[DB] Created table: leaderboard_tweets");

  // Leaderboard global config table
  await query(`
    CREATE TABLE IF NOT EXISTS leaderboard_global_config (
      id TEXT PRIMARY KEY DEFAULT 'global',
      scrape_interval_hours INTEGER DEFAULT 24,
      cron_enabled BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("[DB] Created table: leaderboard_global_config");

  // Insert default global config if not exists
  await query(`
    INSERT INTO leaderboard_global_config (id)
    VALUES ('global')
    ON CONFLICT (id) DO NOTHING
  `);

  // Seen URLs table for deduplication
  await query(`
    CREATE TABLE IF NOT EXISTS seen_urls (
      url TEXT PRIMARY KEY,
      seen_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("[DB] Created table: seen_urls");

  // Personas table (migrated from config/personas/*.json)
  await query(`
    CREATE TABLE IF NOT EXISTS personas (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config JSONB NOT NULL,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("[DB] Created table: personas");

  // Searches table (migrated from config/searches.json)
  await query(`
    CREATE TABLE IF NOT EXISTS searches (
      name TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      time_window TEXT DEFAULT '24h',
      min_views INTEGER,
      min_likes INTEGER,
      max_results INTEGER DEFAULT 20,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("[DB] Created table: searches");

  // Create indexes
  console.log("[DB] Creating indexes...");

  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_session_tweets_session_id ON session_tweets(session_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_session_samples_session_id ON session_samples(session_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_leaderboards_updated_at ON leaderboards(updated_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_leaderboard_tweets_leaderboard_id ON leaderboard_tweets(leaderboard_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_leaderboard_tweets_rank ON leaderboard_tweets(leaderboard_id, rank)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_seen_urls_seen_at ON seen_urls(seen_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_personas_is_default ON personas(is_default) WHERE is_default = TRUE`);

  console.log("[DB] Schema initialization complete!");
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initSchema()
    .then(() => {
      console.log("[DB] Done!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[DB] Error:", err);
      process.exit(1);
    });
}
