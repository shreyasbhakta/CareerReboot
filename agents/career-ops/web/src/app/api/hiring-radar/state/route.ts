import { envStatus, readResults, readLocalConfig, readExampleConfig, readSchedule, currentRun, connectionsInfo, radarInstalled, dataDir, radarDir } from "@/lib/hiring-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const run = currentRun();
  return Response.json({
    installed: radarInstalled(),
    results: readResults()?.json ?? null,
    env: envStatus(),
    configLocal: readLocalConfig(),
    configExample: readExampleConfig(),
    schedule: await readSchedule(),
    connections: connectionsInfo(),
    run: run && { id: run.id, status: run.status, code: run.code ?? null, startedAt: run.startedAt, endedAt: run.endedAt ?? null, args: run.args, log: run.log.slice(-30_000) },
    paths: { dataDir: dataDir(), radarDir: radarDir() },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}
