import { config as dotenvConfig } from "dotenv";
import { readFileSync, existsSync } from "node:fs";
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

export { PROJECT_ROOT };
