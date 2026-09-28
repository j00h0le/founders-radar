import { SignInForm } from "@/components/auth/sign-in-form";
import { createRadarRepository, getDataMode } from "@/lib/db";

export default async function SignInPage() {
  const mode = getDataMode();
  const signedIn =
    mode === "supabase" ? await (await createRadarRepository()).hasSession() : false;

  return <SignInForm mode={mode} signedIn={signedIn} />;
}
