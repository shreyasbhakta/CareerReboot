import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";

const run = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real scan-run history for the Portals transparency panel — the SAME
// computeAllStats() the CLI's `node stats.mjs` prints, not a reimplementation.
// No "next run" field exists here on purpose: there is no in-repo scheduler
// (scans are user/agent-triggered, or via an external cron/`/loop` the app
// doesn't track), so a next-run time would have to be fabricated. The UI must
// show "Not scheduled" rather than invent one.
export async function GET() {
  const root = careerOpsRoot();
  const script = rootScript("stats");
  if (!fs.existsSync(script)) {
    return Response.json({ available: false });
  }
  try {
    const { stdout } = await run(process.execPath, [script], { cwd: root, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    return Response.json({ available: true, runs: parsed.runs ?? null, portals: parsed.portals ?? null });
  } catch (e) {
    return Response.json({ available: false, error: e instanceof Error ? e.message.slice(0, 300) : "stats.mjs failed" }, { status: 500 });
  }
}
