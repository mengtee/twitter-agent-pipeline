import { query } from "../src/db/query.js";

async function resetScrapingState() {
  console.log("Checking leaderboards state...");

  const leaderboards = await query<{id: string, name: string, is_scraping_now: boolean, last_error: string | null}>(
    "SELECT id, name, is_scraping_now, last_error FROM leaderboards"
  );

  console.log("Current state:");
  for (const lb of leaderboards) {
    console.log(`  - ${lb.name} (${lb.id}): is_scraping_now=${lb.is_scraping_now}, last_error=${lb.last_error?.slice(0, 50) || "none"}`);
  }

  // Reset any stuck scraping flags
  await query("UPDATE leaderboards SET is_scraping_now = false WHERE is_scraping_now = true");
  console.log("\nReset is_scraping_now flags to false");

  process.exit(0);
}

resetScrapingState().catch(console.error);
