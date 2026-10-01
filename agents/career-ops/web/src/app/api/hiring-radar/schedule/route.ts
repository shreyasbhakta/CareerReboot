import { readSchedule, writeSchedule, validateSchedule, cronLine } from "@/lib/hiring-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() { return Response.json(await readSchedule()); }

// Installs/removes ONE marked block in the user's crontab; every other line is left untouched.
export async function POST(req: Request) {
  let s, preview = false;
  try { const body = await req.json(); preview = Boolean(body?.preview); s = validateSchedule(body); } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "invalid" }, { status: 400 }); }
  if (preview) return Response.json({ ok: true, line: cronLine(s) });
  try {
    await writeSchedule(s.enabled ? s : null);
    return Response.json({ ok: true, line: s.enabled ? cronLine(s) : null, ...(await readSchedule()) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
