import { createDemoRepository } from "@/lib/db/demo-repository";
import { getDataMode } from "@/lib/db/mode";
import type { RadarRepository } from "@/lib/db/repository";
import { createSupabaseRepository } from "@/lib/db/supabase-repository";

export async function createRadarRepository(): Promise<RadarRepository> {
  if (getDataMode() === "demo") return createDemoRepository();
  return createSupabaseRepository();
}

export type { RadarRepository } from "@/lib/db/repository";
export type { EventDraft, StoredEvaluation } from "@/lib/db/records";
export { getDataMode } from "@/lib/db/mode";
