import * as cron from "node-cron";
import { loadConfig } from "../config.js";
import {
  listLeaderboards,
  loadLeaderboard,
  markScrapingStarted,
  completeScraping,
  failScraping,
  loadGlobalConfig,
  saveGlobalConfig,
} from "./store.js";
import { scrapeLeaderboard } from "./scraper.js";

let cronJob: cron.ScheduledTask | null = null;
let scrapingLeaderboardIds = new Set<string>();

/**
 * Convert interval hours to cron expression.
 */
function intervalToCron(hours: number): string {
  if (hours === 1) {
    return "0 * * * *"; // Every hour at :00
  } else if (hours < 24) {
    return `0 */${hours} * * *`; // Every N hours at :00
  } else if (hours === 24) {
    return "0 0 * * *"; // Daily at midnight
  } else {
    // For intervals > 24h, run daily and check manually
    return "0 0 * * *";
  }
}

/**
 * Scrape a single leaderboard by ID.
 */
export async function scrapeLeaderboardById(leaderboardId: string): Promise<void> {
  if (scrapingLeaderboardIds.has(leaderboardId)) {
    console.log(`[Leaderboard ${leaderboardId}] Scrape already in progress, skipping...`);
    return;
  }

  const leaderboard = loadLeaderboard(leaderboardId);
  if (!leaderboard) {
    throw new Error(`Leaderboard ${leaderboardId} not found`);
  }

  if (leaderboard.sources.length === 0) {
    throw new Error("No sources configured");
  }

  scrapingLeaderboardIds.add(leaderboardId);
  markScrapingStarted(leaderboardId);

  try {
    console.log(`[Leaderboard ${leaderboard.name}] Starting scrape...`);

    // Load API key
    const appConfig = loadConfig();
    if (!appConfig.xaiApiKey) {
      throw new Error("XAI_API_KEY not configured");
    }

    const result = await scrapeLeaderboard(appConfig.xaiApiKey, leaderboard);

    // Update leaderboard with new tweets
    completeScraping(leaderboardId, result.tweets, result.tokensUsed);

    console.log(
      `[Leaderboard ${leaderboard.name}] Scrape complete: ${result.tweets.length} tweets, ` +
        `${result.tokensUsed.input + result.tokensUsed.output} tokens`
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Leaderboard ${leaderboard.name}] Scrape failed:`, errorMsg);
    failScraping(leaderboardId, errorMsg);
    throw err;
  } finally {
    scrapingLeaderboardIds.delete(leaderboardId);
  }
}

/**
 * Run cron job: scrape all leaderboards that need updating.
 */
async function runCronJob(): Promise<void> {
  const leaderboards = listLeaderboards();
  const now = new Date();

  console.log(`[Cron] Checking ${leaderboards.length} leaderboards...`);

  for (const lb of leaderboards) {
    // Skip if already scraping
    if (lb.isScrapingNow || scrapingLeaderboardIds.has(lb.id)) {
      continue;
    }

    // Check if it needs scraping (nextScheduledAt is in the past or not set)
    const needsScraping =
      !lb.lastScrapedAt ||
      (lb.lastScrapedAt && new Date(lb.lastScrapedAt).getTime() < now.getTime() - 23 * 60 * 60 * 1000);

    if (needsScraping) {
      console.log(`[Cron] Scraping leaderboard: ${lb.name}`);
      try {
        await scrapeLeaderboardById(lb.id);
      } catch (err) {
        console.error(`[Cron] Failed to scrape ${lb.name}:`, err);
      }
    }
  }
}

/**
 * Start the global cron job that checks all leaderboards.
 */
export function startLeaderboardCron(intervalHours?: number): void {
  const config = loadGlobalConfig();
  const hours = intervalHours ?? config.scrapeIntervalHours;

  // Stop existing job if running
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }

  const cronExpression = intervalToCron(hours);
  console.log(
    `[Leaderboard] Starting global cron with interval ${hours}h (${cronExpression})`
  );

  // Update config
  saveGlobalConfig({ ...config, cronEnabled: true, scrapeIntervalHours: hours });

  // Schedule the cron job
  cronJob = cron.schedule(cronExpression, () => {
    runCronJob().catch((err) => {
      console.error("[Leaderboard] Cron job error:", err);
    });
  });

  // Run immediately on start
  runCronJob().catch((err) => {
    console.error("[Leaderboard] Initial cron run error:", err);
  });
}

/**
 * Stop the global cron job.
 */
export function stopLeaderboardCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log("[Leaderboard] Global cron stopped");
  }

  // Update config
  const config = loadGlobalConfig();
  saveGlobalConfig({ ...config, cronEnabled: false });
}

/**
 * Check if the cron job is currently running.
 */
export function isLeaderboardCronRunning(): boolean {
  return cronJob !== null;
}

/**
 * Check if a specific leaderboard is being scraped.
 */
export function isLeaderboardScraping(leaderboardId: string): boolean {
  return scrapingLeaderboardIds.has(leaderboardId);
}

/**
 * Get global cron status.
 */
export function getCronStatus(): {
  cronEnabled: boolean;
  scrapeIntervalHours: number;
  activeScrapesCount: number;
} {
  const config = loadGlobalConfig();
  return {
    cronEnabled: cronJob !== null,
    scrapeIntervalHours: config.scrapeIntervalHours,
    activeScrapesCount: scrapingLeaderboardIds.size,
  };
}
