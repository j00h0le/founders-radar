export type JevFailureKind =
  | "missing_credentials"
  | "network"
  | "api"
  | "invalid_response"
  | "missing_judgment"
  | "rate_limit";

export class JevEvaluationError extends Error {
  readonly kind: JevFailureKind;

  constructor(kind: JevFailureKind, message: string) {
    super(message);
    this.name = "JevEvaluationError";
    this.kind = kind;
  }
}
