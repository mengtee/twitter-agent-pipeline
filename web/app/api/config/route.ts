import { NextResponse } from "next/server";
import { loadConfig, loadSearches, loadDefaultPersona } from "@pipeline/config.js";

export async function GET() {
  try {
    const config = loadConfig();
    const searches = await loadSearches();
    let personaName = "(none)";
    try {
      const persona = await loadDefaultPersona();
      personaName = persona.name;
    } catch {
      // No personas configured yet
    }

    return NextResponse.json({
      valid: true,
      persona: personaName,
      searchCount: searches.length,
      apiKeys: {
        xai: !!config.xaiApiKey,
        openrouter: !!config.openrouterApiKey,
      },
    });
  } catch (err) {
    return NextResponse.json({
      valid: false,
      error: err instanceof Error ? err.message : "Config error",
    });
  }
}
