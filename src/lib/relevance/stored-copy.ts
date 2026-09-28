const prefix = "Matches: ";

export function packExplanation(criteria: string[], explanation: string) {
  const label = criteria.length > 0 ? criteria.join(", ") : "none";
  return `${prefix}${label}.\n\n${explanation}`;
}

export function unpackExplanation(stored: string) {
  if (!stored.startsWith(prefix)) {
    return { matchingCriteria: [] as string[], explanation: stored };
  }
  const splitAt = stored.indexOf("\n\n");
  if (splitAt === -1) {
    return { matchingCriteria: [] as string[], explanation: stored };
  }
  const label = stored.slice(prefix.length, splitAt).replace(/\.$/, "").trim();
  const matchingCriteria =
    label === "" || label === "none" ? [] : label.split(", ").filter(Boolean);
  return { matchingCriteria, explanation: stored.slice(splitAt + 2) };
}
