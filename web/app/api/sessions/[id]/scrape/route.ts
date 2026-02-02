import { loadConfig, loadSearches } from "@pipeline/config.js";
import { scrapeSearch } from "@pipeline/scraper/grok-scraper.js";
import { loadSession, saveSession } from "@pipeline/session/store.js";
import type { ScrapedTweet } from "@pipeline/types.js";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    const { id } = await params;
    session = loadSession(id);
  } catch {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  // Allow re-scraping from any stage (user can go back to re-scrape)

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const config = loadConfig();
        const allSearches = loadSearches();
        const searches = allSearches.filter((s) =>
          session.searchNames.includes(s.name)
        );

        if (searches.length === 0) {
          send("error", { message: "No matching searches found" });
          controller.close();
          return;
        }

        send("started", {
          total: searches.length,
          names: searches.map((s) => s.name),
        });

        const allTweets: ScrapedTweet[] = [];
        const totalTokens = { input: 0, output: 0 };

        for (let i = 0; i < searches.length; i++) {
          const search = searches[i];
          send("progress", {
            current: i + 1,
            total: searches.length,
            search: search.name,
          });

          try {
            const result = await scrapeSearch(config.xaiApiKey, search);
            allTweets.push(...result.tweets);
            totalTokens.input += result.tokensUsed.input;
            totalTokens.output += result.tokensUsed.output;

            send("search-complete", {
              search: search.name,
              found: result.tweets.length,
              tokens: result.tokensUsed,
            });
          } catch (err) {
            send("search-error", {
              search: search.name,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Save scraped tweets into the session (re-load to get latest state)
        const latest = loadSession(session.id);
        latest.scrapedTweets = allTweets;
        latest.scrapeTokens = totalTokens;
        latest.selectedTweetIds = [];
        latest.samples = [];
        latest.chosenSampleId = undefined;
        latest.finalText = undefined;
        latest.stage = "scraped";
        saveSession(latest);

        send("complete", {
          totalFound: allTweets.length,
          totalTokens,
        });
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
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
