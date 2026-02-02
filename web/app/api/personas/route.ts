import { NextResponse } from "next/server";
import {
  listPersonas,
  getDefaultPersonaSlug,
  savePersona,
  personaSlug,
  loadPersonaBySlug,
} from "@pipeline/config.js";
import { PersonaConfigSchema } from "@pipeline/types.js";

export async function GET() {
  try {
    const personas = listPersonas();
    const defaultSlug = getDefaultPersonaSlug();
    return NextResponse.json({
      personas: personas.map((p) => ({
        ...p,
        isDefault: p.slug === defaultSlug,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list personas" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const persona = PersonaConfigSchema.parse(body);

    // Check for duplicate slug
    const slug = personaSlug(persona.name);
    const existing = listPersonas();
    if (existing.some((p) => p.slug === slug)) {
      return NextResponse.json(
        { error: `Persona "${persona.name}" already exists` },
        { status: 409 }
      );
    }

    const savedSlug = savePersona(persona);
    return NextResponse.json({ success: true, slug: savedSlug });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create persona" },
      { status: 400 }
    );
  }
}
