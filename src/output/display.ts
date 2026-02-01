import type { QueueItem } from "../types.js";

const SEPARATOR = "─".repeat(50);

/**
 * Format a single queue item for CLI display.
 */
export function formatQueueItem(item: QueueItem, index: number): string {
  const lines: string[] = [];

  lines.push(`\n${SEPARATOR}`);
  lines.push(`  #${index + 1}  [${item.id}]  Status: ${item.status.toUpperCase()}`);
  lines.push(SEPARATOR);

  // Original tweet
  lines.push(`  ORIGINAL: @${item.scrapedTweet.handle} (${item.scrapedTweet.author})`);
  lines.push(
    `  ${item.scrapedTweet.views} views | ${item.scrapedTweet.likes} likes | ${item.scrapedTweet.retweets} RTs`
  );
  lines.push(`  "${item.scrapedTweet.text}"`);
  lines.push(`  ${item.scrapedTweet.url}`);

  // Rewritten tweet
  if (item.rewrittenTweet) {
    lines.push("");
    lines.push(`  REWRITTEN:`);
    lines.push(`  "${item.rewrittenTweet}"`);
    lines.push(`  (${item.rewrittenTweet.length} chars)`);
    if (item.confidence) {
      lines.push(`  Confidence: ${item.confidence}/10`);
    }
    if (item.hashtags.length > 0) {
      lines.push(`  Tags: ${item.hashtags.map((t) => `#${t}`).join(" ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a summary of the queue.
 */
export function formatQueueSummary(queue: QueueItem[]): string {
  const counts = {
    scraped: 0,
    generated: 0,
    reviewed: 0,
    approved: 0,
    posted: 0,
  };

  for (const item of queue) {
    counts[item.status]++;
  }

  const lines: string[] = [];
  lines.push(`\nQueue: ${queue.length} total`);
  lines.push(`  Scraped:   ${counts.scraped}`);
  lines.push(`  Generated: ${counts.generated}`);
  lines.push(`  Reviewed:  ${counts.reviewed}`);
  lines.push(`  Approved:  ${counts.approved}`);
  lines.push(`  Posted:    ${counts.posted}`);

  return lines.join("\n");
}

/**
 * Format a tweet for quick preview (one-liner).
 */
export function formatPreview(item: QueueItem): string {
  const status = item.status.padEnd(9);
  const text = item.rewrittenTweet
    ? item.rewrittenTweet.slice(0, 70)
    : item.scrapedTweet.text.slice(0, 70);
  const suffix = (item.rewrittenTweet ?? item.scrapedTweet.text).length > 70 ? "..." : "";
  return `  [${item.id}] ${status} "${text}${suffix}"`;
}
