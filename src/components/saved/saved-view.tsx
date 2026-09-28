"use client";

import { BookmarkIcon } from "lucide-react";
import { useRadar } from "@/components/radar-provider";
import { EventList } from "@/components/events/event-list";

export function SavedView() {
  const radar = useRadar();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-xl flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">Saved events</h1>
        <p className="leading-7 text-muted-foreground">
          Events you keep while reviewing collected listings.
        </p>
      </div>
      <EventList
        events={radar.savedEvents}
        savedIds={radar.savedIds}
        loading={false}
        emptyTitle="No saved events"
        emptyDescription="Save an event from Discover and it will stay on this list."
        emptyIcon={<BookmarkIcon />}
        onToggleSaved={radar.toggleSaved}
      />
    </div>
  );
}
