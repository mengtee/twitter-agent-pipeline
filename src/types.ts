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
  imageUrls: z.array(z.string().url()).default([]),
  postedAt: z.string(),
  scrapedAt: z.string(),
  searchName: z.string(),
});

export type ScrapedTweet = z.infer<typeof ScrapedTweetSchema>;

// --- Search Config ---

export const TimeWindows = ["1h", "12h", "24h", "48h", "7d", "14d", "30d"] as const;
export type TimeWindow = (typeof TimeWindows)[number];

export const SearchConfigSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  timeWindow: z.enum(TimeWindows),
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

// --- Trend Analysis ---

export const ContentIdeaSchema = z.object({
  title: z.string(),
  description: z.string(),
  angle: z.string(),
  suggestedFormat: z.enum(["thread", "single", "poll", "media"]),
  relevanceScore: z.number().min(1).max(10),
  sourceTweetIds: z.array(z.string()).default([]),
});

export type ContentIdea = z.infer<typeof ContentIdeaSchema>;

export const TopicWithTweetsSchema = z.object({
  topic: z.string(),
  explanation: z.string(),
  tweetIds: z.array(z.string()).default([]),
});

export type TopicWithTweets = z.infer<typeof TopicWithTweetsSchema>;

export const TrendAnalysisSchema = z.object({
  summary: z.string(),
  trendingTopics: z.array(z.string()).default([]),
  topicsWithTweets: z.array(TopicWithTweetsSchema).default([]),
  contentIdeas: z.array(ContentIdeaSchema).default([]),
});

export type TrendAnalysis = z.infer<typeof TrendAnalysisSchema>;

// --- Session Pipeline ---

export const SessionStages = ["created", "scraped", "analyzed", "selected", "generated", "completed"] as const;
export type SessionStage = (typeof SessionStages)[number];

export const SessionSampleSchema = z.object({
  id: z.string(),
  text: z.string(),
  confidence: z.number().min(1).max(10),
  hashtags: z.array(z.string()).default([]),
  imageSuggestion: z.string().optional(),
});

export type SessionSample = z.infer<typeof SessionSampleSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  stage: z.enum(SessionStages),
  searchNames: z.array(z.string()).min(1),
  scrapedTweets: z.array(ScrapedTweetSchema).default([]),
  scrapeTokens: z.object({ input: z.number(), output: z.number() }).optional(),
  analysis: TrendAnalysisSchema.optional(),
  analyzeTokens: z.object({ input: z.number(), output: z.number() }).optional(),
  selectedTweetIds: z.array(z.string()).default([]),
  userPrompt: z.string().default(""),
  personaSlug: z.string().optional(),
  samples: z.array(SessionSampleSchema).default([]),
  generateTokens: z.object({ input: z.number(), output: z.number() }).optional(),
  chosenSampleId: z.string().optional(),
  finalText: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Session = z.infer<typeof SessionSchema>;

// --- Leaderboard Pipeline (Multi-Leaderboard) ---

export const LeaderboardSourceSchema = z.object({
  type: z.enum(["handle", "topic"]),
  value: z.string().min(1), // @handle or search prompt
  label: z.string().optional(), // display name
});

export type LeaderboardSource = z.infer<typeof LeaderboardSourceSchema>;

export const TrendingTweetSchema = ScrapedTweetSchema.extend({
  sourceType: z.enum(["handle", "topic"]),
  sourceValue: z.string(),
  engagementScore: z.number(), // views + likes*10 + retweets*5
  rank: z.number().optional(),
});

export type TrendingTweet = z.infer<typeof TrendingTweetSchema>;

// Each leaderboard is a self-contained entity with its own sources, tweets, and sync schedule
export const LeaderboardSchema = z.object({
  id: z.string(), // unique ID (e.g., "lb-abc123")
  name: z.string().min(1), // display name (e.g., "AI Influencers")
  sources: z.array(LeaderboardSourceSchema).min(1), // at least one source
  tweets: z.array(TrendingTweetSchema).default([]),
  // Scrape settings
  maxTweetsPerSource: z.number().min(5).max(50).default(10),
  minViews: z.number().optional(),
  minLikes: z.number().optional(),
  timeWindow: z.enum(TimeWindows).default("48h"),
  // Sync state
  lastScrapedAt: z.string().optional(),
  nextScheduledAt: z.string().optional(),
  isScrapingNow: z.boolean().default(false),
  lastError: z.string().optional(),
  tokensUsed: z.object({ input: z.number(), output: z.number() }).default({ input: 0, output: 0 }),
  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Leaderboard = z.infer<typeof LeaderboardSchema>;

// Global leaderboard settings (shared across all leaderboards)
export const LeaderboardGlobalConfigSchema = z.object({
  scrapeIntervalHours: z.number().min(1).max(168).default(24), // default 24h
  cronEnabled: z.boolean().default(false),
});

export type LeaderboardGlobalConfig = z.infer<typeof LeaderboardGlobalConfigSchema>;

export const CommentSuggestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  tone: z.enum(["witty", "insightful", "supportive"]),
  confidence: z.number().min(1).max(10),
});

export type CommentSuggestion = z.infer<typeof CommentSuggestionSchema>;
