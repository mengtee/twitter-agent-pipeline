import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PROJECT_ROOT } from "../config.js";
import { SessionSchema } from "../types.js";
import type { Session, SessionStage } from "../types.js";

const DATA_DIR = resolve(PROJECT_ROOT, "data");
const SESSIONS_DIR = resolve(DATA_DIR, "sessions");

function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

export interface SessionSummary {
  id: string;
  name: string;
  stage: SessionStage;
  tweetCount: number;
  updatedAt: string;
}

export function createSession(name: string, searchNames: string[]): Session {
  ensureSessionsDir();
  const now = new Date().toISOString();
  const session: Session = {
    id: randomUUID().slice(0, 8),
    name,
    stage: "created",
    searchNames,
    scrapedTweets: [],
    selectedTweetIds: [],
    userPrompt: "",
    samples: [],
    createdAt: now,
    updatedAt: now,
  };
  saveSession(session);
  return session;
}

export function loadSession(id: string): Session {
  ensureSessionsDir();
  const file = resolve(SESSIONS_DIR, `${id}.json`);
  if (!existsSync(file)) {
    throw new Error(`Session not found: ${id}`);
  }
  const raw = readFileSync(file, "utf-8");
  return SessionSchema.parse(JSON.parse(raw));
}

export function saveSession(session: Session): void {
  ensureSessionsDir();
  session.updatedAt = new Date().toISOString();
  const file = resolve(SESSIONS_DIR, `${session.id}.json`);
  writeFileSync(file, JSON.stringify(session, null, 2));
}

export function listSessions(): SessionSummary[] {
  ensureSessionsDir();
  const files = readdirSync(SESSIONS_DIR).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_")
  );

  const sessions: SessionSummary[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(resolve(SESSIONS_DIR, file), "utf-8");
      const data = SessionSchema.parse(JSON.parse(raw));
      sessions.push({
        id: data.id,
        name: data.name,
        stage: data.stage,
        tweetCount: data.scrapedTweets.length,
        updatedAt: data.updatedAt,
      });
    } catch {
      // skip invalid files
    }
  }

  return sessions.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function deleteSession(id: string): boolean {
  ensureSessionsDir();
  const file = resolve(SESSIONS_DIR, `${id}.json`);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}
