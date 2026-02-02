"use client";

import { useSessions, deleteSession } from "@/hooks/use-sessions";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default function SessionsPage() {
  const { sessions, isLoading, mutate } = useSessions();

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this session?")) return;
    await deleteSession(id);
    mutate();
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Sessions</h2>
        <Link
          href="/sessions/new"
          className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          New Session
        </Link>
      </div>

      {isLoading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">
          Loading sessions...
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-zinc-500 text-sm py-8 text-center border border-zinc-800 rounded-lg bg-zinc-900">
          No sessions yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-4 p-4 border border-zinc-800 rounded-lg bg-zinc-900 hover:border-zinc-700 transition-colors"
            >
              <StatusBadge status={s.stage} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/sessions/${s.id}`}
                  className="text-sm font-medium text-zinc-200 hover:text-white"
                >
                  {s.name}
                </Link>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {s.tweetCount > 0
                    ? `${s.tweetCount} tweets scraped`
                    : "Not scraped yet"}
                  {" · "}
                  {formatDate(s.updatedAt)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/sessions/${s.id}`}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                >
                  {s.stage === "completed" ? "View" : "Continue"}
                </Link>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
