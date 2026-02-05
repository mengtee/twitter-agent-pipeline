"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession, updateSession } from "@/hooks/use-sessions";
import { usePersonas } from "@/hooks/use-personas";
import { useSSE, type SSEEvent } from "@/hooks/use-sse";
import { StageIndicator } from "@/components/stage-indicator";
import { TweetSelectCard } from "@/components/tweet-select-card";
import { SampleCard } from "@/components/sample-card";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ContentIdea } from "@pipeline/types.js";

/** Strip t.co links from tweet text for cleaner display */
function cleanTweetText(text: string): string {
  return text.replace(/\s*https?:\/\/t\.co\/\w+/g, "").trim();
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading, mutate } = useSession(id);
  const { personas } = usePersonas();

  const scrapeSSE = useSSE(`/api/sessions/${id}/scrape`);
  const analyzeSSE = useSSE(`/api/sessions/${id}/analyze`);
  const generateSSE = useSSE(`/api/sessions/${id}/generate`);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [personaSlug, setPersonaSlug] = useState("");
  const [finalText, setFinalText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync local state from session data
  useEffect(() => {
    if (!session) return;
    setSelectedIds(new Set(session.selectedTweetIds));
    setPrompt(session.userPrompt || "");
    setPersonaSlug(session.personaSlug || "");
    setFinalText(session.finalText || session.samples.find(s => s.id === session.chosenSampleId)?.text || "");
  }, [session]);

  // Auto-start scrape when session is in "created" stage
  const scrapeTriggeredRef = useRef(false);
  useEffect(() => {
    if (session?.stage === "created" && !scrapeTriggeredRef.current) {
      scrapeTriggeredRef.current = true;
      scrapeSSE.start();
    }
  }, [session?.stage, scrapeSSE]);

  // Auto-start analyze when session is in "scraped" stage
  const analyzeTriggeredRef = useRef(false);
  useEffect(() => {
    if (session?.stage === "scraped" && !analyzeTriggeredRef.current) {
      analyzeTriggeredRef.current = true;
      analyzeSSE.start();
    }
  }, [session?.stage, analyzeSSE]);

  // Auto-start generate when session is in "selected" stage (e.g. after page refresh)
  const generateTriggeredRef = useRef(false);
  useEffect(() => {
    if (session?.stage === "selected" && !generateTriggeredRef.current) {
      generateTriggeredRef.current = true;
      generateSSE.start();
    }
  }, [session?.stage, generateSSE]);

  // Refresh session after scrape completes
  useEffect(() => {
    if (scrapeSSE.status === "done") {
      mutate();
    }
  }, [scrapeSSE.status, mutate]);

  // Refresh session after analyze completes
  useEffect(() => {
    if (analyzeSSE.status === "done") {
      mutate();
    }
  }, [analyzeSSE.status, mutate]);

  // Refresh session after generate completes
  useEffect(() => {
    if (generateSSE.status === "done") {
      mutate();
    }
  }, [generateSSE.status, mutate]);

  const toggleTweet = useCallback((tweetId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tweetId)) next.delete(tweetId);
      else next.add(tweetId);
      return next;
    });
  }, []);

  const handleUseIdea = (idea: ContentIdea) => {
    // Pre-fill the prompt with the content idea
    setPrompt(`${idea.title}\n\n${idea.description}\n\nAngle: ${idea.angle}`);
    // Auto-select source tweets for this idea
    if (idea.sourceTweetIds && idea.sourceTweetIds.length > 0) {
      setSelectedIds(new Set(idea.sourceTweetIds));
    }
  };

  const handleSelectTopicTweets = (tweetIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of tweetIds) {
        next.add(id);
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selectedIds.size === 0 || !prompt.trim()) return;

    // Save selections + advance stage to "selected", then start generation
    await updateSession(id, {
      selectedTweetIds: Array.from(selectedIds),
      userPrompt: prompt.trim(),
      personaSlug: personaSlug || undefined,
      stage: "selected",
    });

    generateTriggeredRef.current = true;
    generateSSE.start();
  };

  const handleRegenerate = async () => {
    // Go back to selected stage and regenerate
    await updateSession(id, {
      stage: "selected",
      selectedTweetIds: Array.from(selectedIds),
      userPrompt: prompt.trim(),
      personaSlug: personaSlug || undefined,
    });
    generateTriggeredRef.current = true;
    generateSSE.reset();
    generateSSE.start();
  };

  const handleChoose = async (sampleId: string) => {
    const sample = session?.samples.find((s) => s.id === sampleId);
    if (!sample) return;
    setFinalText(sample.text);
    await updateSession(id, {
      chosenSampleId: sampleId,
      finalText: sample.text,
      stage: "completed",
    });
    mutate();
  };

  const handleSaveFinal = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateSession(id, { finalText });
      await mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Save failed:", err);
      alert(`Failed to save: ${err instanceof Error ? err.message : "Network error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(finalText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGoToStage = async (stage: string) => {
    if (stage === "created") {
      // Re-scrape: reset stage, then trigger scrape
      await updateSession(id, { stage: "created" });
      scrapeSSE.reset();
      analyzeSSE.reset();
      generateSSE.reset();
      analyzeTriggeredRef.current = false;
      generateTriggeredRef.current = false;
      await mutate();
      scrapeSSE.start();
    } else if (stage === "scraped") {
      // Go back to analyze
      analyzeSSE.reset();
      generateSSE.reset();
      analyzeTriggeredRef.current = false;
      generateTriggeredRef.current = false;
      await updateSession(id, { stage: "scraped" });
      await mutate();
      analyzeSSE.start();
    } else if (stage === "analyzed") {
      // Go back to tweet selection
      generateSSE.reset();
      generateTriggeredRef.current = false;
      await updateSession(id, { stage: "analyzed" });
      mutate();
    } else if (stage === "generated") {
      // Go back to choose sample
      await updateSession(id, { stage: "generated" });
      mutate();
    }
  };

  if (isLoading || !session) {
    return (
      <div className="text-zinc-500 text-sm py-8 text-center">
        Loading session...
      </div>
    );
  }

  const getScrapeMessage = (e: SSEEvent): string => {
    const d = e.data;
    switch (e.event) {
      case "started":
        return `Starting ${d.total} search(es)...`;
      case "progress":
        return `[${d.current}/${d.total}] Searching "${d.search}"...`;
      case "scrape-progress":
        if (d.type === "attempt") {
          return `  → Trying ${d.window} window...`;
        } else if (d.type === "expanding") {
          return `  → ${String(d.message)}`;
        } else if (d.type === "response") {
          return `  → Grok returned ${d.parsedCount} tweets, ${d.filteredCount} after filtering`;
        }
        return String(d.message);
      case "search-complete":
        return `✓ "${d.search}" found ${d.found} tweets${d.finalWindow ? ` (${d.finalWindow} window)` : ""}`;
      case "search-error":
        return `✗ "${d.search}" error: ${d.error}`;
      case "complete":
        return `Done! Found ${d.totalFound} tweets total`;
      case "error":
        return `Error: ${d.message}`;
      default:
        return JSON.stringify(d);
    }
  };

  const getAnalyzeMessage = (e: SSEEvent): string => {
    const d = e.data;
    switch (e.event) {
      case "started":
        return `Analyzing ${d.tweetCount} tweets from ${(d.searchNames as string[])?.join(", ") ?? "searches"}...`;
      case "analyzing":
        return String(d.message);
      case "complete":
        return `Done! Found ${(d.analysis as { trendingTopics?: unknown[] })?.trendingTopics?.length ?? 0} trending topics`;
      case "error":
        return `Error: ${d.message}`;
      default:
        return JSON.stringify(d);
    }
  };

  const getGenerateMessage = (e: SSEEvent): string => {
    const d = e.data;
    switch (e.event) {
      case "started":
        return `Generating with ${d.persona ?? "default"} persona (${d.tweetCount} source tweets)...`;
      case "generating":
        return String(d.message);
      case "complete":
        return `Done! Generated ${(d.samples as unknown[])?.length ?? 0} variations`;
      case "error":
        return `Error: ${d.message}`;
      default:
        return JSON.stringify(d);
    }
  };

  const formatLabels: Record<string, string> = {
    thread: "Thread",
    single: "Single Tweet",
    poll: "Poll",
    media: "Media Post",
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link
            href="/sessions"
            className="text-xs text-zinc-500 hover:text-zinc-400 mb-1 block"
          >
            &larr; Back to sessions
          </Link>
          <h2 className="text-2xl font-bold text-white">{session.name}</h2>
        </div>
      </div>

      <div className="mb-6">
        <StageIndicator current={session.stage} onStageClick={handleGoToStage} />
      </div>

      {/* Stage: created — scraping */}
      {(session.stage === "created" || scrapeSSE.status === "running") && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-400">
              Scraping Tweets
            </h3>
            {scrapeSSE.status === "running" && (
              <span className="text-xs text-blue-400 animate-pulse">
                Running...
              </span>
            )}
            {scrapeSSE.status === "done" && (
              <span className="text-xs text-green-400">Complete</span>
            )}
          </div>
          <div className="space-y-1 font-mono text-xs">
            {scrapeSSE.events.map((e, i) => (
              <div
                key={i}
                className={cn(
                  "text-zinc-400",
                  e.event === "error" && "text-red-400",
                  e.event === "search-error" && "text-red-400",
                  e.event === "complete" && "text-green-400 font-medium",
                  e.event === "search-complete" && "text-zinc-300"
                )}
              >
                {getScrapeMessage(e)}
              </div>
            ))}
            {scrapeSSE.events.length === 0 && (
              <div className="text-zinc-500">Starting scrape...</div>
            )}
          </div>
        </div>
      )}

      {/* Stage: scraped — analyzing */}
      {(session.stage === "scraped" || analyzeSSE.status === "running") &&
        session.stage !== "created" && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-zinc-400">
                Analyzing Trends
              </h3>
              {analyzeSSE.status === "running" && (
                <span className="text-xs text-purple-400 animate-pulse">
                  Running...
                </span>
              )}
              {analyzeSSE.status === "done" && (
                <span className="text-xs text-green-400">Complete</span>
              )}
            </div>
            <div className="space-y-1 font-mono text-xs">
              {analyzeSSE.events.map((e, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-zinc-400",
                    e.event === "error" && "text-red-400",
                    e.event === "complete" && "text-green-400 font-medium"
                  )}
                >
                  {getAnalyzeMessage(e)}
                </div>
              ))}
              {analyzeSSE.events.length === 0 && (
                <div className="text-zinc-500">Starting analysis...</div>
              )}
            </div>
          </div>
        )}

      {/* Stage: analyzed — show analysis + select tweets + write prompt */}
      {session.stage === "analyzed" && (
        <div className="space-y-6">
          {/* Trend Analysis Results */}
          {session.analysis && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
                <h3 className="text-sm font-medium text-purple-400 mb-2">
                  Trend Summary
                </h3>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                  {session.analysis.summary}
                </p>
              </div>

              {/* Topics with Tweets */}
              {session.analysis.topicsWithTweets && session.analysis.topicsWithTweets.length > 0 ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="text-sm font-medium text-zinc-400 mb-3">
                    Trending Topics & Related Tweets
                    <span className="text-xs text-zinc-500 font-normal ml-2">
                      (click tweets to select)
                    </span>
                  </h3>
                  <div className="space-y-4">
                    {session.analysis.topicsWithTweets.map((topicGroup, i) => {
                      const tweetsInTopic = session.scrapedTweets.filter(t =>
                        topicGroup.tweetIds.includes(t.id)
                      );
                      const selectedCount = tweetsInTopic.filter(t => selectedIds.has(t.id)).length;
                      const allSelected = tweetsInTopic.length > 0 && selectedCount === tweetsInTopic.length;
                      return (
                        <div key={i} className="border-l-2 border-purple-500/30 pl-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-start gap-2">
                              <span className="text-purple-400 font-medium shrink-0">
                                {i + 1}.
                              </span>
                              <div>
                                <span className="text-sm font-medium text-zinc-200">
                                  {topicGroup.topic}
                                </span>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                  {topicGroup.explanation}
                                </p>
                              </div>
                            </div>
                            {tweetsInTopic.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleSelectTopicTweets(topicGroup.tweetIds)}
                                className={cn(
                                  "text-xs px-2 py-1 rounded transition-colors shrink-0",
                                  allSelected
                                    ? "bg-purple-500/20 text-purple-300"
                                    : "text-purple-400 hover:bg-purple-500/10"
                                )}
                              >
                                {allSelected ? `✓ ${selectedCount} selected` : `Select all ${tweetsInTopic.length}`}
                              </button>
                            )}
                          </div>
                          {tweetsInTopic.length > 0 && (
                            <div className="ml-5 space-y-2 mt-2">
                              {tweetsInTopic.map(tweet => {
                                const isSelected = selectedIds.has(tweet.id);
                                return (
                                  <div
                                    key={tweet.id}
                                    className={cn(
                                      "w-full text-left text-xs rounded p-2 transition-all",
                                      isSelected
                                        ? "bg-purple-500/20 border border-purple-500/40"
                                        : "bg-zinc-800/50 border border-transparent hover:border-zinc-600"
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                      <button
                                        type="button"
                                        onClick={() => toggleTweet(tweet.id)}
                                        className="flex items-center gap-2"
                                      >
                                        <span className={cn(
                                          "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                          isSelected
                                            ? "bg-purple-500 border-purple-500 text-white"
                                            : "border-zinc-600"
                                        )}>
                                          {isSelected && "✓"}
                                        </span>
                                        <span className="font-medium text-zinc-300">
                                          @{tweet.handle}
                                        </span>
                                        <span className="text-zinc-500">
                                          {tweet.views.toLocaleString()} views
                                        </span>
                                      </button>
                                      <a
                                        href={tweet.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-purple-400 hover:text-purple-300 shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        View →
                                      </a>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => toggleTweet(tweet.id)}
                                      className="text-zinc-400 line-clamp-2 ml-6 text-left w-full"
                                    >
                                      {cleanTweetText(tweet.text)}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : session.analysis.trendingTopics.length > 0 && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="text-sm font-medium text-zinc-400 mb-3">
                    Trending Topics
                  </h3>
                  <div className="space-y-2">
                    {session.analysis.trendingTopics.map((topic, i) => (
                      <div
                        key={i}
                        className="text-sm text-zinc-300 flex items-start gap-2"
                      >
                        <span className="text-purple-400 font-medium shrink-0">
                          {i + 1}.
                        </span>
                        <span>{topic}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Content Ideas */}
              {session.analysis.contentIdeas.length > 0 && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <h3 className="text-sm font-medium text-zinc-400 mb-3">
                    Content Ideas
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {session.analysis.contentIdeas.map((idea, i) => {
                      const sourceTweets = session.scrapedTweets.filter(t =>
                        idea.sourceTweetIds?.includes(t.id)
                      );
                      return (
                        <div
                          key={i}
                          className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-sm font-medium text-zinc-200">
                              {idea.title}
                            </h4>
                            <span className="text-xs text-amber-400 shrink-0">
                              {idea.relevanceScore}/10
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 mb-2">
                            {idea.description}
                          </p>
                          <p className="text-xs text-zinc-500 mb-3">
                            <span className="text-zinc-400">Angle:</span>{" "}
                            {idea.angle}
                          </p>

                          {/* Source tweets for this idea */}
                          {sourceTweets.length > 0 && (
                            <div className="mb-3 border-t border-zinc-700 pt-2">
                              <div className="text-xs text-zinc-500 mb-1.5">
                                Based on {sourceTweets.length} tweet{sourceTweets.length > 1 ? "s" : ""}:
                              </div>
                              <div className="space-y-1.5 max-h-24 overflow-y-auto">
                                {sourceTweets.map(tweet => {
                                  const isSelected = selectedIds.has(tweet.id);
                                  return (
                                    <div
                                      key={tweet.id}
                                      className={cn(
                                        "w-full text-left text-xs rounded p-1.5 transition-all",
                                        isSelected
                                          ? "bg-blue-500/20 border border-blue-500/40"
                                          : "bg-zinc-900/50 border border-transparent hover:border-zinc-600"
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-1.5 mb-0.5">
                                        <button
                                          type="button"
                                          onClick={() => toggleTweet(tweet.id)}
                                          className="flex items-center gap-1.5"
                                        >
                                          <span className={cn(
                                            "w-3 h-3 rounded border flex items-center justify-center shrink-0 text-[8px]",
                                            isSelected
                                              ? "bg-blue-500 border-blue-500 text-white"
                                              : "border-zinc-600"
                                          )}>
                                            {isSelected && "✓"}
                                          </span>
                                          <span className="font-medium text-zinc-400">
                                            @{tweet.handle}
                                          </span>
                                          <span className="text-zinc-600">
                                            {tweet.views.toLocaleString()} views
                                          </span>
                                        </button>
                                        <a
                                          href={tweet.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-400 hover:text-blue-300 shrink-0 text-[10px]"
                                        >
                                          View →
                                        </a>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => toggleTweet(tweet.id)}
                                        className="text-zinc-500 line-clamp-1 ml-[18px] text-left w-full"
                                      >
                                        {cleanTweetText(tweet.text)}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <span className="text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-400">
                              {formatLabels[idea.suggestedFormat] || idea.suggestedFormat}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUseIdea(idea)}
                              className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-blue-500/10"
                            >
                              Use idea{sourceTweets.length > 0 ? ` + ${sourceTweets.length} tweets` : ""}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tweet selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-zinc-400">
                Select Tweets ({selectedIds.size} selected of{" "}
                {session.scrapedTweets.length})
              </h3>
              <button
                onClick={() =>
                  setSelectedIds(
                    new Set(session.scrapedTweets.map((t) => t.id))
                  )
                }
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Select all
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {session.scrapedTweets.map((tweet) => (
                <TweetSelectCard
                  key={tweet.id}
                  tweet={tweet}
                  selected={selectedIds.has(tweet.id)}
                  onToggle={toggleTweet}
                />
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-sm font-medium text-zinc-400 mb-2 block">
              Your Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="e.g. Combine these tweets into one insightful post about the current market... (or click 'Use this idea' above)"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Persona picker */}
          <div>
            <label className="text-sm font-medium text-zinc-400 mb-2 block">
              Persona
            </label>
            <select
              value={personaSlug}
              onChange={(e) => setPersonaSlug(e.target.value)}
              className="px-3 py-2 text-sm rounded bg-zinc-900 border border-zinc-700 text-zinc-300 focus:outline-none focus:border-blue-500"
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
            onClick={handleGenerate}
            disabled={
              selectedIds.size === 0 ||
              !prompt.trim() ||
              generateSSE.status === "running"
            }
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-colors",
              selectedIds.size === 0 || !prompt.trim()
                ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                : "bg-amber-600 text-white hover:bg-amber-500"
            )}
          >
            {generateSSE.status === "running"
              ? "Generating..."
              : "Generate 3 Samples"}
          </button>
        </div>
      )}

      {/* Stage: selected — generating */}
      {(session.stage === "selected" || generateSSE.status === "running") &&
        session.stage !== "analyzed" && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-zinc-400">
                Generating Samples
              </h3>
              {generateSSE.status === "running" && (
                <span className="text-xs text-amber-400 animate-pulse">
                  Running...
                </span>
              )}
              {generateSSE.status === "done" && (
                <span className="text-xs text-green-400">Complete</span>
              )}
            </div>
            <div className="space-y-1 font-mono text-xs">
              {generateSSE.events.map((e, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-zinc-400",
                    e.event === "error" && "text-red-400",
                    e.event === "complete" && "text-green-400 font-medium"
                  )}
                >
                  {getGenerateMessage(e)}
                </div>
              ))}
              {generateSSE.events.length === 0 && (
                <div className="text-zinc-500">
                  Starting generation...
                </div>
              )}
            </div>
            {(generateSSE.status === "error" || generateSSE.status === "done") && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleGoToStage("analyzed")}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                >
                  Back to Selection
                </button>
                {generateSSE.status === "error" && (
                  <button
                    onClick={handleRegenerate}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-500 transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        )}

      {/* Stage: generated — choose a sample */}
      {session.stage === "generated" && (
        <div className="space-y-6">
          {/* Source info */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-xs font-medium text-zinc-500 mb-2">
              PROMPT
            </h3>
            <p className="text-sm text-zinc-300">{session.userPrompt}</p>
            <div className="text-xs text-zinc-500 mt-2">
              {session.selectedTweetIds.length} source tweet(s)
              {session.personaSlug && ` · Persona: ${session.personaSlug}`}
            </div>
          </div>

          {/* Samples */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3">
              Choose a Variation
            </h3>
            <div className="grid gap-3 md:grid-cols-3">
              {session.samples.map((sample, i) => (
                <SampleCard
                  key={sample.id}
                  sample={sample}
                  index={i}
                  chosen={session.chosenSampleId === sample.id}
                  onChoose={handleChoose}
                />
              ))}
            </div>
          </div>

          {/* Regenerate */}
          <button
            onClick={handleRegenerate}
            disabled={generateSSE.status === "running"}
            className="px-4 py-2 rounded-md text-sm font-medium bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
          >
            Regenerate Samples
          </button>
        </div>
      )}

      {/* Stage: completed */}
      {session.stage === "completed" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-green-400">
                Final Tweet
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                    copied
                      ? "bg-green-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  )}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <textarea
              value={finalText}
              onChange={(e) => setFinalText(e.target.value)}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-green-500 resize-none mb-2"
            />
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "text-xs",
                  finalText.length > 280 ? "text-red-400" : "text-zinc-500"
                )}
              >
                {finalText.length}/280
              </span>
              <button
                type="button"
                onClick={handleSaveFinal}
                disabled={saving}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-50",
                  saved
                    ? "bg-green-500 text-white"
                    : "bg-green-600 text-white hover:bg-green-500"
                )}
              >
                {saving ? "Saving..." : saved ? "Saved!" : "Save Edit"}
              </button>
            </div>
          </div>

          {/* Session summary */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-4">
            <h3 className="text-xs font-medium text-zinc-500">
              SESSION SUMMARY
            </h3>

            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-zinc-500 text-xs mb-1">Prompt</div>
                <div className="text-zinc-300 whitespace-pre-wrap">{session.userPrompt}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs mb-1">Persona</div>
                <div className="text-zinc-300">
                  {session.personaSlug || "Default"}
                </div>
              </div>
            </div>

            {/* Chosen sample info */}
            {session.chosenSampleId && (() => {
              const chosenSample = session.samples.find(s => s.id === session.chosenSampleId);
              return chosenSample ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-zinc-500 text-xs mb-1">Confidence Score</div>
                      <div className="text-zinc-300">{chosenSample.confidence}/10</div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-xs mb-1">Hashtags</div>
                      <div className="text-zinc-300">
                        {chosenSample.hashtags.length > 0
                          ? chosenSample.hashtags.map(h => `#${h}`).join(" ")
                          : "None"}
                      </div>
                    </div>
                  </div>
                  {chosenSample.imageSuggestion && (
                    <div>
                      <div className="text-zinc-500 text-xs mb-1">Image Suggestion</div>
                      <div className="text-zinc-300 text-sm bg-zinc-800/50 rounded p-2">
                        {chosenSample.imageSuggestion}
                      </div>
                    </div>
                  )}
                </div>
              ) : null;
            })()}

            {/* Selected tweets */}
            <div>
              <div className="text-zinc-500 text-xs mb-2">
                Source Tweets ({session.selectedTweetIds.length} selected from {session.searchNames.join(", ")})
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {session.scrapedTweets
                  .filter(t => session.selectedTweetIds.includes(t.id))
                  .map(tweet => (
                    <div key={tweet.id} className="text-xs bg-zinc-800/50 rounded p-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-300">@{tweet.handle}</span>
                          <span className="text-zinc-500">
                            {tweet.views.toLocaleString()} views · {tweet.likes.toLocaleString()} likes
                          </span>
                        </div>
                        <a
                          href={tweet.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 shrink-0"
                        >
                          View →
                        </a>
                      </div>
                      <div className="text-zinc-400 line-clamp-2">{cleanTweetText(tweet.text)}</div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Token usage */}
            {(session.scrapeTokens || session.analyzeTokens || session.generateTokens) && (
              <div>
                <div className="text-zinc-500 text-xs mb-1">Token Usage</div>
                <div className="flex gap-4 text-xs text-zinc-400">
                  {session.scrapeTokens && (
                    <span>Scrape: {(session.scrapeTokens.input + session.scrapeTokens.output).toLocaleString()}</span>
                  )}
                  {session.analyzeTokens && (
                    <span>Analyze: {(session.analyzeTokens.input + session.analyzeTokens.output).toLocaleString()}</span>
                  )}
                  {session.generateTokens && (
                    <span>Generate: {(session.generateTokens.input + session.generateTokens.output).toLocaleString()}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Navigation hint */}
          <p className="text-xs text-zinc-600">
            Click any completed stage above to go back and make changes.
          </p>
        </div>
      )}
    </div>
  );
}
