import type { ScoredEvent, StartupEvent } from "@/types/event";
import type { FounderProfile } from "@/types/profile";
import type { EventDraft, StoredEvaluation } from "@/lib/db/records";

export type RadarRepository = {
  hasSession(): Promise<boolean>;
  listEvents(): Promise<StartupEvent[]>;
  upsertEvents(events: EventDraft[]): Promise<StartupEvent[]>;
  getProfile(): Promise<FounderProfile | null>;
  saveProfile(profile: FounderProfile): Promise<FounderProfile>;
  listEvaluations(): Promise<StoredEvaluation[]>;
  saveEvaluations(events: ScoredEvent[], provider: "mock" | "jev"): Promise<void>;
  listSavedIds(): Promise<string[]>;
  setSaved(eventId: string, saved: boolean): Promise<void>;
};
