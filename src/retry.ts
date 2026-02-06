import { AxiosError } from "axios";

export const MAX_RETRIES = 3;
export const INITIAL_RETRY_DELAY_MS = 2000;

const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ECONNREFUSED",
]);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof AxiosError) {
    if (err.code && RETRYABLE_CODES.has(err.code)) return true;
    if (err.response?.status && err.response.status >= 500) return true;
    if (err.response?.status === 429) return true;
  }
  return false;
}

export function getRetryDelay(err: unknown, attempt: number): number {
  // Check for Retry-After header on 429 responses
  if (err instanceof AxiosError && err.response?.status === 429) {
    const retryAfter = err.response.headers?.["retry-after"];
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }
      // Try parsing as HTTP-date
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        const delayMs = date.getTime() - Date.now();
        if (delayMs > 0) return delayMs;
      }
    }
  }
  // Default: exponential backoff
  return INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
}
