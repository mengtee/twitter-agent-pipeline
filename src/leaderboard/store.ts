import { randomBytes } from "node:crypto";
import { query, queryOne, withTransaction } from "../db/query.js";
import type {
  Leaderboard,
  LeaderboardGlobalConfig,
  LeaderboardSource,
  TrendingTweet,
  TimeWindow,
} from "../types.js";

// Database row types
interface DbLeaderboard {
  id: string;
  name: string;
  sources: LeaderboardSource[];
  max_tweets_per_source: number;
  min_views: number | null;
  min_likes: number | null;
  time_window: string;
  last_scraped_at: Date | null;
  next_scheduled_at: Date | null;
  is_scraping_now: boolean;
  last_error: string | null;
  tokens_input: number;
  tokens_output: number;
  created_at: Date;
  updated_at: Date;
}

interface DbLeaderboardTweet {
  id: string;
  leaderboard_id: string;
  text: string;
  author: string;
  handle: string;
  likes: number;
  retweets: number;
  views: number;
  replies: number;
  url: string;
  image_urls: string[];
  posted_at: Date;
  scraped_at: Date;
  search_name: string;
  source_type: string;
  source_value: string;
  engagement_score: number;
  rank: number | null;
}

interface DbGlobalConfig {
  id: string;
  scrape_interval_hours: number;
  cron_enabled: boolean;
  updated_at: Date;
}

/**
 * Generate a short unique ID for a leaderboard.
 */
function generateId(): string {
  return `lb-${randomBytes(4).toString("hex")}`;
}

/**
 * Calculate engagement score for a tweet.
 * Formula: views + likes*10 + retweets*5 + replies*3
 */
export function calculateEngagementScore(tweet: {
  views: number;
  likes: number;
  retweets: number;
  replies: number;
}): number {
  return tweet.views + tweet.likes * 10 + tweet.retweets * 5 + tweet.replies * 3;
}

// --- Global Config ---

/**
 * Load global leaderboard configuration.
 */
export async function loadGlobalConfig(): Promise<LeaderboardGlobalConfig> {
  const config = await queryOne<DbGlobalConfig>(
    `SELECT * FROM leaderboard_global_config WHERE id = 'global'`
  );

  if (!config) {
    return { scrapeIntervalHours: 24, cronEnabled: false };
  }

  return {
    scrapeIntervalHours: config.scrape_interval_hours,
    cronEnabled: config.cron_enabled,
  };
}

/**
 * Save global leaderboard configuration.
 */
export async function saveGlobalConfig(config: LeaderboardGlobalConfig): Promise<void> {
  await query(
    `INSERT INTO leaderboard_global_config (id, scrape_interval_hours, cron_enabled, updated_at)
     VALUES ('global', $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET
       scrape_interval_hours = EXCLUDED.scrape_interval_hours,
       cron_enabled = EXCLUDED.cron_enabled,
       updated_at = NOW()`,
    [config.scrapeIntervalHours, config.cronEnabled]
  );
}

// --- Leaderboard CRUD ---

/**
 * Create a new leaderboard.
 */
export async function createLeaderboard(
  name: string,
  sources: LeaderboardSource[]
): Promise<Leaderboard> {
  const id = generateId();

  const result = await queryOne<DbLeaderboard>(
    `INSERT INTO leaderboards (id, name, sources)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, name, JSON.stringify(sources)]
  );

  if (!result) {
    throw new Error("Failed to create leaderboard");
  }

  return dbToLeaderboard(result, []);
}

/**
 * Load a leaderboard by ID.
 */
export async function loadLeaderboard(id: string): Promise<Leaderboard | null> {
  const lb = await queryOne<DbLeaderboard>(
    `SELECT * FROM leaderboards WHERE id = $1`,
    [id]
  );

  if (!lb) {
    return null;
  }

  const tweets = await query<DbLeaderboardTweet>(
    `SELECT * FROM leaderboard_tweets WHERE leaderboard_id = $1 ORDER BY rank NULLS LAST, engagement_score DESC`,
    [id]
  );

  return dbToLeaderboard(lb, tweets);
}

/**
 * Build a multi-row INSERT query with parameterized values.
 */
function buildMultiInsert(
  baseQuery: string,
  rows: unknown[][]
): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const valueGroups: string[] = [];
  for (const row of rows) {
    const offset = params.length;
    const placeholders = row.map((_, i) => `$${offset + i + 1}`);
    valueGroups.push(`(${placeholders.join(", ")})`);
    params.push(...row);
  }
  return { text: `${baseQuery} VALUES ${valueGroups.join(", ")}`, params };
}

/**
 * Save a leaderboard inside a transaction.
 */
export async function saveLeaderboard(leaderboard: Leaderboard): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE leaderboards SET
         name = $2,
         sources = $3,
         max_tweets_per_source = $4,
         min_views = $5,
         min_likes = $6,
         time_window = $7,
         last_scraped_at = $8,
         next_scheduled_at = $9,
         is_scraping_now = $10,
         last_error = $11,
         tokens_input = $12,
         tokens_output = $13,
         updated_at = NOW()
       WHERE id = $1`,
      [
        leaderboard.id,
        leaderboard.name,
        JSON.stringify(leaderboard.sources),
        leaderboard.maxTweetsPerSource,
        leaderboard.minViews ?? null,
        leaderboard.minLikes ?? null,
        leaderboard.timeWindow,
        leaderboard.lastScrapedAt ? new Date(leaderboard.lastScrapedAt) : null,
        leaderboard.nextScheduledAt ? new Date(leaderboard.nextScheduledAt) : null,
        leaderboard.isScrapingNow,
        leaderboard.lastError ?? null,
        leaderboard.tokensUsed.input,
        leaderboard.tokensUsed.output,
      ]
    );

    // Sync tweets (delete + multi-row insert)
    await tx.execute(`DELETE FROM leaderboard_tweets WHERE leaderboard_id = $1`, [leaderboard.id]);

    if (leaderboard.tweets.length > 0) {
      const { text, params } = buildMultiInsert(
        `INSERT INTO leaderboard_tweets (
           id, leaderboard_id, text, author, handle, likes, retweets, views, replies,
           url, image_urls, posted_at, scraped_at, search_name, source_type, source_value,
           engagement_score, rank)`,
        leaderboard.tweets.map((t) => [
          t.id, leaderboard.id, t.text, t.author, t.handle,
          t.likes, t.retweets, t.views, t.replies,
          t.url, t.imageUrls, new Date(t.postedAt), new Date(t.scrapedAt),
          t.searchName, t.sourceType, t.sourceValue, t.engagementScore, t.rank ?? null,
        ])
      );
      await tx.execute(text, params);
    }
  });
}

/**
 * Delete a leaderboard.
 */
export async function deleteLeaderboard(id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM leaderboards WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.length > 0;
}

/**
 * List all leaderboards (summary info only).
 */
export async function listLeaderboards(): Promise<Array<{
  id: string;
  name: string;
  sourceCount: number;
  tweetCount: number;
  lastScrapedAt: string | undefined;
  isScrapingNow: boolean;
  createdAt: string;
  updatedAt: string;
}>> {
  const leaderboards = await query<DbLeaderboard & { tweet_count: string }>(
    `SELECT l.*,
            (SELECT COUNT(*) FROM leaderboard_tweets WHERE leaderboard_id = l.id)::text as tweet_count
     FROM leaderboards l
     ORDER BY l.updated_at DESC`
  );

  return leaderboards.map(lb => ({
    id: lb.id,
    name: lb.name,
    sourceCount: Array.isArray(lb.sources) ? lb.sources.length : 0,
    tweetCount: parseInt(lb.tweet_count, 10),
    lastScrapedAt: lb.last_scraped_at?.toISOString(),
    isScrapingNow: lb.is_scraping_now,
    createdAt: lb.created_at.toISOString(),
    updatedAt: lb.updated_at.toISOString(),
  }));
}

// --- Scrape Operations ---

/** Scraping timeout in milliseconds (10 minutes). */
const SCRAPING_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Auto-reset leaderboards stuck in scraping state for longer than the timeout.
 * Called before starting a new scrape to prevent permanent stuck states.
 */
export async function resetStuckScrapingJobs(): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE leaderboards
     SET is_scraping_now = false,
         last_error = 'Scraping timed out (auto-reset)',
         updated_at = NOW()
     WHERE is_scraping_now = true
       AND updated_at < NOW() - INTERVAL '${Math.floor(SCRAPING_TIMEOUT_MS / 1000)} seconds'
     RETURNING id`
  );
  if (rows.length > 0) {
    console.log(`[Leaderboard] Auto-reset ${rows.length} stuck scraping job(s): ${rows.map((r) => r.id).join(", ")}`);
  }
  return rows.length;
}

/**
 * Mark a leaderboard as scraping started.
 * Also resets any stuck scraping jobs first.
 */
export async function markScrapingStarted(id: string): Promise<void> {
  await resetStuckScrapingJobs();
  await query(
    `UPDATE leaderboards SET is_scraping_now = true, last_error = NULL, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

/**
 * Complete scraping for a leaderboard with new tweets.
 */
// Max tweets to keep per leaderboard (prevents unbounded growth)
const MAX_ACCUMULATED_TWEETS = 200;

export async function completeScraping(
  id: string,
  newTweets: TrendingTweet[],
  tokensUsed: { input: number; output: number }
): Promise<void> {
  const lb = await loadLeaderboard(id);
  if (!lb) return;

  // Merge new tweets with existing — new version wins on duplicate ID
  const tweetMap = new Map<string, TrendingTweet>();
  for (const tweet of lb.tweets) {
    tweetMap.set(tweet.id, tweet);
  }
  for (const tweet of newTweets) {
    tweetMap.set(tweet.id, tweet);
  }

  // Sort by engagement score descending, cap at limit
  const merged = Array.from(tweetMap.values())
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, MAX_ACCUMULATED_TWEETS);

  // Assign ranks
  const ranked = merged.map((tweet, index) => ({
    ...tweet,
    rank: index + 1,
  }));

  lb.tweets = ranked;
  lb.lastScrapedAt = new Date().toISOString();
  lb.isScrapingNow = false;
  lb.lastError = undefined;
  lb.tokensUsed = {
    input: lb.tokensUsed.input + tokensUsed.input,
    output: lb.tokensUsed.output + tokensUsed.output,
  };

  // Calculate next scheduled time
  const config = await loadGlobalConfig();
  const nextTime = new Date();
  nextTime.setHours(nextTime.getHours() + config.scrapeIntervalHours);
  lb.nextScheduledAt = nextTime.toISOString();

  await saveLeaderboard(lb);
}

/**
 * Mark scraping as failed for a leaderboard.
 */
export async function failScraping(id: string, error: string): Promise<void> {
  await query(
    `UPDATE leaderboards SET is_scraping_now = false, last_error = $2, updated_at = NOW() WHERE id = $1`,
    [id, error]
  );
}

/**
 * Get tweets from a leaderboard.
 */
export async function getLeaderboardTweets(id: string, limit: number = 50): Promise<TrendingTweet[]> {
  const tweets = await query<DbLeaderboardTweet>(
    `SELECT * FROM leaderboard_tweets WHERE leaderboard_id = $1 ORDER BY rank NULLS LAST, engagement_score DESC LIMIT $2`,
    [id, limit]
  );

  return tweets.map(dbToTweet);
}

/**
 * Find a tweet by ID across all leaderboards.
 */
export async function findTweetById(tweetId: string): Promise<TrendingTweet | undefined> {
  const tweet = await queryOne<DbLeaderboardTweet>(
    `SELECT * FROM leaderboard_tweets WHERE id = $1 LIMIT 1`,
    [tweetId]
  );

  return tweet ? dbToTweet(tweet) : undefined;
}

/**
 * Update leaderboard settings (not sources/tweets).
 */
export async function updateLeaderboardSettings(
  id: string,
  settings: {
    name?: string;
    maxTweetsPerSource?: number;
    minViews?: number;
    minLikes?: number;
    timeWindow?: TimeWindow;
  }
): Promise<Leaderboard | null> {
  const lb = await loadLeaderboard(id);
  if (!lb) return null;

  if (settings.name !== undefined) lb.name = settings.name;
  if (settings.maxTweetsPerSource !== undefined) lb.maxTweetsPerSource = settings.maxTweetsPerSource;
  if (settings.minViews !== undefined) lb.minViews = settings.minViews;
  if (settings.minLikes !== undefined) lb.minLikes = settings.minLikes;
  if (settings.timeWindow !== undefined) lb.timeWindow = settings.timeWindow;

  await saveLeaderboard(lb);
  return lb;
}

/**
 * Update leaderboard sources.
 */
export async function updateLeaderboardSources(
  id: string,
  sources: LeaderboardSource[]
): Promise<Leaderboard | null> {
  const lb = await loadLeaderboard(id);
  if (!lb) return null;
  lb.sources = sources;
  await saveLeaderboard(lb);
  return lb;
}

// --- Converters ---

function dbToLeaderboard(lb: DbLeaderboard, tweets: DbLeaderboardTweet[]): Leaderboard {
  return {
    id: lb.id,
    name: lb.name,
    sources: Array.isArray(lb.sources) ? lb.sources : [],
    tweets: tweets.map(dbToTweet),
    maxTweetsPerSource: lb.max_tweets_per_source,
    minViews: lb.min_views ?? undefined,
    minLikes: lb.min_likes ?? undefined,
    timeWindow: lb.time_window as TimeWindow,
    lastScrapedAt: lb.last_scraped_at?.toISOString(),
    nextScheduledAt: lb.next_scheduled_at?.toISOString(),
    isScrapingNow: lb.is_scraping_now,
    lastError: lb.last_error ?? undefined,
    tokensUsed: { input: lb.tokens_input, output: lb.tokens_output },
    createdAt: lb.created_at.toISOString(),
    updatedAt: lb.updated_at.toISOString(),
  };
}

function dbToTweet(t: DbLeaderboardTweet): TrendingTweet {
  return {
    id: t.id,
    text: t.text,
    author: t.author,
    handle: t.handle,
    likes: t.likes,
    retweets: t.retweets,
    views: t.views,
    replies: t.replies,
    url: t.url,
    imageUrls: t.image_urls,
    postedAt: t.posted_at.toISOString(),
    scrapedAt: t.scraped_at.toISOString(),
    searchName: t.search_name,
    sourceType: t.source_type as "handle" | "topic",
    sourceValue: t.source_value,
    engagementScore: t.engagement_score,
    rank: t.rank ?? undefined,
  };
}
