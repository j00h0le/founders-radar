export type DataMode = "demo" | "supabase";

export function getDataMode(): DataMode {
  const mode = process.env.APP_MODE ?? "demo";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (mode !== "supabase" || !url || !anonKey) {
    return "demo";
  }
  return "supabase";
}

export function requirePublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then set APP_MODE=supabase.",
    );
  }
  return { url, anonKey };
}

export function requireServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error(
      "Set SUPABASE_SERVICE_ROLE_KEY on the server. Do not expose it to the browser.",
    );
  }
  return serviceRoleKey;
}
