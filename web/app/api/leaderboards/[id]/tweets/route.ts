import { getLeaderboardTweets, loadLeaderboard } from "@pipeline/leaderboard/store.js";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/leaderboards/[id]/tweets - Get tweets from a leaderboard
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const leaderboard = loadLeaderboard(id);
    if (!leaderboard) {
      return Response.json({ error: "Leaderboard not found" }, { status: 404 });
    }

    const tweets = getLeaderboardTweets(id, limit);
    return Response.json({ tweets });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
