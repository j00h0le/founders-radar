import { createRadarRepository, getDataMode } from "@/lib/db";
import { refreshWorkspace } from "@/lib/ingestion/refresh";
import type { RefreshStreamEvent } from "@/lib/refresh/stream";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const mode = getDataMode();
  let profileInput: unknown;
  if (mode === "demo") {
    const body = (await request.json().catch(() => null)) as { profile?: unknown } | null;
    if (body && "profile" in body) profileInput = body.profile;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RefreshStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const repository = await createRadarRepository();
        const result = await refreshWorkspace({
          repository,
          mode,
          profileInput,
          onProgress: (progress) => send({ type: "progress", progress }),
        });
        send(
          result.ok
            ? { type: "result", data: result.data }
            : { type: "error", message: result.message },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not refresh events.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
