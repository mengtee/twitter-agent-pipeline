import axios, { AxiosError } from "axios";
import { randomUUID } from "node:crypto";
import type { PersonaConfig, ScrapedTweet, SessionSample } from "../types.js";
import {
  buildSessionSystemPrompt,
  buildSessionUserPrompt,
  type ContentBlock,
} from "../processor/prompt-builder.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof AxiosError) {
    if (err.response?.status && err.response.status >= 500) return true;
    if (err.response?.status === 429) return true;
    if (err.code && ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EPIPE"].includes(err.code)) return true;
  }
  return false;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface GenerateSamplesResult {
  samples: SessionSample[];
  tokensUsed: { input: number; output: number };
}

/**
 * Parse the LLM response text into sample objects.
 */
export function parseSamplesResponse(
  text: string
): Array<Omit<SessionSample, "id">> {
  let cleaned = text.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        text: String(item.text ?? item.rewritten ?? ""),
        confidence: Number(item.confidence ?? 5),
        hashtags: Array.isArray(item.hashtags)
          ? item.hashtags.map(String)
          : [],
        ...(item.imageSuggestion
          ? { imageSuggestion: String(item.imageSuggestion) }
          : {}),
      }));
    }

    // Single object returned instead of array
    if (parsed.text || parsed.rewritten) {
      return [
        {
          text: String(parsed.text ?? parsed.rewritten ?? ""),
          confidence: Number(parsed.confidence ?? 5),
          hashtags: Array.isArray(parsed.hashtags)
            ? parsed.hashtags.map(String)
            : [],
          ...(parsed.imageSuggestion
            ? { imageSuggestion: String(parsed.imageSuggestion) }
            : {}),
        },
      ];
    }

    return [{ text: cleaned, confidence: 5, hashtags: [] }];
  } catch {
    // Not valid JSON — treat as plain text
    return [{ text: cleaned, confidence: 5, hashtags: [] }];
  }
}

/**
 * Strip image_url blocks from content, keeping only text blocks.
 * Used as a fallback when multimodal requests fail.
 */
function stripImages(content: ContentBlock[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * Generate tweet samples from selected source tweets + user prompt.
 */
export async function generateSamples(
  apiKey: string,
  persona: PersonaConfig,
  tweets: ScrapedTweet[],
  userPrompt: string,
  model: string = DEFAULT_MODEL
): Promise<GenerateSamplesResult> {
  const systemPrompt = buildSessionSystemPrompt(persona);
  const userContent = buildSessionUserPrompt(tweets, userPrompt);

  // Check if content has images
  const hasImages = userContent.some((block) => block.type === "image_url");

  // Try with images first, fall back to text-only if it fails
  let response;
  let lastError: Error | null = null;
  let useImages = hasImages;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const userMessage = useImages
        ? { role: "user" as const, content: userContent }
        : { role: "user" as const, content: stripImages(userContent) };

      console.log(
        `[Generator] Attempt ${attempt}/${MAX_RETRIES} (images: ${useImages}, model: ${model})`
      );

      response = await axios.post<OpenRouterResponse>(
        OPENROUTER_URL,
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            userMessage,
          ],
          temperature: 0.9,
          max_tokens: 1500,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/twitter-agent-pipeline",
            "X-Title": "Tweet Pipeline",
          },
          timeout: 60_000,
        }
      );
      break; // Success
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof AxiosError) {
        const status = err.response?.status;
        const errorBody = err.response?.data;

        console.error(`[Generator] OpenRouter error (attempt ${attempt}/${MAX_RETRIES}):`);
        console.error(`  Status: ${status ?? "N/A"}`);
        console.error(`  Body: ${JSON.stringify(errorBody ?? {})}`);
        console.error(`  Code: ${err.code ?? "N/A"}`);

        // If 400 and we have images, retry without images (likely image URL issue)
        if (status === 400 && useImages) {
          console.log("[Generator] Got 400 with images — retrying without images...");
          useImages = false;
          continue;
        }

        // Retryable errors (500s, 429, network)
        if (isRetryableError(err) && attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(`[Generator] Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        // Non-retryable — throw with detail
        const detail = errorBody
          ? JSON.stringify(errorBody)
          : err.message;
        throw new Error(`OpenRouter API ${status ?? "error"}: ${detail}`);
      }

      throw err;
    }
  }

  if (!response) {
    throw lastError ?? new Error("OpenRouter request failed after retries");
  }

  const content = response.data.choices?.[0]?.message?.content ?? "";
  const parsed = parseSamplesResponse(content);

  const samples: SessionSample[] = parsed.map((s) => ({
    id: randomUUID().slice(0, 8),
    ...s,
  }));

  const tokensUsed = {
    input: response.data.usage?.prompt_tokens ?? 0,
    output: response.data.usage?.completion_tokens ?? 0,
  };

  return { samples, tokensUsed };
}

export { DEFAULT_MODEL };
