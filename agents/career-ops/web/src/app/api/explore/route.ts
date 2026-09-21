import { NextRequest } from "next/server";
import fs from "node:fs";
import { runDiscovery } from "@/lib/core/scan";
import { rootScript } from "@/lib/career-ops";
import { parseExplorePatch, DEFAULT_FILTERS, type DiscoveredOffer, type ScanEvent } from "@/lib/explore";
import { scannerMissingBody, SCANNER_MISSING_STATUS } from "@/lib/explore-error.mjs";
import { createJob, emitJob, finishJob, subscribeJob } from "@/lib/core/job-registry";

// Discovery is HTTP-bound across many ATS boards; give it room. It is FREE —
// zero LLM tokens (the scanner only does HTTP + JSON, and --dry-run writes nothing).
// 1220 to clear scan.ts's own 1_200_000ms (20min) safety-net timeout, which is
// itself generous because Workday's large tenants are genuinely slow to
// paginate (see scan.ts) — a scan this long is fine now that it's a
// background job (#background-jobs): closing the tab no longer loses it.
export const runtime = "nodejs";
export const maxDuration = 1220;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty body → defaults */
  }

  const filters = parseExplorePatch(body, DEFAULT_FILTERS);

  // Guard: a data-only checkout (or pre-onboarding) has no scanner. Fail soft.
  // The body carries an explicit code because 400 is a shared channel: the
  // client cannot tell this apart from a malformed request by status alone.
  if (!fs.existsSync(rootScript("scan-ats-full"))) {
    return Response.json(scannerMissingBody(), { status: SCANNER_MISSING_STATUS });
  }

  // Registered before any stream exists, same reasoning as /api/run
  // (#background-jobs): a scan is a real, sometimes many-minutes-long HTTP
  // sweep across the ATS network (see scan.ts's note on Workday), and closing
  // the tab must not throw that work away. runDiscovery itself never held a
  // disconnect-kill switch, but without a job to buffer into, its results
  // still vanished into a closed stream with no way to reconnect and see them.
  const job = createJob<ScanEvent>("scan");
  const send = (obj: ScanEvent) => {
    emitJob(job, obj);
    if (obj.kind === "done" || obj.kind === "error") finishJob(job, obj.kind);
  };

  (async () => {
    send({ kind: "jobId", id: job.id });
    send({ kind: "start", ats: filters.ats, sinceDays: filters.sinceDays, limit: filters.limitPerAts, free: true });
    let offers: DiscoveredOffer[] = [];
    try {
      offers = await runDiscovery(filters, (e: ScanEvent) => send(e));
    } catch (err) {
      send({ kind: "error", message: err instanceof Error ? err.message : "discovery failed" });
      return;
    }
    send({ kind: "done", count: offers.length, offers, cost: { tokens: 0, usd: 0 } });
  })();

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
      // Detach only this response — the scan itself keeps running (#background-jobs).
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
