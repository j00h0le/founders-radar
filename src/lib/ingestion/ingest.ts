import type { RadarRepository } from "@/lib/db/repository";
import type { EventDraft } from "@/lib/db/records";
import { dedupeDrafts } from "@/lib/ingestion/dedupe";
import { kstartupEventSource } from "@/lib/ingestion/kstartup-adapter";
import { mockEventSource } from "@/lib/ingestion/mock-adapter";
import { tipsEventSource } from "@/lib/ingestion/tips-adapter";
import {
  SourceAccessError,
  type EventSourceAdapter,
  type IngestionReport,
  type SourceIngestionStatus,
  type SourceListings,
} from "@/lib/ingestion/types";

export type { IngestionReport };

const UPSERT_BATCH = 100;

const liveSources: EventSourceAdapter[] = [tipsEventSource, kstartupEventSource];

function listingsFrom(value: EventDraft[] | SourceListings) {
  if (Array.isArray(value)) {
    return {
      drafts: value,
      retrievedCount: value.length,
      normalizedCount: value.length,
    };
  }
  return {
    drafts: value.drafts,
    retrievedCount: value.retrievedCount,
    normalizedCount: value.drafts.length,
  };
}

async function storeDrafts(
  repository: RadarRepository,
  drafts: EventDraft[],
  onDeduped?: (collected: number, unique: number) => void,
) {
  const unique = dedupeDrafts(drafts);
  onDeduped?.(drafts.length, unique.length);
  for (let index = 0; index < unique.length; index += UPSERT_BATCH) {
    await repository.upsertEvents(unique.slice(index, index + UPSERT_BATCH));
  }
  return unique.length;
}

function status(
  source: EventSourceAdapter,
  counts: { listingCount: number; retrievedCount: number; normalizedCount: number },
  limitation: string | null,
): SourceIngestionStatus {
  return {
    id: source.id,
    name: source.name,
    live: source.live,
    listingCount: counts.listingCount,
    retrievedCount: counts.retrievedCount,
    normalizedCount: counts.normalizedCount,
    limitation,
  };
}

function emptyCounts() {
  return { listingCount: 0, retrievedCount: 0, normalizedCount: 0 };
}

function limitationFrom(source: EventSourceAdapter, error: unknown) {
  return error instanceof SourceAccessError
    ? error.message
    : `${source.name} event listings could not be read.`;
}

export type IngestNotice =
  | { type: "started"; sources: Array<{ id: string; name: string; live: boolean }> }
  | { type: "source"; source: SourceIngestionStatus }
  | { type: "deduped"; collected: number; unique: number };

export async function ingestEventSources(
  repository: RadarRepository,
  sourcesToRead: EventSourceAdapter[] = liveSources,
  onNotice?: (notice: IngestNotice) => void,
): Promise<IngestionReport> {
  onNotice?.({
    type: "started",
    sources: sourcesToRead.map((source) => ({
      id: source.id,
      name: source.name,
      live: source.live,
    })),
  });

  const settled = await Promise.allSettled(
    sourcesToRead.map(async (source) => {
      try {
        const value = await source.fetchListings();
        const listings = listingsFrom(value);
        onNotice?.({
          type: "source",
          source: status(
            source,
            {
              listingCount: listings.normalizedCount,
              retrievedCount: listings.retrievedCount,
              normalizedCount: listings.normalizedCount,
            },
            null,
          ),
        });
        return value;
      } catch (error) {
        onNotice?.({
          type: "source",
          source: status(source, emptyCounts(), limitationFrom(source, error)),
        });
        throw error;
      }
    }),
  );
  const sources: SourceIngestionStatus[] = [];
  const liveDrafts: EventDraft[] = [];

  settled.forEach((outcome, index) => {
    const source = sourcesToRead[index];
    if (!source) return;
    if (outcome.status === "fulfilled") {
      const listings = listingsFrom(outcome.value);
      liveDrafts.push(...listings.drafts);
      sources.push(
        status(
          source,
          {
            listingCount: listings.normalizedCount,
            retrievedCount: listings.retrievedCount,
            normalizedCount: listings.normalizedCount,
          },
          null,
        ),
      );
      return;
    }

    const error = outcome.reason;
    const limitation = limitationFrom(source, error);
    sources.push(status(source, emptyCounts(), limitation));
  });

  const live = sources.filter((source) => source.live);
  const anySuccess = live.some((source) => !source.limitation);
  const anyFailure = live.some((source) => source.limitation);
  const partial = anySuccess && anyFailure;

  const onDeduped = (collected: number, unique: number) => {
    onNotice?.({ type: "deduped", collected, unique });
  };

  if (liveDrafts.length > 0) {
    const storedCount = await storeDrafts(repository, liveDrafts, onDeduped);
    return { storedCount, partial, sources };
  }

  if (anySuccess || !anyFailure) {
    return { storedCount: 0, partial, sources };
  }

  const existing = await repository.listEvents();
  if (existing.length > 0) {
    return { storedCount: 0, partial: false, sources };
  }

  try {
    const fallback = listingsFrom(await mockEventSource.fetchListings());
    const storedCount = await storeDrafts(repository, fallback.drafts, onDeduped);
    sources.push(
      status(
        mockEventSource,
        {
          listingCount: fallback.normalizedCount,
          retrievedCount: fallback.retrievedCount,
          normalizedCount: fallback.normalizedCount,
        },
        null,
      ),
    );
    return { storedCount, partial: false, sources };
  } catch {
    sources.push(
      status(mockEventSource, emptyCounts(), "The demo event catalog could not be loaded."),
    );
    return { storedCount: 0, partial: false, sources };
  }
}
