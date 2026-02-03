import { loadConfig } from "@pipeline/config.js";
import { analyzeTweets } from "@pipeline/session/analyzer.js";
import { loadSession, saveSession } from "@pipeline/session/store.js";

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

  if (session.scrapedTweets.length === 0) {
    return Response.json(
      { error: "No tweets to analyze" },
      { status: 400 }
    );
  }

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

        send("started", {
          tweetCount: session.scrapedTweets.length,
          searchNames: session.searchNames,
        });

        send("analyzing", {
          message: "Identifying trends and generating content ideas...",
        });

        const result = await analyzeTweets(
          config.openrouterApiKey,
          session.searchNames,
          session.scrapedTweets
        );

        // Save analysis into the session (re-load to get latest state)
        const latest = loadSession(session.id);
        latest.analysis = result.analysis;
        latest.analyzeTokens = result.tokensUsed;
        latest.stage = "analyzed";
        saveSession(latest);

        send("complete", {
          analysis: result.analysis,
          tokensUsed: result.tokensUsed,
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
