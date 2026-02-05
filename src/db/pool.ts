import { Pool } from "pg";
import "dotenv/config";

/**
 * PostgreSQL connection pool with singleton pattern.
 * Prevents multiple pool instances during hot-reload in development.
 */

const globalForPg = globalThis as unknown as {
  pool: Pool | undefined;
};

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

// Handle pool errors to prevent silent failures
pool.on("error", (err) => {
  console.error("Database pool error:", err.message);
});

if (process.env.NODE_ENV !== "production") {
  globalForPg.pool = pool;
}

/**
 * Check if database is configured.
 */
export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}
