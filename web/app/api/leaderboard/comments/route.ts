import { loadConfig, loadPersonaBySlug } from "@pipeline/config.js";
import { findTweetById } from "@pipeline/leaderboard/store.js";
import { generateCommentSuggestions } from "@pipeline/leaderboard/comment-generator.js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tweetId, personaSlug } = body as {
      tweetId: string;
      personaSlug?: string;
    };

    if (!tweetId) {
      return Response.json(
        { error: "tweetId is required" },
        { status: 400 }
      );
    }

    // Load config
    const config = loadConfig();
    if (!config.openrouterApiKey) {
      return Response.json(
        { error: "OPENROUTER_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Find the tweet across all leaderboards
    const tweet = await findTweetById(tweetId);
    if (!tweet) {
      return Response.json(
        { error: "Tweet not found in any leaderboard" },
        { status: 404 }
      );
    }

    // Optionally load persona
    const persona = personaSlug ? await loadPersonaBySlug(personaSlug) : undefined;

    // Generate suggestions
    const result = await generateCommentSuggestions(
      config.openrouterApiKey,
      tweet,
      persona ?? undefined
    );

    return Response.json({
      suggestions: result.suggestions,
      tokensUsed: result.tokensUsed,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
