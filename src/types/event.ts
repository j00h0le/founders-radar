import type { Industry } from "@/types/profile";

export const eventTypes = [
  "Meetup",
  "Conference",
  "Competition",
  "Program",
  "Networking",
  "Demo day",
] as const;

export type EventType = (typeof eventTypes)[number];

export type StartupEvent = {
  id: string;
  title: string;
  organizer: string | null;
  description: string | null;
  category: string | null;
  startsAt: string | null;
  registrationDeadline: string | null;
  industries: Industry[];
  eventType: EventType;
  location: string | null;
  sourceName: string;
  sourceUrl: string;
  firstSeenAt: string | null;
  lastCheckedAt: string | null;
  isMock: boolean;
};

export type ScoreSource = "demo" | "jev" | "unscored";

export type ScoredEvent = StartupEvent & {
  relevanceScore: number;
  explanation: string;
  matchingCriteria: string[];
  scoreSource: ScoreSource;
  isNewlyDiscovered: boolean;
};

export type SortKey = "relevance" | "date";
