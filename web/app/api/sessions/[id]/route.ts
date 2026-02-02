import {
  loadSession,
  saveSession,
  deleteSession,
} from "@pipeline/session/store.js";
import type { SessionStage } from "@pipeline/types.js";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = loadSession(id);
    return Response.json(session);
  } catch {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = loadSession(id);
    const body = await request.json();

    if (body.selectedTweetIds !== undefined) {
      session.selectedTweetIds = body.selectedTweetIds;
    }
    if (body.userPrompt !== undefined) {
      session.userPrompt = body.userPrompt;
    }
    if (body.personaSlug !== undefined) {
      session.personaSlug = body.personaSlug;
    }
    if (body.chosenSampleId !== undefined) {
      session.chosenSampleId = body.chosenSampleId;
    }
    if (body.finalText !== undefined) {
      session.finalText = body.finalText;
    }
    if (body.stage !== undefined) {
      session.stage = body.stage as SessionStage;
    }

    saveSession(session);
    return Response.json(session);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      return Response.json({ error: msg }, { status: 404 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = deleteSession(id);
  if (!deleted) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
