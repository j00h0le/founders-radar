import { baseEvents, reserveEvents } from "@/lib/events/catalog";
import type { EventDraft } from "@/lib/db/records";
import type { EventSourceAdapter } from "@/lib/ingestion/types";

function toDraft(event: (typeof baseEvents)[number]): EventDraft {
  return {
    title: event.title,
    description: event.description,
    organizer: event.organizer,
    category: event.category,
    industries: event.industries,
    eventType: event.eventType,
    startsAt: event.startsAt,
    registrationDeadline: event.registrationDeadline,
    location: event.location,
    sourceName: event.sourceName,
    sourceUrl: event.sourceUrl,
    isMock: true,
  };
}

export const mockEventSource: EventSourceAdapter = {
  id: "mock",
  name: "Demo listing",
  live: false,
  async fetchListings() {
    return [...baseEvents, ...reserveEvents].map(toDraft);
  },
};
