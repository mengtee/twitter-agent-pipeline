import axios from "axios";
import type { SearchConfig, ScrapedTweet } from "../types.js";
import { ScrapedTweetSchema } from "../types.js";
import { z } from "zod";

const GROK_API_URL = "https://api.x.ai/v1/responses";
const GROK_MODEL = "grok-3-fast";

/**
 * Builds the system prompt that instructs Grok to return structured JSON.
 */
function buildSystemPrompt(): string {
  return `You are a tweet research assistant. Your job is to search X (Twitter) and return results as structured JSON.

IMPORTANT: Return ONLY a valid JSON array. No markdown, no code fences, no explanation text.

Each object in the array must have exactly these fields:
{
  "id": "tweet status ID from the URL",
  "text": "full tweet text",
  "author": "display name",
  "handle": "@username",
  "likes": number,
  "retweets": number,
  "views": number,
  "replies": number,
  "url": "https://x.com/username/status/ID",
  "postedAt": "ISO 8601 timestamp or approximate time description"
}

Rules:
- Include the direct tweet URL for every tweet
- If exact engagement numbers aren't available, estimate from context (use 0 if unknown)
- Sort by engagement (views) descending
- Only include tweets that match the user's criteria
- If no tweets match, return an empty array: []`;
}

/**
 * Builds the user prompt from a search config.
 */
function buildUserPrompt(search: SearchConfig): string {
  let prompt = search.prompt;

  prompt += `\n\nTime window: last ${search.timeWindow}`;

  const filters: string[] = [];
  if (search.minViews) {
    filters.push(`more than ${search.minViews} views`);
  }
  if (search.minLikes) {
    filters.push(`more than ${search.minLikes} likes`);
  }
  if (filters.length > 0) {
    prompt += `\nFilter: only include tweets with ${filters.join(" and ")}`;
  }

  prompt += `\nMax results: ${search.maxResults}`;
  prompt += `\nInclude the direct tweet link for each result.`;

  return prompt;
}

/**
 * Computes the from_date for the x_search tool based on time window.
 */
function getFromDate(timeWindow: string): string {
  const now = new Date();
  switch (timeWindow) {
    case "1h":
      now.setHours(now.getHours() - 1);
      break;
    case "12h":
      now.setHours(now.getHours() - 12);
      break;
    case "24h":
      now.setDate(now.getDate() - 1);
      break;
    case "7d":
      now.setDate(now.getDate() - 7);
      break;
  }
  return now.toISOString().split("T")[0];
}

/**
 * Extract @handles from the search prompt if present (e.g., "from @polymarket @user2").
 * Returns up to 10 handles for the x_search allowed_x_handles filter.
 */
function extractHandles(prompt: string): string[] | undefined {
  const matches = prompt.match(/@(\w+)/g);
  if (!matches || matches.length === 0) return undefined;
  const handles = matches.map((m) => m.slice(1)).slice(0, 10);
  return handles;
}

interface GrokApiResponse {
  output: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Parse Grok's response text into ScrapedTweet objects.
 * Handles cases where Grok wraps JSON in markdown code fences.
 */
export function parseGrokResponse(
  responseText: string,
  searchName: string
): ScrapedTweet[] {
  // Strip markdown code fences if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse Grok response as JSON");
    console.error("Raw response (first 500 chars):", cleaned.slice(0, 500));
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.error("Grok response is not an array");
    return [];
  }

  const now = new Date().toISOString();
  const tweets: ScrapedTweet[] = [];

  for (const item of parsed) {
    try {
      const tweet = ScrapedTweetSchema.parse({
        ...item,
        scrapedAt: now,
        searchName,
      });
      tweets.push(tweet);
    } catch (err) {
      // Skip malformed tweets but log them
      console.warn(
        `Skipping malformed tweet: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return tweets;
}

export interface ScrapeResult {
  tweets: ScrapedTweet[];
  tokensUsed: { input: number; output: number };
}

/**
 * Scrape tweets for a single search config via Grok API.
 */
export async function scrapeSearch(
  apiKey: string,
  search: SearchConfig
): Promise<ScrapeResult> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(search);
  const fromDate = getFromDate(search.timeWindow);
  const handles = extractHandles(search.prompt);

  // Build x_search tool config
  const xSearchTool: Record<string, unknown> = {
    type: "x_search",
    from_date: fromDate,
  };
  if (handles) {
    xSearchTool.allowed_x_handles = handles;
  }

  const body = {
    model: GROK_MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    tools: [xSearchTool],
  };

  const response = await axios.post<GrokApiResponse>(GROK_API_URL, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 60_000,
  });

  // Extract text from response
  const outputMessage = response.data.output?.find(
    (o) => o.type === "message"
  );
  const textContent = outputMessage?.content?.find((c) => c.type === "text");
  const responseText = textContent?.text ?? "";

  const tweets = parseGrokResponse(responseText, search.name);
  const tokensUsed = {
    input: response.data.usage?.input_tokens ?? 0,
    output: response.data.usage?.output_tokens ?? 0,
  };

  return { tweets, tokensUsed };
}

/**
 * Run all search configs and return combined results.
 */
export async function scrapeAll(
  apiKey: string,
  searches: SearchConfig[]
): Promise<{ allTweets: ScrapedTweet[]; totalTokens: { input: number; output: number } }> {
  const allTweets: ScrapedTweet[] = [];
  const totalTokens = { input: 0, output: 0 };

  for (const search of searches) {
    console.log(`\n  Searching: "${search.name}" ...`);
    try {
      const result = await scrapeSearch(apiKey, search);
      allTweets.push(...result.tweets);
      totalTokens.input += result.tokensUsed.input;
      totalTokens.output += result.tokensUsed.output;
      console.log(`    Found ${result.tweets.length} tweets`);
    } catch (err) {
      console.error(
        `    Error scraping "${search.name}":`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return { allTweets, totalTokens };
}

// Re-export for testing
export { buildSystemPrompt, buildUserPrompt, getFromDate, extractHandles };
