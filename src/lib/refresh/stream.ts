import type { RefreshData, RefreshResult } from "@/lib/ingestion/refresh";
import type { RefreshProgress } from "@/lib/ingestion/progress";

export type RefreshStreamEvent =
  | { type: "progress"; progress: RefreshProgress }
  | { type: "result"; data: RefreshData }
  | { type: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseRefreshStreamEvent(value: unknown): RefreshStreamEvent | null {
  if (!isRecord(value)) return null;
  if (value.type === "progress" && isRecord(value.progress)) {
    return { type: "progress", progress: value.progress as RefreshProgress };
  }
  if (value.type === "result" && isRecord(value.data)) {
    return { type: "result", data: value.data as RefreshData };
  }
  if (value.type === "error" && typeof value.message === "string") {
    return { type: "error", message: value.message };
  }
  return null;
}

export async function consumeRefreshStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: RefreshStreamEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parseRefreshStreamEvent(JSON.parse(line) as unknown);
      if (event) onEvent(event);
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const event = parseRefreshStreamEvent(JSON.parse(buffer) as unknown);
    if (event) onEvent(event);
  }
}

export async function refreshEventsStream(input: {
  profile?: unknown;
  signal?: AbortSignal;
  onProgress: (progress: RefreshProgress) => void;
}): Promise<RefreshResult> {
  const response = await fetch("/api/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.profile === undefined ? {} : { profile: input.profile }),
    signal: input.signal,
  });
  if (!response.ok || !response.body) {
    return { ok: false, message: "Could not refresh events." };
  }

  let result: RefreshResult | null = null;
  await consumeRefreshStream(response.body, (event) => {
    if (event.type === "progress") input.onProgress(event.progress);
    if (event.type === "result") result = { ok: true, data: event.data };
    if (event.type === "error") result = { ok: false, message: event.message };
  });
  return result ?? { ok: false, message: "Could not refresh events." };
}
