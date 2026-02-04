"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { generateComments } from "@/hooks/use-leaderboard";
import { usePersonas } from "@/hooks/use-personas";
import type { TrendingTweet, CommentSuggestion } from "@pipeline/types.js";

/** Strip t.co links from tweet text */
function cleanTweetText(text: string): string {
  return text.replace(/\s*https?:\/\/t\.co\/\w+/g, "").trim();
}

/** Format large numbers */
function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

interface CommentModalProps {
  tweet: TrendingTweet;
  onClose: () => void;
}

export function CommentModal({ tweet, onClose }: CommentModalProps) {
  const { personas } = usePersonas();
  const [personaSlug, setPersonaSlug] = useState<string>("");
  const [suggestions, setSuggestions] = useState<CommentSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setSuggestions([]);

    try {
      const result = await generateComments(
        tweet.id,
        personaSlug || undefined
      );
      setSuggestions(result.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback
    }
  };

  const toneColors: Record<string, string> = {
    witty: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    insightful: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    supportive: "bg-green-500/20 text-green-400 border-green-500/30",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">
            Generate Comment
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tweet preview */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-2 text-xs mb-2">
            <span className="font-medium text-zinc-300">@{tweet.handle}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">{tweet.author}</span>
          </div>
          <p className="text-sm text-zinc-300 mb-2">{cleanTweetText(tweet.text)}</p>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>{formatNumber(tweet.views)} views</span>
            <span>{formatNumber(tweet.likes)} likes</span>
            <span>{formatNumber(tweet.retweets)} RTs</span>
            <a
              href={tweet.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 ml-auto"
            >
              View on X ↗
            </a>
          </div>
        </div>

        {/* Generate controls */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <select
              value={personaSlug}
              onChange={(e) => setPersonaSlug(e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">No persona (generic)</option>
              {personas.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className={cn(
                "px-4 py-2 text-sm rounded-lg transition-colors",
                isGenerating
                  ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-500"
              )}
            >
              {isGenerating ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="p-4 overflow-y-auto max-h-80">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}

          {suggestions.length === 0 && !isGenerating && !error && (
            <div className="text-center py-8 text-zinc-500 text-sm">
              Click Generate to create comment suggestions
            </div>
          )}

          {isGenerating && (
            <div className="text-center py-8 text-zinc-400 text-sm">
              <div className="animate-spin inline-block mb-2">⟳</div>
              <p>Generating suggestions...</p>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-3">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="p-3 rounded-lg border border-zinc-800 bg-zinc-800/30"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full border",
                        toneColors[suggestion.tone] || "bg-zinc-800 text-zinc-400"
                      )}
                    >
                      {suggestion.tone}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {suggestion.confidence}/10 confidence
                    </span>
                    <span className="text-xs text-zinc-600 ml-auto">
                      {suggestion.text.length}/280
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300 mb-2">{suggestion.text}</p>
                  <button
                    type="button"
                    onClick={() => handleCopy(suggestion.text, suggestion.id)}
                    className={cn(
                      "text-xs px-2 py-1 rounded transition-colors",
                      copied === suggestion.id
                        ? "bg-green-500/20 text-green-400"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                    )}
                  >
                    {copied === suggestion.id ? "✓ Copied!" : "Copy"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
