"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CircleAlertIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  refreshAnnouncement,
  refreshCount,
  refreshHeadline,
  relevanceDetail,
  sourceDetail,
  type RefreshProgress,
} from "@/lib/ingestion/progress";
import { createCountAnimator, createElapsedTimer, formatElapsed } from "@/lib/refresh/timing";

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function StatusMark({ status }: { status: "scanning" | "success" | "failed" | "waiting" }) {
  if (status === "success") {
    return <CheckIcon aria-hidden="true" className="size-4 text-primary" />;
  }
  if (status === "failed") {
    return <CircleAlertIcon aria-hidden="true" className="size-4 text-destructive" />;
  }
  if (status === "scanning") {
    return (
      <span
        aria-hidden="true"
        className="size-2 rounded-full bg-primary motion-safe:animate-pulse"
      />
    );
  }
  return <span aria-hidden="true" className="size-2 rounded-full bg-border" />;
}

export function RefreshProgressPanel({
  running,
  progress,
}: {
  running: boolean;
  progress: RefreshProgress | null;
}) {
  const reducedMotion = useReducedMotion();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [count, setCount] = useState(0);
  const animator = useRef<ReturnType<typeof createCountAnimator> | null>(null);
  const target = refreshCount(progress);

  useEffect(() => {
    if (!running) return;
    const timer = createElapsedTimer({
      now: () => performance.now(),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
      onChange: setElapsedMs,
    });
    timer.start();
    return () => {
      setElapsedMs(timer.stop());
    };
  }, [running]);

  useEffect(() => {
    const next = createCountAnimator({
      now: () => performance.now(),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
      onChange: setCount,
    });
    animator.current = next;
    return () => {
      next.stop();
      animator.current = null;
    };
  }, []);

  useEffect(() => {
    animator.current?.to(target.value, reducedMotion);
  }, [reducedMotion, target.value]);

  const headline = refreshHeadline(progress);
  const relevanceStatus = progress?.relevance.status ?? "pending";
  const mark =
    relevanceStatus === "success"
      ? "success"
      : relevanceStatus === "failed"
        ? "failed"
        : relevanceStatus === "analyzing"
          ? "scanning"
          : "waiting";

  return (
    <Card data-testid="refresh-progress" aria-busy={running}>
      <p className="sr-only" aria-live="polite">
        {refreshAnnouncement(progress)}
      </p>
      <div className="flex items-start justify-between gap-4 px-(--card-spacing)">
        <h2 className="text-lg font-medium tracking-tight">{headline}</h2>
        <p className="shrink-0 pt-1 text-sm tabular-nums text-muted-foreground">
          <span className="sr-only">{running ? "Elapsed time" : "Refresh took"} </span>
          {formatElapsed(elapsedMs)}
        </p>
      </div>
      <div className="flex flex-col gap-1 px-(--card-spacing)">
        <p className="text-5xl font-medium tabular-nums tracking-tight text-primary sm:text-6xl">
          {count.toLocaleString("en-US")}
        </p>
        <p className="text-sm text-muted-foreground">{target.caption}</p>
        {progress?.phase === "complete" && progress.relevance.status === "success" ? (
          <p className="text-sm text-foreground">
            {progress.relevance.evaluated.toLocaleString("en-US")} analyzed for relevance
          </p>
        ) : null}
        {progress?.phase === "complete" && progress.relevance.status === "skipped" ? (
          <p className="text-sm text-muted-foreground">Save a profile to analyze relevance.</p>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2 px-(--card-spacing)">
        {(progress?.sources ?? []).map((source) => (
          <li key={source.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <StatusMark
                status={
                  source.status === "scanning"
                    ? "scanning"
                    : source.status === "failed"
                      ? "failed"
                      : "success"
                }
              />
              {source.name}
            </span>
            <span className="text-muted-foreground">{sourceDetail(source)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <StatusMark status={mark} />
            {progress?.relevance.label ?? "Relevance"}
          </span>
          <span className="text-muted-foreground">
            {progress ? relevanceDetail(progress) : "Waiting"}
          </span>
        </li>
      </ul>
    </Card>
  );
}
