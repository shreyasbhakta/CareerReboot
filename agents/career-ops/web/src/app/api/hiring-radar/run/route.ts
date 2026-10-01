import { startRun, currentRun, SOURCES } from "@/lib/hiring-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const days = Number(b.days ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 30) return Response.json({ error: "days must be 1-30" }, { status: 400 });
  const source = String(b.source ?? "all");
  if (!SOURCES.includes(source)) return Response.json({ error: "invalid source" }, { status: 400 });
  let minScore: number | undefined;
  if (b.minScore !== undefined && b.minScore !== "" && b.minScore !== null) {
    minScore = Number(b.minScore);
    if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) return Response.json({ error: "minScore must be 0-100" }, { status: 400 });
  }
  try {
    const run = startRun({ days, source, minScore, dryRun: Boolean(b.dryRun) });
    return Response.json({ id: run.id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 409 });
  }
}

export async function GET() {
  const r = currentRun();
  return Response.json(r ? { id: r.id, status: r.status, code: r.code ?? null, log: r.log.slice(-60_000), startedAt: r.startedAt, endedAt: r.endedAt ?? null } : null);
}
