/**
 * One-time migration script to move personas and searches from JSON files to PostgreSQL.
 *
 * Usage: npx tsx src/db/migrate-config.ts
 *
 * This migrates:
 *   - config/personas/*.json → personas table
 *   - config/searches.json → searches table
 *   - config/personas/_default.txt → is_default flag on persona row
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { config as dotenvConfig } from "dotenv";
import { initSchema } from "./schema.js";
import { query } from "./query.js";
import { pool } from "./pool.js";

dotenvConfig();

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const PERSONAS_DIR = resolve(PROJECT_ROOT, "config/personas");
const DEFAULT_PERSONA_FILE = resolve(PERSONAS_DIR, "_default.txt");
const SEARCHES_FILE = resolve(PROJECT_ROOT, "config/searches.json");

async function migratePersonas(): Promise<number> {
  if (!existsSync(PERSONAS_DIR)) {
    console.log("  No personas directory found, skipping...");
    return 0;
  }

  const files = readdirSync(PERSONAS_DIR).filter((f) => f.endsWith(".json"));
  console.log(`  Found ${files.length} persona files`);

  // Read default persona slug
  let defaultSlug: string | null = null;
  if (existsSync(DEFAULT_PERSONA_FILE)) {
    defaultSlug = readFileSync(DEFAULT_PERSONA_FILE, "utf-8").trim() || null;
    console.log(`  Default persona slug: ${defaultSlug}`);
  }

  let migrated = 0;
  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    const filepath = resolve(PERSONAS_DIR, file);

    try {
      const raw = readFileSync(filepath, "utf-8");
      const config = JSON.parse(raw);
      const name = config.name || slug;
      const isDefault = slug === defaultSlug;

      await query(
        `INSERT INTO personas (slug, name, config, is_default)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           config = EXCLUDED.config,
           is_default = EXCLUDED.is_default,
           updated_at = NOW()`,
        [slug, name, JSON.stringify(config), isDefault]
      );

      migrated++;
      console.log(`    Migrated persona: ${slug} (${name})${isDefault ? " [default]" : ""}`);
    } catch (err) {
      console.error(`    Failed to migrate persona ${file}:`, err);
    }
  }

  return migrated;
}

async function migrateSearches(): Promise<number> {
  if (!existsSync(SEARCHES_FILE)) {
    console.log("  No searches.json file found, skipping...");
    return 0;
  }

  try {
    const raw = readFileSync(SEARCHES_FILE, "utf-8");
    const data = JSON.parse(raw);
    const searches = data.searches || [];
    console.log(`  Found ${searches.length} searches`);

    let migrated = 0;
    for (const search of searches) {
      await query(
        `INSERT INTO searches (name, prompt, time_window, min_views, min_likes, max_results)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO UPDATE SET
           prompt = EXCLUDED.prompt,
           time_window = EXCLUDED.time_window,
           min_views = EXCLUDED.min_views,
           min_likes = EXCLUDED.min_likes,
           max_results = EXCLUDED.max_results,
           updated_at = NOW()`,
        [
          search.name,
          search.prompt,
          search.timeWindow || "24h",
          search.minViews ?? null,
          search.minLikes ?? null,
          search.maxResults ?? 20,
        ]
      );

      migrated++;
      console.log(`    Migrated search: ${search.name}`);
    }

    return migrated;
  } catch (err) {
    console.error("  Failed to migrate searches:", err);
    return 0;
  }
}

async function main(): Promise<void> {
  console.log("=== Config Migration Script ===\n");
  console.log("Migrating personas and searches from JSON files to PostgreSQL.\n");

  // Initialize schema (creates tables if they don't exist)
  console.log("1. Ensuring database schema...");
  await initSchema();
  console.log("   Schema ready.\n");

  // Migrate personas
  console.log("2. Migrating personas...");
  const personaCount = await migratePersonas();
  console.log(`   Migrated ${personaCount} personas.\n`);

  // Migrate searches
  console.log("3. Migrating searches...");
  const searchCount = await migrateSearches();
  console.log(`   Migrated ${searchCount} searches.\n`);

  console.log("=== Migration Complete ===");
  console.log(`Personas: ${personaCount}`);
  console.log(`Searches: ${searchCount}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
