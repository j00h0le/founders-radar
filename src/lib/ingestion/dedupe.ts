import type { EventDraft } from "@/lib/db/records";

function compact(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sourceNames(value: string) {
  const names: string[] = [];
  for (const part of value.split(",")) {
    const name = part.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function withAttribution(kept: EventDraft, next: EventDraft): EventDraft {
  return {
    ...kept,
    sourceName: [...sourceNames(kept.sourceName), ...sourceNames(next.sourceName)]
      .filter((name, index, names) => names.indexOf(name) === index)
      .join(", "),
  };
}

function crossSourceKey(draft: EventDraft) {
  const title = compact(draft.title);
  const organizer = draft.organizer ? compact(draft.organizer) : "";
  const deadline = draft.registrationDeadline;
  if (!title || !organizer || !deadline) return null;
  return `${title}\n${organizer}\n${deadline}`;
}

export function dedupeDrafts(drafts: EventDraft[]): EventDraft[] {
  const byUrl = new Map<string, EventDraft>();
  const urlByKey = new Map<string, string>();

  for (const draft of drafts) {
    const sourceUrl = draft.sourceUrl.trim();
    const title = draft.title.trim();
    if (!sourceUrl || !title) continue;
    const next = { ...draft, sourceUrl, title };
    const key = crossSourceKey(next);
    const existingUrl = byUrl.has(sourceUrl) ? sourceUrl : key ? urlByKey.get(key) : undefined;
    const existing = existingUrl ? byUrl.get(existingUrl) : undefined;

    if (existing && existingUrl) {
      byUrl.set(existingUrl, withAttribution(existing, next));
      continue;
    }

    byUrl.set(sourceUrl, next);
    if (key) urlByKey.set(key, sourceUrl);
  }

  return [...byUrl.values()];
}
