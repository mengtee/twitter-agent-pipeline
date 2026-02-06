import { NextResponse } from "next/server";
import { saveSearch, deleteSearch } from "@pipeline/config.js";
import { SearchConfigSchema } from "@pipeline/types.js";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await request.json();
    const updated = SearchConfigSchema.parse(body);

    // If name changed, delete old and insert new
    if (updated.name !== name) {
      await deleteSearch(name);
    }
    await saveSearch(updated);

    return NextResponse.json({ success: true, search: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update search" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const deleted = await deleteSearch(name);

    if (!deleted) {
      return NextResponse.json({ error: "Search not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete search" },
      { status: 500 }
    );
  }
}
