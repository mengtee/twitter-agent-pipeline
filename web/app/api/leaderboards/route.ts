import {
  listLeaderboards,
  createLeaderboard,
} from "@pipeline/leaderboard/store.js";
import { LeaderboardSourceSchema } from "@pipeline/types.js";
import { z } from "zod";

// GET /api/leaderboards - List all leaderboards
export async function GET() {
  try {
    const leaderboards = listLeaderboards();
    return Response.json({ leaderboards });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// POST /api/leaderboards - Create a new leaderboard
const CreateLeaderboardSchema = z.object({
  name: z.string().min(1),
  sources: z.array(LeaderboardSourceSchema).min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateLeaderboardSchema.parse(body);

    const leaderboard = createLeaderboard(parsed.name, parsed.sources);
    return Response.json({ leaderboard }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
