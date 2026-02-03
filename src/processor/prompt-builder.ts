import type { PersonaConfig, ScrapedTweet } from "../types.js";

/**
 * Build the shared persona context (identity, voice, topics, rules, examples).
 */
function buildPersonaContext(persona: PersonaConfig): string[] {
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

  return lines;
}

/**
 * Build the system prompt from persona config.
 * This tells Claude who it is and how to write.
 */
export function buildSystemPrompt(persona: PersonaConfig): string {
  const lines = buildPersonaContext(persona);

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
 * Build the system prompt for session-based multi-tweet generation.
 * Requests 3 tweet variations as a JSON array.
 */
export function buildSessionSystemPrompt(persona: PersonaConfig): string {
  const lines = buildPersonaContext(persona);

  lines.push("## Output Format");
  lines.push(
    "Based on the source tweets and instructions I give you, generate exactly 3 different tweet variations."
  );
  lines.push(
    "Each variation should take a different angle or approach while staying in your voice."
  );
  lines.push(
    "For each variation, also suggest an image idea that would complement the tweet and boost engagement."
  );
  lines.push("");
  lines.push(
    "Respond with ONLY a JSON array (no markdown, no code fences):"
  );
  lines.push("[");
  lines.push(
    `  { "text": "your tweet text", "confidence": 1-10, "hashtags": ["optional", "tags"], "imageSuggestion": "brief description of an image that would pair well with this tweet" },`
  );
  lines.push(
    `  { "text": "different angle", "confidence": 1-10, "hashtags": ["optional", "tags"], "imageSuggestion": "image idea for this variation" },`
  );
  lines.push(
    `  { "text": "third variation", "confidence": 1-10, "hashtags": ["optional", "tags"], "imageSuggestion": "image idea for this variation" }`
  );
  lines.push("]");
  lines.push("");
  lines.push(
    "confidence = how good you think each variation is (10 = banger, 1 = weak)."
  );
  lines.push(
    "imageSuggestion = a concise visual idea (e.g. 'chart showing BTC price action', 'screenshot of the dashboard UI', 'meme of a bear vs bull'). Be specific and actionable."
  );
  lines.push("Each tweet must be under 280 characters.");

  return lines.join("\n");
}

/**
 * Content block for multimodal messages (text or image_url).
 */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Build the user prompt for session-based multi-tweet generation.
 * Returns an array of content blocks (text + images) for multimodal LLMs.
 */
export function buildSessionUserPrompt(
  tweets: ScrapedTweet[],
  userPrompt: string
): ContentBlock[] {
  const content: ContentBlock[] = [];

  const lines: string[] = [];
  lines.push("Here are the source tweets:\n");
  for (let i = 0; i < tweets.length; i++) {
    const t = tweets[i];
    lines.push(`--- Tweet ${i + 1} ---`);
    lines.push(`@${t.handle} (${t.author})`);
    lines.push(`"${t.text}"`);
    lines.push(
      `Engagement: ${t.views} views, ${t.likes} likes, ${t.retweets} RTs`
    );
    if (t.imageUrls && t.imageUrls.length > 0) {
      lines.push(`Images: ${t.imageUrls.length} attached (shown below)`);
    }
    lines.push("");
  }

  lines.push("---\n");
  lines.push(`Instructions: ${userPrompt}`);

  content.push({ type: "text", text: lines.join("\n") });

  // Append images from all selected tweets
  for (const t of tweets) {
    if (t.imageUrls && t.imageUrls.length > 0) {
      for (const url of t.imageUrls) {
        content.push({ type: "image_url", image_url: { url } });
      }
    }
  }

  return content;
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
