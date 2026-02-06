import useSWR from "swr";
import type { Session, SessionStage } from "@pipeline/types.js";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface SessionSummary {
  id: string;
  name: string;
  stage: SessionStage;
  tweetCount: number;
  updatedAt: string;
}

export function useSessions() {
  const { data, error, isLoading, mutate } = useSWR<{
    sessions: SessionSummary[];
  }>("/api/sessions", fetcher, { refreshInterval: 5000 });

  return {
    sessions: data?.sessions ?? [],
    isLoading,
    error,
    mutate,
  };
}

export function useSession(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<Session>(
    id ? `/api/sessions/${id}` : null,
    fetcher
  );

  return {
    session: data ?? null,
    isLoading,
    error,
    mutate,
  };
}

export async function createSession(name: string, searchNames: string[]) {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, searchNames }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateSession(id: string, data: Record<string, unknown>) {
  const res = await fetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteSession(id: string) {
  const res = await fetch(`/api/sessions/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
