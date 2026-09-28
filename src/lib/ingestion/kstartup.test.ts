import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { scoreJevJudgment } from "@/lib/relevance/jev/score";
import { buildDecisionsRequest } from "@/lib/relevance/jev/questions";
import { scoreEvent } from "@/lib/relevance/mock-provider";
import { demoProfile } from "@/types/profile";
import {
  KSTARTUP_PAGE_SIZE,
  kstartupEventSource,
  normalizeKstartupItem,
} from "@/lib/ingestion/kstartup-adapter";

const detailUrl =
  "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=179345";

function row(overrides: Record<string, unknown> = {}) {
  return {
    biz_pbanc_nm: "2026 incubator intake",
    pbanc_ctnt: "<p>Support for early founders.</p>",
    pbanc_ntrp_nm: "Kyung Hee BI Center",
    supt_biz_clsfc: "사업화",
    supt_regin: "서울",
    pbanc_rcpt_bgng_dt: "20260923",
    pbanc_rcpt_end_dt: "20261006",
    detl_pg_url: detailUrl,
    pbanc_sn: 179345,
    ...overrides,
  };
}

function pageBody(page: number, total: number, items: unknown[]) {
  return {
    currentCount: items.length,
    data: items,
    matchCount: total,
    page,
    perPage: KSTARTUP_PAGE_SIZE,
    totalCount: total,
  };
}

const originalFetch = globalThis.fetch;
const originalKey = process.env.KSTARTUP_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.KSTARTUP_API_KEY;
  else process.env.KSTARTUP_API_KEY = originalKey;
});

describe("K-Startup normalization", () => {
  it("maps announcement fields and leaves missing fields empty", () => {
    const event = normalizeKstartupItem(
      row({
        pbanc_ntrp_nm: "  ",
        supt_regin: null,
        pbanc_ctnt: "",
        pbanc_rcpt_end_dt: "not-a-date",
        pbanc_rcpt_bgng_dt: null,
      }),
    );
    assert.ok(event);
    assert.equal(event.sourceName, "K-Startup");
    assert.equal(event.sourceUrl, detailUrl);
    assert.equal(event.isMock, false);
    assert.equal(event.category, "사업화");
    assert.equal(event.eventType, "Program");
    assert.equal(event.organizer, null);
    assert.equal(event.location, null);
    assert.equal(event.description, null);
    assert.equal(event.startsAt, null);
    assert.equal(event.registrationDeadline, null);
    assert.deepEqual(event.industries, []);
  });

  it("maps known support classes and skips unknown classes", () => {
    assert.equal(normalizeKstartupItem(row({ supt_biz_clsfc: "행사ㆍ네트워크" }))?.eventType, "Networking");
    assert.equal(normalizeKstartupItem(row({ supt_biz_clsfc: "창업교육" }))?.eventType, "Program");
    assert.equal(normalizeKstartupItem(row({ supt_biz_clsfc: "시설·공간·보육" }))?.eventType, "Program");
    assert.equal(normalizeKstartupItem(row({ supt_biz_clsfc: "알 수 없음" })), null);
    assert.equal(normalizeKstartupItem(row({ supt_biz_clsfc: "  " })), null);
  });

  it("skips a malformed record and builds a detail URL from the serial when needed", () => {
    assert.equal(normalizeKstartupItem(row({ biz_pbanc_nm: " " })), null);
    assert.equal(normalizeKstartupItem("not-a-record"), null);
    const event = normalizeKstartupItem(row({ detl_pg_url: null, pbanc_sn: 42 }));
    assert.equal(
      event?.sourceUrl,
      "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=42",
    );
    assert.equal(normalizeKstartupItem(row({ detl_pg_url: null, pbanc_sn: null })), null);
  });

  it("does not treat missing industry or category text as a Jev industry match", () => {
    const event = normalizeKstartupItem(
      row({ supt_biz_clsfc: "사업화", pbanc_ctnt: null, supt_regin: null }),
    );
    assert.ok(event);
    const request = buildDecisionsRequest(
      {
        id: "kstartup",
        ...event,
        firstSeenAt: null,
        lastCheckedAt: null,
      },
      demoProfile,
      "typesafe/jev-1.13",
    );
    const listed = request.state.event as { industries: string[]; category: string | null };
    assert.deepEqual(listed.industries, []);
    assert.equal(listed.category, "사업화");
    const missingCategory = buildDecisionsRequest(
      {
        id: "kstartup",
        ...event,
        category: null,
        firstSeenAt: null,
        lastCheckedAt: null,
      },
      demoProfile,
      "typesafe/jev-1.13",
    );
    assert.equal((missingCategory.state.event as { category: string | null }).category, null);

    const score = scoreJevJudgment({
      industry: 0.2,
      stage: { choice: "not_stated", relevantProbability: 0, confidence: 0.4 },
      eventType: null,
    });
    assert.equal(score.matchingCriteria.includes("Industry"), false);
    assert.equal(score.stageIncluded, false);
    assert.match(score.explanation, /left out of the score/);

    const demo = scoreEvent(
      {
        id: "kstartup",
        ...event,
        industries: [],
        location: null,
        firstSeenAt: null,
        lastCheckedAt: null,
      },
      demoProfile,
    );
    assert.equal(demo.matchingCriteria.includes("Industry"), false);
    assert.match(demo.explanation, /No shared industry/);
  });
});

describe("K-Startup pagination and errors", () => {
  it("keeps the first page and skips malformed records", async () => {
    process.env.KSTARTUP_API_KEY = "test-key";
    const requested: number[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("serviceKey"), "test-key");
      assert.equal(url.searchParams.get("returnType"), "json");
      assert.equal(url.searchParams.get("perPage"), String(KSTARTUP_PAGE_SIZE));
      const page = Number(url.searchParams.get("page"));
      requested.push(page);
      const items = Array.from({ length: KSTARTUP_PAGE_SIZE }, (_, index) =>
        row({
          pbanc_sn: page * 1000 + index,
          detl_pg_url: `https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=${page * 1000 + index}`,
          biz_pbanc_nm: index === 0 ? " " : `Notice ${page}-${index}`,
        }),
      );
      return new Response(JSON.stringify(pageBody(page, KSTARTUP_PAGE_SIZE + 1, items)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const listings = await kstartupEventSource.fetchListings();
    assert.ok(!Array.isArray(listings));
    assert.deepEqual(requested, [1]);
    assert.equal(listings.retrievedCount, KSTARTUP_PAGE_SIZE);
    assert.equal(listings.drafts.length, KSTARTUP_PAGE_SIZE - 1);
  });

  it("treats malformed payloads, HTTP errors, and a missing key as source errors", async () => {
    process.env.KSTARTUP_API_KEY = "test-key";
    globalThis.fetch = async () => new Response("not-json", { status: 200 });
    await assert.rejects(() => kstartupEventSource.fetchListings(), /not JSON/);

    globalThis.fetch = async () => new Response("down", { status: 503 });
    await assert.rejects(() => kstartupEventSource.fetchListings(), /HTTP 503/);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ page: 1, perPage: KSTARTUP_PAGE_SIZE, totalCount: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    await assert.rejects(() => kstartupEventSource.fetchListings(), /malformed/);

    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    await assert.rejects(() => kstartupEventSource.fetchListings(), /could not be reached/);

    delete process.env.KSTARTUP_API_KEY;
    await assert.rejects(() => kstartupEventSource.fetchListings(), /not configured/);
  });
});
