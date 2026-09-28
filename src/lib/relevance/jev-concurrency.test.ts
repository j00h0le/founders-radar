import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JevEvaluationError } from "@/lib/relevance/jev/errors";
import { JEV_CONCURRENCY } from "@/lib/relevance/jev/pool";
import { createJevRelevanceProvider } from "@/lib/relevance/jev/provider";
import type { StartupEvent } from "@/types/event";
import { demoProfile } from "@/types/profile";

function eventAt(index: number): StartupEvent {
  return {
    id: `evt-${index}`,
    title: `Event ${index}`,
    organizer: null,
    description: null,
    category: null,
    startsAt: null,
    registrationDeadline: null,
    industries: [],
    eventType: "Program",
    location: null,
    sourceName: "TIPS",
    sourceUrl: `https://example.com/events/${index}`,
    firstSeenAt: null,
    lastCheckedAt: null,
    isMock: false,
  };
}

function bodyFor(index: number) {
  return {
    model: "typesafe/jev-1.13-20260917",
    answers: {
      industry_relevance: { type: "noul", noul: index / 100 },
      stage_relevance: {
        type: "choice",
        choice: "not_stated",
        probabilities: { relevant: 0, not_relevant: 0, not_stated: 1 },
        confidence: 1,
      },
    },
    usage: { input_tokens: 1, output_tokens: 1, cost: 0 },
    id: `gen-${index}`,
    provider: "TypeSafe",
  };
}

function titleIndex(init: RequestInit | undefined) {
  const body = JSON.parse(String(init?.body)) as { state: { event: { title: string } } };
  return Number(body.state.event.title.replace("Event ", ""));
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("Jev concurrency", () => {
  it("keeps at most 30 requests in flight and evaluates every event in order", async () => {
    assert.equal(JEV_CONCURRENCY, 30);
    let inFlight = 0;
    let maxInFlight = 0;
    const waiting: Array<() => void> = [];
    const provider = createJevRelevanceProvider({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        const index = titleIndex(init);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => waiting.push(resolve));
        inFlight -= 1;
        return Response.json(bodyFor(index));
      },
    });
    const events = Array.from({ length: 40 }, (_, index) => eventAt(index));
    const pending = provider.evaluate({
      profile: demoProfile,
      events,
      newlyDiscoveredIds: ["evt-3"],
    });

    for (let i = 0; i < 20 && waiting.length < 30; i += 1) await settle();
    assert.equal(waiting.length, 30);
    assert.equal(inFlight, 30);
    const release = waiting.shift();
    assert.ok(release);
    release();
    for (let i = 0; i < 20 && waiting.length < 30; i += 1) await settle();
    assert.equal(waiting.length, 30);
    assert.ok(maxInFlight <= 30);

    let scored: Awaited<typeof pending> | undefined;
    const finished = pending.then((value) => {
      scored = value;
    });
    for (let i = 0; i < 40 && !scored; i += 1) {
      while (waiting.length > 0) waiting.shift()?.();
      await settle();
    }
    await finished;
    assert.ok(scored);
    assert.equal(scored.length, 40);
    assert.equal(maxInFlight, 30);
    scored.forEach((item, index) => {
      assert.equal(item.id, `evt-${index}`);
      assert.equal(item.relevanceScore, index);
      assert.equal(item.scoreSource, "jev");
    });
    assert.equal(scored[3]?.isNewlyDiscovered, true);
    assert.equal(scored[0]?.isNewlyDiscovered, false);
  });

  it("evaluates fewer than 30 and exactly 30 events in one wave", async () => {
    for (const count of [4, 30]) {
      let maxInFlight = 0;
      let inFlight = 0;
      const waiting: Array<() => void> = [];
      const provider = createJevRelevanceProvider({
        apiKey: "test-key",
        fetchImpl: async (_url, init) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise<void>((resolve) => waiting.push(resolve));
          inFlight -= 1;
          return Response.json(bodyFor(titleIndex(init)));
        },
      });
      const pending = provider.evaluate({
        profile: demoProfile,
        events: Array.from({ length: count }, (_, index) => eventAt(index)),
        newlyDiscoveredIds: [],
      });
      for (let i = 0; i < 20 && waiting.length < count; i += 1) await settle();
      assert.equal(waiting.length, count);
      assert.equal(maxInFlight, count);
      let scored: Awaited<typeof pending> | undefined;
      const finished = pending.then((value) => {
        scored = value;
      });
      for (let i = 0; i < 20 && !scored; i += 1) {
        while (waiting.length > 0) waiting.shift()?.();
        await settle();
      }
      await finished;
      assert.ok(scored);
      assert.deepEqual(
        scored.map((item) => item.id),
        Array.from({ length: count }, (_, index) => `evt-${index}`),
      );
    }
  });

  it("does not call Jev twice for the same event in one refresh", async () => {
    let calls = 0;
    const logs: string[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const provider = createJevRelevanceProvider({
        apiKey: "test-key",
        fetchImpl: async () => {
          calls += 1;
          return Response.json(bodyFor(7));
        },
      });
      const event = eventAt(7);
      const scored = await provider.evaluate({
        profile: demoProfile,
        events: [event, { ...event }],
        newlyDiscoveredIds: [],
      });
      assert.equal(calls, 1);
      assert.equal(scored.length, 2);
      assert.equal(scored[0]?.id, event.id);
      assert.equal(scored[1]?.id, event.id);
      assert.equal(scored[0]?.relevanceScore, scored[1]?.relevanceScore);
      assert.match(logs.join("\n"), /"fromCache":1/);
      assert.match(logs.join("\n"), /"jevRequests":1/);
      assert.match(logs.join("\n"), /"concurrency":30/);
      assert.equal(logs.join("\n").includes("test-key"), false);
    } finally {
      console.info = original;
    }
  });

  it("rejects a failed request without returning another event's score", async () => {
    const calls: number[] = [];
    const provider = createJevRelevanceProvider({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        const index = titleIndex(init);
        calls.push(index);
        if (index === 1) {
          return Response.json({ error: { message: "upstream" } }, { status: 500 });
        }
        return Response.json(bodyFor(index));
      },
    });
    await assert.rejects(
      () =>
        provider.evaluate({
          profile: demoProfile,
          events: [eventAt(0), eventAt(1), eventAt(2)],
          newlyDiscoveredIds: [],
        }),
      (error: unknown) =>
        error instanceof JevEvaluationError &&
        error.kind === "api" &&
        error.message.includes("upstream"),
    );
    assert.deepEqual(calls.sort((a, b) => a - b), [0, 1, 2]);
  });

  it("keeps completion order from changing which event receives which score", async () => {
    const gates = new Map<number, () => void>();
    const provider = createJevRelevanceProvider({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        const index = titleIndex(init);
        await new Promise<void>((resolve) => gates.set(index, resolve));
        return Response.json(bodyFor(index));
      },
    });
    const pending = provider.evaluate({
      profile: demoProfile,
      events: [eventAt(0), eventAt(1), eventAt(2)],
      newlyDiscoveredIds: [],
    });
    for (let i = 0; i < 20 && gates.size < 3; i += 1) await settle();
    gates.get(2)?.();
    gates.get(0)?.();
    gates.get(1)?.();
    const scored = await pending;
    assert.deepEqual(
      scored.map((item) => [item.id, item.relevanceScore]),
      [
        ["evt-0", 0],
        ["evt-1", 1],
        ["evt-2", 2],
      ],
    );
  });
});
