import axios, { AxiosError } from "axios";
import type { SearchConfig, ScrapedTweet, TimeWindow } from "../types.js";
import { ScrapedTweetSchema } from "../types.js";


const GROK_API_URL = "https://api.x.ai/v1/responses";
const GROK_MODEL = "grok-4-1-fast";

/**
 * Builds the system prompt that instructs Grok to return structured JSON.
 */
function buildSystemPrompt(): string {
  return `You are a tweet research assistant. Your job is to search X (Twitter) and return as many matching results as possible as structured JSON.

SEARCH STRATEGY (CRITICAL — follow this exactly):
1. Start by searching with the exact keywords from the user's query
2. Then search again with synonyms, related terms, and alternative phrasings
3. Then search with broader terms if you still haven't reached the requested count
4. Keep searching with different queries until you reach the requested maximum number of results or truly exhaust all possibilities
5. Combine and deduplicate results from ALL searches before returning

For example, if asked about "crypto conferences":
- Search: "crypto conference"
- Search: "web3 summit"
- Search: "blockchain event"
- Search: "crypto meetup"
- Search: "token conference"
- Search: "defi event"
...and so on until you hit the max count.

IMPORTANT: Do NOT stop after the first search. You must perform at least 3-5 different searches to maximize results. If your first search returns few results, broaden your search terms.

QUALITY FILTERS:
- Include original tweets, retweets, and quote tweets
- EXCLUDE replies and comments — only include top-level tweets, not responses to other tweets
- Skip obvious promotional spam, giveaway tweets, airdrop announcements, and engagement-bait
- Always include the COMPLETE tweet text — never truncate or summarize

OUTPUT FORMAT:
Return ONLY a valid JSON array. No markdown, no code fences, no explanation text.

Each object must have exactly these fields:
{
  "id": "tweet status ID from the URL",
  "text": "full tweet text (complete, not truncated)",
  "author": "display name",
  "handle": "@username",
  "likes": number,
  "retweets": number,
  "views": number,
  "replies": number,
  "url": "https://x.com/username/status/ID",
  "imageUrls": ["https://pbs.twimg.com/media/...jpg", ...],
  "postedAt": "ISO 8601 timestamp or approximate time description"
}

imageUrls: array of direct image/media URLs attached to the tweet. Use the full pbs.twimg.com URL. If the tweet has no images, use an empty array [].

RULES:
- Include the direct tweet URL for every tweet
- If exact engagement numbers aren't available, give your best estimate based on context
- IMPORTANT: If the user specifies minimum engagement thresholds (e.g. "50+ likes"), ONLY include tweets that meet those thresholds. Do NOT include tweets with unknown or zero engagement when a minimum is specified.
- Sort by engagement (views) descending
- No duplicate tweets in the results
- If no tweets match, return an empty array: []`;
}

/**
 * Builds the user prompt from a search config.
 */
function buildUserPrompt(search: SearchConfig): string {
  let prompt = `Search goal: ${search.prompt}`;

  prompt += `\n\nSearch with multiple different keyword variations and phrasings to find diverse results.`;

  prompt += `\n\nConstraints:`;
  prompt += `\n- Time window: last ${search.timeWindow}`;
  prompt += `\n- Max results: ${search.maxResults}`;

  if (search.minViews || search.minLikes) {
    const filters: string[] = [];
    if (search.minViews) {
      filters.push(`${search.minViews}+ views`);
    }
    if (search.minLikes) {
      filters.push(`${search.minLikes}+ likes`);
    }
    prompt += `\n- Minimum engagement: ${filters.join(", ")}`;
  }

  prompt += `\n\nReturn complete tweet text and direct tweet URLs for every result.`;

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
    case "14d":
      now.setDate(now.getDate() - 14);
      break;
    case "30d":
      now.setDate(now.getDate() - 30);
      break;
  }
  return now.toISOString().split("T")[0];
}

/**
 * Get the next larger time window for fallback when no tweets are found.
 */
function getExpandedTimeWindow(current: TimeWindow): TimeWindow | null {
  const expansion: Record<TimeWindow, TimeWindow | null> = {
    "1h": "12h",
    "12h": "24h",
    "24h": "7d",
    "7d": "14d",
    "14d": "30d",
    "30d": null,
  };
  return expansion[current];
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
 * Attempt to salvage a truncated JSON array by extracting complete objects.
 * When Grok hits its output token limit, the JSON array gets cut off mid-object.
 * This finds all complete {...} objects in the text.
 */
function parseTruncatedJsonArray(text: string): unknown[] {
  const objects: unknown[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          objects.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // skip malformed object
        }
        start = -1;
      }
    }
  }

  return objects;
}

/**
 * Parse Grok's response text into ScrapedTweet objects.
 * Handles markdown code fences and truncated JSON arrays.
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
    // JSON.parse failed — likely truncated response from output token limit.
    // Try to salvage complete objects from the truncated array.
    console.warn("JSON parse failed, attempting to salvage truncated response...");
    const salvaged = parseTruncatedJsonArray(cleaned);
    if (salvaged.length > 0) {
      console.warn(`Salvaged ${salvaged.length} complete tweet(s) from truncated response`);
      parsed = salvaged;
    } else {
      console.error("Failed to parse Grok response as JSON");
      console.error("Raw response (first 500 chars):", cleaned.slice(0, 500));
      return [];
    }
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
  finalWindow?: TimeWindow;
}

export interface ScrapeProgress {
  type: "attempt" | "expanding" | "response";
  window: TimeWindow;
  message: string;
  parsedCount?: number;
  filteredCount?: number;
}

/**
 * Perform a single scrape request with specified time window.
 */
async function doScrapeRequest(
  apiKey: string,
  search: SearchConfig,
  timeWindow: TimeWindow
): Promise<{ tweets: ScrapedTweet[]; tokensUsed: { input: number; output: number }; parsedCount: number }> {
  const systemPrompt = buildSystemPrompt();
  // Override time window in the prompt
  const modifiedSearch = { ...search, timeWindow };
  const userPrompt = buildUserPrompt(modifiedSearch);
  const fromDate = getFromDate(timeWindow);
  const handles = extractHandles(search.prompt);

  // Build x_search tool config
  const xSearchTool: Record<string, unknown> = {
    type: "x_search",
    from_date: fromDate,
  };
  if (handles) {
    xSearchTool.allowed_x_handles = handles;
  }

  // Responses API: system prompt goes in "instructions", not in input messages
  const body = {
    model: GROK_MODEL,
    max_output_tokens: 16000,
    instructions: systemPrompt,
    input: [
      { role: "user", content: userPrompt },
    ],
    tools: [xSearchTool],
  };

  console.log(`\n--- Grok API Request [${search.name}] (window: ${timeWindow}) ---`);
  console.log(`Model: ${GROK_MODEL}`);
  console.log(`System prompt:\n${systemPrompt}`);
  console.log(`User prompt:\n${userPrompt}`);
  console.log(`Tools: ${JSON.stringify([xSearchTool], null, 2)}`);
  console.log(`--- End Request ---\n`);

  let response;
  try {
    response = await axios.post<GrokApiResponse>(GROK_API_URL, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 180_000,
    });
  } catch (err) {
    if (err instanceof AxiosError && err.response) {
      const errData = err.response.data as Record<string, unknown>;
      throw new Error(
        `Grok API ${err.response.status}: ${JSON.stringify(errData)}`
      );
    }
    throw err;
  }

  // Extract text from response
  let responseText = "";

  const outputMessage = response.data.output?.find(
    (o) => o.type === "message"
  );
  if (outputMessage?.content) {
    // Responses API uses "output_text" as the content type
    const textContent = outputMessage.content.find(
      (c) => c.type === "output_text" || c.type === "text"
    );
    responseText = textContent?.text ?? "";
  }

  console.log(`\n--- Grok API Response [${search.name}] (window: ${timeWindow}) ---`);
  console.log(`Tokens: ${response.data.usage?.input_tokens ?? 0} in / ${response.data.usage?.output_tokens ?? 0} out`);
  console.log(`Response text (first 2000 chars):\n${responseText.slice(0, 2000)}`);
  if (responseText.length > 2000) console.log(`... (${responseText.length} total chars)`);
  console.log(`--- End Response ---\n`);

  const allParsed = parseGrokResponse(responseText, search.name);

  // Enforce minimum engagement filters server-side (can't fully rely on LLM)
  const tweets = allParsed.filter((t) => {
    if (search.minViews && t.views < search.minViews) return false;
    if (search.minLikes && t.likes < search.minLikes) return false;
    return true;
  });

  if (tweets.length < allParsed.length) {
    console.log(`  Filtered out ${allParsed.length - tweets.length} tweet(s) below engagement thresholds (minViews: ${search.minViews ?? "none"}, minLikes: ${search.minLikes ?? "none"})`);
  }

  const tokensUsed = {
    input: response.data.usage?.input_tokens ?? 0,
    output: response.data.usage?.output_tokens ?? 0,
  };

  return { tweets, tokensUsed, parsedCount: allParsed.length };
}

/**
 * Scrape tweets for a single search config via Grok API.
 * Automatically expands time window if no tweets are found.
 */
export async function scrapeSearch(
  apiKey: string,
  search: SearchConfig,
  onProgress?: (progress: ScrapeProgress) => void
): Promise<ScrapeResult> {
  let currentWindow = search.timeWindow;
  let totalTokens = { input: 0, output: 0 };

  // Try with current time window, expand if no results
  while (true) {
    onProgress?.({
      type: "attempt",
      window: currentWindow,
      message: `Searching with ${currentWindow} time window...`,
    });

    const result = await doScrapeRequest(apiKey, search, currentWindow);
    totalTokens.input += result.tokensUsed.input;
    totalTokens.output += result.tokensUsed.output;

    onProgress?.({
      type: "response",
      window: currentWindow,
      message: `Got ${result.parsedCount} tweets, ${result.tweets.length} after filtering`,
      parsedCount: result.parsedCount,
      filteredCount: result.tweets.length,
    });

    if (result.tweets.length > 0) {
      return { tweets: result.tweets, tokensUsed: totalTokens, finalWindow: currentWindow };
    }

    // No tweets found - try expanding time window
    const expandedWindow = getExpandedTimeWindow(currentWindow);
    if (!expandedWindow) {
      console.log(`  No tweets found and no further time window expansion available (was: ${currentWindow})`);
      return { tweets: [], tokensUsed: totalTokens, finalWindow: currentWindow };
    }

    onProgress?.({
      type: "expanding",
      window: expandedWindow,
      message: `No tweets with ${currentWindow}, expanding to ${expandedWindow}...`,
    });
    console.log(`  No tweets found with ${currentWindow} window, expanding to ${expandedWindow}...`);
    currentWindow = expandedWindow;
  }
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
