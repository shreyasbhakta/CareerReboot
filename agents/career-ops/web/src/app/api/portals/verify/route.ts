import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import { createJob, emitJob, finishJob, subscribeJob } from "@/lib/core/job-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

// Orchestrates the core's verify-portals.mjs (#1016) — the SAME ATS-slug
// validator the CLI uses. Catches the silent 404s that quietly drop a company
// from every future scan (= lost offers). We parse its console output; we do NOT
// reimplement the validation.
//
// STREAMED + backgrounded (#background-jobs), same reasoning as /api/run and
// /api/explore: this used to be a single execFile() capped at 110s. That was
// fine at ~150 tracked companies, but with the list now past 180 (and
// growing), a full sweep is creeping toward that ceiling — and worse, the
// plain fetch().json() gave the Portals page nothing to show for a minute-plus
// straight, which is exactly what "the refresh looks stopped" describes even
// when the check is actually still running server-side. Streaming per-company
// results as they arrive fixes both: real progress instead of a blank
// spinner, and no fixed time budget the check can outgrow.
const STATUS: Record<string, "live" | "empty" | "broken" | "skipped"> = {
  "✅": "live",
  "🟡": "empty",
  "❌": "broken",
  "➖": "skipped",
};

export type PortalEvent =
  | { type: "jobId"; id: string }
  | { type: "company"; name: string; status: "live" | "empty" | "broken" | "skipped" | "unknown"; detail: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function GET() {
  const root = careerOpsRoot();
  const verifyPortals = rootScript("verify-portals");
  if (!fs.existsSync(verifyPortals)) {
    return Response.json({ available: false, configured: false, companies: [] });
  }
  if (!fs.existsSync(path.join(root, "portals.yml"))) {
    return Response.json({ available: true, configured: false, companies: [] });
  }

  const job = createJob<PortalEvent>("portals-verify");
  const send = (e: PortalEvent) => {
    emitJob(job, e);
    if (e.type === "done" || e.type === "error") finishJob(job, e.type === "done" ? "done" : "error");
  };
  send({ type: "jobId", id: job.id });

  const child = spawn(process.execPath, [verifyPortals], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  // Safety net only — real runs finish well under this even at 180+ companies.
  // Never fired by a client disconnect; the job outlives any one response.
  const killer = setTimeout(() => {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }, 600_000);

  const parseLine = (line: string) => {
    const m = line.match(/^\s*(✅|🟡|❌|➖)\s+(.+?)\s+—\s+(.*)$/);
    if (m) send({ type: "company", name: m[2].trim(), status: STATUS[m[1]] ?? "unknown", detail: m[3].trim() });
  };

  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      parseLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  });
  let stderrTail = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-2000);
  });
  child.on("error", (e) => {
    clearTimeout(killer);
    send({ type: "error", message: e.message });
  });
  child.on("close", (code) => {
    clearTimeout(killer);
    if (buf.trim()) parseLine(buf);
    if (code !== 0) {
      send({ type: "error", message: stderrTail.trim().slice(0, 200) || `verify-portals.mjs exited with code ${code}` });
    } else {
      send({ type: "done" });
    }
  });

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
      // Detach only this response — closing the Portals tab must not cut off
      // a health check that's most useful precisely because it kept running.
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
