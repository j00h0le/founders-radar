import type { ScoredEvent, StartupEvent } from "@/types/event";
import type { FounderProfile } from "@/types/profile";

export type EvaluationInput = {
  profile: FounderProfile;
  events: StartupEvent[];
  newlyDiscoveredIds: string[];
};

export type RelevanceProvider = {
  id: "mock" | "jev";
  label: string;
  evaluate(input: EvaluationInput): Promise<ScoredEvent[]>;
};
