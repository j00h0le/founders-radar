/**
 * Application-level weights for combining Jev judgments into one 0–100 score.
 * Jev does not prescribe these weights. Jev returns a probability or a choice.
 * Startup Radar multiplies those judgments by the weights below.
 *
 * Industry relevance is the `industry_relevance` noul: the probability that the
 * statement is true, from 0 to 1.
 * Startup-stage relevance is the probability of the `relevant` option on the
 * `stage_relevance` choice, from 0 to 1.
 *
 * When both judgments are available:
 *   score = round(industryProbability * 60 + stageProbability * 40)
 *
 * When Jev's winning stage choice is `not_stated`, stage relevance is
 * unavailable. The score is then the industry probability alone:
 *   score = round(industryProbability * 100)
 * A missing stage is left out. It is not scored as zero.
 *
 * Event-type relevance is asked only when the profile has preferred event
 * types. A match is listed with the other criteria. It does not change the
 * 60/40 split.
 */
export const jevScoringWeights = {
  industry: 60,
  stage: 40,
} as const;

export const jevMatchAt = 0.5;
