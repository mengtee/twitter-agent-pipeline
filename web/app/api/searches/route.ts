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

export async function GET() {
  try {
    const data = loadSearchesFile();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load searches" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newSearch = SearchConfigSchema.parse(body);

    const data = loadSearchesFile();

    // Check for duplicate name
    if (data.searches.some((s) => s.name === newSearch.name)) {
      return NextResponse.json(
        { error: `Search with name "${newSearch.name}" already exists` },
        { status: 409 }
      );
    }

    data.searches.push(newSearch);
    saveSearchesFile(data);

    return NextResponse.json({ success: true, search: newSearch });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add search" },
      { status: 400 }
    );
  }
}
