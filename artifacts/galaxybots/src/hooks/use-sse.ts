import { useState, useCallback, useRef } from "react";

export interface AgenticEvent {
  type: "tool_call" | "tool_result" | "message" | "bot_complete" | "error" | "done";
  botId?: number;
  botName?: string;
  botTitle?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  content?: string;
  iteration?: number;
}

export interface UseSSEStreamOptions {
  onEvent?: (event: AgenticEvent) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function useSSEStream(options: UseSSEStreamOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [events, setEvents] = useState<AgenticEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setIsStreaming(true);
      setEvents([]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event: AgenticEvent = JSON.parse(line.slice(6));
                setEvents((prev) => [...prev, event]);
                options.onEvent?.(event);

                if (event.type === "done") {
                  setIsStreaming(false);
                  options.onComplete?.();
                } else if (event.type === "error") {
                  options.onError?.(event.content || "Unknown error");
                }
              } catch {
                // skip malformed event
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          options.onError?.(err instanceof Error ? err.message : "Stream failed");
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [options],
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { isStreaming, events, startStream, stopStream, clearEvents };
}
