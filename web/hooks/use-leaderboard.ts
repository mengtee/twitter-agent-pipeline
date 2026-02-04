import useSWR from "swr";
import type {
  TrendingTweet,
  Leaderboard,
  CommentSuggestion,
} from "@pipeline/types.js";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Summary info returned from list endpoint
interface LeaderboardSummary {
  id: string;
  name: string;
  sourceCount: number;
  tweetCount: number;
  lastScrapedAt?: string;
  isScrapingNow: boolean;
  createdAt: string;
  updatedAt: string;
}

// List all leaderboards
export function useLeaderboards() {
  const { data, error, isLoading, mutate } = useSWR<{ leaderboards: LeaderboardSummary[] }>(
    "/api/leaderboards",
    fetcher,
    { refreshInterval: 30_000 }
  );

  return {
    leaderboards: data?.leaderboards ?? [],
    isLoading,
    error,
    mutate,
  };
}

// Get a single leaderboard by ID
export function useLeaderboard(id: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<{ leaderboard: Leaderboard }>(
    id ? `/api/leaderboards/${id}` : null,
    fetcher
  );

  return {
    leaderboard: data?.leaderboard,
    isLoading,
    error,
    mutate,
  };
}

// Get tweets from a leaderboard
export function useLeaderboardTweets(id: string | undefined, limit: number = 50) {
  const { data, error, isLoading, mutate } = useSWR<{ tweets: TrendingTweet[] }>(
    id ? `/api/leaderboards/${id}/tweets?limit=${limit}` : null,
    fetcher,
    { refreshInterval: 60_000 }
  );

  return {
    tweets: data?.tweets ?? [],
    isLoading,
    error,
    mutate,
  };
}

// Create a new leaderboard
export async function createLeaderboard(
  name: string,
  sources: Array<{ type: "handle" | "topic"; value: string; label?: string }>
): Promise<{ leaderboard: Leaderboard }> {
  const res = await fetch("/api/leaderboards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, sources }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Update a leaderboard
export async function updateLeaderboard(
  id: string,
  updates: {
    name?: string;
    sources?: Array<{ type: "handle" | "topic"; value: string; label?: string }>;
    maxTweetsPerSource?: number;
    minViews?: number;
    minLikes?: number;
    timeWindow?: "1h" | "12h" | "24h" | "7d" | "14d" | "30d";
  }
): Promise<{ leaderboard: Leaderboard }> {
  const res = await fetch(`/api/leaderboards/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Delete a leaderboard
export async function deleteLeaderboard(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/leaderboards/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Generate comment suggestions for a tweet
export async function generateComments(
  tweetId: string,
  personaSlug?: string
): Promise<{ suggestions: CommentSuggestion[]; tokensUsed: { input: number; output: number } }> {
  const res = await fetch("/api/leaderboard/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tweetId, personaSlug }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
