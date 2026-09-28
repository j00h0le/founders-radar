"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "@/components/ui/toast";
import {
  applyProfileAction,
  loadWorkspace,
  saveProfileAction,
  setSavedAction,
  type IngestionReport,
} from "@/lib/db/actions";
import type { RefreshProgress } from "@/lib/ingestion/progress";
import { refreshEventsStream } from "@/lib/refresh/stream";
import type { DataMode } from "@/lib/db/mode";
import { baseEvents } from "@/lib/events/catalog";
import { scoreEvent } from "@/lib/relevance/mock-provider";
import { scoringWeights } from "@/lib/scoring/weights";
import type { ScoredEvent } from "@/types/event";
import { demoProfile, type FounderProfile } from "@/types/profile";

type RefreshSession = {
  id: number;
  phase: "running" | "complete";
  progress: RefreshProgress | null;
};

type RadarState = {
  profile: FounderProfile;
  events: ScoredEvent[];
  savedIds: string[];
  status: "idle" | "refreshing" | "saving";
  error: string | null;
  ingestion: IngestionReport | null;
  refreshSession: RefreshSession | null;
};

type RadarContextValue = RadarState & {
  source: DataMode;
  highlyRelevantCount: number;
  newlyDiscoveredCount: number;
  savedEvents: ScoredEvent[];
  updateProfile: (profile: FounderProfile) => void;
  toggleSaved: (eventId: string) => void;
  refresh: () => Promise<void>;
};

const blankProfile: FounderProfile = {
  name: "",
  startupName: "",
  startupDescription: "",
  industries: [],
  stage: "Idea",
  preferredLocation: "",
  preferredEventTypes: [],
};

const RadarContext = createContext<RadarContextValue | null>(null);

function scoreAll(
  events: Parameters<typeof scoreEvent>[0][],
  profile: FounderProfile,
  newlyDiscoveredIds: string[],
): ScoredEvent[] {
  return events.map((event) => ({
    ...event,
    ...scoreEvent(event, profile),
    isNewlyDiscovered: newlyDiscoveredIds.includes(event.id),
  }));
}

function initialState(): RadarState {
  return {
    profile: demoProfile,
    events: scoreAll(baseEvents, demoProfile, []),
    savedIds: [],
    status: "idle",
    error: null,
    ingestion: null,
    refreshSession: null,
  };
}

export function RadarProvider({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: DataMode;
}) {
  const profileTouched = useRef(false);
  const refreshId = useRef(0);
  const [state, setState] = useState<RadarState>(() =>
    mode === "demo"
      ? initialState()
      : {
          profile: blankProfile,
          events: [],
          savedIds: [],
          status: "refreshing",
          error: null,
          ingestion: null,
          refreshSession: null,
        },
  );

  useEffect(() => {
    if (mode === "demo") {
      let cancelled = false;
      loadWorkspace().then((result) => {
        if (cancelled || profileTouched.current || !result.ok || !result.profile) return;
        const scored = result.events.some((event) => event.scoreSource !== "unscored");
        setState((current) => ({
          ...current,
          profile: result.profile ?? current.profile,
          events: scored ? result.events : current.events,
          savedIds: result.savedIds,
          status: "idle",
          error: null,
        }));
      });
      return () => {
        cancelled = true;
      };
    }
    if (mode !== "supabase") return;
    let cancelled = false;
    loadWorkspace().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState((current) => ({
          ...current,
          status: "idle",
          error: result.message,
          ingestion: null,
        }));
        return;
      }
      setState((current) => ({
        ...current,
        profile: result.profile ?? blankProfile,
        events: result.events,
        savedIds: result.savedIds,
        status: "idle",
        error: null,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const updateProfile = useCallback(
    (profile: FounderProfile) => {
      profileTouched.current = true;
      if (mode === "demo") {
        setState((current) => ({ ...current, status: "saving", error: null }));
        void applyProfileAction(profile).then((result) => {
          if (!result.ok) {
            setState((current) => ({
              ...current,
              status: "idle",
              error: result.message,
            }));
            toast.add({
              title: "Profile not saved",
              description: result.message,
              type: "error",
            });
            return;
          }
          setState((current) => ({
            ...current,
            profile: result.data.profile,
            events: result.data.events ?? current.events,
            status: "idle",
            error: null,
          }));
          toast.add({
            title: "Profile saved",
            description: "The ranking now uses this profile.",
            type: "success",
          });
        });
        return;
      }

      void saveProfileAction(profile).then((result) => {
        if (!result.ok) {
          setState((current) => ({ ...current, error: result.message }));
          toast.add({
            title: "Profile not saved",
            description: result.message,
            type: "error",
          });
          return;
        }
        setState((current) => ({ ...current, profile: result.data, error: null }));
        toast.add({
          title: "Profile saved",
          description: "Refresh events to match this profile.",
          type: "success",
        });
      });
    },
    [mode],
  );

  const toggleSaved = useCallback(
    (eventId: string) => {
      if (mode === "demo") {
        setState((current) => {
          const saved = current.savedIds.includes(eventId);
          return {
            ...current,
            savedIds: saved
              ? current.savedIds.filter((id) => id !== eventId)
              : [...current.savedIds, eventId],
          };
        });
        return;
      }

      const saved = state.savedIds.includes(eventId);
      const nextSaved = !saved;
      setState((current) => ({
        ...current,
        savedIds: nextSaved
          ? [...current.savedIds, eventId]
          : current.savedIds.filter((id) => id !== eventId),
      }));
      void setSavedAction(eventId, nextSaved).then((result) => {
        if (result.ok) return;
        setState((current) => ({
          ...current,
          savedIds: saved
            ? [...new Set([...current.savedIds, eventId])]
            : current.savedIds.filter((id) => id !== eventId),
          error: result.message,
        }));
        toast.add({
          title: "Saved events not updated",
          description: result.message,
          type: "error",
        });
      });
    },
    [mode, state.savedIds],
  );

  const refresh = useCallback(async () => {
    const id = refreshId.current + 1;
    refreshId.current = id;
    const profile = state.profile;
    setState((current) => ({
      ...current,
      status: "refreshing",
      error: null,
      refreshSession: { id, phase: "running", progress: null },
    }));
    const result = await refreshEventsStream({
      profile: mode === "demo" ? profile : undefined,
      onProgress: (progress) => {
        setState((current) => {
          if (current.refreshSession?.id !== id || current.refreshSession.phase !== "running") {
            return current;
          }
          return { ...current, refreshSession: { id, phase: "running", progress } };
        });
      },
    });
    if (!result.ok) {
      setState((current) => ({
        ...current,
        status: "idle",
        error: result.message,
        refreshSession: null,
      }));
      toast.add({ title: "Refresh failed", description: result.message, type: "error" });
      return;
    }

    const limitations = result.data.ingestion.sources.flatMap((source) =>
      source.limitation ? [source.limitation] : [],
    );
    setState((current) => ({
      ...current,
      events: result.data.events,
      ingestion: result.data.ingestion,
      status: "idle",
      error: null,
      refreshSession: { id, phase: "complete", progress: result.data.summary },
    }));
    toast.add({
      title: limitations.length > 0 ? "Refresh incomplete" : "Events refreshed",
      description:
        limitations.length > 0
          ? limitations.join(" ")
          : result.data.scored
            ? "Listings were collected and scored for this profile."
            : "Listings were collected. Save your profile to score them.",
      type: limitations.length > 0 ? "error" : "success",
    });
  }, [mode, state.profile]);

  const value = useMemo<RadarContextValue>(() => {
    const savedEvents = state.events.filter((event) =>
      state.savedIds.includes(event.id),
    );
    return {
      ...state,
      source: mode,
      highlyRelevantCount: state.events.filter(
        (event) => event.relevanceScore >= scoringWeights.highlyRelevantAt,
      ).length,
      newlyDiscoveredCount: state.events.filter((event) => event.isNewlyDiscovered)
        .length,
      savedEvents,
      updateProfile,
      toggleSaved,
      refresh,
    };
  }, [mode, refresh, state, toggleSaved, updateProfile]);

  return <RadarContext.Provider value={value}>{children}</RadarContext.Provider>;
}

export function useRadar() {
  const value = useContext(RadarContext);
  if (!value) {
    throw new Error("useRadar must be used inside RadarProvider");
  }
  return value;
}
