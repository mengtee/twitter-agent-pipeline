import axios, { AxiosError } from "axios";
import { randomUUID } from "node:crypto";
import type { TrendingTweet, CommentSuggestion, PersonaConfig } from "../types.js";
import { MAX_RETRIES, sleep, isRetryableError, getRetryDelay } from "../retry.js";

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

export interface CommentGenerationResult {
  suggestions: CommentSuggestion[];
  tokensUsed: { input: number; output: number };
}

/**
 * Build system prompt for comment generation.
 */
function buildCommentSystemPrompt(persona?: PersonaConfig): string {
  let prompt = `You are a social media engagement expert. Generate reply/comment suggestions for tweets that will drive engagement and build relationships.

Generate 3 different comment suggestions, each with a distinct tone:
1. **Witty** - Clever, humorous, or playful response that entertains
2. **Insightful** - Adds value, shares perspective, or contributes to the discussion
3. **Supportive** - Agreeing, amplifying, or encouraging the original poster`;

  if (persona) {
    prompt += `

You are writing as ${persona.name}. ${persona.bio}

Voice:
- Tone: ${persona.voice.tone}
- Style: ${persona.voice.style}
${persona.voice.vocabulary.length > 0 ? `- Vocabulary: ${persona.voice.vocabulary.join(", ")}` : ""}
${persona.voice.avoid.length > 0 ? `- Avoid: ${persona.voice.avoid.join(", ")}` : ""}`;
  }

  prompt += `

OUTPUT FORMAT:
Return ONLY a valid JSON array (no markdown, no code fences):
[
  { "text": "witty comment", "tone": "witty", "confidence": 1-10 },
  { "text": "insightful comment", "tone": "insightful", "confidence": 1-10 },
  { "text": "supportive comment", "tone": "supportive", "confidence": 1-10 }
]

RULES:
- Keep comments under 280 characters
- Be authentic and conversational
- Don't be sycophantic or overly promotional
- confidence = how engaging/effective this comment would be (10 = very engaging)`;

  return prompt;
}

/**
 * Build user prompt with the tweet to respond to.
 */
function buildCommentUserPrompt(tweet: TrendingTweet): string {
  return `Generate 3 comment/reply suggestions for this tweet:

@${tweet.handle} (${tweet.author})
"${tweet.text}"

Engagement: ${tweet.views.toLocaleString()} views, ${tweet.likes.toLocaleString()} likes, ${tweet.retweets.toLocaleString()} RTs

Generate comments that would work well as replies to this specific tweet.`;
}

/**
 * Parse comment suggestions from LLM response.
 */
function parseCommentResponse(
  text: string
): Array<Omit<CommentSuggestion, "id">> {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        text: String(item.text ?? ""),
        tone: validateTone(item.tone),
        confidence: Math.min(10, Math.max(1, Number(item.confidence ?? 5))),
      }));
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Validate tone value.
 */
function validateTone(tone: unknown): "witty" | "insightful" | "supportive" {
  const validTones = ["witty", "insightful", "supportive"];
  const normalized = String(tone ?? "").toLowerCase();
  return validTones.includes(normalized)
    ? (normalized as "witty" | "insightful" | "supportive")
    : "insightful";
}

/**
 * Generate comment suggestions for a tweet.
 */
export async function generateCommentSuggestions(
  apiKey: string,
  tweet: TrendingTweet,
  persona?: PersonaConfig,
  model: string = DEFAULT_MODEL
): Promise<CommentGenerationResult> {
  const systemPrompt = buildCommentSystemPrompt(persona);
  const userPrompt = buildCommentUserPrompt(tweet);

  let response;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[CommentGen] Attempt ${attempt}/${MAX_RETRIES} (model: ${model})`);

      response = await axios.post<OpenRouterResponse>(
        OPENROUTER_URL,
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.8,
          max_tokens: 800,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/twitter-agent-pipeline",
            "X-Title": "Tweet Pipeline - Comment Generator",
          },
          timeout: 30_000,
        }
      );
      break; // Success
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof AxiosError) {
        const status = err.response?.status;
        const errorBody = err.response?.data;

        console.error(`[CommentGen] OpenRouter error (attempt ${attempt}/${MAX_RETRIES}):`);
        console.error(`  Status: ${status ?? "N/A"}`);
        console.error(`  Body: ${JSON.stringify(errorBody ?? {})}`);

        if (isRetryableError(err) && attempt < MAX_RETRIES) {
          const delay = getRetryDelay(err, attempt);
          console.log(`[CommentGen] Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        const detail = errorBody ? JSON.stringify(errorBody) : err.message;
        throw new Error(`OpenRouter API ${status ?? "error"}: ${detail}`);
      }

      throw err;
    }
  }

  if (!response) {
    throw lastError ?? new Error("OpenRouter request failed after retries");
  }

  const content = response.data.choices?.[0]?.message?.content ?? "";
  const parsed = parseCommentResponse(content);

  const suggestions: CommentSuggestion[] = parsed.map((s) => ({
    id: randomUUID().slice(0, 8),
    ...s,
  }));

  // Ensure we have all 3 tones
  const tones: Array<"witty" | "insightful" | "supportive"> = [
    "witty",
    "insightful",
    "supportive",
  ];
  for (const tone of tones) {
    if (!suggestions.some((s) => s.tone === tone)) {
      suggestions.push({
        id: randomUUID().slice(0, 8),
        text: `[Could not generate ${tone} comment]`,
        tone,
        confidence: 1,
      });
    }
  }

  const tokensUsed = {
    input: response.data.usage?.prompt_tokens ?? 0,
    output: response.data.usage?.completion_tokens ?? 0,
  };

  return { suggestions, tokensUsed };
}

export { DEFAULT_MODEL };
