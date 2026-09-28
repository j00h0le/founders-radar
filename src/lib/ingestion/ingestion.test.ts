import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDemoRepository } from "@/lib/db/demo-repository";
import { loadWorkspaceState } from "@/lib/db/workspace";
import { eventToInsert, type EventDraft } from "@/lib/db/records";
import type { RadarRepository } from "@/lib/db/repository";
import { dedupeDrafts } from "@/lib/ingestion/dedupe";
import { ingestEventSources } from "@/lib/ingestion/ingest";
import { mockEventSource } from "@/lib/ingestion/mock-adapter";
import { refreshWorkspace } from "@/lib/ingestion/refresh";
import {
  normalizeTipsItem,
  TIPS_PAGE_SIZE,
  tipsEventSource,
} from "@/lib/ingestion/tips-adapter";
import { SourceAccessError, type EventSourceAdapter } from "@/lib/ingestion/types";
import { scoreEvent } from "@/lib/relevance/mock-provider";
import type { StartupEvent } from "@/types/event";
import { demoProfile, type FounderProfile } from "@/types/profile";

const detailUrl = "https://jointips.or.kr/contents/events/detail?eventId=bj7Ko2";

function tipsRow(overrides: Record<string, unknown> = {}) {
  return {
    title: "AI startup briefing",
    organizer: "Seoul AI Hub",
    location: "Seoul",
    summary: "A briefing for founders.",
    eventStdCd: "FRM",
    eventStdNm: "포럼",
    eventStartDt: "2026-09-30 16:00",
    applyEndDt: "2026-09-23 23:30",
    encodedId: "bj7Ko2",
    ...overrides,
  };
}

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    title: "Live briefing",
    description: "Listed by the source.",
    organizer: "Seoul AI Hub",
    category: "포럼",
    industries: [],
    eventType: "Conference",
    startsAt: "2026-09-30T07:00:00.000Z",
    registrationDeadline: "2026-09-23T14:30:00.000Z",
    location: "Seoul",
    sourceName: "TIPS",
    sourceUrl: detailUrl,
    isMock: false,
    ...overrides,
  };
}

function memoryRepository(options?: {
  enforceAuth?: boolean;
  signedIn?: boolean;
  profile?: FounderProfile | null;
  events?: StartupEvent[];
}): RadarRepository & { evaluationsSaved: number } {
  const enforceAuth = options?.enforceAuth ?? false;
  const signedIn = options?.signedIn ?? true;
  let profile = options?.profile === undefined ? demoProfile : options.profile;
  let events = options?.events ?? [];
  let evaluationsSaved = 0;
  const requireUser = () => {
    if (enforceAuth && !signedIn) {
      throw new Error("Sign in before saving a Startup Radar profile.");
    }
  };

  return {
    get evaluationsSaved() {
      return evaluationsSaved;
    },
    async hasSession() {
      return !enforceAuth || signedIn;
    },
    async listEvents() {
      requireUser();
      return events;
    },
    async upsertEvents(drafts) {
      requireUser();
      const next = [...events];
      const now = new Date().toISOString();
      for (const item of drafts) {
        const index = next.findIndex((event) => event.sourceUrl === item.sourceUrl);
        const existing = index >= 0 ? next[index] : undefined;
        const event: StartupEvent = {
          id: existing?.id ?? item.sourceUrl,
          title: item.title,
          description: item.description,
          organizer: item.organizer,
          category: item.category,
          industries: item.industries,
          eventType: item.eventType,
          startsAt: item.startsAt,
          registrationDeadline: item.registrationDeadline,
          location: item.location,
          sourceName: item.sourceName,
          sourceUrl: item.sourceUrl,
          firstSeenAt: existing?.firstSeenAt ?? now,
          lastCheckedAt: now,
          isMock: item.isMock,
        };
        if (index >= 0) next[index] = event;
        else next.push(event);
      }
      events = next;
      return next;
    },
    async getProfile() {
      requireUser();
      return profile;
    },
    async saveProfile(next) {
      requireUser();
      profile = next;
      return next;
    },
    async listEvaluations() {
      requireUser();
      return [];
    },
    async saveEvaluations() {
      requireUser();
      evaluationsSaved += 1;
    },
    async listSavedIds() {
      requireUser();
      return [];
    },
    async setSaved() {
      requireUser();
    },
  };
}

function source(listings: EventDraft[] | Error): EventSourceAdapter {
  return namedSource("tips", "TIPS", listings);
}

function namedSource(
  id: string,
  name: string,
  listings: EventDraft[] | Error,
): EventSourceAdapter {
  return {
    id,
    name,
    live: true,
    async fetchListings() {
      if (listings instanceof Error) throw listings;
      return listings;
    },
  };
}

describe("TIPS normalization", () => {
  it("maps source fields and leaves missing fields empty", () => {
    const event = normalizeTipsItem(
      tipsRow({
        organizer: "  ",
        summary: "",
        contents: "<p>From the page</p>",
        location: null,
        applyEndDt: "not-a-date",
      }),
    );
    assert.ok(event);
    assert.equal(event.sourceUrl, detailUrl);
    assert.equal(event.sourceName, "TIPS");
    assert.equal(event.isMock, false);
    assert.equal(event.category, "포럼");
    assert.equal(event.eventType, "Conference");
    assert.equal(event.organizer, null);
    assert.equal(event.location, null);
    assert.equal(event.registrationDeadline, null);
    assert.equal(event.description, "From the page");
    assert.deepEqual(event.industries, []);
    assert.equal(event.startsAt, "2026-09-30T07:00:00.000Z");
  });

  it("maps each known TIPS category code and skips unknown codes", () => {
    const expected = {
      EDU: "Program",
      NET: "Networking",
      CMP: "Competition",
      BRF: "Meetup",
      FRM: "Conference",
      INC: "Program",
    } as const;
    for (const [code, eventType] of Object.entries(expected)) {
      assert.equal(normalizeTipsItem(tipsRow({ eventStdCd: code }))?.eventType, eventType);
    }
    assert.equal(normalizeTipsItem(tipsRow({ eventStdCd: "PRV" })), null);
    assert.equal(normalizeTipsItem(tipsRow({ eventStdCd: "" })), null);
    assert.equal(normalizeTipsItem(tipsRow({ title: "  ", encodedId: "" })), null);
  });

  it("does not treat missing industry tags as a relevance match", () => {
    const unknown = scoreEvent(
      {
        id: "1",
        title: "Briefing",
        organizer: null,
        description: null,
        category: "포럼",
        startsAt: null,
        registrationDeadline: null,
        industries: [],
        eventType: "Conference",
        location: null,
        sourceName: "TIPS",
        sourceUrl: detailUrl,
        firstSeenAt: null,
        lastCheckedAt: null,
        isMock: false,
      },
      demoProfile,
    );
    const matched = scoreEvent(
      {
        id: "2",
        title: "Briefing",
        organizer: null,
        description: null,
        category: "포럼",
        startsAt: null,
        registrationDeadline: null,
        industries: ["AI"],
        eventType: "Conference",
        location: null,
        sourceName: "TIPS",
        sourceUrl: detailUrl,
        firstSeenAt: null,
        lastCheckedAt: null,
        isMock: false,
      },
      demoProfile,
    );
    assert.match(unknown.explanation, /No shared industry/);
    assert.ok(matched.relevanceScore > unknown.relevanceScore);
  });
});

describe("TIPS pagination", () => {
  it("keeps the first page and fails closed on a short page", async () => {
    const original = globalThis.fetch;
    const requested: number[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("size"), String(TIPS_PAGE_SIZE));
      const page = Number(url.searchParams.get("page"));
      requested.push(page);
      const body = {
        code: 200,
        total: 150,
        page,
        size: TIPS_PAGE_SIZE,
        data: Array.from({ length: TIPS_PAGE_SIZE }, (_, index) =>
          tipsRow({ encodedId: `p${page}-${index}`, title: `Event ${page}-${index}` }),
        ),
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const listings = await tipsEventSource.fetchListings();
      assert.ok(Array.isArray(listings));
      assert.deepEqual(requested, [1]);
      assert.equal(listings.length, TIPS_PAGE_SIZE);
      assert.equal(new Set(listings.map((item) => item.sourceUrl)).size, TIPS_PAGE_SIZE);
    } finally {
      globalThis.fetch = original;
    }

    globalThis.fetch = async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      return new Response(
        JSON.stringify({
          code: 200,
          total: 150,
          page,
          size: TIPS_PAGE_SIZE,
          data: Array.from({ length: TIPS_PAGE_SIZE - 1 }, (_, index) =>
            tipsRow({ encodedId: `a${index}` }),
          ),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    try {
      await assert.rejects(() => tipsEventSource.fetchListings(), SourceAccessError);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("treats malformed payloads and failed requests as source errors", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response("not-json", { status: 200 });
    try {
      await assert.rejects(() => tipsEventSource.fetchListings(), /not JSON/);
    } finally {
      globalThis.fetch = original;
    }

    globalThis.fetch = async () => new Response("down", { status: 503 });
    try {
      await assert.rejects(() => tipsEventSource.fetchListings(), /HTTP 503/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("deduplication and persistence", () => {
  it("keeps the first listing for a detail URL", () => {
    const unique = dedupeDrafts([
      draft({ title: "First" }),
      draft({ title: "Second" }),
      draft({ title: " ", sourceUrl: " https://example.com/other " }),
    ]);
    assert.equal(unique.length, 1);
    assert.equal(unique[0]?.title, "First");
    assert.equal(unique[0]?.sourceUrl, detailUrl);
  });

  it("updates an existing demo record without duplicating it or resetting first seen", async () => {
    const repository = createDemoRepository();
    const before = await repository.listEvents();
    await repository.upsertEvents([draft()]);
    const saved = (await repository.listEvents()).find((event) => event.sourceUrl === detailUrl);
    assert.ok(saved);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await repository.upsertEvents([draft({ title: "Updated briefing" })]);
    const updated = (await repository.listEvents()).find((event) => event.sourceUrl === detailUrl);
    const after = await repository.listEvents();
    assert.equal(after.length, before.length + 1);
    assert.equal(updated?.id, saved.id);
    assert.equal(updated?.firstSeenAt, saved.firstSeenAt);
    assert.ok((updated?.lastCheckedAt ?? "") >= (saved.lastCheckedAt ?? ""));
    assert.equal(updated?.title, "Updated briefing");
  });

  it("does not send first_seen_at on upsert", () => {
    const payload = eventToInsert(draft());
    assert.equal("first_seen_at" in payload, false);
    assert.equal(typeof payload.last_checked_at, "string");
    assert.equal(payload.source_url, detailUrl);
  });
});

describe("dashboard loading", () => {
  it("loads an empty dashboard for a signed-out Supabase session", async () => {
    let reads = 0;
    const repository = memoryRepository({ enforceAuth: true, signedIn: false, events: [] });
    const original = repository.listEvents;
    repository.listEvents = async () => {
      reads += 1;
      return original();
    };
    const result = await loadWorkspaceState({ repository, mode: "supabase" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.profile, null);
    assert.deepEqual(result.data.events, []);
    assert.deepEqual(result.data.savedIds, []);
    assert.equal(reads, 0);
  });

  it("loads events without scores when a signed-in user has no profile", async () => {
    const repository = memoryRepository({
      enforceAuth: true,
      profile: null,
      events: [
        {
          id: "kept",
          ...draft(),
          firstSeenAt: "2026-01-01T00:00:00.000Z",
          lastCheckedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const result = await loadWorkspaceState({ repository, mode: "supabase" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.profile, null);
    assert.equal(result.data.events[0]?.sourceUrl, detailUrl);
    assert.equal(result.data.events[0]?.relevanceScore, 0);
    assert.match(result.data.events[0]?.explanation ?? "", /Refresh events to score/);
  });

  it("keeps saved scores for a signed-in user with a profile", async () => {
    const repository = memoryRepository({ enforceAuth: true });
    repository.listEvaluations = async () => [
      {
        eventId: "kept",
        relevanceScore: 80,
        explanation: "Saved demo score.",
        matchingCriteria: ["Industry"],
        provider: "mock",
        isNewlyDiscovered: true,
        evaluatedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    repository.listEvents = async () => [
      {
        id: "kept",
        ...draft(),
        firstSeenAt: "2026-01-01T00:00:00.000Z",
        lastCheckedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const result = await loadWorkspaceState({ repository, mode: "supabase" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.profile?.startupName, demoProfile.startupName);
    assert.equal(result.data.events[0]?.relevanceScore, 80);
    assert.equal(result.data.events[0]?.explanation, "Saved demo score.");
    assert.equal(result.data.events[0]?.isNewlyDiscovered, true);
  });
});

describe("fallback and refresh", () => {
  it("loads marked demo events only when the live source fails and the store is empty", async () => {
    const empty = memoryRepository({ events: [] });
    const failed = await ingestEventSources(empty, [
      source(new SourceAccessError("TIPS event listings could not be reached.")),
    ]);
    const stored = await empty.listEvents();
    assert.equal(failed.sources[0]?.limitation, "TIPS event listings could not be reached.");
    assert.ok(stored.length > 0);
    assert.ok(stored.every((event) => event.isMock));
    assert.equal(failed.sources.some((item) => item.live && item.listingCount > 0), false);

    const existing = memoryRepository({
      events: [
        {
          id: "kept",
          ...draft(),
          firstSeenAt: "2026-01-01T00:00:00.000Z",
          lastCheckedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const blocked = await ingestEventSources(existing, [
      source(new SourceAccessError("TIPS event listings could not be reached.")),
    ]);
    const unchanged = await existing.listEvents();
    assert.equal(blocked.storedCount, 0);
    assert.equal(unchanged.length, 1);
    assert.equal(unchanged[0]?.id, "kept");
    assert.equal(unchanged[0]?.isMock, false);
    assert.ok(blocked.sources[0]?.limitation);
  });

  it("marks every mock adapter listing as demo data", async () => {
    const listings = await mockEventSource.fetchListings();
    assert.ok(Array.isArray(listings));
    assert.ok(listings.length > 0);
    assert.ok(listings.every((event) => event.isMock));
  });

  it("refreshes demo data without a Supabase session", async () => {
    const repository = memoryRepository({ events: [] });
    const result = await refreshWorkspace({
      repository,
      mode: "demo",
      profileInput: demoProfile,
      sources: [source([draft()])],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.scored, true);
    assert.equal(result.data.events.length, 1);
    assert.equal(result.data.events[0]?.isMock, false);
    assert.equal(repository.evaluationsSaved, 1);
  });

  it("does not write events for a signed-out Supabase session", async () => {
    const repository = memoryRepository({ enforceAuth: true, signedIn: false, events: [] });
    const result = await refreshWorkspace({
      repository,
      mode: "supabase",
      sources: [source([draft()])],
    });
    assert.deepEqual(result, { ok: false, message: "Sign in to refresh events." });
  });

  it("ingests for a signed-in user who has not saved a profile", async () => {
    const repository = memoryRepository({ enforceAuth: true, profile: null, events: [] });
    const result = await refreshWorkspace({
      repository,
      mode: "supabase",
      sources: [source([draft()])],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.scored, false);
    assert.equal(result.data.events[0]?.sourceUrl, detailUrl);
    assert.equal(repository.evaluationsSaved, 0);
    assert.match(result.data.events[0]?.explanation ?? "", /Save your profile/);
  });

  it("does not report a failed live source as a successful live refresh", async () => {
    const repository = memoryRepository({ events: [] });
    const result = await refreshWorkspace({
      repository,
      mode: "demo",
      profileInput: demoProfile,
      sources: [source(new SourceAccessError("TIPS event listings could not be reached."))],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.ingestion.sources[0]?.live, true);
    assert.equal(result.data.ingestion.sources[0]?.listingCount, 0);
    assert.ok(result.data.ingestion.sources[0]?.limitation);
    assert.ok(result.data.events.every((event) => event.isMock));
    assert.equal(result.data.ingestion.partial, false);
  });
});

const kstartupUrl = "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=179345";

describe("concurrent live sources", () => {
  const tipsDraft = draft();
  const kstartupDraft = draft({
    title: "Incubator intake",
    sourceName: "K-Startup",
    sourceUrl: kstartupUrl,
    eventType: "Program",
    industries: [],
    category: "사업화",
  });

  it("keeps both sources when both succeed", async () => {
    const repository = memoryRepository({ events: [] });
    const report = await ingestEventSources(repository, [
      namedSource("tips", "TIPS", [tipsDraft]),
      namedSource("kstartup", "K-Startup", [kstartupDraft]),
    ]);
    const stored = await repository.listEvents();
    assert.equal(report.partial, false);
    assert.equal(report.storedCount, 2);
    assert.equal(stored.length, 2);
    assert.deepEqual(
      stored.map((event) => event.sourceName).sort(),
      ["K-Startup", "TIPS"],
    );
  });

  it("keeps TIPS listings when K-Startup fails", async () => {
    const repository = memoryRepository({ events: [] });
    const report = await ingestEventSources(repository, [
      namedSource("tips", "TIPS", [tipsDraft]),
      namedSource("kstartup", "K-Startup", new SourceAccessError("K-Startup event listings returned HTTP 503.")),
    ]);
    const stored = await repository.listEvents();
    assert.equal(report.partial, true);
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.sourceName, "TIPS");
    assert.equal(stored.every((event) => event.isMock), false);
    assert.match(report.sources[1]?.limitation ?? "", /K-Startup/);
  });

  it("keeps K-Startup listings when TIPS fails", async () => {
    const repository = memoryRepository({ events: [] });
    const report = await ingestEventSources(repository, [
      namedSource("tips", "TIPS", new SourceAccessError("TIPS event listings could not be reached.")),
      namedSource("kstartup", "K-Startup", [kstartupDraft]),
    ]);
    const stored = await repository.listEvents();
    assert.equal(report.partial, true);
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.sourceUrl, kstartupUrl);
    assert.equal(stored.every((event) => event.isMock), false);
  });

  it("uses the demo catalog only when every live source fails and nothing is stored", async () => {
    const repository = memoryRepository({ events: [] });
    const report = await ingestEventSources(repository, [
      namedSource("tips", "TIPS", new SourceAccessError("TIPS event listings could not be reached.")),
      namedSource("kstartup", "K-Startup", new SourceAccessError("K-Startup event listings could not be reached.")),
    ]);
    const stored = await repository.listEvents();
    assert.equal(report.partial, false);
    assert.ok(stored.length > 0);
    assert.ok(stored.every((event) => event.isMock));
    assert.equal(report.sources.filter((item) => item.live && item.limitation).length, 2);
  });

  it("does not replace stored live events when both sources fail", async () => {
    const repository = memoryRepository({
      events: [
        {
          id: "kept",
          ...tipsDraft,
          firstSeenAt: "2026-01-01T00:00:00.000Z",
          lastCheckedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const report = await ingestEventSources(repository, [
      namedSource("tips", "TIPS", new SourceAccessError("TIPS event listings could not be reached.")),
      namedSource("kstartup", "K-Startup", new SourceAccessError("K-Startup event listings could not be reached.")),
    ]);
    const stored = await repository.listEvents();
    assert.equal(report.storedCount, 0);
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.id, "kept");
    assert.equal(stored[0]?.isMock, false);
  });

  it("merges a genuine cross-source duplicate and keeps the TIPS URL", () => {
    const shared = {
      title: "Seoul founder briefing",
      organizer: "Seoul AI Hub",
      registrationDeadline: "2026-09-23T14:30:00.000Z",
    };
    const unique = dedupeDrafts([
      draft({ ...shared, sourceName: "TIPS", sourceUrl: detailUrl }),
      draft({ ...shared, sourceName: "K-Startup", sourceUrl: kstartupUrl, description: "From K-Startup" }),
    ]);
    assert.equal(unique.length, 1);
    assert.equal(unique[0]?.sourceUrl, detailUrl);
    assert.equal(unique[0]?.sourceName, "TIPS, K-Startup");
  });

  it("keeps similarly named opportunities that are not the same listing", () => {
    const unique = dedupeDrafts([
      draft({
        title: "Founder briefing",
        organizer: "Seoul AI Hub",
        registrationDeadline: "2026-09-23T14:30:00.000Z",
        sourceUrl: detailUrl,
      }),
      draft({
        title: "Founder briefing",
        organizer: "Busan Ventures",
        registrationDeadline: "2026-09-23T14:30:00.000Z",
        sourceName: "K-Startup",
        sourceUrl: kstartupUrl,
      }),
      draft({
        title: "Founder briefing session",
        organizer: "Seoul AI Hub",
        registrationDeadline: "2026-09-23T14:30:00.000Z",
        sourceName: "K-Startup",
        sourceUrl: "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=2",
      }),
    ]);
    assert.equal(unique.length, 3);
  });

  it("preserves first_seen_at and updates last_checked_at for an existing source URL", async () => {
    const repository = memoryRepository({ events: [] });
    await ingestEventSources(repository, [namedSource("tips", "TIPS", [tipsDraft])]);
    const saved = (await repository.listEvents()).find((event) => event.sourceUrl === detailUrl);
    assert.ok(saved?.firstSeenAt);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await ingestEventSources(repository, [
      namedSource("tips", "TIPS", [draft({ title: "Updated briefing" })]),
    ]);
    const updated = (await repository.listEvents()).find((event) => event.sourceUrl === detailUrl);
    assert.equal(updated?.firstSeenAt, saved?.firstSeenAt);
    assert.ok((updated?.lastCheckedAt ?? "") >= (saved?.lastCheckedAt ?? ""));
  });

  it("scores combined TIPS and K-Startup events with the existing provider", async () => {
    const seen: string[] = [];
    const repository = memoryRepository({ profile: demoProfile, events: [] });
    const result = await refreshWorkspace({
      repository,
      mode: "demo",
      profileInput: demoProfile,
      sources: [
        namedSource("tips", "TIPS", [tipsDraft]),
        namedSource("kstartup", "K-Startup", [
          draft({
            title: "Support program",
            sourceName: "K-Startup",
            sourceUrl: kstartupUrl,
            category: null,
            industries: [],
            organizer: null,
            location: null,
            description: null,
            eventType: "Program",
          }),
        ]),
      ],
      provider: {
        id: "mock",
        label: "Demo matcher",
        async evaluate(input) {
          seen.push(...input.events.map((event) => event.sourceName));
          return input.events.map((event) => ({
            ...event,
            relevanceScore: 0,
            explanation: "Scored by the existing pipeline.",
            matchingCriteria: [],
            scoreSource: "demo" as const,
            isNewlyDiscovered: false,
          }));
        },
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(seen.sort(), ["K-Startup", "TIPS"]);
    assert.equal(result.data.scored, true);
    assert.equal(repository.evaluationsSaved, 1);
  });
});
