// Reconnect endpoint for a health check started by GET /api/portals/verify
// (#background-jobs). Same reasoning as /api/run/stream and /api/explore/stream.
import { getJob, subscribeJob } from "@/lib/core/job-registry";
import type { PortalEvent } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
  const job = getJob<PortalEvent>(id);
  if (!job) {
    return new Response(JSON.stringify({ error: "This check is no longer available — the server may have restarted." }), { status: 404 });
  }

  const enc = new TextEncoder();
  let unsub: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let subDone = false;
      unsub = subscribeJob<PortalEvent>(job, 0, (obj) => {
        if (subDone) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch {
          subDone = true;
          unsub();
          return;
        }
        if (obj.type === "done" || obj.type === "error") {
          subDone = true;
          unsub();
          try { controller.close(); } catch { /* already closed */ }
        }
      });
    },
    cancel() {
      unsub();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
