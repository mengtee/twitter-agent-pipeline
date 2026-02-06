import { config as dotenvConfig } from "dotenv";
import { resolve } from "node:path";
import { query, queryOne } from "./db/query.js";
import {
  PersonaConfigSchema,
  type SearchConfig,
  type PersonaConfig,
} from "./types.js";

// Load .env for CLI usage (no-op if already loaded or in Next.js)
if (typeof import.meta.dirname === "string") {
  dotenvConfig({ path: resolve(import.meta.dirname, "../.env") });
}

export interface AppConfig {
  xaiApiKey: string;
  openrouterApiKey: string;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. See .env.example`
    );
  }
  return value;
}

/**
 * Load API keys from environment variables.
 * No longer loads searches/persona — use dedicated functions instead.
 */
export function loadConfig(): AppConfig {
  return {
    xaiApiKey: requireEnv("XAI_API_KEY"),
    openrouterApiKey: requireEnv("OPENROUTER_API_KEY"),
  };
}

// --- Searches (PostgreSQL) ---

interface DbSearch {
  name: string;
  prompt: string;
  time_window: string;
  min_views: number | null;
  min_likes: number | null;
  max_results: number;
}

export async function loadSearches(): Promise<SearchConfig[]> {
  const rows = await query<DbSearch>(`SELECT * FROM searches ORDER BY name`);
  return rows.map((r) => ({
    name: r.name,
    prompt: r.prompt,
    timeWindow: r.time_window as SearchConfig["timeWindow"],
    minViews: r.min_views ?? undefined,
    minLikes: r.min_likes ?? undefined,
    maxResults: r.max_results,
  }));
}

export async function saveSearch(search: SearchConfig): Promise<void> {
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
    [search.name, search.prompt, search.timeWindow, search.minViews ?? null, search.minLikes ?? null, search.maxResults]
  );
}

export async function deleteSearch(name: string): Promise<boolean> {
  const rows = await query(
    `DELETE FROM searches WHERE name = $1 RETURNING name`,
    [name]
  );
  return rows.length > 0;
}

// --- Personas (PostgreSQL) ---

interface DbPersona {
  slug: string;
  name: string;
  config: PersonaConfig;
  is_default: boolean;
}

export function personaSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function listPersonas(): Promise<Array<{ slug: string; name: string }>> {
  const rows = await query<DbPersona>(
    `SELECT slug, name FROM personas ORDER BY name`
  );
  return rows.map((r) => ({ slug: r.slug, name: r.name }));
}

export async function loadPersonaBySlug(slug: string): Promise<PersonaConfig> {
  const row = await queryOne<DbPersona>(
    `SELECT config FROM personas WHERE slug = $1`,
    [slug]
  );
  if (!row) {
    throw new Error(`Persona not found: ${slug}`);
  }
  return PersonaConfigSchema.parse(row.config);
}

export async function savePersona(persona: PersonaConfig): Promise<string> {
  const validated = PersonaConfigSchema.parse(persona);
  const slug = personaSlug(validated.name);
  await query(
    `INSERT INTO personas (slug, name, config)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       config = EXCLUDED.config,
       updated_at = NOW()`,
    [slug, validated.name, JSON.stringify(validated)]
  );
  return slug;
}

export async function deletePersona(slug: string): Promise<boolean> {
  const rows = await query(
    `DELETE FROM personas WHERE slug = $1 RETURNING slug`,
    [slug]
  );
  return rows.length > 0;
}

export async function getDefaultPersonaSlug(): Promise<string | null> {
  const row = await queryOne<DbPersona>(
    `SELECT slug FROM personas WHERE is_default = TRUE LIMIT 1`
  );
  return row?.slug ?? null;
}

export async function setDefaultPersonaSlug(slug: string): Promise<void> {
  // Clear all defaults, then set the new one
  await query(`UPDATE personas SET is_default = FALSE WHERE is_default = TRUE`);
  if (slug) {
    await query(
      `UPDATE personas SET is_default = TRUE WHERE slug = $1`,
      [slug]
    );
  }
}

export async function loadDefaultPersona(): Promise<PersonaConfig> {
  const slug = await getDefaultPersonaSlug();
  if (slug) {
    try {
      return await loadPersonaBySlug(slug);
    } catch {
      // Fall through
    }
  }
  // Return first persona if no default set
  const rows = await query<DbPersona>(
    `SELECT config FROM personas ORDER BY created_at LIMIT 1`
  );
  if (rows.length > 0) {
    return PersonaConfigSchema.parse(rows[0].config);
  }
  throw new Error("No personas configured. Create one first.");
}
