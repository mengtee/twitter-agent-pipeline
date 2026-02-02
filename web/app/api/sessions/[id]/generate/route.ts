import { loadConfig, loadPersonaBySlug, loadDefaultPersona } from "@pipeline/config.js";
import { generateSamples } from "@pipeline/session/generator.js";
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

  if (session.selectedTweetIds.length === 0) {
    return Response.json(
      { error: "No tweets selected" },
      { status: 400 }
    );
  }

  if (!session.userPrompt.trim()) {
    return Response.json(
      { error: "No prompt provided" },
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
        const persona = session.personaSlug
          ? loadPersonaBySlug(session.personaSlug)
          : loadDefaultPersona();

        const selectedTweets = session.scrapedTweets.filter((t) =>
          session.selectedTweetIds.includes(t.id)
        );

        if (selectedTweets.length === 0) {
          send("error", { message: "Selected tweets not found in session" });
          controller.close();
          return;
        }

        send("started", {
          tweetCount: selectedTweets.length,
          persona: persona.name,
        });

        send("generating", {
          message: "Generating 3 sample variations...",
        });

        const result = await generateSamples(
          config.openrouterApiKey,
          persona,
          selectedTweets,
          session.userPrompt
        );

        // Save samples into the session
        session.samples = result.samples;
        session.generateTokens = result.tokensUsed;
        session.stage = "generated";
        saveSession(session);

        send("complete", {
          samples: result.samples,
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
