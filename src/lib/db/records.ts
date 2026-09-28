import { z } from "zod";
import { unpackExplanation } from "@/lib/relevance/stored-copy";
import { eventTypes, type StartupEvent } from "@/types/event";
import {
  founderProfileSchema,
  industries,
  type FounderProfile,
} from "@/types/profile";
import type { EvaluationRow, EventRow, ProfileRow } from "@/lib/db/database";

const industryList = z.array(z.enum(industries));

export const eventRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  organizer: z.string().nullable(),
  category: z.string().nullable(),
  industry_tags: industryList,
  event_type: z.enum(eventTypes),
  event_date: z.string().nullable(),
  registration_deadline: z.string().nullable(),
  location: z.string().nullable(),
  source_name: z.string().min(1),
  source_url: z.string().min(1),
  first_seen_at: z.string().min(1),
  last_checked_at: z.string().min(1),
  is_mock: z.boolean(),
});

export const profileRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  startup_name: z.string().min(1),
  startup_description: z.string().max(8000).default(""),
  industries: industryList.min(1),
  stage: founderProfileSchema.shape.stage,
  preferred_location: z.string().min(1),
  preferred_event_types: z.array(z.enum(eventTypes)).optional().default([]),
  created_at: z.string(),
  updated_at: z.string(),
});

export const evaluationRowSchema = z.object({
  id: z.number(),
  profile_id: z.string().uuid(),
  event_id: z.string().uuid(),
  relevance_score: z.number().int().min(0).max(100),
  explanation: z.string().min(1),
  provider: z.enum(["mock", "jev"]),
  is_newly_discovered: z.boolean(),
  evaluated_at: z.string(),
});

export type StoredEvaluation = {
  eventId: string;
  relevanceScore: number;
  explanation: string;
  matchingCriteria: string[];
  provider: "mock" | "jev";
  isNewlyDiscovered: boolean;
  evaluatedAt: string;
};

export type EventDraft = {
  title: string;
  description: string | null;
  organizer: string | null;
  category: string | null;
  industries: StartupEvent["industries"];
  eventType: StartupEvent["eventType"];
  startsAt: string | null;
  registrationDeadline: string | null;
  location: string | null;
  sourceName: string;
  sourceUrl: string;
  isMock: boolean;
};

export function profileFromRow(row: ProfileRow): FounderProfile {
  const parsed = profileRowSchema.parse(row);
  return {
    name: parsed.name,
    startupName: parsed.startup_name,
    startupDescription: parsed.startup_description,
    industries: parsed.industries,
    stage: parsed.stage,
    preferredLocation: parsed.preferred_location,
    preferredEventTypes: parsed.preferred_event_types,
  };
}

export function eventFromRow(row: EventRow): StartupEvent {
  const parsed = eventRowSchema.parse(row);
  return {
    id: parsed.id,
    title: parsed.title,
    organizer: parsed.organizer,
    description: parsed.description,
    category: parsed.category,
    startsAt: parsed.event_date,
    registrationDeadline: parsed.registration_deadline,
    industries: parsed.industry_tags,
    eventType: parsed.event_type,
    location: parsed.location,
    sourceName: parsed.source_name,
    sourceUrl: parsed.source_url,
    firstSeenAt: parsed.first_seen_at,
    lastCheckedAt: parsed.last_checked_at,
    isMock: parsed.is_mock,
  };
}

export function evaluationFromRow(row: EvaluationRow): StoredEvaluation {
  const parsed = evaluationRowSchema.parse(row);
  const copy = unpackExplanation(parsed.explanation);
  return {
    eventId: parsed.event_id,
    relevanceScore: parsed.relevance_score,
    explanation: copy.explanation,
    matchingCriteria: copy.matchingCriteria,
    provider: parsed.provider,
    isNewlyDiscovered: parsed.is_newly_discovered,
    evaluatedAt: parsed.evaluated_at,
  };
}

export function eventToInsert(draft: EventDraft) {
  return {
    title: draft.title,
    description: draft.description,
    organizer: draft.organizer,
    category: draft.category,
    industry_tags: draft.industries,
    event_type: draft.eventType,
    event_date: draft.startsAt,
    registration_deadline: draft.registrationDeadline,
    location: draft.location,
    source_name: draft.sourceName,
    source_url: draft.sourceUrl,
    last_checked_at: new Date().toISOString(),
    is_mock: draft.isMock,
  };
}
