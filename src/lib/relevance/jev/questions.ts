import type { StartupEvent } from "@/types/event";
import type { EventType } from "@/types/event";
import type { FounderProfile, Industry, StartupStage } from "@/types/profile";

export const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const DEFAULT_JEV_MODEL = "typesafe/jev-1.13";

const industryDefinitions: Record<Industry, string> = {
  AI: "Products built around machine learning, language models, or other artificial intelligence.",
  Fintech: "Financial products, payments, lending, insurance, or other financial infrastructure.",
  SaaS: "Software sold as a subscription service to businesses or teams.",
  "E-commerce": "Online retail, marketplaces, or commerce tooling.",
  Healthcare: "Health, medical, or wellness products and services.",
  Education: "Learning products, schools, or training for students or workers.",
  "Climate Tech": "Climate, energy, or environmental technology.",
  Robotics: "Robots, autonomous machines, or hardware that acts in the physical world.",
  Other: "A startup industry outside the named categories.",
};

const stageDefinitions: Record<StartupStage, string> = {
  Idea: "A startup that is still shaping the concept and has not raised a round.",
  "Pre-seed": "A startup raising or recently raising its first outside capital.",
  Seed: "A startup with an early product that is raising or has raised a seed round.",
  "Series A": "A startup scaling after a seed round, typically raising Series A.",
  "Series B+": "A later-stage startup at Series B or beyond.",
  Other: "A startup stage outside Idea, Pre-seed, Seed, Series A, and Series B+.",
};

const eventTypeDefinitions: Record<EventType, string> = {
  Meetup: "A small in-person or online gathering of founders.",
  Conference: "A scheduled conference, forum, or multi-session industry event.",
  Competition: "A pitch competition, challenge, or contest with a selection process.",
  Program: "An accelerator, incubator, fellowship, or multi-week founder program.",
  Networking: "An event organized mainly for founders to meet other people.",
  "Demo day": "A showcase where startups present their product to an audience.",
};

export const stageCriteria = {
  relevant:
    "The event is for startups at the stage described in `founder.stage_definition`, or for a range of stages that includes that stage.",
  not_relevant:
    "The event is for a different startup stage than the one described in `founder.stage_definition`.",
  not_stated: "The event does not say which startup stage it is for.",
} as const;

export type StageChoice = keyof typeof stageCriteria;

export type DecisionsQuestion =
  | {
      type: "noul";
      instructions: string;
      criteria: { true: string; false: string };
    }
  | {
      type: "choice";
      instructions: string;
      criteria: Record<string, string>;
    };

export type DecisionsRequest = {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, DecisionsQuestion>;
};

function listedDefinitions<T extends string>(
  selected: readonly T[],
  definitions: Record<T, string>,
) {
  return selected.map((item) => `${item}: ${definitions[item]}`).join(" ");
}

export function preferredEventTypes(profile: FounderProfile) {
  return profile.preferredEventTypes ?? [];
}

export function buildDecisionsRequest(
  event: StartupEvent,
  profile: FounderProfile,
  model: string,
): DecisionsRequest {
  const preferred = preferredEventTypes(profile);
  const founder: Record<string, unknown> = {
    startup_name: profile.startupName,
    industries: profile.industries,
    industry_definitions: listedDefinitions(profile.industries, industryDefinitions),
    stage: profile.stage,
    stage_definition: stageDefinitions[profile.stage],
  };
  if (preferred.length > 0) {
    founder.preferred_event_types = preferred;
    founder.preferred_event_type_definitions = listedDefinitions(
      preferred,
      eventTypeDefinitions,
    );
  }

  const questions: Record<string, DecisionsQuestion> = {
    industry_relevance: {
      type: "noul",
      instructions:
        "Is the subject or audience of the event in `event.title`, `event.description`, `event.category`, and `event.industries` specifically one of the industries described by `founder.industry_definitions`?",
      criteria: {
        true: "The event's subject or audience is specifically one of those industries.",
        false:
          "The event is for startups in general, names a different industry, or does not name an industry.",
      },
    },
    stage_relevance: {
      type: "choice",
      instructions:
        "Which statement best describes how the audience of `event` relates to a startup at `founder.stage`?",
      criteria: stageCriteria,
    },
  };

  if (preferred.length > 0) {
    questions.event_type_relevance = {
      type: "noul",
      instructions:
        "Does `event` match one of the event kinds described in `founder.preferred_event_type_definitions`?",
      criteria: {
        true: "The event is one of those kinds, even if the listing uses different wording.",
        false: "The event is a different kind from every preferred event type.",
      },
    };
  }

  return {
    model,
    state: {
      event: {
        title: event.title,
        description: event.description,
        category: event.category,
        industries: event.industries,
        event_type: event.eventType,
        organizer: event.organizer,
        location: event.location,
      },
      founder,
    },
    questions,
  };
}
