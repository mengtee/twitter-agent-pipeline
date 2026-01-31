import { Command } from "commander";
import { loadConfig, loadSearches, loadPersona } from "./config.js";
import { scrapeAll } from "./scraper/grok-scraper.js";
import {
  loadSeenUrls,
  saveSeenUrls,
  deduplicateTweets,
  saveScrapeResults,
} from "./scraper/store.js";

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

    console.log(`\n--- Results ---`);
    console.log(`Total found: ${allTweets.length}`);
    console.log(`New (deduplicated): ${newTweets.length}`);
    console.log(`Tokens used: ${totalTokens.input} in / ${totalTokens.output} out`);
    console.log(`Saved to: ${filepath}`);

    // Preview first few tweets
    console.log(`\nTop tweets:`);
    for (const t of newTweets.slice(0, 5)) {
      console.log(`\n  @${t.handle} — ${t.views} views, ${t.likes} likes`);
      console.log(`  "${t.text.slice(0, 120)}${t.text.length > 120 ? "..." : ""}"`);
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
  .action(async () => {
    const persona = loadPersona();
    console.log(`Loaded persona: ${persona.name}`);
    console.log(`  Voice: ${persona.voice.tone}`);
    console.log(`  Rules: ${persona.rules.length}`);
    console.log("\n[rewriter not yet implemented — Stage 4]");
  });

// --- review ---
program
  .command("review")
  .description("Review generated tweets side-by-side with originals")
  .action(async () => {
    console.log("[review not yet implemented — Stage 5]");
  });

// --- approve ---
program
  .command("approve <id>")
  .description("Mark a generated tweet as approved for posting")
  .action(async (id: string) => {
    console.log(`[approve not yet implemented — Stage 5] id=${id}`);
  });

// --- list ---
program
  .command("list")
  .description("Show all tweets in the queue with their status")
  .action(async () => {
    console.log("[list not yet implemented — Stage 5]");
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
  .action(async () => {
    console.log("Running full pipeline...\n");
    console.log("[pipeline not yet implemented — Stages 2-5]");
  });

program.parse();
