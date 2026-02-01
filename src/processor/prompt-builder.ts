import type { PersonaConfig, ScrapedTweet } from "../types.js";

/**
 * Build the system prompt from persona config.
 * This tells Claude who it is and how to write.
 */
export function buildSystemPrompt(persona: PersonaConfig): string {
  const lines: string[] = [];

  lines.push(`You are ${persona.name}. ${persona.bio}`);
  lines.push("");

  // Voice
  lines.push("## Your Voice");
  lines.push(`Tone: ${persona.voice.tone}`);
  lines.push(`Style: ${persona.voice.style}`);
  if (persona.voice.vocabulary.length > 0) {
    lines.push(
      `Vocabulary you naturally use: ${persona.voice.vocabulary.join(", ")}`
    );
  }
  if (persona.voice.avoid.length > 0) {
    lines.push(`Never use or reference: ${persona.voice.avoid.join(", ")}`);
  }
  lines.push("");

  // Topics
  lines.push("## Your Topics");
  if (persona.topics.interests.length > 0) {
    lines.push(`Interests: ${persona.topics.interests.join(", ")}`);
  }
  if (persona.topics.expertise.length > 0) {
    lines.push(`Expertise: ${persona.topics.expertise.join(", ")}`);
  }
  if (persona.topics.avoid.length > 0) {
    lines.push(`Avoid these topics: ${persona.topics.avoid.join(", ")}`);
  }
  lines.push("");

  // Rules
  if (persona.rules.length > 0) {
    lines.push("## Rules");
    for (const rule of persona.rules) {
      lines.push(`- ${rule}`);
    }
    lines.push("");
  }

  // Examples
  if (persona.examples.length > 0) {
    lines.push("## Examples of Your Style");
    for (const ex of persona.examples) {
      lines.push(`Original: "${ex.original}"`);
      lines.push(`Your version: "${ex.rewritten}"`);
      lines.push("");
    }
  }

  // Output format
  lines.push("## Output Format");
  lines.push(
    "For each tweet I give you, respond with ONLY a JSON object (no markdown, no code fences):"
  );
  lines.push(
    `{ "rewritten": "your tweet text", "confidence": 1-10, "hashtags": ["optional", "tags"] }`
  );
  lines.push("");
  lines.push(
    "confidence = how good you think the rewrite is (10 = banger, 1 = weak)."
  );
  lines.push(
    "If the original tweet is not worth rewriting (off-topic, low quality, spam), return:"
  );
  lines.push(`{ "rewritten": "", "confidence": 0, "hashtags": [] }`);

  return lines.join("\n");
}

/**
 * Build the user prompt for a single tweet rewrite.
 */
export function buildTweetPrompt(tweet: ScrapedTweet): string {
  const lines: string[] = [];

  lines.push("Rewrite this tweet in your voice:\n");
  lines.push(`@${tweet.handle} (${tweet.author})`);
  lines.push(`"${tweet.text}"`);
  lines.push("");
  lines.push(
    `Engagement: ${tweet.views} views, ${tweet.likes} likes, ${tweet.retweets} RTs`
  );
  lines.push(`Source: ${tweet.url}`);

  return lines.join("\n");
}
