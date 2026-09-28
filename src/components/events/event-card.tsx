import { BookmarkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatEventDate } from "@/lib/events/format";
import { scoringWeights } from "@/lib/scoring/weights";
import type { ScoredEvent } from "@/types/event";

export function EventCard({
  event,
  saved,
  onToggleSaved,
}: {
  event: ScoredEvent;
  saved: boolean;
  onToggleSaved: (eventId: string) => void;
}) {
  const strong =
    event.scoreSource !== "unscored" &&
    event.relevanceScore >= scoringWeights.highlyRelevantAt;
  const scoreLabel =
    event.scoreSource === "unscored"
      ? "Not scored"
      : strong
        ? "Highly relevant"
        : "Relevance";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-xl flex-col gap-2">
            <CardTitle className="text-lg leading-7">{event.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {event.organizer ?? "Organizer not listed"}
            </p>
          </div>
          <div className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
            <p className="text-3xl font-medium tabular-nums tracking-tight">
              <span className="sr-only">Relevance score </span>
              {event.relevanceScore}
              <span className="sr-only"> out of 100</span>
            </p>
            <p className="text-sm text-muted-foreground">{scoreLabel}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Event date</dt>
            <dd>{formatEventDate(event.startsAt, "Date not listed")}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Registration deadline</dt>
            <dd>
              {formatEventDate(event.registrationDeadline, "Deadline not listed")}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Location</dt>
            <dd>{event.location ?? "Location not listed"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{event.eventType}</Badge>
          {event.isNewlyDiscovered ? <Badge>Newly discovered</Badge> : null}
          <Badge variant="outline">{event.isMock ? "Demo data" : event.sourceName}</Badge>
          {event.scoreSource === "demo" ? <Badge variant="outline">Demo match</Badge> : null}
        </div>
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-sm">
            {event.matchingCriteria.length > 0
              ? `Matched on ${event.matchingCriteria.join(", ")}.`
              : "No profile criteria matched."}
          </p>
          {event.scoreSource === "jev" ? null : (
            <p className="text-sm leading-6 text-muted-foreground">{event.explanation}</p>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3">
        <Button
          variant={saved ? "secondary" : "outline"}
          aria-pressed={saved}
          onClick={() => onToggleSaved(event.id)}
        >
          <BookmarkIcon data-icon="inline-start" />
          {saved ? "Saved" : "Save event"}
        </Button>
        <a
          href={event.sourceUrl}
          className="text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open listing
          <span className="sr-only"> for {event.title}</span>
        </a>
      </CardFooter>
    </Card>
  );
}
