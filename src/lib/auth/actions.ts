"use server";

import { z } from "zod";
import { getDataMode } from "@/lib/db/mode";
import { createUserClient } from "@/lib/supabase/user-client";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export type SignInResult = { ok: true } | { ok: false; message: string };

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<SignInResult> {
  if (getDataMode() !== "supabase") {
    return { ok: false, message: "Sign-in is available when APP_MODE is supabase." };
  }

  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the email and password.",
    };
  }

  try {
    const supabase = await createUserClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      return { ok: false, message: "Email or password is incorrect." };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sign in.";
    return { ok: false, message };
  }
}

export async function signOutAction(): Promise<SignInResult> {
  if (getDataMode() !== "supabase") {
    return { ok: false, message: "Sign-in is available when APP_MODE is supabase." };
  }

  try {
    const supabase = await createUserClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { ok: false, message: "Could not sign out." };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sign out.";
    return { ok: false, message };
  }
}
