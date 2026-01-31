import { z } from "zod";

// --- Scraped Tweet ---

export const ScrapedTweetSchema = z.object({
  id: z.string(),
  text: z.string(),
  author: z.string(),
  handle: z.string(),
  likes: z.number().default(0),
  retweets: z.number().default(0),
  views: z.number().default(0),
  replies: z.number().default(0),
  url: z.string().url(),
  postedAt: z.string(),
  scrapedAt: z.string(),
  searchName: z.string(),
});

export type ScrapedTweet = z.infer<typeof ScrapedTweetSchema>;

// --- Search Config ---

export const SearchConfigSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  timeWindow: z.enum(["1h", "12h", "24h", "7d"]),
  minViews: z.number().optional(),
  minLikes: z.number().optional(),
  maxResults: z.number().default(20),
});

export type SearchConfig = z.infer<typeof SearchConfigSchema>;

export const SearchesFileSchema = z.object({
  searches: z.array(SearchConfigSchema).min(1),
});

// --- Persona Config ---

export const PersonaVoiceSchema = z.object({
  tone: z.string(),
  vocabulary: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  style: z.string(),
});

export const PersonaTopicsSchema = z.object({
  interests: z.array(z.string()).default([]),
  expertise: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
});

export const PersonaExampleSchema = z.object({
  original: z.string(),
  rewritten: z.string(),
});

export const PersonaConfigSchema = z.object({
  name: z.string().min(1),
  bio: z.string(),
  voice: PersonaVoiceSchema,
  topics: PersonaTopicsSchema,
  rules: z.array(z.string()).default([]),
  examples: z.array(PersonaExampleSchema).default([]),
});

export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

// --- Rewritten Tweet ---

export const RewrittenTweetSchema = z.object({
  original: ScrapedTweetSchema,
  rewritten: z.string(),
  confidence: z.number().min(1).max(10),
  hashtags: z.array(z.string()).default([]),
});

export type RewrittenTweet = z.infer<typeof RewrittenTweetSchema>;

// --- Queue Item ---

export type QueueStatus =
  | "scraped"
  | "generated"
  | "reviewed"
  | "approved"
  | "posted";

export const QueueItemSchema = z.object({
  id: z.string(),
  status: z.enum(["scraped", "generated", "reviewed", "approved", "posted"]),
  scrapedTweet: ScrapedTweetSchema,
  rewrittenTweet: z.string().optional(),
  confidence: z.number().optional(),
  hashtags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type QueueItem = z.infer<typeof QueueItemSchema>;
