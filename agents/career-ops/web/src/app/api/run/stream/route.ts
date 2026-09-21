// Reconnect endpoint for a job started by POST /api/run (#background-jobs).
// The job survives a browser tab closing/reloading — this is how a reopened
// tab finds it again: replay everything buffered since `after`, then keep
// tailing live until the job's own done/error event closes the stream.
// Same NDJSON wire format as /api/run, so job-store.tsx's existing line
// parser handles a reconnect identically to the original connection.
import { getJob, subscribeJob } from "@/lib/core/job-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const after = Number(searchParams.get("after") ?? "0");
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
  const job = getJob<Record<string, unknown>>(id);
  if (!job) {
    // Most commonly a server restart wiped the in-memory registry, or the id
    // is just stale (>2h since the job finished — see job-registry's cleanup).
    return new Response(JSON.stringify({ error: "This run is no longer available — the server may have restarted." }), { status: 404 });
  }

  const enc = new TextEncoder();
  let unsub: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let subDone = false;
      unsub = subscribeJob<Record<string, unknown>>(job, Number.isFinite(after) ? after : 0, (obj) => {
        if (subDone) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch {
          subDone = true;
          unsub();
          return;
        }
        if (obj && typeof obj === "object" && "type" in obj) {
          const t = (obj as { type?: unknown }).type;
          if (t === "done" || t === "error") {
            subDone = true;
            unsub();
            try { controller.close(); } catch { /* already closed */ }
          }
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
