"use client";

import { usePersonas } from "@/hooks/use-personas";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function PersonasPage() {
  const { personas, isLoading, mutate } = usePersonas();

  const handleSetDefault = async (slug: string) => {
    await fetch("/api/personas/default", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    mutate();
  };

  const handleDuplicate = async (slug: string) => {
    await fetch(`/api/personas/${slug}/duplicate`, { method: "POST" });
    mutate();
  };

  const handleDelete = async (slug: string, name: string) => {
    if (!confirm(`Delete persona "${name}"?`)) return;
    await fetch(`/api/personas/${slug}`, { method: "DELETE" });
    mutate();
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Personas</h2>
        <Link
          href="/personas/new"
          className="px-3 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          + New Persona
        </Link>
      </div>

      {isLoading ? (
        <div className="text-zinc-500 text-sm">Loading...</div>
      ) : personas.length === 0 ? (
        <div className="text-zinc-500 text-sm border border-zinc-800 rounded-lg bg-zinc-900 p-6 text-center">
          No personas yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {personas.map((p) => (
            <div
              key={p.slug}
              className={cn(
                "rounded-lg border bg-zinc-900 p-4",
                p.isDefault ? "border-blue-500/40" : "border-zinc-800"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">
                      {p.name}
                    </span>
                    {p.isDefault && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {p.slug}.json
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!p.isDefault && (
                    <button
                      onClick={() => handleSetDefault(p.slug)}
                      className="px-2 py-1 text-xs rounded bg-zinc-800 text-zinc-400 hover:text-blue-400 hover:bg-zinc-700 transition-colors"
                    >
                      Set Default
                    </button>
                  )}
                  <Link
                    href={`/personas/${p.slug}`}
                    className="px-2 py-1 text-xs rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDuplicate(p.slug)}
                    className="px-2 py-1 text-xs rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleDelete(p.slug, p.name)}
                    className="px-2 py-1 text-xs rounded bg-zinc-800 text-red-400 hover:bg-red-900/30 transition-colors"
                  >
                    Delete
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
