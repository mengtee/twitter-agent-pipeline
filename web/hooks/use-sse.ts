"use client";

import { useState, useCallback, useRef } from "react";

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export function useSSE(url: string) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const start = useCallback(
    async (body?: unknown) => {
      // Prevent duplicate concurrent starts
      if (runningRef.current) return;
      runningRef.current = true;

      // Abort any previous connection
      abortRef.current?.abort();

      setStatus("running");
      setEvents([]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          setEvents((prev) => [...prev, { event: "error", data: { message: text } }]);
          setStatus("error");
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                setEvents((prev) => [...prev, { event: currentEvent, data }]);

                if (currentEvent === "error") {
                  setStatus("error");
                } else if (currentEvent === "complete") {
                  setStatus("done");
                }
              } catch {
                // ignore non-JSON data lines
              }
              currentEvent = "message";
            }
          }
        }

        setStatus((prev) => (prev === "error" ? "error" : "done"));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setEvents((prev) => [
            ...prev,
            { event: "error", data: { message: (err as Error).message } },
          ]);
          setStatus("error");
        }
      } finally {
        runningRef.current = false;
      }
    },
    [url]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    runningRef.current = false;
    setStatus("done");
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    runningRef.current = false;
    setEvents([]);
    setStatus("idle");
  }, []);

  return { events, status, start, stop, reset };
}
