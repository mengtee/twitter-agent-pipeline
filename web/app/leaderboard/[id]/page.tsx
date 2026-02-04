"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDate, truncate } from "@/lib/utils";
import {
  useLeaderboard,
  useLeaderboardTweets,
  generateComments,
} from "@/hooks/use-leaderboard";
import { usePersonas } from "@/hooks/use-personas";
import { useSSE, type SSEEvent } from "@/hooks/use-sse";
import type { TrendingTweet, CommentSuggestion } from "@pipeline/types.js";

/** Strip t.co links from tweet text for cleaner display */
function cleanTweetText(text: string): string {
  return text.replace(/\s*https?:\/\/t\.co\/\w+/g, "").trim();
}

/** Format large numbers (e.g., 12500 -> 12.5K) */
function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function LeaderboardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { leaderboard, isLoading, mutate: mutateLeaderboard } = useLeaderboard(id);
  const { tweets, mutate: mutateTweets } = useLeaderboardTweets(id, 50);
  const { personas } = usePersonas();

  const scrapeSSE = useSSE(`/api/leaderboards/${id}/scrape`);

  // Comment generation state
  const [selectedTweet, setSelectedTweet] = useState<TrendingTweet | null>(null);
  const [comments, setComments] = useState<CommentSuggestion[]>([]);
  const [isGeneratingComments, setIsGeneratingComments] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [personaSlug, setPersonaSlug] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Refresh data after scrape completes
  useEffect(() => {
    if (scrapeSSE.status === "done") {
      mutateLeaderboard();
      mutateTweets();
    }
  }, [scrapeSSE.status, mutateLeaderboard, mutateTweets]);

  const handleRefresh = () => {
    scrapeSSE.reset();
    scrapeSSE.start();
  };

  const handleSelectTweet = async (tweet: TrendingTweet) => {
    setSelectedTweet(tweet);
    setComments([]);
    setCommentError(null);
  };

  const handleGenerateComments = async () => {
    if (!selectedTweet) return;
    setIsGeneratingComments(true);
    setCommentError(null);
    try {
      const result = await generateComments(selectedTweet.id, personaSlug || undefined);
      setComments(result.suggestions);
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingComments(false);
    }
  };

  const handleCopyComment = async (comment: CommentSuggestion) => {
    await navigator.clipboard.writeText(comment.text);
    setCopiedId(comment.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getScrapeMessage = (e: SSEEvent): string => {
    const d = e.data;
    switch (e.event) {
      case "started":
        return `Starting scrape for ${d.total} source(s)...`;
      case "progress":
        return `[${d.current}/${d.total}] Scraping ${d.sourceType === "handle" ? "@" : ""}${d.sourceValue}...`;
      case "scrape-progress":
        if (d.type === "attempt") {
          return `  Trying ${d.window} window...`;
        } else if (d.type === "expanding") {
          return `  ${String(d.message)}`;
        } else if (d.type === "response") {
          return `  Grok returned ${d.parsedCount} tweets, ${d.filteredCount} after filtering`;
        }
        return String(d.message);
      case "source-complete":
        return `Done "${d.sourceValue}" - ${d.found} tweets (${d.finalWindow} window)`;
      case "source-error":
        return `Error "${d.sourceValue}": ${d.error}`;
      case "complete":
        return `Scrape complete! ${d.totalFound} tweets total`;
      case "error":
        return `Error: ${d.message}`;
      default:
        return JSON.stringify(d);
    }
  };

  if (isLoading || !leaderboard) {
    return (
      <div className="text-zinc-500 text-sm py-8 text-center">
        Loading leaderboard...
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href="/leaderboard"
            className="text-xs text-zinc-500 hover:text-zinc-400 mb-1 block"
          >
            &larr; Back to leaderboards
          </Link>
          <h1 className="text-2xl font-bold text-white">{leaderboard.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {leaderboard.sources.map((source, i) => (
              <span
                key={i}
                className={cn(
                  "text-xs px-2 py-0.5 rounded",
                  source.type === "handle"
                    ? "bg-purple-500/20 text-purple-400"
                    : "bg-blue-500/20 text-blue-400"
                )}
              >
                {source.type === "handle" ? `@${source.value}` : source.value}
              </span>
            ))}
          </div>
          {leaderboard.lastScrapedAt && (
            <p className="text-xs text-zinc-500 mt-2">
              Last updated: {formatDate(leaderboard.lastScrapedAt)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={scrapeSSE.status === "running" || leaderboard.isScrapingNow}
          className={cn(
            "px-4 py-2 text-sm rounded-lg transition-colors",
            scrapeSSE.status === "running" || leaderboard.isScrapingNow
              ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-500"
          )}
        >
          {scrapeSSE.status === "running" || leaderboard.isScrapingNow
            ? "Refreshing..."
            : "Refresh Now"}
        </button>
      </div>

      {/* Scrape progress */}
      {scrapeSSE.status === "running" && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-400">Scraping Progress</h3>
            <span className="text-xs text-blue-400 animate-pulse">Running...</span>
          </div>
          <div className="space-y-1 font-mono text-xs max-h-32 overflow-y-auto">
            {scrapeSSE.events.map((e, i) => (
              <div
                key={i}
                className={cn(
                  "text-zinc-400",
                  e.event === "error" && "text-red-400",
                  e.event === "source-error" && "text-red-400",
                  e.event === "complete" && "text-green-400 font-medium",
                  e.event === "source-complete" && "text-zinc-300"
                )}
              >
                {getScrapeMessage(e)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-column layout: tweets + comment panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tweet list */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">
            Trending Tweets ({tweets.length})
          </h3>
          {tweets.length === 0 ? (
            <div className="text-zinc-500 text-sm py-8 text-center rounded-lg border border-zinc-800 bg-zinc-900">
              No tweets yet. Click "Refresh Now" to scrape.
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
              {tweets.map((tweet, index) => (
                <button
                  key={tweet.id}
                  type="button"
                  onClick={() => handleSelectTweet(tweet)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-colors",
                    selectedTweet?.id === tweet.id
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Rank badge */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-zinc-200 text-sm">
                          @{tweet.handle}
                        </span>
                        <span
                          className={cn(
                            "text-xs px-1.5 py-0.5 rounded",
                            tweet.sourceType === "handle"
                              ? "bg-purple-500/20 text-purple-400"
                              : "bg-blue-500/20 text-blue-400"
                          )}
                        >
                          {tweet.sourceType}
                        </span>
                      </div>
                      {/* Tweet text */}
                      <p className="text-sm text-zinc-400 line-clamp-2 mb-2">
                        {cleanTweetText(tweet.text)}
                      </p>
                      {/* Metrics */}
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span title="Views">{formatNumber(tweet.views)} views</span>
                        <span title="Likes">{formatNumber(tweet.likes)} likes</span>
                        <span title="Retweets">{formatNumber(tweet.retweets)} RTs</span>
                        <span
                          className="text-amber-400 font-medium"
                          title="Engagement score"
                        >
                          {formatNumber(tweet.engagementScore)} score
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comment panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">
              Comment Suggestions
            </h3>
            {!selectedTweet ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-center">
                <p className="text-sm text-zinc-500">
                  Select a tweet to generate comment suggestions
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-4">
                {/* Selected tweet preview */}
                <div className="border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-zinc-200 text-sm">
                      @{selectedTweet.handle}
                    </span>
                    <a
                      href={selectedTweet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      View on X
                    </a>
                  </div>
                  <p className="text-sm text-zinc-400">
                    {truncate(cleanTweetText(selectedTweet.text), 150)}
                  </p>
                </div>

                {/* Persona selector */}
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">
                    Persona (optional)
                  </label>
                  <select
                    value={personaSlug}
                    onChange={(e) => setPersonaSlug(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-300"
                  >
                    <option value="">Default persona</option>
                    {personas.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name}
                        {p.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Generate button */}
                <button
                  type="button"
                  onClick={handleGenerateComments}
                  disabled={isGeneratingComments}
                  className={cn(
                    "w-full px-3 py-2 text-sm rounded-lg transition-colors",
                    isGeneratingComments
                      ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                      : "bg-amber-600 text-white hover:bg-amber-500"
                  )}
                >
                  {isGeneratingComments ? "Generating..." : "Generate Comments"}
                </button>

                {/* Error */}
                {commentError && (
                  <div className="text-sm text-red-400 bg-red-500/10 rounded p-2">
                    {commentError}
                  </div>
                )}

                {/* Generated comments */}
                {comments.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-zinc-500 uppercase">
                      Suggestions
                    </h4>
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded border border-zinc-700 bg-zinc-800/50 p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded capitalize",
                              comment.tone === "witty" && "bg-purple-500/20 text-purple-400",
                              comment.tone === "insightful" && "bg-blue-500/20 text-blue-400",
                              comment.tone === "supportive" && "bg-green-500/20 text-green-400"
                            )}
                          >
                            {comment.tone}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {comment.confidence}/10
                          </span>
                        </div>
                        <p className="text-sm text-zinc-300 mb-2">{comment.text}</p>
                        <button
                          type="button"
                          onClick={() => handleCopyComment(comment)}
                          className={cn(
                            "text-xs px-2 py-1 rounded transition-colors",
                            copiedId === comment.id
                              ? "bg-green-600 text-white"
                              : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                          )}
                        >
                          {copiedId === comment.id ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
