import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import { addOffersToPipeline } from "@/lib/core/pipeline";

const run = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Kanban's "move back" — undoes a Ready-to-Apply card (real evaluation OR
// a skip-evaluation row) back into the Evaluate queue. Never deletes anything:
// the tracker row moves to the tracker's own real "not pursuing this" state
// (Discarded — the same one "Remove from board" already uses elsewhere) and
// the posting is re-added to the pipeline as a fresh saved entry, so it shows
// up in Evaluate again. Any report file already generated stays on disk,
// orphaned but never deleted — identical to how every other "discard" in this
// app already behaves.
export async function POST(req: Request) {
  let body: { n?: string; url?: string; company?: string; role?: string; location?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const n = typeof body.n === "string" ? body.n.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!n || !url || !company || !role) {
    return Response.json({ error: "n, url, company, and role are required" }, { status: 400 });
  }

  const script = rootScript("set-status");
  if (!fs.existsSync(script)) {
    return Response.json({ error: "this checkout has data only, not the career-ops scripts" }, { status: 503 });
  }

  try {
    const { stdout } = await run(process.execPath, [script, "--row", n, "Discarded", "--source", "web", "--json"], {
      cwd: careerOpsRoot(),
      timeout: 30_000,
    });
    const parsed = JSON.parse(stdout);
    if (!parsed || parsed.changed !== true) {
      return Response.json({ error: "could not discard the existing tracker row" }, { status: 500 });
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 200) : "could not discard the existing tracker row" }, { status: 500 });
  }

  const added = await addOffersToPipeline([
    { url, company, title: role, location: body.location || "", postedAt: "", ats: "", source: "dashboard" },
  ]);
  if (added.error) {
    return Response.json({ error: `Row discarded, but re-adding to the pipeline failed: ${added.error}` }, { status: 500 });
  }
  return Response.json({ ok: true });
}
