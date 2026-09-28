"use client";

import { useMemo, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { useRadar } from "@/components/radar-provider";
import { EventFilters } from "@/components/events/event-filters";
import { EventList } from "@/components/events/event-list";
import { RefreshProgressPanel } from "@/components/events/refresh-progress-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { emptyQuery, filterEvents, type EventQuery } from "@/lib/events/query";
import { scoringWeights } from "@/lib/scoring/weights";
import type { ScoredEvent } from "@/types/event";
import type { FounderProfile } from "@/types/profile";

const PAGE_SIZE = 12;

function greeting(name: string) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name.trim() ? `${hello}, ${name.trim()}` : hello;
}

function rankingLine(profile: FounderProfile) {
  const startup = profile.startupName.trim() || "your startup";
  if (profile.industries.length === 0) {
    return `Save a profile to rank events for ${startup}.`;
  }
  const industries = new Intl.ListFormat("en", { type: "conjunction" }).format(
    profile.industries,
  );
  return `Events are ranked for ${startup} in ${industries}.`;
}

function listedEvents(events: ScoredEvent[]) {
  const hasLiveListing = events.some((event) => !event.isMock);
  return hasLiveListing ? events.filter((event) => !event.isMock) : events;
}

export function DiscoverView() {
  const radar = useRadar();
  const [query, setQuery] = useState<EventQuery>(emptyQuery);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const collected = useMemo(() => listedEvents(radar.events), [radar.events]);
  const visible = useMemo(
    () => filterEvents(collected, query),
    [collected, query],
  );
  const page = visible.slice(0, limit);
  const refreshing = radar.status === "refreshing" && radar.refreshSession !== null;
  const loadingWorkspace = radar.status === "refreshing" && radar.refreshSession === null;
  const highlyRelevant = collected.filter(
    (event) => event.relevanceScore >= scoringWeights.highlyRelevantAt,
  ).length;
  const relevant = collected.filter(
    (event) =>
      event.relevanceScore > scoringWeights.relevantAbove &&
      event.relevanceScore < scoringWeights.highlyRelevantAt,
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-xl flex-col gap-2">
          <h1 className="text-3xl font-medium tracking-tight md:text-4xl">
            {greeting(radar.profile.name)}
          </h1>
          <p className="text-base leading-7 text-muted-foreground" aria-live="polite">
            {rankingLine(radar.profile)}
          </p>
        </div>
        <Button
          onClick={() => void radar.refresh()}
          disabled={refreshing || loadingWorkspace || radar.status === "saving"}
          aria-busy={refreshing}
        >
          {refreshing ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          {refreshing ? "Refreshing" : "Refresh events"}
        </Button>
      </div>

      {radar.refreshSession ? (
        <RefreshProgressPanel
          key={radar.refreshSession.id}
          running={radar.refreshSession.phase === "running"}
          progress={radar.refreshSession.progress}
        />
      ) : null}

      {radar.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not complete the request</AlertTitle>
          <AlertDescription>{radar.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm" className="shadow-sm">
          <CardHeader>
            <CardDescription>Discovered events</CardDescription>
            <CardTitle className="text-2xl">{collected.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm" className="shadow-sm">
          <CardHeader>
            <CardDescription>Highly relevant</CardDescription>
            <CardTitle className="text-2xl">{highlyRelevant}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm" className="shadow-sm">
          <CardHeader>
            <CardDescription>Relevant</CardDescription>
            <CardTitle className="text-2xl">{relevant}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <EventFilters
        query={query}
        onChange={(next) => {
          setQuery(next);
          setLimit(PAGE_SIZE);
        }}
      />

      <EventList
        events={page}
        savedIds={radar.savedIds}
        loading={loadingWorkspace}
        emptyTitle={collected.length === 0 ? "No events yet" : "No events match"}
        emptyDescription={
          collected.length === 0
            ? "Refresh events to collect listings. If every live source fails and nothing is stored, the demo catalog is shown instead."
            : "Clear a filter or search for a broader term."
        }
        onToggleSaved={radar.toggleSaved}
      />
      {visible.length > page.length ? (
        <Button variant="outline" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
          Show more events
        </Button>
      ) : null}
    </div>
  );
}
