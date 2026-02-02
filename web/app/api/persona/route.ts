import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PersonaConfigSchema } from "@pipeline/types.js";

function getPersonaPath(): string {
  const root = process.env.PIPELINE_ROOT ?? process.cwd();
  return resolve(root, "config/persona.json");
}

export async function GET() {
  try {
    const raw = readFileSync(getPersonaPath(), "utf-8");
    const persona = PersonaConfigSchema.parse(JSON.parse(raw));
    return NextResponse.json(persona);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load persona" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const persona = PersonaConfigSchema.parse(body);
    writeFileSync(getPersonaPath(), JSON.stringify(persona, null, 2));
    return NextResponse.json({ success: true, persona });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save persona" },
      { status: 400 }
    );
  }
}
