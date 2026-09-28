import type { DataMode } from "@/lib/db/mode";
import type { RadarRepository } from "@/lib/db/repository";
import { ingestEventSources, type IngestNotice } from "@/lib/ingestion/ingest";
import {
  beginScan,
  withDedupe,
  withIngestionReport,
  withRelevance,
  withSourceResult,
  type RefreshProgress,
} from "@/lib/ingestion/progress";
import type { EventSourceAdapter, IngestionReport } from "@/lib/ingestion/types";
import { selectRelevanceProvider } from "@/lib/relevance/select";
import type { RelevanceProvider } from "@/lib/relevance/provider";
import type { ScoredEvent, StartupEvent } from "@/types/event";
import { founderProfileSchema, type FounderProfile } from "@/types/profile";

export type RefreshData = {
  events: ScoredEvent[];
  ingestion: IngestionReport;
  scored: boolean;
  summary: RefreshProgress;
};

export type RefreshResult = { ok: true; data: RefreshData } | { ok: false; message: string };

function unscored(event: StartupEvent): ScoredEvent {
  return {
    ...event,
    relevanceScore: 0,
    explanation: "Save your profile to score this listing.",
    matchingCriteria: [],
    scoreSource: "unscored",
    isNewlyDiscovered: false,
  };
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function refreshWorkspace(input: {
  repository: RadarRepository;
  mode: DataMode;
  profileInput?: unknown;
  sources?: EventSourceAdapter[];
  provider?: RelevanceProvider;
  onProgress?: (progress: RefreshProgress) => void;
}): Promise<RefreshResult> {
  const started = performance.now();
  let latest: RefreshProgress | null = null;
  const emit = (progress: RefreshProgress) => {
    latest = progress;
    input.onProgress?.(progress);
  };
  const elapsed = () => Math.round(performance.now() - started);

  try {
    const { repository, mode } = input;
    let profile: FounderProfile | null = null;

    if (mode === "supabase") {
      try {
        profile = await repository.getProfile();
      } catch (error) {
        const message = messageFrom(error, "Sign in to refresh events.");
        if (message.startsWith("Sign in")) {
          return { ok: false, message: "Sign in to refresh events." };
        }
        throw error;
      }
    } else if (input.profileInput === undefined) {
      profile = await repository.getProfile();
    } else {
      const parsed = founderProfileSchema.safeParse(input.profileInput);
      profile = parsed.success ? parsed.data : null;
    }

    const provider = input.provider ?? selectRelevanceProvider(mode);
    const previous = profile ? await repository.listEvaluations() : [];
    const ingestion = await ingestEventSources(repository, input.sources, (notice) => {
      emit(progressFromNotice(latest, notice, provider.label, profile ? "pending" : "skipped"));
    });
    const reported = withIngestionReport(
      latest ??
        beginScan([], {
          label: provider.label,
          status: profile ? "pending" : "skipped",
        }),
      ingestion,
    );
    const events = await repository.listEvents();

    if (!profile) {
      const summary = withRelevance(
        reported,
        { label: provider.label, status: "skipped", evaluated: 0 },
        "complete",
        elapsed(),
      );
      emit(summary);
      return {
        ok: true,
        data: { events: events.map(unscored), ingestion, scored: false, summary },
      };
    }

    emit(
      withRelevance(
        reported,
        { label: provider.label, status: "analyzing", evaluated: 0 },
        "analyzing",
        null,
      ),
    );
    const newest = previous.reduce(
      (value, evaluation) =>
        evaluation.evaluatedAt > value ? evaluation.evaluatedAt : value,
      "",
    );
    const newlyDiscoveredIds = events
      .filter((event) => newest && event.firstSeenAt && event.firstSeenAt > newest)
      .map((event) => event.id);
    const scored = await scoreListedEvents({
      repository,
      provider,
      profile,
      events,
      newlyDiscoveredIds,
    });
    const summary = withRelevance(
      latest ?? reported,
      { label: provider.label, status: "success", evaluated: scored.length },
      "complete",
      elapsed(),
    );
    emit(summary);
    return { ok: true, data: { events: scored, ingestion, scored: true, summary } };
  } catch (error) {
    if (latest) {
      const current: RefreshProgress = latest;
      emit(
        withRelevance(
          current,
          current.relevance.status === "skipped"
            ? current.relevance
            : { ...current.relevance, status: "failed" },
          "failed",
          elapsed(),
        ),
      );
    }
    return { ok: false, message: messageFrom(error, "Could not refresh events.") };
  }
}

function progressFromNotice(
  current: RefreshProgress | null,
  notice: IngestNotice,
  label: string,
  relevance: "pending" | "skipped",
) {
  if (notice.type === "started") {
    return beginScan(notice.sources, { label, status: relevance });
  }
  const progress =
    current ?? beginScan([], { label, status: relevance });
  if (notice.type === "source") return withSourceResult(progress, notice.source);
  return withDedupe(progress, notice.collected, notice.unique);
}

export async function rescoreStoredEvents(input: {
  repository: RadarRepository;
  mode: DataMode;
  profile: FounderProfile;
  provider?: RelevanceProvider;
}): Promise<{ ok: true; events: ScoredEvent[] } | { ok: false; message: string }> {
  const parsed = founderProfileSchema.safeParse(input.profile);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Complete your profile first.",
    };
  }

  try {
    await input.repository.saveProfile(parsed.data);
    const [events, previous] = await Promise.all([
      input.repository.listEvents(),
      input.repository.listEvaluations(),
    ]);
    const latest = previous.reduce(
      (newest, evaluation) =>
        evaluation.evaluatedAt > newest ? evaluation.evaluatedAt : newest,
      "",
    );
    const newlyDiscoveredIds = events
      .filter((event) => latest && event.firstSeenAt && event.firstSeenAt > latest)
      .map((event) => event.id);
    const provider = input.provider ?? selectRelevanceProvider(input.mode);
    const scored = await scoreListedEvents({
      repository: input.repository,
      provider,
      profile: parsed.data,
      events,
      newlyDiscoveredIds,
    });
    return { ok: true, events: scored };
  } catch (error) {
    return { ok: false, message: messageFrom(error, "Could not update the ranking.") };
  }
}

async function scoreListedEvents(input: {
  repository: RadarRepository;
  provider: RelevanceProvider;
  profile: FounderProfile;
  events: StartupEvent[];
  newlyDiscoveredIds: string[];
}) {
  const scored = await input.provider.evaluate({
    profile: input.profile,
    events: input.events,
    newlyDiscoveredIds: input.newlyDiscoveredIds,
  });
  await input.repository.saveEvaluations(scored, input.provider.id);
  return scored;
}
