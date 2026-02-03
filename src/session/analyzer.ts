import axios from "axios";
import type { ScrapedTweet, TrendAnalysis } from "../types.js";
import { buildAnalysisPrompt } from "../processor/prompt-builder.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

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

export interface AnalyzeResult {
  analysis: TrendAnalysis;
  tokensUsed: { input: number; output: number };
}

/**
 * Parse the LLM response text into a TrendAnalysis object.
 */
export function parseAnalysisResponse(text: string): TrendAnalysis {
  let cleaned = text.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);

    return {
      summary: String(parsed.summary ?? ""),
      trendingTopics: Array.isArray(parsed.trendingTopics)
        ? parsed.trendingTopics.map(String)
        : [],
      contentIdeas: Array.isArray(parsed.contentIdeas)
        ? parsed.contentIdeas.map((idea: Record<string, unknown>) => ({
            title: String(idea.title ?? ""),
            description: String(idea.description ?? ""),
            angle: String(idea.angle ?? ""),
            suggestedFormat: validateFormat(idea.suggestedFormat),
            relevanceScore: Math.min(
              10,
              Math.max(1, Number(idea.relevanceScore ?? 5))
            ),
          }))
        : [],
    };
  } catch {
    // If parsing fails, return a minimal analysis with the raw text as summary
    return {
      summary: cleaned,
      trendingTopics: [],
      contentIdeas: [],
    };
  }
}

/**
 * Validate and normalize the suggested format.
 */
function validateFormat(
  format: unknown
): "thread" | "single" | "poll" | "media" {
  const validFormats = ["thread", "single", "poll", "media"];
  const normalized = String(format ?? "single").toLowerCase();
  return validFormats.includes(normalized)
    ? (normalized as "thread" | "single" | "poll" | "media")
    : "single";
}

/**
 * Analyze scraped tweets to identify trends and suggest content ideas.
 */
export async function analyzeTweets(
  apiKey: string,
  searchNames: string[],
  tweets: ScrapedTweet[],
  model: string = DEFAULT_MODEL
): Promise<AnalyzeResult> {
  const prompt = buildAnalysisPrompt(searchNames, tweets);

  const response = await axios.post<OpenRouterResponse>(
    OPENROUTER_URL,
    {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2500,
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

  const content = response.data.choices?.[0]?.message?.content ?? "";
  const analysis = parseAnalysisResponse(content);

  const tokensUsed = {
    input: response.data.usage?.prompt_tokens ?? 0,
    output: response.data.usage?.completion_tokens ?? 0,
  };

  return { analysis, tokensUsed };
}

export { DEFAULT_MODEL };
