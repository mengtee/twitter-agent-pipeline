import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PROJECT_ROOT } from "../config.js";
import type { ScrapedTweet } from "../types.js";

const DATA_DIR = resolve(PROJECT_ROOT, "data");
const SEEN_FILE = resolve(DATA_DIR, "seen.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load the set of previously seen tweet URLs.
 */
export function loadSeenUrls(): Set<string> {
  if (!existsSync(SEEN_FILE)) {
    return new Set();
  }
  try {
    const raw = readFileSync(SEEN_FILE, "utf-8");
    const urls: string[] = JSON.parse(raw);
    return new Set(urls);
  } catch {
    return new Set();
  }
}

/**
 * Save the set of seen tweet URLs.
 */
export function saveSeenUrls(urls: Set<string>): void {
  ensureDataDir();
  writeFileSync(SEEN_FILE, JSON.stringify([...urls], null, 2));
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
 * Save scraped tweets to a timestamped file.
 */
export function saveScrapeResults(tweets: ScrapedTweet[]): string {
  ensureDataDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `scraped_${timestamp}.json`;
  const filepath = resolve(DATA_DIR, filename);
  writeFileSync(filepath, JSON.stringify(tweets, null, 2));
  return filepath;
}
