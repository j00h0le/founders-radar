import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database";
import { requirePublicSupabaseEnv, requireServiceRoleKey } from "@/lib/db/mode";

export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase service role client is server-only.");
  }

  const { url } = requirePublicSupabaseEnv();
  const serviceRoleKey = requireServiceRoleKey();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
