"use client";

import { useState } from "react";
import { useRadar } from "@/components/radar-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { eventTypes, type EventType } from "@/types/event";
import {
  founderProfileSchema,
  industries,
  startupStages,
  type FounderProfile,
  type Industry,
  type StartupStage,
} from "@/types/profile";

export function ProfileForm() {
  const radar = useRadar();
  const profileKey = JSON.stringify(radar.profile);
  const [draft, setDraft] = useState<FounderProfile>(radar.profile);
  const [draftKey, setDraftKey] = useState(profileKey);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (draftKey !== profileKey) {
    setDraftKey(profileKey);
    setDraft(radar.profile);
  }

  function update(partial: Partial<FounderProfile>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function toggleIndustry(industry: Industry, checked: boolean) {
    update({
      industries: checked
        ? [...draft.industries, industry]
        : draft.industries.filter((item) => item !== industry),
    });
  }

  function save() {
    const parsed = founderProfileSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    radar.updateProfile(parsed.data);
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">My profile</h1>
        <p className="leading-7 text-muted-foreground">
          {radar.source === "demo"
            ? "Saving updates the demo ranking immediately. Refresh still collects listings from TIPS and K-Startup."
            : "Saving stores this profile. Refresh events to score listings with Jev. Preferred event types are optional."}
        </p>
      </div>
      <FieldGroup>
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            value={draft.name}
            aria-invalid={errors.name ? true : undefined}
            onChange={(event) => update({ name: event.target.value })}
          />
          {errors.name ? <FieldError>{errors.name}</FieldError> : null}
        </Field>
        <Field data-invalid={errors.startupName ? true : undefined}>
          <FieldLabel htmlFor="startup-name">Startup name</FieldLabel>
          <Input
            id="startup-name"
            value={draft.startupName}
            aria-invalid={errors.startupName ? true : undefined}
            onChange={(event) => update({ startupName: event.target.value })}
          />
          {errors.startupName ? <FieldError>{errors.startupName}</FieldError> : null}
        </Field>
        <Field data-invalid={errors.startupDescription ? true : undefined}>
          <FieldLabel htmlFor="startup-description">Startup Description</FieldLabel>
          <Textarea
            id="startup-description"
            value={draft.startupDescription}
            rows={6}
            className="min-h-32"
            aria-invalid={errors.startupDescription ? true : undefined}
            onChange={(event) => update({ startupDescription: event.target.value })}
          />
          {errors.startupDescription ? (
            <FieldError>{errors.startupDescription}</FieldError>
          ) : null}
        </Field>
        <FieldSet>
          <FieldLegend variant="label">Industry categories</FieldLegend>
          <FieldDescription>Choose every industry that fits.</FieldDescription>
          <FieldGroup className="gap-3">
            {industries.map((industry) => {
              const id = `industry-${industry.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
              return (
                <Field key={industry} orientation="horizontal">
                  <Checkbox
                    id={id}
                    checked={draft.industries.includes(industry)}
                    onCheckedChange={(checked) =>
                      toggleIndustry(industry, checked === true)
                    }
                  />
                  <FieldLabel htmlFor={id} className="font-normal">
                    {industry}
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldGroup>
          {errors.industries ? <FieldError>{errors.industries}</FieldError> : null}
        </FieldSet>
        <Field data-invalid={errors.stage ? true : undefined}>
          <FieldLabel>Startup stage</FieldLabel>
          <ToggleGroup
            variant="outline"
            spacing={2}
            value={[draft.stage]}
            onValueChange={(value) => {
              const next = value[0] as StartupStage | undefined;
              if (next) update({ stage: next });
            }}
            aria-label="Startup stage"
            className="flex-wrap justify-start"
          >
            {startupStages.map((stage) => (
              <ToggleGroupItem key={stage} value={stage}>
                {stage}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {errors.stage ? <FieldError>{errors.stage}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel>Preferred event types</FieldLabel>
          <FieldDescription>
            Leave this empty to skip event-type relevance. It is not part of the
            60/40 score.
          </FieldDescription>
          <ToggleGroup
            multiple
            variant="outline"
            spacing={2}
            value={draft.preferredEventTypes}
            onValueChange={(value) =>
              update({ preferredEventTypes: value as EventType[] })
            }
            aria-label="Preferred event types"
            className="flex-wrap justify-start"
          >
            {eventTypes.map((type) => (
              <ToggleGroupItem key={type} value={type}>
                {type}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field data-invalid={errors.preferredLocation ? true : undefined}>
          <FieldLabel htmlFor="location">Preferred location</FieldLabel>
          <Input
            id="location"
            value={draft.preferredLocation}
            aria-invalid={errors.preferredLocation ? true : undefined}
            onChange={(event) => update({ preferredLocation: event.target.value })}
          />
          <FieldDescription>A city, or Online.</FieldDescription>
          {errors.preferredLocation ? (
            <FieldError>{errors.preferredLocation}</FieldError>
          ) : null}
        </Field>
      </FieldGroup>
      <Button
        onClick={save}
        className="w-fit"
        disabled={radar.status === "saving" || radar.status === "refreshing"}
      >
        {radar.status === "saving" ? "Saving profile" : "Save profile"}
      </Button>
    </div>
  );
}
