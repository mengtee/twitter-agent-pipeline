"use client";

import { useSessions } from "@/hooks/use-sessions";
import { StatusBadge } from "@/components/status-badge";
import { cn, formatDate } from "@/lib/utils";
import Link from "next/link";

const stageColors: Record<string, string> = {
  created: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  scraped: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  selected: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  generated: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
};

const stageLabels = ["created", "scraped", "selected", "generated", "completed"] as const;

export default function Dashboard() {
  const { sessions, isLoading } = useSessions();

  const stageCounts = stageLabels.reduce(
    (acc, stage) => {
      acc[stage] = sessions.filter((s) => s.stage === stage).length;
      return acc;
    },
    {} as Record<string, number>
  );

  const recentSessions = sessions.slice(0, 10);

  return (
    <div className="max-w-5xl">
      <h2 className="text-2xl font-bold text-white mb-6">Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {stageLabels.map((stage) => (
          <div
            key={stage}
            className={cn("rounded-lg border p-4", stageColors[stage])}
          >
            <div className="text-2xl font-bold">
              {isLoading ? "-" : stageCounts[stage]}
            </div>
            <div className="text-xs capitalize mt-1 opacity-75">{stage}</div>
          </div>
        ))}
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <div className="text-2xl font-bold text-white">
            {isLoading ? "-" : sessions.length}
          </div>
          <div className="text-xs text-zinc-400 mt-1">Total</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 mb-8">
        <Link
          href="/sessions/new"
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          New Session
        </Link>
        <Link
          href="/sessions"
          className="px-4 py-2 rounded-md bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 transition-colors"
        >
          View All Sessions
        </Link>
      </div>

      {/* Pipeline Flow */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-8">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">
          Session Pipeline
        </h3>
        <div className="flex items-center gap-2 text-sm">
          {stageLabels.map((stage, i) => (
            <div key={stage} className="flex items-center gap-2">
              {i > 0 && <span className="text-zinc-600">&rarr;</span>}
              <span
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium border",
                  stageColors[stage]
                )}
              >
                {stage} ({stageCounts[stage]})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="p-4 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-400">
            Recent Sessions
          </h3>
        </div>
        {isLoading ? (
          <div className="p-4 text-zinc-500 text-sm">Loading...</div>
        ) : recentSessions.length === 0 ? (
          <div className="p-4 text-zinc-500 text-sm">
            No sessions yet. Create one to get started.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {recentSessions.map((s) => (
              <Link
                key={s.id}
                href={`/sessions/${s.id}`}
                className="p-3 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors block"
              >
                <StatusBadge status={s.stage} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-300">{s.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {s.tweetCount > 0
                      ? `${s.tweetCount} tweets`
                      : "Not scraped"}
                    {" · "}
                    {formatDate(s.updatedAt)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
