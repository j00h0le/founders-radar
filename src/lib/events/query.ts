import type { ScoredEvent, SortKey } from "@/types/event";
import type { Industry } from "@/types/profile";

export type EventQuery = {
  search: string;
  industries: Industry[];
  eventTypes: ScoredEvent["eventType"][];
  sort: SortKey;
};

export const emptyQuery: EventQuery = {
  search: "",
  industries: [],
  eventTypes: [],
  sort: "relevance",
};

export function filterEvents(events: ScoredEvent[], query: EventQuery) {
  const search = query.search.trim().toLowerCase();
  const filtered = events.filter((event) => {
    const haystack = [event.title, event.organizer, event.description, event.location]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = search.length === 0 || haystack.includes(search);
    const matchesIndustry =
      query.industries.length === 0 ||
      event.industries.some((industry) => query.industries.includes(industry));
    const matchesType =
      query.eventTypes.length === 0 || query.eventTypes.includes(event.eventType);
    return matchesSearch && matchesIndustry && matchesType;
  });

  return [...filtered].sort((a, b) => {
    if (query.sort === "date") {
      const aTime = a.startsAt ? Date.parse(a.startsAt) : Number.POSITIVE_INFINITY;
      const bTime = b.startsAt ? Date.parse(b.startsAt) : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    }
    return b.relevanceScore - a.relevanceScore;
  });
}
