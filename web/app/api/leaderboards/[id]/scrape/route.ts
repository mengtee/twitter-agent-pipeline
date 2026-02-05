import { loadConfig } from "@pipeline/config.js";
import {
  loadLeaderboard,
  markScrapingStarted,
  completeScraping,
  failScraping,
} from "@pipeline/leaderboard/store.js";
import {
  scrapeLeaderboard,
  type LeaderboardScrapeProgress,
} from "@pipeline/leaderboard/scraper.js";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/leaderboards/[id]/scrape - Scrape a leaderboard (SSE)
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const leaderboard = await loadLeaderboard(id);

  if (!leaderboard) {
    return Response.json({ error: "Leaderboard not found" }, { status: 404 });
  }

  if (leaderboard.sources.length === 0) {
    return Response.json({ error: "No sources configured" }, { status: 400 });
  }

  let appConfig;
  try {
    appConfig = loadConfig();
  } catch {
    return Response.json(
      { error: "Config not loaded - check API keys" },
      { status: 500 }
    );
  }

  if (!appConfig.xaiApiKey) {
    return Response.json(
      { error: "XAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  await markScrapingStarted(id);

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        if (!cancelled) {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        }
      };

      try {
        send("started", {
          leaderboardId: id,
          name: leaderboard.name,
          total: leaderboard.sources.length,
          sources: leaderboard.sources.map((s) => ({
            type: s.type,
            value: s.value,
          })),
        });

        const onProgress = (progress: LeaderboardScrapeProgress) => {
          send(progress.type, {
            source: {
              type: progress.source.type,
              value: progress.source.value,
            },
            message: progress.message,
            tweetsFound: progress.tweetsFound,
            tokensUsed: progress.tokensUsed,
          });
        };

        const result = await scrapeLeaderboard(
          appConfig.xaiApiKey,
          leaderboard,
          onProgress
        );

        // Complete the scrape
        await completeScraping(id, result.tweets, result.tokensUsed);

        send("complete", {
          leaderboardId: id,
          totalTweets: result.tweets.length,
          tokensUsed: result.tokensUsed,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await failScraping(id, errorMsg);
        send("error", { leaderboardId: id, message: errorMsg });
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Stream was cancelled (user navigated away, connection dropped, etc.)
      cancelled = true;
      console.log(`[Scrape] Stream cancelled for leaderboard ${id}, resetting state...`);
      failScraping(id, "Scrape cancelled (connection lost)").catch(console.error);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
