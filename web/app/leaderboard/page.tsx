"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import {
  useLeaderboards,
  createLeaderboard,
  deleteLeaderboard,
} from "@/hooks/use-leaderboard";
import type { LeaderboardSource } from "@pipeline/types.js";

export default function LeaderboardListPage() {
  const { leaderboards, isLoading, mutate } = useLeaderboards();

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSources, setNewSources] = useState<LeaderboardSource[]>([]);
  const [newSourceType, setNewSourceType] = useState<"handle" | "topic">("handle");
  const [newSourceValue, setNewSourceValue] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddSource = () => {
    if (!newSourceValue.trim()) return;
    const value = newSourceType === "handle"
      ? newSourceValue.replace(/^@/, "").trim()
      : newSourceValue.trim();
    setNewSources([...newSources, { type: newSourceType, value }]);
    setNewSourceValue("");
  };

  const handleRemoveSource = (index: number) => {
    setNewSources(newSources.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!newName.trim() || newSources.length === 0) return;
    setIsCreating(true);
    try {
      await createLeaderboard(newName.trim(), newSources);
      mutate();
      setShowCreateForm(false);
      setNewName("");
      setNewSources([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete leaderboard "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteLeaderboard(id);
      mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Leaderboards</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Track trending tweets from accounts and topics
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={cn(
            "px-4 py-2 text-sm rounded-lg transition-colors",
            showCreateForm
              ? "bg-zinc-700 text-white"
              : "bg-blue-600 text-white hover:bg-blue-500"
          )}
        >
          {showCreateForm ? "Cancel" : "+ New Leaderboard"}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-6">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">Create New Leaderboard</h3>

          {/* Name */}
          <div className="mb-4">
            <label className="text-xs text-zinc-500 block mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., AI Influencers"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 placeholder-zinc-600"
            />
          </div>

          {/* Sources */}
          <div className="mb-4">
            <label className="text-xs text-zinc-500 block mb-1">Sources (at least 1)</label>
            {newSources.length > 0 && (
              <div className="space-y-1 mb-2">
                {newSources.map((source, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded",
                      source.type === "handle" ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"
                    )}>
                      {source.type}
                    </span>
                    <span className="text-zinc-300">
                      {source.type === "handle" ? `@${source.value}` : source.value}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSource(i)}
                      className="text-zinc-500 hover:text-red-400 ml-auto"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <select
                value={newSourceType}
                onChange={(e) => setNewSourceType(e.target.value as "handle" | "topic")}
                className="px-2 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-300"
              >
                <option value="handle">@handle</option>
                <option value="topic">Topic</option>
              </select>
              <input
                type="text"
                value={newSourceValue}
                onChange={(e) => setNewSourceValue(e.target.value)}
                placeholder={newSourceType === "handle" ? "@username" : "search topic"}
                className="flex-1 px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder-zinc-600"
                onKeyDown={(e) => e.key === "Enter" && handleAddSource()}
              />
              <button
                type="button"
                onClick={handleAddSource}
                disabled={!newSourceValue.trim()}
                className="px-3 py-1.5 text-sm bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600"
              >
                Add
              </button>
            </div>
          </div>

          {/* Create button */}
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newName.trim() || newSources.length === 0 || isCreating}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {isCreating ? "Creating..." : "Create Leaderboard"}
          </button>
        </div>
      )}

      {/* Leaderboard list */}
      {isLoading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading...</div>
      ) : leaderboards.length === 0 ? (
        <div className="text-zinc-500 text-sm py-12 text-center">
          <p>No leaderboards yet.</p>
          <p className="mt-1">Create one to start tracking trending tweets.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaderboards.map((lb) => (
            <Link
              key={lb.id}
              href={`/leaderboard/${lb.id}`}
              className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-white">{lb.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                    <span>{lb.sourceCount} source{lb.sourceCount !== 1 ? "s" : ""}</span>
                    <span>{lb.tweetCount} tweet{lb.tweetCount !== 1 ? "s" : ""}</span>
                    {lb.lastScrapedAt && (
                      <span>Updated {formatDate(lb.lastScrapedAt)}</span>
                    )}
                    {lb.isScrapingNow && (
                      <span className="text-blue-400 flex items-center gap-1">
                        <span className="animate-spin">⟳</span> Scraping...
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete(lb.id, lb.name);
                  }}
                  disabled={deletingId === lb.id}
                  className="text-zinc-600 hover:text-red-400 text-sm px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingId === lb.id ? "..." : "Delete"}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
