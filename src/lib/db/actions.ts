"use server";

import { createRadarRepository, getDataMode } from "@/lib/db";
import { loadWorkspaceState } from "@/lib/db/workspace";
import {
  refreshWorkspace,
  rescoreStoredEvents,
  type RefreshData,
} from "@/lib/ingestion/refresh";
import type { ScoredEvent } from "@/types/event";
import {
  founderProfileSchema,
  type FounderProfile,
} from "@/types/profile";

export type { IngestionReport } from "@/lib/ingestion/types";
export type { RefreshData };

export type WorkspaceResult =
  | {
      ok: true;
      profile: FounderProfile | null;
      events: ScoredEvent[];
      savedIds: string[];
    }
  | { ok: false; message: string };

export type MutationResult<T> = { ok: true; data: T } | { ok: false; message: string };

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function loadWorkspace(): Promise<WorkspaceResult> {
  const repository = await createRadarRepository();
  const result = await loadWorkspaceState({ repository, mode: getDataMode() });
  if (!result.ok) return result;
  return { ok: true, ...result.data };
}

export async function saveProfileAction(
  profile: FounderProfile,
): Promise<MutationResult<FounderProfile>> {
  const parsed = founderProfileSchema.safeParse(profile);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Complete your profile first.",
    };
  }
  try {
    const repository = await createRadarRepository();
    const saved = await repository.saveProfile(parsed.data);
    return { ok: true, data: saved };
  } catch (error) {
    return { ok: false, message: messageFrom(error, "Could not save the profile.") };
  }
}

export async function setSavedAction(
  eventId: string,
  saved: boolean,
): Promise<MutationResult<null>> {
  if (!eventId) return { ok: false, message: "Missing event." };
  try {
    const repository = await createRadarRepository();
    await repository.setSaved(eventId, saved);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, message: messageFrom(error, "Could not update saved events.") };
  }
}

export async function applyProfileAction(
  profile: FounderProfile,
): Promise<MutationResult<{ profile: FounderProfile; events: ScoredEvent[] | null }>> {
  const parsed = founderProfileSchema.safeParse(profile);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Complete your profile first.",
    };
  }

  if (getDataMode() !== "demo") {
    const saved = await saveProfileAction(parsed.data);
    if (!saved.ok) return saved;
    return { ok: true, data: { profile: saved.data, events: null } };
  }

  try {
    const repository = await createRadarRepository();
    const scored = await rescoreStoredEvents({
      repository,
      mode: "demo",
      profile: parsed.data,
    });
    if (!scored.ok) return scored;
    return { ok: true, data: { profile: parsed.data, events: scored.events } };
  } catch (error) {
    return { ok: false, message: messageFrom(error, "Could not update the ranking.") };
  }
}

export async function refreshEventsAction(
  profileInput?: FounderProfile,
): Promise<MutationResult<RefreshData>> {
  const repository = await createRadarRepository();
  return refreshWorkspace({
    repository,
    mode: getDataMode(),
    profileInput,
  });
}
