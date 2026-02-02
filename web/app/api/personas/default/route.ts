import { NextResponse } from "next/server";
import { getDefaultPersonaSlug, setDefaultPersonaSlug } from "@pipeline/config.js";

export async function GET() {
  try {
    const slug = getDefaultPersonaSlug();
    return NextResponse.json({ slug });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get default" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { slug } = body as { slug: string };
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }
    setDefaultPersonaSlug(slug);
    return NextResponse.json({ success: true, slug });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to set default" },
      { status: 500 }
    );
  }
}
