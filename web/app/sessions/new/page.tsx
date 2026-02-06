"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSearches } from "@/hooks/use-searches";
import { createSession } from "@/hooks/use-sessions";
import { cn } from "@/lib/utils";

interface TopicForm {
  name: string;
  prompt: string;
  timeWindow: string;
  minViews: string;
  minLikes: string;
  maxResults: string;
}

const emptyTopicForm: TopicForm = {
  name: "",
  prompt: "",
  timeWindow: "24h",
  minViews: "",
  minLikes: "",
  maxResults: "20",
};

export default function NewSessionPage() {
  const router = useRouter();
  const { searches, isLoading: loadingSearches, mutate: mutateSearches } = useSearches();
  const [name, setName] = useState("");
  const [selectedSearches, setSelectedSearches] = useState<Set<string>>(
    new Set()
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Inline topic creation
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [topicForm, setTopicForm] = useState<TopicForm>(emptyTopicForm);
  const [topicError, setTopicError] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);

  const toggleSearch = (searchName: string) => {
    setSelectedSearches((prev) => {
      const next = new Set(prev);
      if (next.has(searchName)) next.delete(searchName);
      else next.add(searchName);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSearches(new Set(searches.map((s) => s.name)));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Session name is required");
      return;
    }
    if (selectedSearches.size === 0) {
      setError("Select at least one search topic");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const session = await createSession(
        name.trim(),
        Array.from(selectedSearches)
      );
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      setCreating(false);
    }
  };

  const handleCreateTopic = async () => {
    setTopicError("");
    const payload = {
      name: topicForm.name.trim(),
      prompt: topicForm.prompt.trim(),
      timeWindow: topicForm.timeWindow,
      ...(topicForm.minViews ? { minViews: parseInt(topicForm.minViews) } : {}),
      ...(topicForm.minLikes ? { minLikes: parseInt(topicForm.minLikes) } : {}),
      maxResults: parseInt(topicForm.maxResults) || 20,
    };

    if (!payload.name || !payload.prompt) {
      setTopicError("Name and prompt are required");
      return;
    }

    setSavingTopic(true);
    const res = await fetch("/api/searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSavingTopic(false);

    if (!res.ok) {
      setTopicError(data.error ?? "Failed to create topic");
      return;
    }

    // Refresh searches and auto-select the new one
    await mutateSearches();
    setSelectedSearches((prev) => new Set([...prev, payload.name]));
    setShowTopicForm(false);
    setTopicForm(emptyTopicForm);
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/sessions"
          className="text-zinc-500 hover:text-zinc-300 text-sm"
        >
          &larr; Sessions
        </Link>
        <h2 className="text-2xl font-bold text-white">New Session</h2>
      </div>

      {/* Session name */}
      <div className="mb-6">
        <label className="text-sm font-medium text-zinc-400 mb-2 block">
          Session Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Crypto insights Feb 1"
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Search selector */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-400">
            Select Search Topics
          </h3>
          <button
            onClick={selectAll}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Select all
          </button>
        </div>
        {loadingSearches ? (
          <div className="text-zinc-500 text-sm">Loading searches...</div>
        ) : searches.length === 0 && !showTopicForm ? (
          <div className="text-zinc-500 text-sm text-center py-2">
            No searches configured yet.
          </div>
        ) : (
          <div className="space-y-2">
            {searches.map((search) => (
              <label
                key={search.name}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                  selectedSearches.has(search.name)
                    ? "border-blue-500/30 bg-blue-500/5"
                    : "border-zinc-800 hover:border-zinc-700"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedSearches.has(search.name)}
                  onChange={() => toggleSearch(search.name)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-zinc-300">
                    {search.name}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {search.prompt}
                  </div>
                  <div className="text-xs text-zinc-600 mt-0.5">
                    {search.timeWindow} window &middot; max {search.maxResults}{" "}
                    results
                    {search.minViews ? ` · ${search.minViews}+ views` : ""}
                    {search.minLikes ? ` · ${search.minLikes}+ likes` : ""}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Inline new topic form */}
        {showTopicForm ? (
          <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-800/50 p-3 space-y-3">
            <div className="text-xs font-medium text-zinc-400">New Search Topic</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 block mb-1">Name</label>
                <input
                  type="text"
                  value={topicForm.name}
                  onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })}
                  placeholder="my-search"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 block mb-1">Prompt</label>
                <textarea
                  value={topicForm.prompt}
                  onChange={(e) => setTopicForm({ ...topicForm, prompt: e.target.value })}
                  rows={2}
                  placeholder="Show me trending tweets about..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Time Window</label>
                <select
                  value={topicForm.timeWindow}
                  onChange={(e) => setTopicForm({ ...topicForm, timeWindow: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="1h">1 hour</option>
                  <option value="12h">12 hours</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Max Results</label>
                <input
                  type="number"
                  value={topicForm.maxResults}
                  onChange={(e) => setTopicForm({ ...topicForm, maxResults: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Min Views</label>
                <input
                  type="number"
                  value={topicForm.minViews}
                  onChange={(e) => setTopicForm({ ...topicForm, minViews: e.target.value })}
                  placeholder="Optional"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Min Likes</label>
                <input
                  type="number"
                  value={topicForm.minLikes}
                  onChange={(e) => setTopicForm({ ...topicForm, minLikes: e.target.value })}
                  placeholder="Optional"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            {topicError && <div className="text-xs text-red-400">{topicError}</div>}
            <div className="flex gap-2">
              <button
                onClick={handleCreateTopic}
                disabled={savingTopic}
                className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                {savingTopic ? "Creating..." : "Create Topic"}
              </button>
              <button
                onClick={() => { setShowTopicForm(false); setTopicForm(emptyTopicForm); setTopicError(""); }}
                className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowTopicForm(true)}
            className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            + New Topic
          </button>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm mb-4">{error}</div>
      )}

      <button
        onClick={handleCreate}
        disabled={creating}
        className={cn(
          "px-4 py-2 rounded-md text-sm font-medium transition-colors",
          creating
            ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-500"
        )}
      >
        {creating ? "Creating..." : "Create & Start Scraping"}
      </button>
    </div>
  );
}
