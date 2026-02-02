"use client";

import useSWR from "swr";
import { useSessions } from "@/hooks/use-sessions";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ConfigStatus {
  valid: boolean;
  persona?: string;
  searchCount?: number;
  apiKeys?: { xai: boolean; openrouter: boolean };
  error?: string;
}

export default function SettingsPage() {
  const { data: config, isLoading } = useSWR<ConfigStatus>("/api/config", fetcher);
  const { sessions } = useSessions();

  const handleClearSessions = async () => {
    if (!confirm("Are you sure you want to delete all sessions? This cannot be undone.")) return;
    for (const s of sessions) {
      await fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
    }
    window.location.reload();
  };

  const completedCount = sessions.filter((s) => s.stage === "completed").length;
  const activeCount = sessions.filter((s) => s.stage !== "completed").length;

  return (
    <div className="max-w-3xl">
      <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>

      {/* Config Status */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-4">
        <h3 className="text-xs font-medium text-zinc-500 mb-3">CONFIGURATION</h3>
        {isLoading ? (
          <div className="text-zinc-500 text-sm">Checking...</div>
        ) : config?.valid ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-sm">Valid</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-zinc-500 text-xs mb-1">Persona</div>
                <div className="text-zinc-300">{config.persona}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs mb-1">Searches</div>
                <div className="text-zinc-300">{config.searchCount} configured</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-red-400 text-sm">{config?.error ?? "Invalid configuration"}</div>
        )}
      </div>

      {/* API Keys */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-4">
        <h3 className="text-xs font-medium text-zinc-500 mb-3">API KEYS</h3>
        {isLoading ? (
          <div className="text-zinc-500 text-sm">Checking...</div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">XAI_API_KEY</span>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded",
                  config?.apiKeys?.xai
                    ? "bg-green-500/10 text-green-400"
                    : "bg-red-500/10 text-red-400"
                )}
              >
                {config?.apiKeys?.xai ? "Set" : "Missing"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">OPENROUTER_API_KEY</span>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded",
                  config?.apiKeys?.openrouter
                    ? "bg-green-500/10 text-green-400"
                    : "bg-red-500/10 text-red-400"
                )}
              >
                {config?.apiKeys?.openrouter ? "Set" : "Missing"}
              </span>
            </div>
            <div className="text-xs text-zinc-600 mt-2">
              API keys are set in .env file at the project root.
            </div>
          </div>
        )}
      </div>

      {/* Data */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-4">
        <h3 className="text-xs font-medium text-zinc-500 mb-3">DATA</h3>
        <div className="grid grid-cols-3 gap-4 text-sm mb-4">
          <div>
            <div className="text-zinc-500 text-xs mb-1">Total Sessions</div>
            <div className="text-zinc-300">{sessions.length}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-xs mb-1">Active</div>
            <div className="text-zinc-300">{activeCount}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-xs mb-1">Completed</div>
            <div className="text-zinc-300">{completedCount}</div>
          </div>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={handleClearSessions}
            className="px-3 py-1.5 text-xs font-medium rounded bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors"
          >
            Delete All Sessions
          </button>
        )}
      </div>

      {/* Help */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-xs font-medium text-zinc-500 mb-3">ABOUT</h3>
        <div className="text-sm text-zinc-400 space-y-2">
          <p>
            Create sessions to scrape tweets, select source material, write prompts,
            and generate tweet variations using your personas.
          </p>
          <p className="text-xs text-zinc-600">
            Session data is stored in data/sessions/. Personas in config/personas/.
          </p>
        </div>
      </div>
    </div>
  );
}
