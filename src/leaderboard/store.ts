import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { PROJECT_ROOT } from "../config.js";
import {
  LeaderboardSchema,
  LeaderboardGlobalConfigSchema,
} from "../types.js";
import type {
  Leaderboard,
  LeaderboardGlobalConfig,
  LeaderboardSource,
  TrendingTweet,
} from "../types.js";

const DATA_DIR = resolve(PROJECT_ROOT, "data");
const LEADERBOARDS_DIR = resolve(DATA_DIR, "leaderboards");
const GLOBAL_CONFIG_FILE = resolve(DATA_DIR, "leaderboard-global-config.json");

// Ensure directories exist
if (!existsSync(LEADERBOARDS_DIR)) {
  mkdirSync(LEADERBOARDS_DIR, { recursive: true });
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
export function loadGlobalConfig(): LeaderboardGlobalConfig {
  if (!existsSync(GLOBAL_CONFIG_FILE)) {
    return LeaderboardGlobalConfigSchema.parse({});
  }
  try {
    const raw = readFileSync(GLOBAL_CONFIG_FILE, "utf-8");
    return LeaderboardGlobalConfigSchema.parse(JSON.parse(raw));
  } catch {
    return LeaderboardGlobalConfigSchema.parse({});
  }
}

/**
 * Save global leaderboard configuration.
 */
export function saveGlobalConfig(config: LeaderboardGlobalConfig): void {
  writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// --- Leaderboard CRUD ---

/**
 * Get the file path for a leaderboard.
 */
function getLeaderboardPath(id: string): string {
  return resolve(LEADERBOARDS_DIR, `${id}.json`);
}

/**
 * Create a new leaderboard.
 */
export function createLeaderboard(
  name: string,
  sources: LeaderboardSource[]
): Leaderboard {
  const now = new Date().toISOString();
  const leaderboard = LeaderboardSchema.parse({
    id: generateId(),
    name,
    sources,
    tweets: [],
    createdAt: now,
    updatedAt: now,
  });

  writeFileSync(getLeaderboardPath(leaderboard.id), JSON.stringify(leaderboard, null, 2));
  return leaderboard;
}

/**
 * Load a leaderboard by ID.
 */
export function loadLeaderboard(id: string): Leaderboard | null {
  const path = getLeaderboardPath(id);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return LeaderboardSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Save a leaderboard.
 */
export function saveLeaderboard(leaderboard: Leaderboard): void {
  leaderboard.updatedAt = new Date().toISOString();
  writeFileSync(getLeaderboardPath(leaderboard.id), JSON.stringify(leaderboard, null, 2));
}

/**
 * Delete a leaderboard.
 */
export function deleteLeaderboard(id: string): boolean {
  const path = getLeaderboardPath(id);
  if (!existsSync(path)) {
    return false;
  }
  unlinkSync(path);
  return true;
}

/**
 * List all leaderboards (summary info only).
 */
export function listLeaderboards(): Array<{
  id: string;
  name: string;
  sourceCount: number;
  tweetCount: number;
  lastScrapedAt: string | undefined;
  isScrapingNow: boolean;
  createdAt: string;
  updatedAt: string;
}> {
  if (!existsSync(LEADERBOARDS_DIR)) {
    return [];
  }

  const files = readdirSync(LEADERBOARDS_DIR).filter(f => f.endsWith(".json"));

  return files
    .map(file => {
      try {
        const raw = readFileSync(resolve(LEADERBOARDS_DIR, file), "utf-8");
        const lb = LeaderboardSchema.parse(JSON.parse(raw));
        return {
          id: lb.id,
          name: lb.name,
          sourceCount: lb.sources.length,
          tweetCount: lb.tweets.length,
          lastScrapedAt: lb.lastScrapedAt,
          isScrapingNow: lb.isScrapingNow,
          createdAt: lb.createdAt,
          updatedAt: lb.updatedAt,
        };
      } catch {
        return null;
      }
    })
    .filter((lb): lb is NonNullable<typeof lb> => lb !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// --- Scrape Operations ---

/**
 * Mark a leaderboard as scraping started.
 */
export function markScrapingStarted(id: string): void {
  const lb = loadLeaderboard(id);
  if (!lb) return;
  lb.isScrapingNow = true;
  lb.lastError = undefined;
  saveLeaderboard(lb);
}

/**
 * Complete scraping for a leaderboard with new tweets.
 */
export function completeScraping(
  id: string,
  tweets: TrendingTweet[],
  tokensUsed: { input: number; output: number }
): void {
  const lb = loadLeaderboard(id);
  if (!lb) return;

  // Sort by engagement score descending
  const sorted = [...tweets].sort(
    (a, b) => b.engagementScore - a.engagementScore
  );

  // Assign ranks
  const ranked = sorted.map((tweet, index) => ({
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

  // Calculate next scheduled time (24h from now)
  const config = loadGlobalConfig();
  const nextTime = new Date();
  nextTime.setHours(nextTime.getHours() + config.scrapeIntervalHours);
  lb.nextScheduledAt = nextTime.toISOString();

  saveLeaderboard(lb);
}

/**
 * Mark scraping as failed for a leaderboard.
 */
export function failScraping(id: string, error: string): void {
  const lb = loadLeaderboard(id);
  if (!lb) return;
  lb.isScrapingNow = false;
  lb.lastError = error;
  saveLeaderboard(lb);
}

/**
 * Get tweets from a leaderboard.
 */
export function getLeaderboardTweets(id: string, limit: number = 50): TrendingTweet[] {
  const lb = loadLeaderboard(id);
  if (!lb) return [];
  return lb.tweets.slice(0, limit);
}

/**
 * Find a tweet by ID across all leaderboards.
 */
export function findTweetById(tweetId: string): TrendingTweet | undefined {
  if (!existsSync(LEADERBOARDS_DIR)) {
    return undefined;
  }

  const files = readdirSync(LEADERBOARDS_DIR).filter(f => f.endsWith(".json"));

  for (const file of files) {
    try {
      const raw = readFileSync(resolve(LEADERBOARDS_DIR, file), "utf-8");
      const lb = LeaderboardSchema.parse(JSON.parse(raw));
      const tweet = lb.tweets.find(t => t.id === tweetId);
      if (tweet) return tweet;
    } catch {
      // skip
    }
  }
  return undefined;
}

/**
 * Update leaderboard settings (not sources/tweets).
 */
export function updateLeaderboardSettings(
  id: string,
  settings: {
    name?: string;
    maxTweetsPerSource?: number;
    minViews?: number;
    minLikes?: number;
    timeWindow?: "1h" | "12h" | "24h" | "7d" | "14d" | "30d";
  }
): Leaderboard | null {
  const lb = loadLeaderboard(id);
  if (!lb) return null;

  if (settings.name !== undefined) lb.name = settings.name;
  if (settings.maxTweetsPerSource !== undefined) lb.maxTweetsPerSource = settings.maxTweetsPerSource;
  if (settings.minViews !== undefined) lb.minViews = settings.minViews;
  if (settings.minLikes !== undefined) lb.minLikes = settings.minLikes;
  if (settings.timeWindow !== undefined) lb.timeWindow = settings.timeWindow;

  saveLeaderboard(lb);
  return lb;
}

/**
 * Update leaderboard sources.
 */
export function updateLeaderboardSources(
  id: string,
  sources: LeaderboardSource[]
): Leaderboard | null {
  const lb = loadLeaderboard(id);
  if (!lb) return null;
  lb.sources = sources;
  saveLeaderboard(lb);
  return lb;
}
