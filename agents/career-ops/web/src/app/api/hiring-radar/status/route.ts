import { execFile } from "node:child_process";
import { radarScript, radarDir } from "@/lib/hiring-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const STATUSES = ["NEW", "SEEN", "REVIEWED", "CONTACTED", "DISMISSED", "CONVERTED"];

export async function POST(req: Request) {
  let b: { id?: string; status?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  if (!b.id || !/^[a-f0-9]{8,32}$/.test(b.id) || !b.status || !STATUSES.includes(b.status)) return Response.json({ error: "invalid id or status" }, { status: 400 });
  return new Promise<Response>((resolve) => {
    execFile(process.execPath, [radarScript("set-status.mjs"), b.id!, b.status!], { cwd: radarDir(), env: process.env, timeout: 15_000 }, (err, _o, stderr) =>
      resolve(err ? Response.json({ error: String(stderr || err.message).trim() }, { status: 400 }) : Response.json({ ok: true })));
  });
}
