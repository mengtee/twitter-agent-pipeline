import { Command } from "commander";
import { loadConfig, loadSearches } from "./config.js";
import { scrapeAll } from "./scraper/grok-scraper.js";
import {
  loadSeenUrls,
  saveSeenUrls,
  deduplicateTweets,
  saveScrapeResults,
} from "./scraper/store.js";
import { rewriteBatch } from "./processor/rewriter.js";
import {
  loadQueue,
  saveQueue,
  addScrapedToQueue,
  markGenerated,
  updateStatus,
  getByStatus,
  loadLatestScrapedTweets,
} from "./output/queue.js";
import {
  formatQueueItem,
  formatQueueSummary,
  formatPreview,
} from "./output/display.js";

const program = new Command();

program
  .name("tweet-pipeline")
  .description(
    "Scrape trending tweets → rewrite with character voice → output for posting"
  )
  .version("0.1.0");

// --- scrape ---
program
  .command("scrape")
  .description("Fetch new tweets from configured search queries via Grok API")
  .option("-n, --name <name>", "Run only a specific search by name")
  .option("--dry-run", "Show what would be searched without calling the API")
  .action(async (opts: { name?: string; dryRun?: boolean }) => {
    let searches = loadSearches();

    if (opts.name) {
      const allNames = searches.map((s) => s.name);
      searches = searches.filter((s) => s.name === opts.name);
      if (searches.length === 0) {
        console.error(`No search config found with name: "${opts.name}"`);
        console.error(`Available: ${allNames.join(", ")}`);
        process.exit(1);
      }
    }

    console.log(`Running ${searches.length} search(es)...`);

    if (opts.dryRun) {
      for (const s of searches) {
        console.log(`\n  [dry-run] ${s.name}:`);
        console.log(`    Prompt: "${s.prompt}"`);
        console.log(`    Time: ${s.timeWindow}, Max: ${s.maxResults}`);
        if (s.minViews) console.log(`    Min views: ${s.minViews}`);
        if (s.minLikes) console.log(`    Min likes: ${s.minLikes}`);
      }
      return;
    }

    // Only load API keys when actually calling the API
    const config = loadConfig();
    const { allTweets, totalTokens } = await scrapeAll(
      config.xaiApiKey,
      searches
    );

    // Deduplicate
    const seen = loadSeenUrls();
    const newTweets = deduplicateTweets(allTweets, seen);
    saveSeenUrls(seen);

    if (newTweets.length === 0) {
      console.log("\nNo new tweets found (all duplicates or empty results).");
      return;
    }

    // Save results
    const filepath = saveScrapeResults(newTweets);

    // Add to queue
    const queue = loadQueue();
    addScrapedToQueue(queue, newTweets);
    saveQueue(queue);

    console.log(`\n--- Results ---`);
    console.log(`Total found: ${allTweets.length}`);
    console.log(`New (deduplicated): ${newTweets.length}`);
    console.log(`Tokens used: ${totalTokens.input} in / ${totalTokens.output} out`);
    console.log(`Saved to: ${filepath}`);
    console.log(`Added to queue (${queue.length} total items)`);

    // Preview first few tweets
    console.log(`\nTop tweets:`);
    for (const t of newTweets.slice(0, 5)) {
      console.log(`\n  @${t.handle} — ${t.views} views, ${t.likes} likes`);
      console.log(
        `  "${t.text.slice(0, 120)}${t.text.length > 120 ? "..." : ""}"`
      );
      console.log(`  ${t.url}`);
    }
    if (newTweets.length > 5) {
      console.log(`\n  ... and ${newTweets.length - 5} more`);
    }
  });

// --- generate ---
program
  .command("generate")
  .description("Rewrite scraped tweets using Claude with persona voice")
  .option(
    "-m, --model <model>",
    "OpenRouter model ID",
    "anthropic/claude-sonnet-4"
  )
  .option("--from-file <file>", "Load tweets from a specific scraped file")
  .action(async (opts: { model: string; fromFile?: string }) => {
    const config = loadConfig();
    const persona = config.persona;

    console.log(`Persona: ${persona.name}`);
    console.log(`Model: ${opts.model}`);

    // Load tweets to rewrite
    const queue = loadQueue();
    let tweetsToRewrite = getByStatus(queue, "scraped").map(
      (q) => q.scrapedTweet
    );

    if (tweetsToRewrite.length === 0) {
      // Fallback: load from latest scraped file
      tweetsToRewrite = loadLatestScrapedTweets();
      if (tweetsToRewrite.length > 0) {
        console.log(
          `No scraped items in queue. Loaded ${tweetsToRewrite.length} from latest scrape file.`
        );
        addScrapedToQueue(queue, tweetsToRewrite);
        tweetsToRewrite = getByStatus(queue, "scraped").map(
          (q) => q.scrapedTweet
        );
      }
    }

    if (tweetsToRewrite.length === 0) {
      console.log("\nNo tweets to rewrite. Run 'scrape' first.");
      return;
    }

    console.log(`\nRewriting ${tweetsToRewrite.length} tweets...\n`);

    const { results, skipped, totalTokens } = await rewriteBatch(
      config.openrouterApiKey,
      persona,
      tweetsToRewrite,
      opts.model
    );

    // Update queue with rewrites
    for (const r of results) {
      markGenerated(queue, r.tweet.url, r.rewritten, r.confidence, r.hashtags);
    }
    saveQueue(queue);

    console.log(`\n--- Generate Results ---`);
    console.log(`Rewritten: ${results.length}`);
    console.log(`Skipped: ${skipped}`);
    console.log(
      `Tokens: ${totalTokens.input} in / ${totalTokens.output} out`
    );
    console.log(`Queue updated.`);
  });

// --- review ---
program
  .command("review")
  .description("Review generated tweets side-by-side with originals")
  .option(
    "-s, --status <status>",
    "Filter by status (generated, approved, all)",
    "generated"
  )
  .action(async (opts: { status: string }) => {
    const queue = loadQueue();

    const items =
      opts.status === "all"
        ? queue.filter((q) => q.rewrittenTweet)
        : getByStatus(queue, opts.status as "generated");

    if (items.length === 0) {
      console.log(
        `\nNo ${opts.status} tweets to review. Run 'generate' first.`
      );
      return;
    }

    console.log(`\nShowing ${items.length} ${opts.status} tweet(s):`);
    for (let i = 0; i < items.length; i++) {
      console.log(formatQueueItem(items[i], i));
    }
  });

// --- approve ---
program
  .command("approve")
  .description("Mark tweet(s) as approved for posting")
  .argument("<ids...>", "Tweet queue IDs to approve (or 'all')")
  .action(async (ids: string[]) => {
    const queue = loadQueue();
    let count = 0;

    if (ids.includes("all")) {
      for (const item of getByStatus(queue, "generated")) {
        updateStatus(queue, item.id, "approved");
        count++;
      }
    } else {
      for (const id of ids) {
        if (updateStatus(queue, id, "approved")) {
          count++;
        } else {
          console.error(`  Not found: ${id}`);
        }
      }
    }

    saveQueue(queue);
    console.log(`Approved ${count} tweet(s).`);
  });

// --- list ---
program
  .command("list")
  .description("Show all tweets in the queue with their status")
  .option("-s, --status <status>", "Filter by status")
  .action(async (opts: { status?: string }) => {
    const queue = loadQueue();

    if (queue.length === 0) {
      console.log("\nQueue is empty. Run 'scrape' to get started.");
      return;
    }

    console.log(formatQueueSummary(queue));

    const items = opts.status
      ? getByStatus(queue, opts.status as "scraped")
      : queue;

    console.log("");
    for (const item of items) {
      console.log(formatPreview(item));
    }
  });

// --- config ---
program
  .command("config")
  .description("Validate and display current configuration")
  .action(async () => {
    try {
      const config = loadConfig();
      console.log("Configuration valid!\n");
      console.log(`Persona: ${config.persona.name}`);
      console.log(`  Bio: ${config.persona.bio}`);
      console.log(`  Tone: ${config.persona.voice.tone}`);
      console.log(`  Topics: ${config.persona.topics.interests.join(", ")}`);
      console.log(`  Rules: ${config.persona.rules.length}`);
      console.log(`  Examples: ${config.persona.examples.length}`);
      console.log(`\nSearches: ${config.searches.length}`);
      for (const s of config.searches) {
        console.log(
          `  - ${s.name}: "${s.prompt}" [${s.timeWindow}, max ${s.maxResults}]`
        );
      }
      console.log("\nAPI Keys: set (masked)");
    } catch (err) {
      console.error(
        "Config error:",
        err instanceof Error ? err.message : err
      );
      process.exit(1);
    }
  });

// --- run (full pipeline) ---
program
  .command("run")
  .description("Run the full pipeline: scrape → generate → review")
  .option(
    "-m, --model <model>",
    "OpenRouter model ID for rewriting",
    "anthropic/claude-sonnet-4"
  )
  .action(async (opts: { model: string }) => {
    const config = loadConfig();

    // Step 1: Scrape
    console.log("=== Step 1: Scrape ===\n");
    const { allTweets, totalTokens: scrapeTokens } = await scrapeAll(
      config.xaiApiKey,
      config.searches
    );

    const seen = loadSeenUrls();
    const newTweets = deduplicateTweets(allTweets, seen);
    saveSeenUrls(seen);

    if (newTweets.length === 0) {
      console.log("No new tweets found. Pipeline complete.");
      return;
    }

    saveScrapeResults(newTweets);
    const queue = loadQueue();
    addScrapedToQueue(queue, newTweets);
    console.log(`Found ${newTweets.length} new tweets.\n`);

    // Step 2: Generate
    console.log("=== Step 2: Generate ===\n");
    console.log(`Persona: ${config.persona.name} | Model: ${opts.model}\n`);

    const tweetsToRewrite = getByStatus(queue, "scraped").map(
      (q) => q.scrapedTweet
    );

    const { results, skipped, totalTokens: genTokens } = await rewriteBatch(
      config.openrouterApiKey,
      config.persona,
      tweetsToRewrite,
      opts.model
    );

    for (const r of results) {
      markGenerated(queue, r.tweet.url, r.rewritten, r.confidence, r.hashtags);
    }
    saveQueue(queue);

    // Step 3: Review
    console.log("\n=== Step 3: Review ===\n");
    const generated = getByStatus(queue, "generated");

    if (generated.length === 0) {
      console.log("No rewrites generated.");
    } else {
      for (let i = 0; i < generated.length; i++) {
        console.log(formatQueueItem(generated[i], i));
      }
    }

    // Summary
    console.log("\n=== Pipeline Summary ===");
    console.log(`Scraped: ${newTweets.length} tweets`);
    console.log(`Rewritten: ${results.length} | Skipped: ${skipped}`);
    console.log(
      `Tokens: ${scrapeTokens.input + genTokens.input} in / ${scrapeTokens.output + genTokens.output} out`
    );
    console.log(formatQueueSummary(queue));
    console.log(
      `\nRun 'approve <id>' or 'approve all' to mark tweets for posting.`
    );
  });

program.parse();
