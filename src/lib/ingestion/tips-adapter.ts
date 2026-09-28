import { z } from "zod";
import type { EventDraft } from "@/lib/db/records";
import { dedupeDrafts } from "@/lib/ingestion/dedupe";
import { SourceAccessError, type EventSourceAdapter } from "@/lib/ingestion/types";
import type { EventType } from "@/types/event";

const TIPS_ORIGIN = "https://jointips.or.kr";
const LIST_PATH = "/api/cms/public/event/list";
const DETAIL_PATH = "/contents/events/detail";
const SITE_ID = "4";
/** One page of listings collected on each refresh. */
const PAGE_SIZE = 100;
const PAGE_TIMEOUT_MS = 15_000;

export { PAGE_SIZE as TIPS_PAGE_SIZE };

const eventTypeByCode: Record<string, EventType> = {
  EDU: "Program",
  NET: "Networking",
  CMP: "Competition",
  BRF: "Meetup",
  FRM: "Conference",
  INC: "Program",
};

const listSchema = z.object({
  code: z.coerce.number(),
  data: z.array(z.unknown()).optional(),
  total: z.number().optional(),
  page: z.number().optional(),
  size: z.number().optional(),
  message: z.string().optional(),
});

const itemSchema = z.object({
  title: z.string().optional(),
  organizer: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  contents: z.string().nullable().optional(),
  eventStdCd: z.string().nullable().optional(),
  eventStdNm: z.string().nullable().optional(),
  eventStartDt: z.string().nullable().optional(),
  applyEndDt: z.string().nullable().optional(),
  encodedId: z.string().optional(),
});

function blankToNull(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function plainText(value: string | null | undefined) {
  const raw = blankToNull(value);
  if (!raw) return null;
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.slice(0, 4000);
}

function koreaDateTime(value: string | null | undefined) {
  const raw = blankToNull(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?$/);
  if (!match) return null;
  const iso = `${match[1]}T${match[2] ?? "00:00"}:00+09:00`;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function normalizeTipsItem(input: unknown): EventDraft | null {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return null;

  const title = blankToNull(parsed.data.title);
  const encodedId = blankToNull(parsed.data.encodedId);
  if (!title || !encodedId) return null;

  const code = (parsed.data.eventStdCd ?? "").trim().toUpperCase();
  const eventType = eventTypeByCode[code];
  // event_type is required by the shared schema and the database check.
  // There is no unknown value, and every allowed type can earn category points.
  if (!eventType) return null;
  const sourceUrl = `${TIPS_ORIGIN}${DETAIL_PATH}?eventId=${encodeURIComponent(encodedId)}`;

  return {
    title,
    description: plainText(parsed.data.summary) ?? plainText(parsed.data.contents),
    organizer: blankToNull(parsed.data.organizer),
    category: blankToNull(parsed.data.eventStdNm),
    industries: [],
    eventType,
    startsAt: koreaDateTime(parsed.data.eventStartDt),
    registrationDeadline: koreaDateTime(parsed.data.applyEndDt),
    location: blankToNull(parsed.data.location),
    sourceName: "TIPS",
    sourceUrl,
    isMock: false,
  };
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SourceAccessError("TIPS returned a response that was not JSON.");
  }
}

async function fetchPage(page: number) {
  const url = new URL(LIST_PATH, TIPS_ORIGIN);
  url.searchParams.set("siteId", SITE_ID);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PAGE_SIZE));
  url.searchParams.set("sort", "latest");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new SourceAccessError("TIPS event listings could not be reached.");
  }

  if (!response.ok) {
    throw new SourceAccessError(`TIPS event listings returned HTTP ${response.status}.`);
  }

  const json = listSchema.safeParse(await readJson(response));
  if (!json.success) {
    throw new SourceAccessError("TIPS event listings were malformed.");
  }
  if (json.data.code !== 200 || !Array.isArray(json.data.data)) {
    throw new SourceAccessError(
      json.data.message || "TIPS event listings could not be read.",
    );
  }

  const total = json.data.total;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
    throw new SourceAccessError("TIPS returned an unexpected listing total.");
  }
  if (json.data.page !== page) {
    throw new SourceAccessError("TIPS returned a listing page that did not match the request.");
  }
  if (json.data.size !== PAGE_SIZE) {
    throw new SourceAccessError("TIPS returned an unexpected page size.");
  }

  return {
    total,
    page,
    rawCount: json.data.data.length,
    drafts: json.data.data.flatMap((item) => {
      const draft = normalizeTipsItem(item);
      return draft ? [draft] : [];
    }),
  };
}

function expectedRawCount(total: number) {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new SourceAccessError("TIPS returned an unexpected listing total.");
  }
  return Math.min(total, PAGE_SIZE);
}

export const tipsEventSource: EventSourceAdapter = {
  id: "tips",
  name: "TIPS",
  live: true,
  async fetchListings() {
    const first = await fetchPage(1);
    if (first.total === 0) {
      if (first.rawCount !== 0) {
        throw new SourceAccessError("TIPS returned listings without a total.");
      }
      return [];
    }
    if (first.rawCount !== expectedRawCount(first.total)) {
      throw new SourceAccessError("TIPS returned an incomplete listing page.");
    }

    return dedupeDrafts(first.drafts).slice(0, PAGE_SIZE);
  },
};
