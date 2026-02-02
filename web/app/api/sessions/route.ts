import {
  listSessions,
  createSession,
} from "@pipeline/session/store.js";

export async function GET() {
  const sessions = listSessions();
  return Response.json({ sessions });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, searchNames } = body as {
      name?: string;
      searchNames?: string[];
    };

    if (!name || !searchNames || searchNames.length === 0) {
      return Response.json(
        { error: "name and searchNames are required" },
        { status: 400 }
      );
    }

    const session = createSession(name, searchNames);
    return Response.json(session, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
