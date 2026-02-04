import axios, { AxiosError } from "axios";
import type {
  Leaderboard,
  LeaderboardSource,
  TrendingTweet,
  TimeWindow,
} from "../types.js";
import { ScrapedTweetSchema } from "../types.js";
import { calculateEngagementScore } from "./store.js";

const GROK_API_URL = "https://api.x.ai/v1/responses";
const GROK_MODEL = "grok-4-1-fast";

/**
 * Build system prompt for leaderboard scraping.
 */
function buildSystemPrompt(): string {
  return `You are a tweet research assistant. Your job is to search X (Twitter) and return high-engagement tweets as structured JSON.

SEARCH STRATEGY:
1. Search for tweets matching the given criteria
2. Focus on finding the highest-engagement content
3. Prioritize viral and trending content

QUALITY FILTERS:
- Include original tweets, retweets, and quote tweets
- EXCLUDE replies and comments — only include top-level tweets
- Skip obvious promotional spam, giveaway tweets, airdrop announcements
- Always include the COMPLETE tweet text

OUTPUT FORMAT:
Return ONLY a valid JSON array. No markdown, no code fences.

Each object must have:
{
  "id": "tweet status ID",
  "text": "full tweet text",
  "author": "display name",
  "handle": "@username",
  "likes": number,
  "retweets": number,
  "views": number,
  "replies": number,
  "url": "https://x.com/username/status/ID",
  "imageUrls": ["https://pbs.twimg.com/..."],
  "postedAt": "ISO 8601 timestamp"
}

RULES:
- Sort by engagement (views) descending
- No duplicate tweets
- If no tweets match, return: []`;
}

/**
 * Build user prompt for handle-based search.
 */
function buildHandlePrompt(
  handle: string,
  maxResults: number,
  timeWindow: TimeWindow,
  minViews?: number,
  minLikes?: number
): string {
  let prompt = `Find the top ${maxResults} tweets from @${handle} in the last ${timeWindow}.`;

  if (minViews || minLikes) {
    const filters: string[] = [];
    if (minViews) filters.push(`${minViews}+ views`);
    if (minLikes) filters.push(`${minLikes}+ likes`);
    prompt += `\nMinimum engagement: ${filters.join(", ")}`;
  }

  prompt += `\nReturn their most engaging content.`;
  return prompt;
}

/**
 * Build user prompt for topic-based search.
 */
function buildTopicPrompt(
  topic: string,
  maxResults: number,
  timeWindow: TimeWindow,
  minViews?: number,
  minLikes?: number
): string {
  let prompt = `Search for: ${topic}`;
  prompt += `\n\nConstraints:`;
  prompt += `\n- Time window: last ${timeWindow}`;
  prompt += `\n- Max results: ${maxResults}`;

  if (minViews || minLikes) {
    const filters: string[] = [];
    if (minViews) filters.push(`${minViews}+ views`);
    if (minLikes) filters.push(`${minLikes}+ likes`);
    prompt += `\n- Minimum engagement: ${filters.join(", ")}`;
  }

  return prompt;
}

/**
 * Get from_date for x_search tool.
 */
function getFromDate(timeWindow: TimeWindow): string {
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
 * Parse Grok response into tweet objects.
 */
function parseGrokResponse(responseText: string): unknown[] {
  let cleaned = responseText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Try to salvage truncated JSON
    const objects: unknown[] = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (ch === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            objects.push(JSON.parse(cleaned.slice(start, i + 1)));
          } catch {
            // skip
          }
          start = -1;
        }
      }
    }
    return objects;
  }
}

export interface LeaderboardScrapeProgress {
  type: "source-start" | "source-complete" | "source-error";
  source: LeaderboardSource;
  message: string;
  tweetsFound?: number;
  tokensUsed?: { input: number; output: number };
}

export interface LeaderboardScrapeResult {
  tweets: TrendingTweet[];
  tokensUsed: { input: number; output: number };
}

/**
 * Scrape a single source (handle or topic).
 */
async function scrapeSource(
  apiKey: string,
  source: LeaderboardSource,
  leaderboard: Leaderboard
): Promise<{ tweets: TrendingTweet[]; tokensUsed: { input: number; output: number } }> {
  const systemPrompt = buildSystemPrompt();
  const fromDate = getFromDate(leaderboard.timeWindow);

  // Build prompt based on source type
  const userPrompt =
    source.type === "handle"
      ? buildHandlePrompt(
          source.value.replace(/^@/, ""),
          leaderboard.maxTweetsPerSource,
          leaderboard.timeWindow,
          leaderboard.minViews,
          leaderboard.minLikes
        )
      : buildTopicPrompt(
          source.value,
          leaderboard.maxTweetsPerSource,
          leaderboard.timeWindow,
          leaderboard.minViews,
          leaderboard.minLikes
        );

  // Build x_search tool config
  const xSearchTool: Record<string, unknown> = {
    type: "x_search",
    from_date: fromDate,
  };

  // For handle searches, use allowed_x_handles
  if (source.type === "handle") {
    xSearchTool.allowed_x_handles = [source.value.replace(/^@/, "")];
  }

  const body = {
    model: GROK_MODEL,
    max_output_tokens: 16000,
    instructions: systemPrompt,
    input: [{ role: "user", content: userPrompt }],
    tools: [xSearchTool],
  };

  console.log(`\n--- Leaderboard Scrape [${source.type}: ${source.value}] ---`);

  let response;
  try {
    console.log(`Making API request to ${GROK_API_URL}`);
    console.log(`Request body:`, JSON.stringify(body, null, 2));

    response = await axios.post<GrokApiResponse>(GROK_API_URL, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 180_000,
    });
  } catch (err) {
    if (err instanceof AxiosError) {
      console.error(`Axios error details:`);
      console.error(`  - Code: ${err.code}`);
      console.error(`  - Message: ${err.message}`);
      console.error(`  - Status: ${err.response?.status ?? "N/A"}`);
      console.error(`  - Response data:`, err.response?.data ?? "N/A");

      if (err.response) {
        const errData = err.response.data as Record<string, unknown>;
        throw new Error(`Grok API ${err.response.status}: ${JSON.stringify(errData)}`);
      }
      throw new Error(`Grok API connection error (${err.code}): ${err.message}`);
    }
    console.error(`Unknown error:`, err);
    throw err;
  }

  // Extract text from response
  let responseText = "";
  const outputMessage = response.data.output?.find((o) => o.type === "message");
  if (outputMessage?.content) {
    const textContent = outputMessage.content.find(
      (c) => c.type === "output_text" || c.type === "text"
    );
    responseText = textContent?.text ?? "";
  }

  const tokensUsed = {
    input: response.data.usage?.input_tokens ?? 0,
    output: response.data.usage?.output_tokens ?? 0,
  };

  console.log(`Tokens: ${tokensUsed.input} in / ${tokensUsed.output} out`);

  // Parse response
  const parsed = parseGrokResponse(responseText);
  const now = new Date().toISOString();
  const tweets: TrendingTweet[] = [];

  for (const item of parsed) {
    try {
      // First validate as ScrapedTweet
      const base = ScrapedTweetSchema.parse({
        ...(item as Record<string, unknown>),
        scrapedAt: now,
        searchName: source.label || source.value,
      });

      // Apply engagement filters
      if (leaderboard.minViews && base.views < leaderboard.minViews) continue;
      if (leaderboard.minLikes && base.likes < leaderboard.minLikes) continue;

      // Convert to TrendingTweet
      const trendingTweet: TrendingTweet = {
        ...base,
        sourceType: source.type,
        sourceValue: source.value,
        engagementScore: calculateEngagementScore(base),
      };

      tweets.push(trendingTweet);
    } catch {
      // Skip malformed tweets
    }
  }

  console.log(`Found ${tweets.length} tweets from ${source.value}`);
  return { tweets, tokensUsed };
}

/**
 * Scrape all configured sources for a leaderboard.
 */
export async function scrapeLeaderboard(
  apiKey: string,
  leaderboard: Leaderboard,
  onProgress?: (progress: LeaderboardScrapeProgress) => void
): Promise<LeaderboardScrapeResult> {
  const allTweets: TrendingTweet[] = [];
  const totalTokens = { input: 0, output: 0 };
  const seenIds = new Set<string>();

  for (const source of leaderboard.sources) {
    onProgress?.({
      type: "source-start",
      source,
      message: `Scraping ${source.type}: ${source.value}...`,
    });

    try {
      const result = await scrapeSource(apiKey, source, leaderboard);

      // Deduplicate by tweet ID
      for (const tweet of result.tweets) {
        if (!seenIds.has(tweet.id)) {
          seenIds.add(tweet.id);
          allTweets.push(tweet);
        }
      }

      totalTokens.input += result.tokensUsed.input;
      totalTokens.output += result.tokensUsed.output;

      onProgress?.({
        type: "source-complete",
        source,
        message: `Found ${result.tweets.length} tweets from ${source.value}`,
        tweetsFound: result.tweets.length,
        tokensUsed: result.tokensUsed,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Error scraping ${source.value}:`, errorMsg);

      onProgress?.({
        type: "source-error",
        source,
        message: errorMsg,
      });
    }
  }

  // Sort by engagement score
  allTweets.sort((a, b) => b.engagementScore - a.engagementScore);

  console.log(`\nLeaderboard scrape complete: ${allTweets.length} unique tweets`);
  return { tweets: allTweets, tokensUsed: totalTokens };
}
