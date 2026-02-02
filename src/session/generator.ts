import axios from "axios";
import { randomUUID } from "node:crypto";
import type { PersonaConfig, ScrapedTweet, SessionSample } from "../types.js";
import {
  buildSessionSystemPrompt,
  buildSessionUserPrompt,
} from "../processor/prompt-builder.js";

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
  const userMsg = buildSessionUserPrompt(tweets, userPrompt);

  const response = await axios.post<OpenRouterResponse>(
    OPENROUTER_URL,
    {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
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
