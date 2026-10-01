import fs from "node:fs";
import path from "node:path";
import { connectionsFile, connectionsInfo } from "@/lib/hiring-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stores LinkedIn's Connections.csv under data/ (gitignored). Third-party PII: never returned to the browser.
export async function POST(req: Request) {
  let b: { csv?: string; remove?: boolean };
  try { b = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  if (b.remove) { fs.rmSync(connectionsFile(), { force: true }); return Response.json({ ok: true, ...connectionsInfo() }); }
  const csv = typeof b.csv === "string" ? b.csv : "";
  if (csv.length > 20_000_000) return Response.json({ error: "file too large" }, { status: 413 });
  if (!/first name/i.test(csv) || !/company/i.test(csv)) return Response.json({ error: "This doesn't look like LinkedIn's Connections.csv (needs First Name and Company columns)." }, { status: 422 });
  fs.mkdirSync(path.dirname(connectionsFile()), { recursive: true });
  fs.writeFileSync(connectionsFile(), csv, { mode: 0o600 });
  return Response.json({ ok: true, ...connectionsInfo() });
}
