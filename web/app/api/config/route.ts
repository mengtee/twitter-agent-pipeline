import { NextResponse } from "next/server";
import { loadConfig } from "@pipeline/config.js";

export async function GET() {
  try {
    const config = loadConfig();
    return NextResponse.json({
      valid: true,
      persona: config.persona.name,
      searchCount: config.searches.length,
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
