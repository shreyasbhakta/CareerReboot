import { writeEnv, envStatus, ENV_KEYS } from "@/lib/hiring-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// body.env: { KEY: "value" } sets, { KEY: null } removes. Blank strings are ignored so a
// masked secret field that was left untouched never overwrites the stored value.
export async function POST(req: Request) {
  let b: { env?: Record<string, string | null> };
  try { b = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const updates: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(b.env ?? {})) {
    if (!(ENV_KEYS as readonly string[]).includes(k)) return Response.json({ error: `unsupported key ${k}` }, { status: 400 });
    if (v === null) updates[k] = null;
    else if (typeof v === "string" && v.trim() !== "") updates[k] = v.trim();
  }
  try { writeEnv(updates); } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "write failed" }, { status: 400 }); }
  return Response.json({ ok: true, env: envStatus() });
}
