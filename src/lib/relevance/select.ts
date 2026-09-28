import type { DataMode } from "@/lib/db/mode";
import { createJevRelevanceProvider } from "@/lib/relevance/jev/provider";
import { mockRelevanceProvider } from "@/lib/relevance/mock-provider";
import type { RelevanceProvider } from "@/lib/relevance/provider";

export function selectRelevanceProvider(mode: DataMode): RelevanceProvider {
  if (mode === "demo") return mockRelevanceProvider;
  return createJevRelevanceProvider();
}
