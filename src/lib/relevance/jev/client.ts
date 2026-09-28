import { JevEvaluationError } from "@/lib/relevance/jev/errors";
import {
  DECISIONS_URL,
  type DecisionsRequest,
} from "@/lib/relevance/jev/questions";

type DecisionsFetch = typeof fetch;

function messageFromBody(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as { error?: { message?: unknown }; message?: unknown };
  if (typeof record.error?.message === "string" && record.error.message.trim()) {
    return record.error.message.trim();
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  return null;
}

export async function postDecisions(
  request: DecisionsRequest,
  options: { apiKey: string; fetchImpl?: DecisionsFetch },
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(DECISIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new JevEvaluationError(
      "network",
      "Jev could not be reached. Check the network and try the refresh again.",
    );
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }

  if (response.status === 429) {
    throw new JevEvaluationError(
      "rate_limit",
      "OpenRouter rate-limited the Jev request. Wait and refresh again.",
    );
  }

  if (!response.ok) {
    const detail = messageFromBody(body);
    throw new JevEvaluationError(
      "api",
      detail
        ? `Jev rejected the request: ${detail}`
        : `Jev rejected the request (${response.status}).`,
    );
  }

  if (body === null) {
    throw new JevEvaluationError(
      "invalid_response",
      "Jev returned a response that is not JSON.",
    );
  }

  return body;
}
