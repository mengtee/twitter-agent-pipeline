import { NextResponse } from "next/server";
import { loadDefaultPersona, savePersona } from "@pipeline/config.js";
import { PersonaConfigSchema } from "@pipeline/types.js";

export async function GET() {
  try {
    const persona = await loadDefaultPersona();
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
    await savePersona(persona);
    return NextResponse.json({ success: true, persona });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save persona" },
      { status: 400 }
    );
  }
}
