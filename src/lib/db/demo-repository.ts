import { baseEvents } from "@/lib/events/catalog";
import { packExplanation, unpackExplanation } from "@/lib/relevance/stored-copy";
import { scoreEvent } from "@/lib/relevance/mock-provider";
import type { RadarRepository } from "@/lib/db/repository";
import type { EventDraft, StoredEvaluation } from "@/lib/db/records";
import type { ScoredEvent, StartupEvent } from "@/types/event";
import { demoProfile, type FounderProfile } from "@/types/profile";

type DemoState = {
  profile: FounderProfile;
  events: StartupEvent[];
  evaluations: StoredEvaluation[];
  savedIds: string[];
};

const state: DemoState = {
  profile: demoProfile,
  events: baseEvents,
  evaluations: baseEvents.map((event) => {
    const score = scoreEvent(event, demoProfile);
    return {
      eventId: event.id,
      relevanceScore: score.relevanceScore,
      explanation: score.explanation,
      matchingCriteria: score.matchingCriteria,
      provider: "mock" as const,
      isNewlyDiscovered: false,
      evaluatedAt: "2026-01-01T00:00:00.000Z",
    };
  }),
  savedIds: [],
};

function draftToEvent(draft: EventDraft, existing: StartupEvent | undefined): StartupEvent {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? draft.sourceUrl,
    title: draft.title,
    description: draft.description,
    organizer: draft.organizer,
    category: draft.category,
    industries: draft.industries,
    eventType: draft.eventType,
    startsAt: draft.startsAt,
    registrationDeadline: draft.registrationDeadline,
    location: draft.location,
    sourceName: draft.sourceName,
    sourceUrl: draft.sourceUrl,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastCheckedAt: now,
    isMock: draft.isMock,
  };
}

export function createDemoRepository(): RadarRepository {
  return {
    async hasSession() {
      return true;
    },
    async listEvents() {
      return state.events;
    },
    async upsertEvents(drafts) {
      const next = [...state.events];
      for (const draft of drafts) {
        const index = next.findIndex((event) => event.sourceUrl === draft.sourceUrl);
        const existing = index >= 0 ? next[index] : undefined;
        const event = draftToEvent(draft, existing);
        if (index >= 0) next[index] = event;
        else next.push(event);
      }
      state.events = next;
      return next;
    },
    async getProfile() {
      return state.profile;
    },
    async saveProfile(profile) {
      state.profile = profile;
      return profile;
    },
    async listEvaluations() {
      return state.evaluations.map((evaluation) => {
        const copy = unpackExplanation(evaluation.explanation);
        return {
          ...evaluation,
          explanation: copy.explanation,
          matchingCriteria: evaluation.matchingCriteria.length
            ? evaluation.matchingCriteria
            : copy.matchingCriteria,
        };
      });
    },
    async saveEvaluations(events: ScoredEvent[], provider) {
      const evaluatedAt = new Date().toISOString();
      state.evaluations = events.map((event) => ({
        eventId: event.id,
        relevanceScore: event.relevanceScore,
        explanation: packExplanation(event.matchingCriteria, event.explanation),
        matchingCriteria: event.matchingCriteria,
        provider,
        isNewlyDiscovered: event.isNewlyDiscovered,
        evaluatedAt,
      }));
    },
    async listSavedIds() {
      return state.savedIds;
    },
    async setSaved(eventId, saved) {
      state.savedIds = saved
        ? [...new Set([...state.savedIds, eventId])]
        : state.savedIds.filter((id) => id !== eventId);
    },
  };
}
