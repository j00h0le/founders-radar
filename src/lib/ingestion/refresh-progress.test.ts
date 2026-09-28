import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EventDraft } from "@/lib/db/records";
import type { RadarRepository } from "@/lib/db/repository";
import { refreshWorkspace } from "@/lib/ingestion/refresh";
import {
  refreshAnnouncement,
  refreshCount,
  refreshHeadline,
  relevanceDetail,
  sourceDetail,
  type RefreshProgress,
} from "@/lib/ingestion/progress";
import { consumeRefreshStream } from "@/lib/refresh/stream";
import { SourceAccessError, type EventSourceAdapter } from "@/lib/ingestion/types";
import type { RelevanceProvider } from "@/lib/relevance/provider";
import type { StartupEvent } from "@/types/event";
import { demoProfile } from "@/types/profile";

function draft(sourceName: string, sourceUrl: string): EventDraft {
  return {
    title: sourceName,
    description: null,
    organizer: null,
    category: null,
    industries: [],
    eventType: "Program",
    startsAt: null,
    registrationDeadline: null,
    location: null,
    sourceName,
    sourceUrl,
    isMock: false,
  };
}

function repository(): RadarRepository {
  let events: StartupEvent[] = [];
  return {
    async hasSession() {
      return true;
    },
    async listEvents() {
      return events;
    },
    async upsertEvents(drafts) {
      const now = "2026-09-25T00:00:00.000Z";
      events = drafts.map((item) => ({
        id: item.sourceUrl,
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
        firstSeenAt: now,
        lastCheckedAt: now,
        isMock: item.isMock,
      }));
      return events;
    },
    async getProfile() {
      return demoProfile;
    },
    async saveProfile(profile) {
      return profile;
    },
    async listEvaluations() {
      return [];
    },
    async saveEvaluations() {},
    async listSavedIds() {
      return [];
    },
    async setSaved() {},
  };
}

function source(
  id: string,
  name: string,
  listings: EventDraft[] | Error,
  wait?: Promise<void>,
): EventSourceAdapter {
  return {
    id,
    name,
    live: true,
    async fetchListings() {
      if (wait) await wait;
      if (listings instanceof Error) throw listings;
      return {
        drafts: listings,
        retrievedCount: listings.length + 3,
      };
    },
  };
}

const provider: RelevanceProvider = {
  id: "mock",
  label: "Demo matcher",
  async evaluate({ events }) {
    return events.map((event) => ({
      ...event,
      relevanceScore: 70,
      explanation: "Matched in the test.",
      matchingCriteria: [],
      scoreSource: "demo" as const,
      isNewlyDiscovered: false,
    }));
  },
};

describe("refresh progress", () => {
  it("reports parallel sources, real counts, and relevance after both settle", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen: RefreshProgress[] = [];
    const pending = refreshWorkspace({
      repository: repository(),
      mode: "demo",
      profileInput: demoProfile,
      sources: [
        source("tips", "TIPS", [draft("TIPS", "https://example.com/tips")]),
        source(
          "kstartup",
          "K-Startup",
          [draft("K-Startup", "https://example.com/kstartup")],
          gate,
        ),
      ],
      provider,
      onProgress: (progress) => seen.push(progress),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const during = seen.at(-1);
    assert.ok(during);
    assert.equal(during.phase, "scanning");
    assert.equal(during.sources.find((item) => item.id === "tips")?.status, "success");
    assert.equal(during.sources.find((item) => item.id === "tips")?.normalized, 1);
    assert.equal(during.sources.find((item) => item.id === "tips")?.fetched, 4);
    assert.equal(during.sources.find((item) => item.id === "kstartup")?.status, "scanning");
    assert.equal(during.events.collected, 1);
    assert.equal(during.relevance.status, "pending");
    assert.equal(during.relevance.label, "Demo matcher");

    release();
    const result = await pending;
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.summary.phase, "complete");
    assert.equal(result.data.summary.outcome, "complete");
    assert.equal(result.data.summary.events.collected, 2);
    assert.equal(result.data.summary.events.unique, 2);
    assert.equal(result.data.summary.events.persisted, 2);
    assert.equal(result.data.summary.relevance.status, "success");
    assert.equal(result.data.summary.relevance.evaluated, 2);
    assert.equal(typeof result.data.summary.durationMs, "number");
    assert.ok(seen.some((progress) => progress.phase === "analyzing"));
    assert.equal(
      seen.find((progress) => progress.phase === "analyzing")?.relevance.evaluated,
      0,
    );
    assert.equal(refreshCount(result.data.summary).value, 2);
    assert.equal(refreshHeadline(result.data.summary), "Refresh complete");
  });

  it("marks a partial source failure without treating it as a full success", async () => {
    const seen: RefreshProgress[] = [];
    const result = await refreshWorkspace({
      repository: repository(),
      mode: "demo",
      profileInput: demoProfile,
      sources: [
        source("tips", "TIPS", [draft("TIPS", "https://example.com/tips")]),
        source(
          "kstartup",
          "K-Startup",
          new SourceAccessError("K-Startup event listings returned HTTP 503."),
        ),
      ],
      provider,
      onProgress: (progress) => seen.push(progress),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const summary = result.data.summary;
    assert.equal(summary.outcome, "limited");
    assert.equal(summary.sources[0]?.status, "success");
    assert.equal(summary.sources[0]?.normalized, 1);
    assert.equal(summary.sources[1]?.status, "failed");
    assert.equal(summary.sources[1]?.normalized, 0);
    assert.equal(summary.relevance.status, "success");
    assert.equal(summary.relevance.evaluated, 1);
    assert.equal(refreshHeadline(summary), "Refresh completed with limited sources");
    assert.equal(sourceDetail(summary.sources[1]!), "Unavailable");
    assert.equal(relevanceDetail(summary), "Analyzed available events");
    assert.match(refreshAnnouncement(summary), /K-Startup Unavailable/);
    assert.ok(seen.some((progress) => progress.relevance.status === "analyzing"));
  });

  it("stops a failed relevance run without a successful summary", async () => {
    const seen: RefreshProgress[] = [];
    const result = await refreshWorkspace({
      repository: repository(),
      mode: "demo",
      profileInput: demoProfile,
      sources: [source("tips", "TIPS", [draft("TIPS", "https://example.com/tips")])],
      provider: {
        ...provider,
        label: "Jev",
        async evaluate() {
          throw new Error("OpenRouter rate-limited the Jev request.");
        },
      },
      onProgress: (progress) => seen.push(progress),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /rate-limited/);
    const failed = seen.at(-1);
    assert.equal(failed?.phase, "failed");
    assert.equal(failed?.relevance.label, "Jev");
    assert.equal(failed?.relevance.status, "failed");
    assert.equal(relevanceDetail(failed!), "Failed");
  });

  it("does not emit progress when sign-in fails before ingestion", async () => {
    const seen: RefreshProgress[] = [];
    const result = await refreshWorkspace({
      repository: {
        ...repository(),
        async getProfile() {
          throw new Error("Sign in to refresh events.");
        },
      },
      mode: "supabase",
      onProgress: (progress) => seen.push(progress),
    });
    assert.deepEqual(result, { ok: false, message: "Sign in to refresh events." });
    assert.equal(seen.length, 0);
  });
});

describe("refresh stream", () => {
  it("reads progress and a final result from ndjson", async () => {
    const payload = [
      JSON.stringify({
        type: "progress",
        progress: {
          phase: "scanning",
          outcome: "pending",
          durationMs: null,
          sources: [],
          events: { collected: 0, unique: null, persisted: null },
          relevance: { label: "Jev", status: "pending", evaluated: 0 },
        },
      }),
      JSON.stringify({ type: "error", message: "Could not refresh events." }),
    ].join("\n");
    const events: string[] = [];
    await consumeRefreshStream(new Blob([payload]).stream(), (event) => {
      events.push(event.type);
    });
    assert.deepEqual(events, ["progress", "error"]);
  });
});
