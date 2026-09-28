import type { EventDraft } from "@/lib/db/records";

export type SourceListings = {
  drafts: EventDraft[];
  retrievedCount: number;
};

export type EventSourceAdapter = {
  id: string;
  name: string;
  live: boolean;
  fetchListings(): Promise<EventDraft[] | SourceListings>;
};

export type SourceIngestionStatus = {
  id: string;
  name: string;
  live: boolean;
  listingCount: number;
  retrievedCount: number;
  normalizedCount: number;
  limitation: string | null;
};

export type IngestionReport = {
  storedCount: number;
  partial: boolean;
  sources: SourceIngestionStatus[];
};

export class SourceAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceAccessError";
  }
}
