import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createUserClient } from "@/lib/supabase/user-client";
import type { Database } from "@/lib/db/database";
import {
  evaluationFromRow,
  eventFromRow,
  eventToInsert,
  profileFromRow,
  type EventDraft,
} from "@/lib/db/records";
import type { RadarRepository } from "@/lib/db/repository";
import { founderProfileSchema, type FounderProfile } from "@/types/profile";
import { packExplanation } from "@/lib/relevance/stored-copy";
import type { ScoredEvent } from "@/types/event";

type UserClient = SupabaseClient<Database>;

function fail(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

async function requireUserId(client: UserClient) {
  const { data, error } = await client.auth.getClaims();
  if (error) throw new Error(error.message);
  const userId = data?.claims.sub;
  if (!userId) {
    throw new Error("Sign in before saving a Startup Radar profile.");
  }
  return userId;
}

export async function createSupabaseRepository(): Promise<RadarRepository> {
  const user = await createUserClient();

  return {
    async hasSession() {
      const { data, error } = await user.auth.getClaims();
      if (error) return false;
      return Boolean(data?.claims.sub);
    },
    async listEvents() {
      const { data, error } = await user
        .from("events")
        .select("*")
        .order("event_date", { ascending: true, nullsFirst: false });
      fail(error, "Could not load events.");
      return (data ?? []).map(eventFromRow);
    },

    async upsertEvents(drafts: EventDraft[]) {
      if (drafts.length === 0) return [];
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("events")
        .upsert(drafts.map(eventToInsert), { onConflict: "source_url" })
        .select("*");
      fail(error, "Could not save events.");
      return (data ?? []).map(eventFromRow);
    },

    async getProfile() {
      const userId = await requireUserId(user);
      const { data, error } = await user
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      fail(error, "Could not load the profile.");
      return data ? profileFromRow(data) : null;
    },

    async saveProfile(profile: FounderProfile) {
      const parsed = founderProfileSchema.parse(profile);
      const userId = await requireUserId(user);
      const { data, error } = await user
        .from("profiles")
        .upsert(
          {
            id: userId,
            name: parsed.name,
            startup_name: parsed.startupName,
            startup_description: parsed.startupDescription,
            industries: parsed.industries,
            stage: parsed.stage,
            preferred_location: parsed.preferredLocation,
            preferred_event_types: parsed.preferredEventTypes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
        .select("*")
        .single();
      fail(error, "Could not save the profile.");
      if (!data) throw new Error("Could not save the profile.");
      return profileFromRow(data);
    },

    async listEvaluations() {
      const userId = await requireUserId(user);
      const { data, error } = await user
        .from("relevance_evaluations")
        .select("*")
        .eq("profile_id", userId);
      fail(error, "Could not load relevance evaluations.");
      return (data ?? []).map(evaluationFromRow);
    },

    async saveEvaluations(events: ScoredEvent[], provider: "mock" | "jev") {
      if (events.length === 0) return;
      const userId = await requireUserId(user);
      const evaluatedAt = new Date().toISOString();
      const { error } = await user.from("relevance_evaluations").upsert(
        events.map((event) => ({
          profile_id: userId,
          event_id: event.id,
          relevance_score: event.relevanceScore,
          explanation: packExplanation(event.matchingCriteria, event.explanation),
          provider,
          is_newly_discovered: event.isNewlyDiscovered,
          evaluated_at: evaluatedAt,
        })),
        { onConflict: "profile_id,event_id" },
      );
      fail(error, "Could not save relevance evaluations.");
    },

    async listSavedIds() {
      const userId = await requireUserId(user);
      const { data, error } = await user
        .from("saved_events")
        .select("event_id")
        .eq("profile_id", userId);
      fail(error, "Could not load saved events.");
      return (data ?? []).map((row) => row.event_id);
    },

    async setSaved(eventId: string, saved: boolean) {
      const userId = await requireUserId(user);
      if (saved) {
        const { error } = await user.from("saved_events").upsert(
          { profile_id: userId, event_id: eventId },
          { onConflict: "profile_id,event_id" },
        );
        fail(error, "Could not save this event.");
        return;
      }
      const { error } = await user
        .from("saved_events")
        .delete()
        .eq("profile_id", userId)
        .eq("event_id", eventId);
      fail(error, "Could not remove this saved event.");
    },
  };
}
