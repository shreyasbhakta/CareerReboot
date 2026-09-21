// Reconnect endpoint for a scan started by POST /api/explore (#background-jobs).
// A scan can run many minutes (see scan.ts's note on Workday); this is how a
// reopened tab finds it again instead of losing the results it already
// produced. Same NDJSON wire format as /api/explore.
import type { ScanEvent } from "@/lib/explore";
import { getJob, subscribeJob } from "@/lib/core/job-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1220;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
  const job = getJob<ScanEvent>(id);
  if (!job) {
    return new Response(JSON.stringify({ error: "This scan is no longer available — the server may have restarted." }), { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsub: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let subDone = false;
      unsub = subscribeJob<ScanEvent>(job, 0, (obj) => {
        if (subDone) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          subDone = true;
          unsub();
          return;
        }
        if (obj.kind === "done" || obj.kind === "error") {
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
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
