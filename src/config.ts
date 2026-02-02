import { config as dotenvConfig } from "dotenv";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  SearchesFileSchema,
  PersonaConfigSchema,
  type SearchConfig,
  type PersonaConfig,
} from "./types.js";

const PROJECT_ROOT = process.env.PIPELINE_ROOT
  ? resolve(process.env.PIPELINE_ROOT)
  : resolve(import.meta.dirname, "..");

dotenvConfig({ path: resolve(PROJECT_ROOT, ".env") });

export interface AppConfig {
  xaiApiKey: string;
  openrouterApiKey: string;
  searches: SearchConfig[];
  persona: PersonaConfig;
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

function loadJsonFile<T>(filePath: string, parser: { parse: (data: unknown) => T }): T {
  const fullPath = resolve(PROJECT_ROOT, filePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }
  const raw = readFileSync(fullPath, "utf-8");
  try {
    const data = JSON.parse(raw);
    return parser.parse(data);
  } catch (err) {
    throw new Error(
      `Invalid config in ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function loadConfig(): AppConfig {
  const xaiApiKey = requireEnv("XAI_API_KEY");
  const openrouterApiKey = requireEnv("OPENROUTER_API_KEY");

  const { searches } = loadJsonFile("config/searches.json", SearchesFileSchema);
  const persona = loadJsonFile("config/persona.json", PersonaConfigSchema);

  return { xaiApiKey, openrouterApiKey, searches, persona };
}

export function loadSearches(): SearchConfig[] {
  const { searches } = loadJsonFile("config/searches.json", SearchesFileSchema);
  return searches;
}

export function loadPersona(): PersonaConfig {
  return loadJsonFile("config/persona.json", PersonaConfigSchema);
}

// --- Multi-Persona Support ---

const PERSONAS_DIR = resolve(PROJECT_ROOT, "config/personas");
const DEFAULT_PERSONA_FILE = resolve(PERSONAS_DIR, "_default.txt");

function ensurePersonasDir(): void {
  if (!existsSync(PERSONAS_DIR)) {
    mkdirSync(PERSONAS_DIR, { recursive: true });
  }
}

export function personaSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function listPersonas(): Array<{ slug: string; name: string }> {
  ensurePersonasDir();
  const files = readdirSync(PERSONAS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const slug = f.replace(/\.json$/, "");
    const raw = readFileSync(resolve(PERSONAS_DIR, f), "utf-8");
    const persona = PersonaConfigSchema.parse(JSON.parse(raw));
    return { slug, name: persona.name };
  });
}

export function loadPersonaBySlug(slug: string): PersonaConfig {
  const filePath = resolve(PERSONAS_DIR, `${slug}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Persona not found: ${slug}`);
  }
  const raw = readFileSync(filePath, "utf-8");
  return PersonaConfigSchema.parse(JSON.parse(raw));
}

export function savePersona(persona: PersonaConfig): string {
  ensurePersonasDir();
  const validated = PersonaConfigSchema.parse(persona);
  const slug = personaSlug(validated.name);
  const filePath = resolve(PERSONAS_DIR, `${slug}.json`);
  writeFileSync(filePath, JSON.stringify(validated, null, 2));
  return slug;
}

export function deletePersona(slug: string): boolean {
  const filePath = resolve(PERSONAS_DIR, `${slug}.json`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

export function getDefaultPersonaSlug(): string | null {
  ensurePersonasDir();
  if (!existsSync(DEFAULT_PERSONA_FILE)) return null;
  return readFileSync(DEFAULT_PERSONA_FILE, "utf-8").trim() || null;
}

export function setDefaultPersonaSlug(slug: string): void {
  ensurePersonasDir();
  writeFileSync(DEFAULT_PERSONA_FILE, slug);
}

export function migratePersonaIfNeeded(): void {
  ensurePersonasDir();
  const existing = readdirSync(PERSONAS_DIR).filter((f) => f.endsWith(".json"));
  if (existing.length > 0) return;

  const legacyPath = resolve(PROJECT_ROOT, "config/persona.json");
  if (!existsSync(legacyPath)) return;

  try {
    const raw = readFileSync(legacyPath, "utf-8");
    const persona = PersonaConfigSchema.parse(JSON.parse(raw));
    const slug = savePersona(persona);
    setDefaultPersonaSlug(slug);
  } catch {
    // Legacy file invalid — skip migration
  }
}

export function loadDefaultPersona(): PersonaConfig {
  migratePersonaIfNeeded();
  const slug = getDefaultPersonaSlug();
  if (slug) {
    try {
      return loadPersonaBySlug(slug);
    } catch {
      // Fall through to legacy
    }
  }
  return loadJsonFile("config/persona.json", PersonaConfigSchema);
}

export { PROJECT_ROOT };
