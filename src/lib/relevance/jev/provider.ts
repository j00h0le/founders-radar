import { JevEvaluationError } from "@/lib/relevance/jev/errors";
import { parseDecisionsResponse } from "@/lib/relevance/jev/parse";
import { postDecisions } from "@/lib/relevance/jev/client";
import { JEV_CONCURRENCY, mapWithConcurrency } from "@/lib/relevance/jev/pool";
import {
  buildDecisionsRequest,
  DEFAULT_JEV_MODEL,
  preferredEventTypes,
} from "@/lib/relevance/jev/questions";
import { scoreJevJudgment } from "@/lib/relevance/jev/score";
import type {
  EvaluationInput,
  RelevanceProvider,
} from "@/lib/relevance/provider";
import type { ScoredEvent, StartupEvent } from "@/types/event";

export type JevProviderOptions = {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

function readConfig(options: JevProviderOptions) {
  if (typeof window !== "undefined") {
    throw new JevEvaluationError(
      "missing_credentials",
      "Jev evaluation runs on the server only.",
    );
  }
  const apiKey = (options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new JevEvaluationError(
      "missing_credentials",
      "Set OPENROUTER_API_KEY on the server before evaluating events with Jev.",
    );
  }
  const model = (options.model ?? process.env.JEV_MODEL ?? DEFAULT_JEV_MODEL).trim();
  if (!model) {
    throw new JevEvaluationError(
      "missing_credentials",
      "Set JEV_MODEL to a Jev model id such as typesafe/jev-1.13.",
    );
  }
  return { apiKey, model };
}

export function createJevRelevanceProvider(
  options: JevProviderOptions = {},
): RelevanceProvider {
  return {
    id: "jev",
    label: "Jev",
    async evaluate({ profile, events, newlyDiscoveredIds }: EvaluationInput) {
      const started = performance.now();
      const { apiKey, model } = readConfig(options);
      const eventTypeAsked = preferredEventTypes(profile).length > 0;
      const unique: StartupEvent[] = [];
      const firstIndex = new Map<string, number>();
      for (const event of events) {
        if (firstIndex.has(event.id)) continue;
        firstIndex.set(event.id, unique.length);
        unique.push(event);
      }
      const fromCache = events.length - unique.length;
      const discovered = new Set(newlyDiscoveredIds);

      const finish = (
        outcome: { succeeded: number; failed: number; maxInFlight: number },
        jevRequests: number,
      ) => {
        console.info(
          "[jev] evaluation",
          JSON.stringify({
            durationMs: Math.round(performance.now() - started),
            eventsEvaluated: events.length,
            fromCache,
            jevRequests,
            succeeded: outcome.succeeded,
            failed: outcome.failed,
            concurrency: JEV_CONCURRENCY,
            maxInFlight: outcome.maxInFlight,
          }),
        );
      };

      const observed = { maxInFlight: 0, succeeded: 0, failed: 0 };
      try {
        const run = await mapWithConcurrency(unique, JEV_CONCURRENCY, async (event) => {
          const request = buildDecisionsRequest(event, profile, model);
          const payload = await postDecisions(request, {
            apiKey,
            fetchImpl: options.fetchImpl,
          });
          const judgment = parseDecisionsResponse(payload, { eventTypeAsked });
          return scoreJevJudgment(judgment);
        }, observed);
        const scored = events.map((event) => {
          const score = run.results[firstIndex.get(event.id) ?? 0];
          if (!score) {
            throw new JevEvaluationError(
              "invalid_response",
              "Jev did not return a score for this event.",
            );
          }
          return {
            ...event,
            relevanceScore: score.relevanceScore,
            explanation: score.explanation,
            matchingCriteria: score.matchingCriteria,
            scoreSource: "jev" as const,
            isNewlyDiscovered: discovered.has(event.id),
          } satisfies ScoredEvent;
        });
        finish(run, unique.length);
        return scored;
      } catch (error) {
        finish(observed, unique.length);
        throw error;
      }
    },
  };
}
