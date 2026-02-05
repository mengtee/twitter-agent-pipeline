/**
 * One-time migration script to move existing JSON data to PostgreSQL.
 *
 * Usage: npx tsx src/db/migrate-json.ts
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { PROJECT_ROOT } from "../config.js";
import { initSchema } from "./schema.js";
import { query } from "./query.js";
import { pool } from "./pool.js";

const DATA_DIR = resolve(PROJECT_ROOT, "data");
const SESSIONS_DIR = resolve(DATA_DIR, "sessions");
const LEADERBOARDS_DIR = resolve(DATA_DIR, "leaderboards");
const SEEN_FILE = resolve(DATA_DIR, "seen.json");

interface JsonSession {
  id: string;
  name: string;
  stage: string;
  searchNames: string[];
  scrapedTweets: Array<{
    id: string;
    text: string;
    author: string;
    handle: string;
    likes: number;
    retweets: number;
    views: number;
    replies: number;
    url: string;
    imageUrls: string[];
    postedAt: string;
    scrapedAt: string;
    searchName: string;
  }>;
  scrapeTokens?: { input: number; output: number };
  analysis?: {
    summary: string;
    trendingTopics: string[];
    topicsWithTweets: unknown;
    contentIdeas: unknown;
  };
  analyzeTokens?: { input: number; output: number };
  selectedTweetIds: string[];
  userPrompt: string;
  personaSlug?: string;
  samples: Array<{
    id: string;
    text: string;
    confidence: number;
    hashtags: string[];
    imageSuggestion?: string;
  }>;
  generateTokens?: { input: number; output: number };
  chosenSampleId?: string;
  finalText?: string;
  createdAt: string;
  updatedAt: string;
}

interface JsonLeaderboard {
  id: string;
  name: string;
  sources: Array<{ type: string; value: string; label?: string }>;
  tweets: Array<{
    id: string;
    text: string;
    author: string;
    handle: string;
    likes: number;
    retweets: number;
    views: number;
    replies: number;
    url: string;
    imageUrls: string[];
    postedAt: string;
    scrapedAt: string;
    searchName: string;
    sourceType: string;
    sourceValue: string;
    engagementScore: number;
    rank?: number;
  }>;
  maxTweetsPerSource: number;
  minViews?: number;
  minLikes?: number;
  timeWindow: string;
  lastScrapedAt?: string;
  nextScheduledAt?: string;
  isScrapingNow: boolean;
  lastError?: string;
  tokensUsed: { input: number; output: number };
  createdAt: string;
  updatedAt: string;
}

async function migrateSessions(): Promise<number> {
  if (!existsSync(SESSIONS_DIR)) {
    console.log("  No sessions directory found, skipping...");
    return 0;
  }

  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  console.log(`  Found ${files.length} session files`);

  let migrated = 0;
  for (const file of files) {
    const filepath = join(SESSIONS_DIR, file);
    try {
      const raw = readFileSync(filepath, "utf-8");
      const session: JsonSession = JSON.parse(raw);

      // Insert main session
      await query(
        `INSERT INTO sessions (
          id, name, stage, search_names, user_prompt, persona_slug,
          chosen_sample_id, final_text,
          scrape_tokens_input, scrape_tokens_output,
          analyze_tokens_input, analyze_tokens_output,
          generate_tokens_input, generate_tokens_output,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO NOTHING`,
        [
          session.id,
          session.name,
          session.stage,
          session.searchNames,
          session.userPrompt || "",
          session.personaSlug || null,
          session.chosenSampleId || null,
          session.finalText || null,
          session.scrapeTokens?.input || 0,
          session.scrapeTokens?.output || 0,
          session.analyzeTokens?.input || 0,
          session.analyzeTokens?.output || 0,
          session.generateTokens?.input || 0,
          session.generateTokens?.output || 0,
          new Date(session.createdAt),
          new Date(session.updatedAt),
        ]
      );

      // Insert tweets
      for (const tweet of session.scrapedTweets || []) {
        await query(
          `INSERT INTO session_tweets (
            id, session_id, text, author, handle, likes, retweets, views, replies,
            url, image_urls, posted_at, scraped_at, search_name
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id, session_id) DO NOTHING`,
          [
            tweet.id,
            session.id,
            tweet.text,
            tweet.author,
            tweet.handle,
            tweet.likes,
            tweet.retweets,
            tweet.views,
            tweet.replies,
            tweet.url,
            tweet.imageUrls || [],
            new Date(tweet.postedAt),
            new Date(tweet.scrapedAt),
            tweet.searchName,
          ]
        );
      }

      // Insert analysis
      if (session.analysis) {
        await query(
          `INSERT INTO session_analyses (
            session_id, summary, trending_topics, topics_with_tweets, content_ideas
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (session_id) DO NOTHING`,
          [
            session.id,
            session.analysis.summary,
            session.analysis.trendingTopics || [],
            JSON.stringify(session.analysis.topicsWithTweets || []),
            JSON.stringify(session.analysis.contentIdeas || []),
          ]
        );
      }

      // Insert samples
      for (const sample of session.samples || []) {
        await query(
          `INSERT INTO session_samples (
            id, session_id, text, confidence, hashtags, image_suggestion
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id, session_id) DO NOTHING`,
          [
            sample.id,
            session.id,
            sample.text,
            sample.confidence,
            sample.hashtags || [],
            sample.imageSuggestion || null,
          ]
        );
      }

      // Insert selected tweets
      for (const tweetId of session.selectedTweetIds || []) {
        await query(
          `INSERT INTO session_selected_tweets (session_id, tweet_id)
          VALUES ($1, $2)
          ON CONFLICT (session_id, tweet_id) DO NOTHING`,
          [session.id, tweetId]
        );
      }

      migrated++;
      console.log(`    Migrated session: ${session.id} (${session.name})`);
    } catch (err) {
      console.error(`    Failed to migrate ${file}:`, err);
    }
  }

  return migrated;
}

async function migrateLeaderboards(): Promise<number> {
  if (!existsSync(LEADERBOARDS_DIR)) {
    console.log("  No leaderboards directory found, skipping...");
    return 0;
  }

  const files = readdirSync(LEADERBOARDS_DIR).filter((f) => f.endsWith(".json"));
  console.log(`  Found ${files.length} leaderboard files`);

  let migrated = 0;
  for (const file of files) {
    const filepath = join(LEADERBOARDS_DIR, file);
    try {
      const raw = readFileSync(filepath, "utf-8");
      const lb: JsonLeaderboard = JSON.parse(raw);

      // Insert main leaderboard
      await query(
        `INSERT INTO leaderboards (
          id, name, sources, max_tweets_per_source, min_views, min_likes,
          time_window, last_scraped_at, next_scheduled_at, is_scraping_now,
          last_error, tokens_input, tokens_output, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO NOTHING`,
        [
          lb.id,
          lb.name,
          JSON.stringify(lb.sources || []),
          lb.maxTweetsPerSource || 10,
          lb.minViews || null,
          lb.minLikes || null,
          lb.timeWindow || "48h",
          lb.lastScrapedAt ? new Date(lb.lastScrapedAt) : null,
          lb.nextScheduledAt ? new Date(lb.nextScheduledAt) : null,
          lb.isScrapingNow || false,
          lb.lastError || null,
          lb.tokensUsed?.input || 0,
          lb.tokensUsed?.output || 0,
          new Date(lb.createdAt),
          new Date(lb.updatedAt),
        ]
      );

      // Insert tweets
      for (const tweet of lb.tweets || []) {
        await query(
          `INSERT INTO leaderboard_tweets (
            id, leaderboard_id, text, author, handle, likes, retweets, views, replies,
            url, image_urls, posted_at, scraped_at, search_name,
            source_type, source_value, engagement_score, rank
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (id, leaderboard_id) DO NOTHING`,
          [
            tweet.id,
            lb.id,
            tweet.text,
            tweet.author,
            tweet.handle,
            tweet.likes,
            tweet.retweets,
            tweet.views,
            tweet.replies,
            tweet.url,
            tweet.imageUrls || [],
            new Date(tweet.postedAt),
            new Date(tweet.scrapedAt),
            tweet.searchName,
            tweet.sourceType,
            tweet.sourceValue,
            tweet.engagementScore,
            tweet.rank || null,
          ]
        );
      }

      migrated++;
      console.log(`    Migrated leaderboard: ${lb.id} (${lb.name})`);
    } catch (err) {
      console.error(`    Failed to migrate ${file}:`, err);
    }
  }

  return migrated;
}

async function migrateSeenUrls(): Promise<number> {
  if (!existsSync(SEEN_FILE)) {
    console.log("  No seen.json file found, skipping...");
    return 0;
  }

  try {
    const raw = readFileSync(SEEN_FILE, "utf-8");
    const urls: string[] = JSON.parse(raw);
    console.log(`  Found ${urls.length} seen URLs`);

    let migrated = 0;
    for (const url of urls) {
      await query(
        `INSERT INTO seen_urls (url) VALUES ($1) ON CONFLICT (url) DO NOTHING`,
        [url]
      );
      migrated++;
    }

    console.log(`    Migrated ${migrated} seen URLs`);
    return migrated;
  } catch (err) {
    console.error("  Failed to migrate seen URLs:", err);
    return 0;
  }
}

async function main(): Promise<void> {
  console.log("=== PostgreSQL Migration Script ===\n");

  // Initialize schema first
  console.log("1. Initializing database schema...");
  await initSchema();
  console.log("   Schema initialized.\n");

  // Migrate sessions
  console.log("2. Migrating sessions...");
  const sessionCount = await migrateSessions();
  console.log(`   Migrated ${sessionCount} sessions.\n`);

  // Migrate leaderboards
  console.log("3. Migrating leaderboards...");
  const leaderboardCount = await migrateLeaderboards();
  console.log(`   Migrated ${leaderboardCount} leaderboards.\n`);

  // Migrate seen URLs
  console.log("4. Migrating seen URLs...");
  const seenCount = await migrateSeenUrls();
  console.log(`   Migrated ${seenCount} seen URLs.\n`);

  console.log("=== Migration Complete ===");
  console.log(`Sessions: ${sessionCount}`);
  console.log(`Leaderboards: ${leaderboardCount}`);
  console.log(`Seen URLs: ${seenCount}`);

  // Close pool
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
