export function formatEventDate(value: string | null, missing: string) {
  if (!value) return missing;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return missing;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(parsed));
}
