"use client";

import { useState } from "react";
import { useSearches } from "@/hooks/use-searches";
import { cn } from "@/lib/utils";

interface SearchFormData {
  name: string;
  prompt: string;
  timeWindow: string;
  minViews: string;
  minLikes: string;
  maxResults: string;
}

const emptyForm: SearchFormData = {
  name: "",
  prompt: "",
  timeWindow: "24h",
  minViews: "",
  minLikes: "",
  maxResults: "20",
};

export default function SearchesPage() {
  const { searches, isLoading, mutate } = useSearches();
  const [showForm, setShowForm] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<SearchFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingName(null);
    setShowForm(true);
    setError(null);
  };

  const openEdit = (name: string) => {
    const s = searches.find((s) => s.name === name);
    if (!s) return;
    setForm({
      name: s.name,
      prompt: s.prompt,
      timeWindow: s.timeWindow,
      minViews: s.minViews?.toString() ?? "",
      minLikes: s.minLikes?.toString() ?? "",
      maxResults: s.maxResults.toString(),
    });
    setEditingName(name);
    setShowForm(true);
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    const payload = {
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      timeWindow: form.timeWindow,
      ...(form.minViews ? { minViews: parseInt(form.minViews) } : {}),
      ...(form.minLikes ? { minLikes: parseInt(form.minLikes) } : {}),
      maxResults: parseInt(form.maxResults) || 20,
    };

    if (!payload.name || !payload.prompt) {
      setError("Name and prompt are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingName
        ? `/api/searches/${encodeURIComponent(editingName)}`
        : "/api/searches";
      const method = editingName ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }

      setShowForm(false);
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete search "${name}"?`)) return;
    setDeletingName(name);
    try {
      const res = await fetch(`/api/searches/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete: ${res.statusText}`);
      mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete search");
    } finally {
      setDeletingName(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Searches</h2>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          + Add Search
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">
            {editingName ? `Edit "${editingName}"` : "New Search"}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!!editingName}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                placeholder="my-search"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Prompt</label>
              <textarea
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Show me trending tweets about..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Time Window</label>
                <select
                  value={form.timeWindow}
                  onChange={(e) => setForm({ ...form, timeWindow: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
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
                  value={form.maxResults}
                  onChange={(e) => setForm({ ...form, maxResults: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Min Views</label>
                <input
                  type="number"
                  value={form.minViews}
                  onChange={(e) => setForm({ ...form, minViews: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Min Likes</label>
                <input
                  type="number"
                  value={form.minLikes}
                  onChange={(e) => setForm({ ...form, minLikes: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                  placeholder="Optional"
                />
              </div>
            </div>

            {error && <div className="text-sm text-red-400">{error}</div>}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Saving..." : editingName ? "Update" : "Add"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm font-medium rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search list */}
      {isLoading ? (
        <div className="text-zinc-500 text-sm">Loading...</div>
      ) : searches.length === 0 ? (
        <div className="text-zinc-500 text-sm border border-zinc-800 rounded-lg bg-zinc-900 p-6 text-center">
          No searches configured. Add one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {searches.map((search) => (
            <div
              key={search.name}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200">{search.name}</div>
                  <div className="text-xs text-zinc-400 mt-1">{search.prompt}</div>
                  <div className="flex gap-3 mt-2 text-xs text-zinc-600">
                    <span>{search.timeWindow} window</span>
                    <span>max {search.maxResults}</span>
                    {search.minViews && <span>{search.minViews}+ views</span>}
                    {search.minLikes && <span>{search.minLikes}+ likes</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(search.name)}
                    className="px-2 py-1 text-xs rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(search.name)}
                    disabled={deletingName === search.name}
                    className="px-2 py-1 text-xs rounded bg-zinc-800 text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingName === search.name ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
