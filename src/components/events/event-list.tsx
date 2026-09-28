import { SearchIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { EventCard } from "@/components/events/event-card";
import type { ScoredEvent } from "@/types/event";

export function EventList({
  events,
  savedIds,
  loading,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  onToggleSaved,
}: {
  events: ScoredEvent[];
  savedIds: string[];
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon?: ReactNode;
  onToggleSaved: (eventId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {emptyIcon ?? <SearchIcon />}
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          saved={savedIds.includes(event.id)}
          onToggleSaved={onToggleSaved}
        />
      ))}
    </div>
  );
}
