import { z } from "zod";
import type { EventDraft } from "@/lib/db/records";
import { dedupeDrafts } from "@/lib/ingestion/dedupe";
import { SourceAccessError, type EventSourceAdapter } from "@/lib/ingestion/types";
import type { EventType } from "@/types/event";

const ENDPOINT =
  "https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01";
const DETAIL_ORIGIN = "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do";
/** One page of listings collected on each refresh. */
const PAGE_SIZE = 100;
const PAGE_TIMEOUT_MS = 15_000;

export { PAGE_SIZE as KSTARTUP_PAGE_SIZE };

const eventTypeByClass: Record<string, EventType> = {
  "시설ㆍ공간ㆍ보육": "Program",
  창업교육: "Program",
  사업화: "Program",
  "행사ㆍ네트워크": "Networking",
  "멘토링ㆍ컨설팅ㆍ교육": "Program",
  글로벌: "Program",
  "판로ㆍ해외진출": "Program",
  인력: "Program",
};

const pageSchema = z.object({
  currentCount: z.number().optional(),
  data: z.array(z.unknown()).optional(),
  matchCount: z.number().optional(),
  page: z.number().optional(),
  perPage: z.number().optional(),
  totalCount: z.number().optional(),
});

const itemSchema = z.object({
  biz_pbanc_nm: z.string().nullable().optional(),
  pbanc_ctnt: z.string().nullable().optional(),
  pbanc_ntrp_nm: z.string().nullable().optional(),
  supt_biz_clsfc: z.string().nullable().optional(),
  supt_regin: z.string().nullable().optional(),
  pbanc_rcpt_bgng_dt: z.string().nullable().optional(),
  pbanc_rcpt_end_dt: z.string().nullable().optional(),
  detl_pg_url: z.string().nullable().optional(),
  pbanc_sn: z.union([z.string(), z.number()]).nullable().optional(),
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

function classKey(value: string) {
  return value.replace(/[·・･∙]/g, "ㆍ").replace(/\s+/g, "");
}

function koreaDate(value: string | null | undefined) {
  const raw = blankToNull(value);
  if (!raw || !/^\d{8}$/.test(raw)) return null;
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00+09:00`;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function detailUrl(explicit: string | null, serial: string | number | null | undefined) {
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit;
  if (typeof serial === "number" && Number.isSafeInteger(serial) && serial > 0) {
    return `${DETAIL_ORIGIN}?schM=view&pbancSn=${serial}`;
  }
  if (typeof serial === "string" && /^[1-9]\d*$/.test(serial.trim())) {
    return `${DETAIL_ORIGIN}?schM=view&pbancSn=${serial.trim()}`;
  }
  return null;
}

export function normalizeKstartupItem(input: unknown): EventDraft | null {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return null;

  const title = blankToNull(parsed.data.biz_pbanc_nm);
  const sourceUrl = detailUrl(blankToNull(parsed.data.detl_pg_url), parsed.data.pbanc_sn);
  const category = blankToNull(parsed.data.supt_biz_clsfc);
  const eventType = category ? eventTypeByClass[classKey(category)] : undefined;
  if (!title || !sourceUrl || !eventType) return null;

  return {
    title,
    description: plainText(parsed.data.pbanc_ctnt),
    organizer: blankToNull(parsed.data.pbanc_ntrp_nm),
    category,
    industries: [],
    eventType,
    startsAt: koreaDate(parsed.data.pbanc_rcpt_bgng_dt),
    registrationDeadline: koreaDate(parsed.data.pbanc_rcpt_end_dt),
    location: blankToNull(parsed.data.supt_regin),
    sourceName: "K-Startup",
    sourceUrl,
    isMock: false,
  };
}

function apiKey() {
  const key = process.env.KSTARTUP_API_KEY?.trim();
  if (!key) {
    throw new SourceAccessError("K-Startup API key is not configured.");
  }
  return key;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SourceAccessError("K-Startup returned a response that was not JSON.");
  }
}

async function fetchPage(page: number, key: string) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("page", String(page));
  url.searchParams.set("perPage", String(PAGE_SIZE));
  url.searchParams.set("returnType", "json");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new SourceAccessError("K-Startup event listings could not be reached.");
  }

  if (!response.ok) {
    throw new SourceAccessError(`K-Startup event listings returned HTTP ${response.status}.`);
  }

  const json = pageSchema.safeParse(await readJson(response));
  if (!json.success || !Array.isArray(json.data.data)) {
    throw new SourceAccessError("K-Startup event listings were malformed.");
  }
  if (json.data.page !== page) {
    throw new SourceAccessError("K-Startup returned a listing page that did not match the request.");
  }
  if (json.data.perPage !== PAGE_SIZE) {
    throw new SourceAccessError("K-Startup returned an unexpected page size.");
  }

  const total = json.data.totalCount;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
    throw new SourceAccessError("K-Startup returned an unexpected listing total.");
  }
  if (json.data.currentCount !== json.data.data.length) {
    throw new SourceAccessError("K-Startup returned an incomplete listing page.");
  }

  return {
    total,
    page,
    rawCount: json.data.data.length,
    drafts: json.data.data.flatMap((item) => {
      const draft = normalizeKstartupItem(item);
      return draft ? [draft] : [];
    }),
  };
}

function expectedRawCount(total: number) {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new SourceAccessError("K-Startup returned an unexpected listing total.");
  }
  return Math.min(total, PAGE_SIZE);
}

export const kstartupEventSource: EventSourceAdapter = {
  id: "kstartup",
  name: "K-Startup",
  live: true,
  async fetchListings() {
    const key = apiKey();
    const first = await fetchPage(1, key);
    if (first.total === 0) {
      if (first.rawCount !== 0) {
        throw new SourceAccessError("K-Startup returned listings without a total.");
      }
      return { drafts: [], retrievedCount: 0 };
    }
    if (first.rawCount !== expectedRawCount(first.total)) {
      throw new SourceAccessError("K-Startup returned an incomplete listing page.");
    }

    return {
      drafts: dedupeDrafts(first.drafts).slice(0, PAGE_SIZE),
      retrievedCount: first.rawCount,
    };
  },
};
