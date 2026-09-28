import { jevMatchAt, jevScoringWeights } from "@/lib/scoring/jev-weights";
import type { ParsedJevJudgment } from "@/lib/relevance/jev/parse";

export type JevScore = {
  relevanceScore: number;
  matchingCriteria: string[];
  explanation: string;
  stageIncluded: boolean;
};

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function percent(probability: number) {
  return `${Math.round(probability * 100)}%`;
}

export function scoreJevJudgment(judgment: ParsedJevJudgment): JevScore {
  const matchingCriteria: string[] = [];
  if (judgment.industry >= jevMatchAt) matchingCriteria.push("Industry");

  const stageIncluded = judgment.stage.choice !== "not_stated";
  if (stageIncluded && judgment.stage.choice === "relevant") {
    matchingCriteria.push("Startup stage");
  }
  if (judgment.eventType !== null && judgment.eventType >= jevMatchAt) {
    matchingCriteria.push("Event type");
  }

  const relevanceScore = stageIncluded
    ? clamp(
        judgment.industry * jevScoringWeights.industry +
          judgment.stage.relevantProbability * jevScoringWeights.stage,
      )
    : clamp(judgment.industry * 100);

  const parts = [
    "Startup Radar summarized Jev's judgments. Jev did not write this text.",
    `Industry relevance ${percent(judgment.industry)}.`,
  ];

  if (!stageIncluded) {
    parts.push(
      "The listing does not state a startup stage, so stage was left out of the score instead of counting as a miss.",
      "The score uses the industry judgment only.",
    );
  } else if (judgment.stage.choice === "relevant") {
    parts.push(
      `Startup stage matches at ${percent(judgment.stage.relevantProbability)}.`,
      `Score = industry × ${jevScoringWeights.industry} + stage × ${jevScoringWeights.stage}.`,
    );
  } else {
    parts.push(
      `Startup stage does not match (${percent(judgment.stage.relevantProbability)} relevant).`,
      `Score = industry × ${jevScoringWeights.industry} + stage × ${jevScoringWeights.stage}.`,
    );
  }

  if (judgment.eventType !== null) {
    parts.push(
      `Event type relevance ${percent(judgment.eventType)}. Preferred event types are listed as a criterion and are not part of the ${jevScoringWeights.industry}/${jevScoringWeights.stage} score.`,
    );
  }

  parts.push("These weights belong to Startup Radar, not to Jev.");

  return {
    relevanceScore,
    matchingCriteria,
    explanation: parts.join(" "),
    stageIncluded,
  };
}
