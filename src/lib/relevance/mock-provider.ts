import { scoringWeights } from "@/lib/scoring/weights";
import type {
  EvaluationInput,
  RelevanceProvider,
} from "@/lib/relevance/provider";
import type { StartupEvent } from "@/types/event";
import type { FounderProfile, StartupStage } from "@/types/profile";

const earlyStages: StartupStage[] = ["Idea", "Pre-seed", "Seed"];

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function industryPoints(event: StartupEvent, profile: FounderProfile) {
  const overlap = event.industries.filter((industry) =>
    profile.industries.includes(industry),
  );
  if (overlap.length === 0 || profile.industries.length === 0) {
    return { points: 0, overlap };
  }
  const ratio = overlap.length / profile.industries.length;
  return { points: scoringWeights.industry * Math.min(1, ratio), overlap };
}

function locationPoints(event: StartupEvent, profile: FounderProfile) {
  if (!event.location) return 0;
  const preferred = profile.preferredLocation.toLowerCase();
  const location = event.location.toLowerCase();
  if (location === "online" || location.includes(preferred)) {
    return scoringWeights.location;
  }
  return 0;
}

function stagePoints(event: StartupEvent, profile: FounderProfile) {
  const early = earlyStages.includes(profile.stage);
  if (early && (event.eventType === "Program" || event.eventType === "Competition")) {
    return scoringWeights.stage;
  }
  if (!early && (event.eventType === "Conference" || event.eventType === "Demo day")) {
    return scoringWeights.stage;
  }
  if (event.eventType === "Meetup" || event.eventType === "Networking") {
    return scoringWeights.stage * 0.6;
  }
  return 0;
}

function explain(
  event: StartupEvent,
  profile: FounderProfile,
  overlap: string[],
  locationHit: boolean,
  criteria: string[],
) {
  const parts = [`Demo match for ${profile.startupName}.`];
  if (overlap.length > 0) {
    parts.push(`Shared industries: ${overlap.join(", ")}.`);
  } else {
    parts.push("No shared industry with the current profile.");
  }
  if (locationHit && event.location) {
    parts.push(`Location fits ${profile.preferredLocation}.`);
  } else if (!event.location) {
    parts.push("Location was not listed, so it was not scored.");
  }
  if (criteria.length > 0) {
    parts.push(`Matching criteria: ${criteria.join(", ")}.`);
  }
  parts.push("This is a demo score, not a Jev judgment.");
  parts.push("These weights belong to Startup Radar, not to Jev.");
  return parts.join(" ");
}

export function scoreEvent(event: StartupEvent, profile: FounderProfile) {
  const industry = industryPoints(event, profile);
  const location = locationPoints(event, profile);
  const stage = stagePoints(event, profile);
  const type = event.eventType ? scoringWeights.type * 0.4 : 0;
  const matchingCriteria = [
    industry.overlap.length > 0 ? "Industry" : null,
    location > 0 ? "Location" : null,
    stage > 0 ? "Startup stage" : null,
  ].filter((item): item is string => item !== null);
  return {
    relevanceScore: clamp(industry.points + location + stage + type),
    matchingCriteria,
    scoreSource: "demo" as const,
    explanation: explain(event, profile, industry.overlap, location > 0, matchingCriteria),
  };
}

export const mockRelevanceProvider: RelevanceProvider = {
  id: "mock",
  label: "Demo matcher",
  async evaluate({ profile, events, newlyDiscoveredIds }: EvaluationInput) {
    return events.map((event) => ({
      ...event,
      ...scoreEvent(event, profile),
      isNewlyDiscovered: newlyDiscoveredIds.includes(event.id),
    }));
  },
};
