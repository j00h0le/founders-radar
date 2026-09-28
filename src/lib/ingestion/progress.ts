import type { IngestionReport, SourceIngestionStatus } from "@/lib/ingestion/types";

export type RefreshPhase =
  | "scanning"
  | "collecting"
  | "deduplicating"
  | "analyzing"
  | "complete"
  | "failed";

export type RefreshOutcome = "pending" | "complete" | "limited" | "failed";

export type RefreshSourceState = {
  id: string;
  name: string;
  status: "scanning" | "success" | "failed";
  fetched: number;
  normalized: number;
  limitation: string | null;
};

export type RefreshProgress = {
  phase: RefreshPhase;
  outcome: RefreshOutcome;
  durationMs: number | null;
  sources: RefreshSourceState[];
  events: {
    collected: number;
    unique: number | null;
    persisted: number | null;
  };
  relevance: {
    label: string;
    status: "pending" | "analyzing" | "success" | "failed" | "skipped";
    evaluated: number;
  };
};

export function beginScan(
  sources: Array<{ id: string; name: string }>,
  relevance: { label: string; status: "pending" | "skipped" },
): RefreshProgress {
  return {
    phase: "scanning",
    outcome: "pending",
    durationMs: null,
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      status: "scanning",
      fetched: 0,
      normalized: 0,
      limitation: null,
    })),
    events: { collected: 0, unique: null, persisted: null },
    relevance: { label: relevance.label, status: relevance.status, evaluated: 0 },
  };
}

export function sourceStateFromStatus(source: SourceIngestionStatus): RefreshSourceState {
  return {
    id: source.id,
    name: source.name,
    status: source.limitation ? "failed" : "success",
    fetched: source.retrievedCount,
    normalized: source.normalizedCount,
    limitation: source.limitation,
  };
}

function collectedFrom(sources: RefreshSourceState[]) {
  return sources.reduce(
    (sum, source) => (source.status === "scanning" ? sum : sum + source.normalized),
    0,
  );
}

export function withSourceResult(
  progress: RefreshProgress,
  source: SourceIngestionStatus,
): RefreshProgress {
  const sources = progress.sources.map((item) =>
    item.id === source.id ? sourceStateFromStatus(source) : item,
  );
  const stillScanning = sources.some((item) => item.status === "scanning");
  return {
    ...progress,
    phase: stillScanning ? "scanning" : "collecting",
    sources,
    events: { ...progress.events, collected: collectedFrom(sources) },
  };
}

export function withDedupe(
  progress: RefreshProgress,
  collected: number,
  unique: number,
): RefreshProgress {
  return {
    ...progress,
    phase: "deduplicating",
    events: { ...progress.events, collected, unique },
  };
}

export function liveSourcesLimited(sources: SourceIngestionStatus[]) {
  return sources.some((source) => source.live && source.limitation);
}

export function withIngestionReport(
  progress: RefreshProgress,
  report: IngestionReport,
): RefreshProgress {
  return {
    ...progress,
    phase: "deduplicating",
    outcome: liveSourcesLimited(report.sources) ? "limited" : "pending",
    sources: report.sources.map(sourceStateFromStatus),
    events: {
      collected: progress.events.collected,
      unique: progress.events.unique ?? 0,
      persisted: report.storedCount,
    },
  };
}

export function withRelevance(
  progress: RefreshProgress,
  relevance: RefreshProgress["relevance"],
  phase: RefreshPhase,
  durationMs: number | null,
): RefreshProgress {
  const outcome =
    relevance.status === "failed"
      ? "failed"
      : progress.outcome === "limited"
        ? "limited"
        : phase === "complete"
          ? "complete"
          : progress.outcome;
  return {
    ...progress,
    phase,
    outcome,
    durationMs,
    relevance,
  };
}

export function refreshHeadline(progress: RefreshProgress | null): string {
  if (!progress || progress.phase === "scanning") return "Scanning sources";
  if (progress.phase === "collecting") return "Collecting events";
  if (progress.phase === "deduplicating") return "Deduplicating";
  if (progress.phase === "analyzing") return "Analyzing relevance";
  if (progress.outcome === "limited") return "Refresh completed with limited sources";
  return "Refresh complete";
}

export function refreshCount(progress: RefreshProgress | null): { value: number; caption: string } {
  if (!progress) return { value: 0, caption: "events processed" };
  if (progress.phase === "complete" && progress.events.unique != null) {
    return { value: progress.events.unique, caption: "opportunities found" };
  }
  if (
    progress.events.unique != null &&
    (progress.phase === "deduplicating" || progress.phase === "analyzing")
  ) {
    return { value: progress.events.unique, caption: "unique opportunities" };
  }
  return { value: progress.events.collected, caption: "events processed" };
}

export function sourceDetail(source: RefreshSourceState): string {
  if (source.status === "scanning") return "Scanning";
  if (source.status === "failed") return "Unavailable";
  return `${source.normalized.toLocaleString("en-US")} events`;
}

export function relevanceDetail(progress: RefreshProgress): string {
  const { relevance, outcome } = progress;
  if (relevance.status === "analyzing") return "Analyzing";
  if (relevance.status === "pending") return "Waiting";
  if (relevance.status === "skipped") return "Skipped";
  if (relevance.status === "failed") return "Failed";
  if (outcome === "limited") return "Analyzed available events";
  return `${relevance.evaluated.toLocaleString("en-US")} evaluated`;
}

export function refreshAnnouncement(progress: RefreshProgress | null): string {
  if (!progress) return "Scanning sources.";
  const count = refreshCount(progress);
  const sources = progress.sources
    .map((source) => `${source.name} ${sourceDetail(source)}`)
    .join(". ");
  return `${refreshHeadline(progress)}. ${count.value.toLocaleString("en-US")} ${count.caption}. ${sources}. ${progress.relevance.label} ${relevanceDetail(progress)}.`;
}
