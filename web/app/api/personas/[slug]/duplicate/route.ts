import { NextResponse } from "next/server";
import {
  loadPersonaBySlug,
  savePersona,
  listPersonas,
  personaSlug,
} from "@pipeline/config.js";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const original = loadPersonaBySlug(slug);

    // Find a unique name
    let copyName = `${original.name} (Copy)`;
    let copySlug = personaSlug(copyName);
    const existing = new Set(listPersonas().map((p) => p.slug));
    let counter = 2;
    while (existing.has(copySlug)) {
      copyName = `${original.name} (Copy ${counter})`;
      copySlug = personaSlug(copyName);
      counter++;
    }

    const savedSlug = savePersona({ ...original, name: copyName });
    return NextResponse.json({ success: true, slug: savedSlug, name: copyName });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to duplicate persona" },
      { status: 500 }
    );
  }
}
