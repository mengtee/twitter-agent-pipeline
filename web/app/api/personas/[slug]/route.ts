import { NextResponse } from "next/server";
import {
  loadPersonaBySlug,
  savePersona,
  deletePersona,
  personaSlug,
  getDefaultPersonaSlug,
  setDefaultPersonaSlug,
} from "@pipeline/config.js";
import { PersonaConfigSchema } from "@pipeline/types.js";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const persona = await loadPersonaBySlug(slug);
    return NextResponse.json(persona);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Persona not found" },
      { status: 404 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const persona = PersonaConfigSchema.parse(body);

    // If the name changed, the slug changes too — delete old row
    const newSlug = personaSlug(persona.name);
    if (newSlug !== slug) {
      await deletePersona(slug);
      // Update default if it pointed to the old slug
      if ((await getDefaultPersonaSlug()) === slug) {
        await setDefaultPersonaSlug(newSlug);
      }
    }

    const savedSlug = await savePersona(persona);
    return NextResponse.json({ success: true, slug: savedSlug });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update persona" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const deleted = await deletePersona(slug);
    if (!deleted) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }
    // Clear default if it was this persona
    if ((await getDefaultPersonaSlug()) === slug) {
      await setDefaultPersonaSlug("");
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete persona" },
      { status: 500 }
    );
  }
}
