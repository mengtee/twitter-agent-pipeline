"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useSession, updateSession } from "@/hooks/use-sessions";
import { usePersonas } from "@/hooks/use-personas";
import { useSSE, type SSEEvent } from "@/hooks/use-sse";
import { StageIndicator } from "@/components/stage-indicator";
import { TweetSelectCard } from "@/components/tweet-select-card";
import { SampleCard } from "@/components/sample-card";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading, mutate } = useSession(id);
  const { personas } = usePersonas();

  const scrapeSSE = useSSE(`/api/sessions/${id}/scrape`);
  const generateSSE = useSSE(`/api/sessions/${id}/generate`);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [personaSlug, setPersonaSlug] = useState("");
  const [finalText, setFinalText] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync local state from session data
  useEffect(() => {
    if (!session) return;
    setSelectedIds(new Set(session.selectedTweetIds));
    setPrompt(session.userPrompt || "");
    setPersonaSlug(session.personaSlug || "");
    setFinalText(session.finalText || session.samples.find(s => s.id === session.chosenSampleId)?.text || "");
  }, [session]);

  // Auto-start scrape when session is in "created" stage
  const scrapeStarted = scrapeSSE.status !== "idle";
  useEffect(() => {
    if (session?.stage === "created" && !scrapeStarted) {
      scrapeSSE.start();
    }
  }, [session?.stage, scrapeStarted, scrapeSSE]);

  // Refresh session after scrape completes
  useEffect(() => {
    if (scrapeSSE.status === "done") {
      mutate();
    }
  }, [scrapeSSE.status, mutate]);

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

  const handleGenerate = async () => {
    if (selectedIds.size === 0 || !prompt.trim()) return;

    // Save selections + advance stage to "selected", then start generation
    await updateSession(id, {
      selectedTweetIds: Array.from(selectedIds),
      userPrompt: prompt.trim(),
      personaSlug: personaSlug || undefined,
      stage: "selected",
    });

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
    await updateSession(id, { finalText });
    setSaving(false);
    mutate();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(finalText);
  };

  const handleGoToStage = async (stage: string) => {
    if (stage === "created") {
      // Re-scrape: reset stage, then trigger scrape
      await updateSession(id, { stage: "created" });
      scrapeSSE.reset();
      generateSSE.reset();
      await mutate();
      scrapeSSE.start();
    } else if (stage === "scraped") {
      // Go back to tweet selection
      generateSSE.reset();
      await updateSession(id, { stage: "scraped" });
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
      case "search-complete":
        return `"${d.search}" found ${d.found} tweets`;
      case "search-error":
        return `"${d.search}" error: ${d.error}`;
      case "complete":
        return `Done! Found ${d.totalFound} tweets`;
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

      {/* Stage: scraped — select tweets + write prompt */}
      {session.stage === "scraped" && (
        <div className="space-y-6">
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
              rows={3}
              placeholder="e.g. Combine these tweets into one insightful post about the current market..."
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
        session.stage !== "scraped" && (
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
                  onClick={handleCopy}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                >
                  Copy
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
                onClick={handleSaveFinal}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-500 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Edit"}
              </button>
            </div>
          </div>

          {/* Session summary */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-xs font-medium text-zinc-500 mb-2">
              SESSION SUMMARY
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-zinc-500 text-xs mb-1">Prompt</div>
                <div className="text-zinc-300">{session.userPrompt}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs mb-1">Source</div>
                <div className="text-zinc-300">
                  {session.selectedTweetIds.length} tweet(s) from{" "}
                  {session.searchNames.join(", ")}
                </div>
              </div>
            </div>
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
