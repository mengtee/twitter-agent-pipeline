import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PROJECT_ROOT } from "../config.js";
import { QueueItemSchema, ScrapedTweetSchema } from "../types.js";
import type { QueueItem, ScrapedTweet, QueueStatus } from "../types.js";
import { randomUUID } from "node:crypto";

const DATA_DIR = resolve(PROJECT_ROOT, "data");
const QUEUE_FILE = resolve(DATA_DIR, "queue.json");

/**
 * Load the queue from disk.
 */
export function loadQueue(): QueueItem[] {
  if (!existsSync(QUEUE_FILE)) {
    return [];
  }
  try {
    const raw = readFileSync(QUEUE_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((item: unknown) => QueueItemSchema.parse(item));
  } catch {
    return [];
  }
}

/**
 * Save the queue to disk.
 */
export function saveQueue(queue: QueueItem[]): void {
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

/**
 * Add scraped tweets to the queue with status "scraped".
 */
export function addScrapedToQueue(
  queue: QueueItem[],
  tweets: ScrapedTweet[]
): QueueItem[] {
  const now = new Date().toISOString();
  const existingUrls = new Set(queue.map((q) => q.scrapedTweet.url));

  for (const tweet of tweets) {
    if (existingUrls.has(tweet.url)) continue;
    queue.push({
      id: randomUUID().slice(0, 8),
      status: "scraped",
      scrapedTweet: tweet,
      hashtags: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  return queue;
}

/**
 * Update a queue item with a rewrite.
 */
export function markGenerated(
  queue: QueueItem[],
  tweetUrl: string,
  rewritten: string,
  confidence: number,
  hashtags: string[]
): void {
  const item = queue.find((q) => q.scrapedTweet.url === tweetUrl);
  if (!item) return;
  item.status = "generated";
  item.rewrittenTweet = rewritten;
  item.confidence = confidence;
  item.hashtags = hashtags;
  item.updatedAt = new Date().toISOString();
}

/**
 * Update the status of a queue item by ID.
 */
export function updateStatus(
  queue: QueueItem[],
  id: string,
  status: QueueStatus
): boolean {
  const item = queue.find((q) => q.id === id);
  if (!item) return false;
  item.status = status;
  item.updatedAt = new Date().toISOString();
  return true;
}

/**
 * Get queue items filtered by status.
 */
export function getByStatus(
  queue: QueueItem[],
  status: QueueStatus
): QueueItem[] {
  return queue.filter((q) => q.status === status);
}

/**
 * Load the most recent scraped tweets file from data/.
 */
export function loadLatestScrapedTweets(): ScrapedTweet[] {
  if (!existsSync(DATA_DIR)) return [];

  const files = readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("scraped_") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) return [];

  const latestFile = resolve(DATA_DIR, files[0]);
  try {
    const raw = readFileSync(latestFile, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((item: unknown) => ScrapedTweetSchema.parse(item));
  } catch {
    return [];
  }
}
