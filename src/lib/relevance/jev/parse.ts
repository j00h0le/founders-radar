import { z } from "zod";
import { JevEvaluationError } from "@/lib/relevance/jev/errors";
import { stageCriteria, type StageChoice } from "@/lib/relevance/jev/questions";

const noulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: z.number(),
});

const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()).optional(),
  confidence: z.number().optional(),
});

const scoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number(),
  legend: z.record(z.string(), z.string()).optional(),
  probabilities: z.record(z.string(), z.number()).optional(),
  confidence: z.number().optional(),
});

const answerSchema = z.discriminatedUnion("type", [
  noulAnswerSchema,
  choiceAnswerSchema,
  scoreAnswerSchema,
]);

const decisionsResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), answerSchema),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cost: z.number().optional(),
    })
    .optional(),
  id: z.string().optional(),
  provider: z.string().optional(),
});

export type StageJudgment = {
  choice: StageChoice;
  relevantProbability: number;
  confidence: number;
};

export type ParsedJevJudgment = {
  industry: number;
  stage: StageJudgment;
  eventType: number | null;
};

function probability(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new JevEvaluationError(
      "invalid_response",
      `Jev returned an invalid probability for ${label}.`,
    );
  }
  return value;
}

function isStageChoice(value: string): value is StageChoice {
  return Object.hasOwn(stageCriteria, value);
}

export function parseDecisionsResponse(
  payload: unknown,
  options: { eventTypeAsked: boolean },
): ParsedJevJudgment {
  const parsed = decisionsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new JevEvaluationError(
      "invalid_response",
      "Jev returned a response that does not match the Decisions API.",
    );
  }

  const industry = parsed.data.answers.industry_relevance;
  const stage = parsed.data.answers.stage_relevance;
  if (!industry || !stage) {
    throw new JevEvaluationError(
      "missing_judgment",
      "Jev omitted an industry or startup-stage judgment.",
    );
  }
  if (industry.type !== "noul" || stage.type !== "choice") {
    throw new JevEvaluationError(
      "invalid_response",
      "Jev returned unexpected answer types.",
    );
  }
  if (!isStageChoice(stage.choice)) {
    throw new JevEvaluationError(
      "invalid_response",
      "Jev returned an unknown startup-stage choice.",
    );
  }
  if (stage.probabilities === undefined || stage.confidence === undefined) {
    throw new JevEvaluationError(
      "missing_judgment",
      "Jev omitted probabilities or confidence for the startup-stage judgment.",
    );
  }
  const relevantProbability = stage.probabilities.relevant;
  if (relevantProbability === undefined) {
    throw new JevEvaluationError(
      "missing_judgment",
      "Jev omitted the probability for the relevant startup stage.",
    );
  }

  let eventType: number | null = null;
  if (options.eventTypeAsked) {
    const answer = parsed.data.answers.event_type_relevance;
    if (!answer) {
      throw new JevEvaluationError(
        "missing_judgment",
        "Jev omitted the event-type judgment.",
      );
    }
    if (answer.type !== "noul") {
      throw new JevEvaluationError(
        "invalid_response",
        "Jev returned an unexpected event-type answer.",
      );
    }
    eventType = probability(answer.noul, "event type");
  }

  return {
    industry: probability(industry.noul, "industry"),
    stage: {
      choice: stage.choice,
      relevantProbability: probability(relevantProbability, "startup stage"),
      confidence: probability(stage.confidence, "startup-stage confidence"),
    },
    eventType,
  };
}
