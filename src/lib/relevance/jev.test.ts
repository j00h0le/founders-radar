import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { refreshWorkspace } from "@/lib/ingestion/refresh";
import type { RadarRepository } from "@/lib/db/repository";
import { JevEvaluationError } from "@/lib/relevance/jev/errors";
import { parseDecisionsResponse } from "@/lib/relevance/jev/parse";
import { createJevRelevanceProvider } from "@/lib/relevance/jev/provider";
import {
  buildDecisionsRequest,
  DECISIONS_URL,
  stageCriteria,
} from "@/lib/relevance/jev/questions";
import { scoreJevJudgment } from "@/lib/relevance/jev/score";
import { selectRelevanceProvider } from "@/lib/relevance/select";
import type { StartupEvent } from "@/types/event";
import { demoProfile, type FounderProfile } from "@/types/profile";

const event: StartupEvent = {
  id: "evt-1",
  title: "AI founder meetup",
  organizer: "Seoul AI Hub",
  description: "An evening for seed-stage AI founders in Seoul.",
  category: "Meetup",
  startsAt: "2026-10-01T10:00:00.000Z",
  registrationDeadline: "2026-09-28T10:00:00.000Z",
  industries: ["AI"],
  eventType: "Meetup",
  location: "Seoul",
  sourceName: "TIPS",
  sourceUrl: "https://example.com/events/ai-meetup",
  firstSeenAt: null,
  lastCheckedAt: null,
  isMock: false,
};

function responseBody(options?: { eventType?: boolean; omitStage?: boolean }) {
  const answers: Record<string, unknown> = {
    industry_relevance: { type: "noul", noul: 0.8 },
    stage_relevance: {
      type: "choice",
      choice: "relevant",
      probabilities: { relevant: 1, not_relevant: 0, not_stated: 0 },
      confidence: 0.9,
    },
  };
  if (options?.omitStage) delete answers.stage_relevance;
  if (options?.eventType) {
    answers.event_type_relevance = { type: "noul", noul: 0.9 };
  }
  return {
    model: "typesafe/jev-1.13-20260917",
    answers,
    usage: { input_tokens: 10, output_tokens: 4, cost: 0.00001 },
    id: "gen-dec-test",
    provider: "TypeSafe",
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Jev request construction", () => {
  it("builds a Decisions API request and skips event type without preferences", () => {
    const request = buildDecisionsRequest(event, demoProfile, "typesafe/jev-1.13");
    assert.equal(request.model, "typesafe/jev-1.13");
    assert.equal(request.questions.industry_relevance?.type, "noul");
    assert.equal(request.questions.stage_relevance?.type, "choice");
    assert.equal(request.questions.event_type_relevance, undefined);
    assert.deepEqual(request.questions.stage_relevance?.criteria, stageCriteria);
    const instructions = request.questions.industry_relevance?.instructions ?? "";
    assert.match(instructions, /`event.title`/);
    assert.match(instructions, /`founder.industry_definitions`/);
    assert.match(instructions, /specifically one of the industries/);
    const industryCriteria = request.questions.industry_relevance?.criteria;
    assert.equal(
      industryCriteria && "true" in industryCriteria ? industryCriteria.true : "",
      "The event's subject or audience is specifically one of those industries.",
    );
    assert.match(
      industryCriteria && "false" in industryCriteria ? industryCriteria.false : "",
      /startups in general/,
    );
    const state = request.state as { event: Record<string, unknown> };
    assert.equal("startsAt" in state.event, false);
    assert.equal("registrationDeadline" in state.event, false);
    assert.equal(JSON.stringify(request.state).includes("2026-10-01"), false);
  });

  it("asks event-type relevance only when preferences are configured", () => {
    const profile: FounderProfile = {
      ...demoProfile,
      preferredEventTypes: ["Meetup", "Demo day"],
    };
    const request = buildDecisionsRequest(event, profile, "typesafe/jev-1.13");
    assert.equal(request.questions.event_type_relevance?.type, "noul");
    const founder = (request.state as { founder: { preferred_event_types?: string[] } })
      .founder;
    assert.deepEqual(founder.preferred_event_types, ["Meetup", "Demo day"]);
  });
});

describe("Jev response parsing", () => {
  it("reads industry, stage, and optional event-type judgments", () => {
    const parsed = parseDecisionsResponse(responseBody({ eventType: true }), {
      eventTypeAsked: true,
    });
    assert.equal(parsed.industry, 0.8);
    assert.equal(parsed.stage.choice, "relevant");
    assert.equal(parsed.stage.relevantProbability, 1);
    assert.equal(parsed.eventType, 0.9);
  });

  it("rejects a missing stage judgment", () => {
    assert.throws(
      () => parseDecisionsResponse(responseBody({ omitStage: true }), { eventTypeAsked: false }),
      (error: unknown) =>
        error instanceof JevEvaluationError && error.kind === "missing_judgment",
    );
  });

  it("rejects an unexpected answer type", () => {
    const body = responseBody();
    body.answers.industry_relevance = {
      type: "score",
      score: 1,
      probabilities: { "0": 0, "1": 1 },
      confidence: 1,
    };
    assert.throws(
      () => parseDecisionsResponse(body, { eventTypeAsked: false }),
      (error: unknown) =>
        error instanceof JevEvaluationError && error.kind === "invalid_response",
    );
  });
});

describe("Jev score calculation", () => {
  it("applies the 60/40 application weights", () => {
    const score = scoreJevJudgment({
      industry: 0.5,
      stage: { choice: "relevant", relevantProbability: 1, confidence: 0.8 },
      eventType: null,
    });
    assert.equal(score.relevanceScore, 70);
    assert.deepEqual(score.matchingCriteria, ["Industry", "Startup stage"]);
    assert.match(score.explanation, /Startup Radar summarized/);
    assert.match(score.explanation, /not to Jev/);
    assert.doesNotMatch(score.explanation, /Jev wrote/i);
  });

  it("leaves an unstated stage out of the score", () => {
    const score = scoreJevJudgment({
      industry: 0.8,
      stage: { choice: "not_stated", relevantProbability: 0, confidence: 0.7 },
      eventType: 0.1,
    });
    assert.equal(score.stageIncluded, false);
    assert.equal(score.relevanceScore, 80);
    assert.deepEqual(score.matchingCriteria, ["Industry"]);
    assert.match(score.explanation, /left out of the score/);
  });

  it("does not change the score when event type matches", () => {
    const without = scoreJevJudgment({
      industry: 0.8,
      stage: { choice: "relevant", relevantProbability: 0.5, confidence: 0.6 },
      eventType: null,
    });
    const withType = scoreJevJudgment({
      industry: 0.8,
      stage: { choice: "relevant", relevantProbability: 0.5, confidence: 0.6 },
      eventType: 0.95,
    });
    assert.equal(without.relevanceScore, withType.relevanceScore);
    assert.equal(withType.relevanceScore, 68);
    assert.ok(withType.matchingCriteria.includes("Event type"));
  });
});

describe("Jev provider failures", () => {
  const profile = demoProfile;

  it("reports a missing API key without calling the network", async () => {
    let called = 0;
    const provider = createJevRelevanceProvider({
      apiKey: "",
      fetchImpl: async () => {
        called += 1;
        return jsonResponse(200, responseBody());
      },
    });
    await assert.rejects(
      () => provider.evaluate({ profile, events: [event], newlyDiscoveredIds: [] }),
      (error: unknown) =>
        error instanceof JevEvaluationError && error.kind === "missing_credentials",
    );
    assert.equal(called, 0);
  });

  it("posts to the Decisions API and returns a normalized score", async () => {
    const calls: Array<{ url: string; authorization: string; body: unknown }> = [];
    const provider = createJevRelevanceProvider({
      apiKey: "test-key",
      model: "typesafe/jev-1.13",
      fetchImpl: async (url, init) => {
        calls.push({
          url: String(url),
          authorization: new Headers(init?.headers).get("authorization") ?? "",
          body: JSON.parse(String(init?.body)),
        });
        return jsonResponse(200, responseBody());
      },
    });
    const [scored] = await provider.evaluate({
      profile,
      events: [event],
      newlyDiscoveredIds: ["evt-1"],
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, DECISIONS_URL);
    assert.equal(calls[0]?.authorization, "Bearer test-key");
    assert.equal(scored?.scoreSource, "jev");
    assert.equal(scored?.relevanceScore, 88);
    assert.equal(scored?.isNewlyDiscovered, true);
    assert.match(scored?.explanation ?? "", /Jev did not write this text/);
  });

  it("surfaces rate limits, API errors, network errors, and invalid JSON", async () => {
    const cases: Array<{
      kind: JevEvaluationError["kind"];
      fetchImpl: typeof fetch;
    }> = [
      {
        kind: "rate_limit",
        fetchImpl: async () => jsonResponse(429, { error: { message: "slow down" } }),
      },
      {
        kind: "api",
        fetchImpl: async () => jsonResponse(500, { error: { message: "upstream" } }),
      },
      {
        kind: "network",
        fetchImpl: async () => {
          throw new Error("socket hang up");
        },
      },
      {
        kind: "invalid_response",
        fetchImpl: async () => new Response("not-json", { status: 200 }),
      },
    ];
    for (const item of cases) {
      const provider = createJevRelevanceProvider({
        apiKey: "test-key",
        fetchImpl: item.fetchImpl,
      });
      await assert.rejects(
        () => provider.evaluate({ profile, events: [event], newlyDiscoveredIds: [] }),
        (error: unknown) => error instanceof JevEvaluationError && error.kind === item.kind,
      );
    }
  });
});

describe("relevance provider selection", () => {
  it("keeps the demo matcher in demo mode and uses Jev otherwise", () => {
    assert.equal(selectRelevanceProvider("demo").id, "mock");
    assert.equal(selectRelevanceProvider("supabase").id, "jev");
  });

  it("does not save demo scores when Jev fails", async () => {
    let saved = 0;
    const repository: RadarRepository = {
      async hasSession() {
        return true;
      },
      async listEvents() {
        return [event];
      },
      async upsertEvents() {
        return [event];
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
      async saveEvaluations() {
        saved += 1;
      },
      async listSavedIds() {
        return [];
      },
      async setSaved() {},
    };
    const result = await refreshWorkspace({
      repository,
      mode: "supabase",
      sources: [],
      provider: {
        id: "jev",
        label: "Jev",
        async evaluate() {
          throw new JevEvaluationError(
            "rate_limit",
            "OpenRouter rate-limited the Jev request. Wait and refresh again.",
          );
        },
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /rate-limited/);
    assert.equal(saved, 0);
  });
});
