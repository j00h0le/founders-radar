export const JEV_CONCURRENCY = 30;

export type ConcurrencyRun<T> = {
  results: T[];
  maxInFlight: number;
  succeeded: number;
  failed: number;
};

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  stats?: { maxInFlight: number; succeeded: number; failed: number },
): Promise<ConcurrencyRun<R>> {
  const results = new Array<R>(items.length);
  const width = Math.min(Math.max(1, limit), Math.max(items.length, 1));
  let cursor = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let succeeded = 0;
  let failed = 0;
  let failure: unknown = null;

  async function run() {
    for (;;) {
      if (failure) return;
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index] as T;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        results[index] = await worker(item, index);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        failure ??= error;
      } finally {
        inFlight -= 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, items.length) }, () => run()));
  if (stats) {
    stats.maxInFlight = maxInFlight;
    stats.succeeded = succeeded;
    stats.failed = failed;
  }
  if (failure) throw failure;
  return { results, maxInFlight, succeeded, failed };
}
