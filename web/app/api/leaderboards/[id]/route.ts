import {
  loadLeaderboard,
  deleteLeaderboard,
  updateLeaderboardSettings,
  updateLeaderboardSources,
} from "@pipeline/leaderboard/store.js";
import { LeaderboardSourceSchema } from "@pipeline/types.js";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/leaderboards/[id] - Get leaderboard details
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const leaderboard = loadLeaderboard(id);

    if (!leaderboard) {
      return Response.json({ error: "Leaderboard not found" }, { status: 404 });
    }

    return Response.json({ leaderboard });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// PATCH /api/leaderboards/[id] - Update leaderboard
const UpdateLeaderboardSchema = z.object({
  name: z.string().min(1).optional(),
  sources: z.array(LeaderboardSourceSchema).min(1).optional(),
  maxTweetsPerSource: z.number().min(5).max(50).optional(),
  minViews: z.number().optional(),
  minLikes: z.number().optional(),
  timeWindow: z.enum(["1h", "12h", "24h", "7d", "14d", "30d"]).optional(),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateLeaderboardSchema.parse(body);

    let leaderboard = loadLeaderboard(id);
    if (!leaderboard) {
      return Response.json({ error: "Leaderboard not found" }, { status: 404 });
    }

    // Update sources separately if provided
    if (parsed.sources) {
      leaderboard = updateLeaderboardSources(id, parsed.sources);
    }

    // Update other settings
    const { sources: _, ...settings } = parsed;
    if (Object.keys(settings).length > 0) {
      leaderboard = updateLeaderboardSettings(id, settings);
    }

    return Response.json({ leaderboard });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

// DELETE /api/leaderboards/[id] - Delete leaderboard
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = deleteLeaderboard(id);

    if (!deleted) {
      return Response.json({ error: "Leaderboard not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
