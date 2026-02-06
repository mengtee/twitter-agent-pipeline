import { NextResponse } from "next/server";
import { loadSearches, saveSearch } from "@pipeline/config.js";
import { SearchConfigSchema } from "@pipeline/types.js";

export async function GET() {
  try {
    const searches = await loadSearches();
    return NextResponse.json({ searches });
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

    const existing = await loadSearches();

    // Check for duplicate name
    if (existing.some((s) => s.name === newSearch.name)) {
      return NextResponse.json(
        { error: `Search with name "${newSearch.name}" already exists` },
        { status: 409 }
      );
    }

    await saveSearch(newSearch);

    return NextResponse.json({ success: true, search: newSearch });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add search" },
      { status: 400 }
    );
  }
}
