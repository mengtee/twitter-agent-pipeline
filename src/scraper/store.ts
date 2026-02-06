import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { query } from "../db/query.js";
import type { ScrapedTweet } from "../types.js";

// Database row type
interface DbSeenUrl {
  url: string;
  seen_at: Date;
}

/**
 * Load the set of previously seen tweet URLs.
 */
export async function loadSeenUrls(): Promise<Set<string>> {
  const rows = await query<DbSeenUrl>(`SELECT url FROM seen_urls`);
  return new Set(rows.map((r) => r.url));
}

/**
 * Save the set of seen tweet URLs.
 * Performs a bulk upsert to add new URLs.
 */
export async function saveSeenUrls(urls: Set<string>): Promise<void> {
  if (urls.size === 0) return;

  // Batch insert new URLs, ignoring conflicts
  const urlArray = [...urls];
  for (const url of urlArray) {
    await query(
      `INSERT INTO seen_urls (url) VALUES ($1) ON CONFLICT (url) DO NOTHING`,
      [url]
    );
  }
}

/**
 * Add a single URL to seen URLs.
 */
export async function addSeenUrl(url: string): Promise<void> {
  await query(
    `INSERT INTO seen_urls (url) VALUES ($1) ON CONFLICT (url) DO NOTHING`,
    [url]
  );
}

/**
 * Check if a URL has been seen before.
 */
export async function hasSeenUrl(url: string): Promise<boolean> {
  const rows = await query<DbSeenUrl>(
    `SELECT url FROM seen_urls WHERE url = $1 LIMIT 1`,
    [url]
  );
  return rows.length > 0;
}

/**
 * Deduplicate tweets against previously seen URLs.
 * Returns only new tweets and updates the seen set.
 */
export function deduplicateTweets(
  tweets: ScrapedTweet[],
  seen: Set<string>
): ScrapedTweet[] {
  const newTweets: ScrapedTweet[] = [];
  for (const tweet of tweets) {
    if (!seen.has(tweet.url)) {
      seen.add(tweet.url);
      newTweets.push(tweet);
    }
  }
  return newTweets;
}

/**
 * Save scraped tweets to a timestamped file (for debugging/archiving).
 * Only works in CLI mode — not available on serverless runtimes.
 */
export function saveScrapeResults(tweets: ScrapedTweet[]): string {
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `scraped_${timestamp}.json`;
  const filepath = resolve(dataDir, filename);
  writeFileSync(filepath, JSON.stringify(tweets, null, 2));
  return filepath;
}
