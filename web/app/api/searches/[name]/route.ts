import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SearchConfigSchema, SearchesFileSchema } from "@pipeline/types.js";

function getSearchesPath(): string {
  const root = process.env.PIPELINE_ROOT ?? process.cwd();
  return resolve(root, "config/searches.json");
}

function loadSearchesFile() {
  const raw = readFileSync(getSearchesPath(), "utf-8");
  return SearchesFileSchema.parse(JSON.parse(raw));
}

function saveSearchesFile(data: { searches: unknown[] }) {
  writeFileSync(getSearchesPath(), JSON.stringify(data, null, 2));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await request.json();
    const updated = SearchConfigSchema.parse(body);

    const data = loadSearchesFile();
    const index = data.searches.findIndex((s) => s.name === name);

    if (index === -1) {
      return NextResponse.json({ error: "Search not found" }, { status: 404 });
    }

    data.searches[index] = updated;
    saveSearchesFile(data);

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
    const data = loadSearchesFile();
    const before = data.searches.length;
    data.searches = data.searches.filter((s) => s.name !== name);

    if (data.searches.length === before) {
      return NextResponse.json({ error: "Search not found" }, { status: 404 });
    }

    saveSearchesFile(data);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete search" },
      { status: 500 }
    );
  }
}
