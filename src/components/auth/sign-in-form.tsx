"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { signInAction, signOutAction } from "@/lib/auth/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { DataMode } from "@/lib/db/mode";

export function SignInForm({
  mode,
  signedIn,
}: {
  mode: DataMode;
  signedIn: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const invalid = error ? true : undefined;

  if (mode !== "supabase") {
    return (
      <div className="flex max-w-md flex-col gap-4">
        <h1 className="text-3xl font-medium tracking-tight">Sign in</h1>
        <Alert>
          <AlertTitle>Demo mode</AlertTitle>
          <AlertDescription>
            This app is not using Supabase accounts. Set APP_MODE to supabase to sign in.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (signedIn) {
    return (
      <div className="flex max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-medium tracking-tight">Signed in</h1>
          <p className="leading-7 text-muted-foreground">
            This browser has a Startup Radar session. Save a profile, then refresh events.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/" />}>
            Discover events
          </Button>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await signOutAction();
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                window.location.assign("/sign-in");
              });
            }}
          >
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            {isPending ? "Signing out" : "Sign out"}
          </Button>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not sign out</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="flex max-w-md flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const email = String(form.get("email") ?? "");
        const password = String(form.get("password") ?? "");
        setError(null);
        startTransition(async () => {
          const result = await signInAction({ email, password });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          window.location.assign("/");
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">Sign in</h1>
        <p className="leading-7 text-muted-foreground">
          Use the Supabase account for this project. Refresh events runs after you are signed in.
        </p>
      </div>
      <FieldGroup>
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={invalid}
          />
        </Field>
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={invalid}
          />
        </Field>
      </FieldGroup>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not sign in</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? <Spinner data-icon="inline-start" /> : null}
        {isPending ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}
