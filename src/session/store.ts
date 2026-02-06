import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "../db/query.js";
import type { TxClient } from "../db/query.js";
import type {
  Session,
  SessionStage,
  SessionSample,
  ScrapedTweet,
  TrendAnalysis,
} from "../types.js";

export interface SessionSummary {
  id: string;
  name: string;
  stage: SessionStage;
  tweetCount: number;
  updatedAt: string;
}

// Database row types
interface DbSession {
  id: string;
  name: string;
  stage: string;
  search_names: string[];
  user_prompt: string;
  persona_slug: string | null;
  chosen_sample_id: string | null;
  final_text: string | null;
  scrape_tokens_input: number;
  scrape_tokens_output: number;
  analyze_tokens_input: number;
  analyze_tokens_output: number;
  generate_tokens_input: number;
  generate_tokens_output: number;
  created_at: Date;
  updated_at: Date;
}

interface DbSessionTweet {
  id: string;
  session_id: string;
  text: string;
  author: string;
  handle: string;
  likes: number;
  retweets: number;
  views: number;
  replies: number;
  url: string;
  image_urls: string[];
  posted_at: Date;
  scraped_at: Date;
  search_name: string;
}

interface DbSessionAnalysis {
  id: string;
  session_id: string;
  summary: string;
  trending_topics: string[];
  topics_with_tweets: unknown;
  content_ideas: unknown;
  created_at: Date;
}

interface DbSessionSample {
  id: string;
  session_id: string;
  text: string;
  confidence: number;
  hashtags: string[];
  image_suggestion: string | null;
  created_at: Date;
}

interface DbSessionSelectedTweet {
  session_id: string;
  tweet_id: string;
}

/**
 * Create a new session.
 */
export async function createSession(
  name: string,
  searchNames: string[]
): Promise<Session> {
  const id = randomUUID().slice(0, 8);

  const result = await queryOne<DbSession>(
    `INSERT INTO sessions (id, name, search_names)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, name, searchNames]
  );

  if (!result) {
    throw new Error("Failed to create session");
  }

  return dbToSession(result, [], null, [], []);
}

/**
 * Load a session by ID.
 */
export async function loadSession(id: string): Promise<Session> {
  const session = await queryOne<DbSession>(
    `SELECT * FROM sessions WHERE id = $1`,
    [id]
  );

  if (!session) {
    throw new Error(`Session not found: ${id}`);
  }

  // Load related data in parallel
  const [tweets, analysis, samples, selectedTweets] = await Promise.all([
    query<DbSessionTweet>(
      `SELECT * FROM session_tweets WHERE session_id = $1 ORDER BY scraped_at`,
      [id]
    ),
    queryOne<DbSessionAnalysis>(
      `SELECT * FROM session_analyses WHERE session_id = $1`,
      [id]
    ),
    query<DbSessionSample>(
      `SELECT * FROM session_samples WHERE session_id = $1 ORDER BY created_at`,
      [id]
    ),
    query<DbSessionSelectedTweet>(
      `SELECT * FROM session_selected_tweets WHERE session_id = $1`,
      [id]
    ),
  ]);

  return dbToSession(
    session,
    tweets,
    analysis,
    samples,
    selectedTweets.map((s) => s.tweet_id)
  );
}

/**
 * Build a multi-row INSERT query with parameterized values.
 */
function buildMultiInsert(
  baseQuery: string,
  rows: unknown[][],
  columnsPerRow: number
): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const valueGroups: string[] = [];
  for (const row of rows) {
    const offset = params.length;
    const placeholders = row.map((_, i) => `$${offset + i + 1}`);
    valueGroups.push(`(${placeholders.join(", ")})`);
    params.push(...row);
  }
  return { text: `${baseQuery} VALUES ${valueGroups.join(", ")}`, params };
}

/**
 * Save a session (update all fields) inside a transaction.
 */
export async function saveSession(session: Session): Promise<void> {
  await withTransaction(async (tx) => {
    // Update main session record
    await tx.query(
      `UPDATE sessions SET
         name = $2,
         stage = $3,
         search_names = $4,
         user_prompt = $5,
         persona_slug = $6,
         chosen_sample_id = $7,
         final_text = $8,
         scrape_tokens_input = $9,
         scrape_tokens_output = $10,
         analyze_tokens_input = $11,
         analyze_tokens_output = $12,
         generate_tokens_input = $13,
         generate_tokens_output = $14,
         updated_at = NOW()
       WHERE id = $1`,
      [
        session.id,
        session.name,
        session.stage,
        session.searchNames,
        session.userPrompt,
        session.personaSlug ?? null,
        session.chosenSampleId ?? null,
        session.finalText ?? null,
        session.scrapeTokens?.input ?? 0,
        session.scrapeTokens?.output ?? 0,
        session.analyzeTokens?.input ?? 0,
        session.analyzeTokens?.output ?? 0,
        session.generateTokens?.input ?? 0,
        session.generateTokens?.output ?? 0,
      ]
    );

    // Sync scraped tweets (delete + multi-row insert)
    await tx.execute(`DELETE FROM session_tweets WHERE session_id = $1`, [session.id]);
    if (session.scrapedTweets.length > 0) {
      const { text, params } = buildMultiInsert(
        `INSERT INTO session_tweets (id, session_id, text, author, handle, likes, retweets, views, replies, url, image_urls, posted_at, scraped_at, search_name)`,
        session.scrapedTweets.map((t) => [
          t.id, session.id, t.text, t.author, t.handle,
          t.likes, t.retweets, t.views, t.replies,
          t.url, t.imageUrls, new Date(t.postedAt), new Date(t.scrapedAt), t.searchName,
        ]),
        14
      );
      await tx.execute(text, params);
    }

    // Sync analysis
    if (session.analysis) {
      await tx.query(
        `INSERT INTO session_analyses (session_id, summary, trending_topics, topics_with_tweets, content_ideas)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (session_id) DO UPDATE SET
           summary = EXCLUDED.summary,
           trending_topics = EXCLUDED.trending_topics,
           topics_with_tweets = EXCLUDED.topics_with_tweets,
           content_ideas = EXCLUDED.content_ideas`,
        [
          session.id,
          session.analysis.summary,
          session.analysis.trendingTopics,
          JSON.stringify(session.analysis.topicsWithTweets),
          JSON.stringify(session.analysis.contentIdeas),
        ]
      );
    } else {
      await tx.execute(`DELETE FROM session_analyses WHERE session_id = $1`, [session.id]);
    }

    // Sync samples (delete + multi-row insert)
    await tx.execute(`DELETE FROM session_samples WHERE session_id = $1`, [session.id]);
    if (session.samples.length > 0) {
      const { text, params } = buildMultiInsert(
        `INSERT INTO session_samples (id, session_id, text, confidence, hashtags, image_suggestion)`,
        session.samples.map((s) => [
          s.id, session.id, s.text, s.confidence, s.hashtags, s.imageSuggestion ?? null,
        ]),
        6
      );
      await tx.execute(text, params);
    }

    // Sync selected tweets (delete + multi-row insert)
    await tx.execute(`DELETE FROM session_selected_tweets WHERE session_id = $1`, [session.id]);
    if (session.selectedTweetIds.length > 0) {
      const { text, params } = buildMultiInsert(
        `INSERT INTO session_selected_tweets (session_id, tweet_id)`,
        session.selectedTweetIds.map((tweetId) => [session.id, tweetId]),
        2
      );
      await tx.execute(text, params);
    }
  });
}

/**
 * List all sessions with summary info.
 */
export async function listSessions(): Promise<SessionSummary[]> {
  const sessions = await query<
    DbSession & { tweet_count: string }
  >(
    `SELECT s.*,
            (SELECT COUNT(*) FROM session_tweets WHERE session_id = s.id)::text as tweet_count
     FROM sessions s
     ORDER BY s.updated_at DESC`
  );

  return sessions.map((s) => ({
    id: s.id,
    name: s.name,
    stage: s.stage as SessionStage,
    tweetCount: parseInt(s.tweet_count, 10),
    updatedAt: s.updated_at.toISOString(),
  }));
}

/**
 * Delete a session by ID.
 */
export async function deleteSession(id: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM sessions WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.length > 0;
}

/**
 * Convert database rows to Session object.
 */
function dbToSession(
  session: DbSession,
  tweets: DbSessionTweet[],
  analysis: DbSessionAnalysis | null,
  samples: DbSessionSample[],
  selectedTweetIds: string[]
): Session {
  const scrapedTweets: ScrapedTweet[] = tweets.map((t) => ({
    id: t.id,
    text: t.text,
    author: t.author,
    handle: t.handle,
    likes: t.likes,
    retweets: t.retweets,
    views: t.views,
    replies: t.replies,
    url: t.url,
    imageUrls: t.image_urls,
    postedAt: t.posted_at.toISOString(),
    scrapedAt: t.scraped_at.toISOString(),
    searchName: t.search_name,
  }));

  const sessionSamples: SessionSample[] = samples.map((s) => ({
    id: s.id,
    text: s.text,
    confidence: s.confidence,
    hashtags: s.hashtags,
    imageSuggestion: s.image_suggestion ?? undefined,
  }));

  let trendAnalysis: TrendAnalysis | undefined;
  if (analysis) {
    trendAnalysis = {
      summary: analysis.summary,
      trendingTopics: analysis.trending_topics,
      topicsWithTweets: analysis.topics_with_tweets as TrendAnalysis["topicsWithTweets"],
      contentIdeas: analysis.content_ideas as TrendAnalysis["contentIdeas"],
    };
  }

  return {
    id: session.id,
    name: session.name,
    stage: session.stage as SessionStage,
    searchNames: session.search_names,
    scrapedTweets,
    scrapeTokens:
      session.scrape_tokens_input > 0 || session.scrape_tokens_output > 0
        ? { input: session.scrape_tokens_input, output: session.scrape_tokens_output }
        : undefined,
    analysis: trendAnalysis,
    analyzeTokens:
      session.analyze_tokens_input > 0 || session.analyze_tokens_output > 0
        ? { input: session.analyze_tokens_input, output: session.analyze_tokens_output }
        : undefined,
    selectedTweetIds,
    userPrompt: session.user_prompt,
    personaSlug: session.persona_slug ?? undefined,
    samples: sessionSamples,
    generateTokens:
      session.generate_tokens_input > 0 || session.generate_tokens_output > 0
        ? { input: session.generate_tokens_input, output: session.generate_tokens_output }
        : undefined,
    chosenSampleId: session.chosen_sample_id ?? undefined,
    finalText: session.final_text ?? undefined,
    createdAt: session.created_at.toISOString(),
    updatedAt: session.updated_at.toISOString(),
  };
}
