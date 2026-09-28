import type { DataMode } from "@/lib/db/mode";
import type { RadarRepository } from "@/lib/db/repository";
import type { ScoredEvent } from "@/types/event";
import type { FounderProfile } from "@/types/profile";

export type WorkspaceState = {
  profile: FounderProfile | null;
  events: ScoredEvent[];
  savedIds: string[];
};

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function loadWorkspaceState(input: {
  repository: RadarRepository;
  mode: DataMode;
}): Promise<{ ok: true; data: WorkspaceState } | { ok: false; message: string }> {
  try {
    if (input.mode === "supabase" && !(await input.repository.hasSession())) {
      return {
        ok: true,
        data: { profile: null, events: [], savedIds: [] },
      };
    }

    const repository = input.repository;
    const [profile, events, evaluations, savedIds] = await Promise.all([
      repository.getProfile(),
      repository.listEvents(),
      repository.listEvaluations(),
      repository.listSavedIds(),
    ]);
    const byEvent = new Map(evaluations.map((evaluation) => [evaluation.eventId, evaluation]));
    return {
      ok: true,
      data: {
        profile,
        savedIds,
        events: events.map((event) => {
          const evaluation = byEvent.get(event.id);
          return {
            ...event,
            relevanceScore: evaluation?.relevanceScore ?? 0,
            explanation:
              evaluation?.explanation ?? "Refresh events to score this listing.",
            matchingCriteria: evaluation?.matchingCriteria ?? [],
            scoreSource: evaluation
              ? evaluation.provider === "jev"
                ? "jev"
                : "demo"
              : "unscored",
            isNewlyDiscovered: evaluation?.isNewlyDiscovered ?? false,
          };
        }),
      },
    };
  } catch (error) {
    return { ok: false, message: messageFrom(error, "Could not load Startup Radar.") };
  }
}
