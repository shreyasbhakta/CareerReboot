import { execFile } from "node:child_process";
import { radarScript, radarDir } from "@/lib/hiring-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const STATUSES = ["NEW", "SEEN", "REVIEWED", "CONTACTED", "DISMISSED", "CONVERTED"];
const ID = /^[a-f0-9]{8,32}$/;

function run(args: string[]): Promise<Response> {
  return new Promise((resolve) => {
    execFile(process.execPath, [radarScript("set-status.mjs"), ...args], { cwd: radarDir(), env: process.env, timeout: 20_000 }, (err, stdout, stderr) =>
      resolve(err ? Response.json({ error: String(stderr || err.message).trim() }, { status: 400 }) : Response.json({ ok: true, detail: String(stdout).trim() })));
  });
}

// One result: { id, status }.  Many: { ids, status }.  Permanent delete: { ids, delete: true }.
// Deleted results are remembered (by dedup key) so a rescan does not bring them back.
export async function POST(req: Request) {
  let b: { id?: string; ids?: string[]; status?: string; delete?: boolean };
  try { b = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const ids = (b.ids ?? (b.id ? [b.id] : [])).map(String);
  if (!ids.length || ids.length > 500 || !ids.every((i) => ID.test(i))) return Response.json({ error: "invalid ids" }, { status: 400 });
  if (b.delete) return run(["--delete", ids.join(",")]);
  if (!b.status || !STATUSES.includes(b.status)) return Response.json({ error: "invalid status" }, { status: 400 });
  return ids.length === 1 ? run([ids[0], b.status]) : run(["--bulk", b.status, ids.join(",")]);
}
