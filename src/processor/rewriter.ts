import axios from "axios";
import type { PersonaConfig, ScrapedTweet } from "../types.js";
import { buildSystemPrompt, buildTweetPrompt } from "./prompt-builder.js";

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

interface RewriteResult {
  rewritten: string;
  confidence: number;
  hashtags: string[];
}

/**
 * Parse Claude's response into a structured rewrite result.
 */
export function parseRewriteResponse(text: string): RewriteResult {
  let cleaned = text.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      rewritten: String(parsed.rewritten ?? ""),
      confidence: Number(parsed.confidence ?? 0),
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map(String)
        : [],
    };
  } catch {
    // If Claude returns plain text instead of JSON, treat it as the rewrite
    return {
      rewritten: cleaned,
      confidence: 5,
      hashtags: [],
    };
  }
}

/**
 * Rewrite a single tweet using Claude via OpenRouter.
 */
export async function rewriteTweet(
  apiKey: string,
  persona: PersonaConfig,
  tweet: ScrapedTweet,
  model: string = DEFAULT_MODEL
): Promise<RewriteResult & { tokensUsed: { input: number; output: number } }> {
  const systemPrompt = buildSystemPrompt(persona);
  const userPrompt = buildTweetPrompt(tweet);

  const response = await axios.post<OpenRouterResponse>(
    OPENROUTER_URL,
    {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 500,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/twitter-agent-pipeline",
        "X-Title": "Tweet Pipeline",
      },
      timeout: 30_000,
    }
  );

  const content = response.data.choices?.[0]?.message?.content ?? "";
  const result = parseRewriteResponse(content);
  const tokensUsed = {
    input: response.data.usage?.prompt_tokens ?? 0,
    output: response.data.usage?.completion_tokens ?? 0,
  };

  return { ...result, tokensUsed };
}

export interface BatchRewriteResult {
  results: Array<{
    tweet: ScrapedTweet;
    rewritten: string;
    confidence: number;
    hashtags: string[];
  }>;
  skipped: number;
  totalTokens: { input: number; output: number };
}

/**
 * Rewrite a batch of tweets sequentially.
 */
export async function rewriteBatch(
  apiKey: string,
  persona: PersonaConfig,
  tweets: ScrapedTweet[],
  model: string = DEFAULT_MODEL
): Promise<BatchRewriteResult> {
  const results: BatchRewriteResult["results"] = [];
  let skipped = 0;
  const totalTokens = { input: 0, output: 0 };

  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    console.log(
      `  [${i + 1}/${tweets.length}] Rewriting @${tweet.handle}: "${tweet.text.slice(0, 60)}..."`
    );

    try {
      const result = await rewriteTweet(apiKey, persona, tweet, model);
      totalTokens.input += result.tokensUsed.input;
      totalTokens.output += result.tokensUsed.output;

      if (result.confidence === 0 || !result.rewritten) {
        console.log(`    Skipped (not worth rewriting)`);
        skipped++;
        continue;
      }

      results.push({
        tweet,
        rewritten: result.rewritten,
        confidence: result.confidence,
        hashtags: result.hashtags,
      });
      console.log(`    → "${result.rewritten.slice(0, 80)}..." (${result.confidence}/10)`);
    } catch (err) {
      console.error(
        `    Error:`,
        err instanceof Error ? err.message : String(err)
      );
      skipped++;
    }
  }

  return { results, skipped, totalTokens };
}

export { DEFAULT_MODEL };
