import type { StartupEvent } from "@/types/event";

const demo = (
  event: Omit<
    StartupEvent,
    "isMock" | "sourceName" | "category" | "firstSeenAt" | "lastCheckedAt"
  > & { sourceName?: string },
): StartupEvent => ({
  sourceName: event.sourceName ?? "Demo listing",
  category: null,
  firstSeenAt: null,
  lastCheckedAt: null,
  ...event,
  isMock: true,
});

export const baseEvents: StartupEvent[] = [
  demo({
    id: "seoul-ai-builders",
    title: "Seoul AI Builders night",
    organizer: "Startup Alliance",
    description:
      "An evening for seed-stage teams shipping applied AI products, with short founder talks and open tables afterward.",
    startsAt: "2026-10-16T10:00:00+09:00",
    registrationDeadline: "2026-10-14T18:00:00+09:00",
    industries: ["AI", "SaaS"],
    eventType: "Meetup",
    location: "Seoul",
    sourceUrl: "https://example.com/startup-radar/demo/seoul-ai-builders",
  }),
  demo({
    id: "pangyo-saas-forum",
    title: "Pangyo SaaS forum",
    organizer: "Gyeonggi Startup Hub",
    description:
      "Operators from B2B software companies compare pricing, onboarding, and the first enterprise sale.",
    startsAt: "2026-11-04T09:30:00+09:00",
    registrationDeadline: "2026-11-01T17:00:00+09:00",
    industries: ["SaaS"],
    eventType: "Conference",
    location: "Pangyo",
    sourceUrl: "https://example.com/startup-radar/demo/pangyo-saas-forum",
  }),
  demo({
    id: "fintech-demo-day",
    title: "Han River fintech demo day",
    organizer: "Korea Fintech Center",
    description:
      "Eight payments and lending teams present to angels and early funds. Audience seats are limited.",
    startsAt: "2026-10-28T14:00:00+09:00",
    registrationDeadline: "2026-10-22T12:00:00+09:00",
    industries: ["Fintech"],
    eventType: "Demo day",
    location: "Seoul",
    sourceUrl: "https://example.com/startup-radar/demo/han-river-fintech",
  }),
  demo({
    id: "climate-studio",
    title: "Climate studio office hours",
    organizer: "Green Campus Daejeon",
    description:
      "Reserve a 25-minute slot with operators who have shipped hardware for energy and agriculture.",
    startsAt: "2026-11-12T13:00:00+09:00",
    registrationDeadline: null,
    industries: ["Climate Tech"],
    eventType: "Program",
    location: "Daejeon",
    sourceUrl: "https://example.com/startup-radar/demo/climate-studio",
  }),
  demo({
    id: "busan-commerce",
    title: "Busan commerce roundtable",
    organizer: null,
    description:
      "Cross-border sellers compare logistics partners and marketplace fees. The host has not published an organizer name.",
    startsAt: "2026-12-02T15:00:00+09:00",
    registrationDeadline: "2026-11-28T18:00:00+09:00",
    industries: ["E-commerce"],
    eventType: "Networking",
    location: "Busan",
    sourceUrl: "https://example.com/startup-radar/demo/busan-commerce",
  }),
  demo({
    id: "health-sprint",
    title: "Digital health sprint",
    organizer: "Seoul Bio Hub",
    description:
      "A three-day build for clinical workflow tools. Teams need a working prototype and a clinician advisor.",
    startsAt: "2026-11-19T09:00:00+09:00",
    registrationDeadline: "2026-11-10T18:00:00+09:00",
    industries: ["Healthcare", "AI"],
    eventType: "Competition",
    location: "Seoul",
    sourceUrl: "https://example.com/startup-radar/demo/digital-health-sprint",
  }),
  demo({
    id: "edtech-breakfast",
    title: "Edtech founder breakfast",
    organizer: "Hongdae Learning Lab",
    description:
      "A small breakfast for teams selling to schools and academies. No stage, just one long table.",
    startsAt: "2026-10-21T08:00:00+09:00",
    registrationDeadline: "2026-10-19T12:00:00+09:00",
    industries: ["Education"],
    eventType: "Networking",
    location: "Seoul",
    sourceUrl: "https://example.com/startup-radar/demo/edtech-breakfast",
  }),
  demo({
    id: "robotics-open",
    title: "Robotics open lab",
    organizer: "Incheon Maker Yard",
    description: null,
    startsAt: null,
    registrationDeadline: null,
    industries: ["Robotics"],
    eventType: "Meetup",
    location: "Incheon",
    sourceUrl: "https://example.com/startup-radar/demo/robotics-open-lab",
  }),
];

export const reserveEvents: StartupEvent[] = [
  demo({
    id: "mapo-founder-desk",
    title: "Mapo founder desk hours",
    organizer: "Seoul Startup Hub",
    description:
      "Drop-in hours for seed teams that want a second look at their customer interviews.",
    startsAt: "2026-10-30T11:00:00+09:00",
    registrationDeadline: "2026-10-29T18:00:00+09:00",
    industries: ["SaaS", "AI"],
    eventType: "Program",
    location: "Seoul",
    sourceUrl: "https://example.com/startup-radar/demo/mapo-founder-desk",
  }),
  demo({
    id: "online-preseed",
    title: "Online pre-seed clinic",
    organizer: "Founder Circle Korea",
    description:
      "A remote clinic on first hires and the story you tell before a seed round.",
    startsAt: "2026-11-07T19:00:00+09:00",
    registrationDeadline: "2026-11-06T12:00:00+09:00",
    industries: ["Other", "SaaS"],
    eventType: "Program",
    location: "Online",
    sourceUrl: "https://example.com/startup-radar/demo/online-preseed-clinic",
  }),
  demo({
    id: "gangnam-introductions",
    title: "Gangnam introductions",
    organizer: "Capital Circle",
    description:
      "A seated introduction hour for founders who already have a product in market.",
    startsAt: "2026-12-09T18:30:00+09:00",
    registrationDeadline: "2026-12-05T18:00:00+09:00",
    industries: ["Fintech", "SaaS", "AI"],
    eventType: "Networking",
    location: "Seoul",
    sourceUrl: "https://example.com/startup-radar/demo/gangnam-introductions",
  }),
];
