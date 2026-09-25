import { loadCandidateProfile, resolveScanTargets, fetchJobsFor, loadHttpCtx, type ScanTarget } from "@/lib/research/providers";
import { scoreJob, dedupe, type RawJob, type ScoredJob } from "@/lib/research/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 150;
const MAX_LIMIT = 400;
const CONCURRENCY = 8;
// A slow Workday/iCIMS tenant can page for a long time; this bounds any ONE
// company so it can never stall the whole scan — it's reported as a timeout
// error for that company, not silence.
const PER_TARGET_TIMEOUT_MS = 90_000;

type Health = "HEALTHY" | "DEGRADED" | "ERROR";
type Diagnostic = { source: string; companies: number; jobs: number; errors: { company: string; message: string }[]; health: Health };

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  async function next(): Promise<void> {
    const i = idx++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms (${label})`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function normalizeJob(raw: unknown, target: ScanTarget): RawJob | null {
  const j = raw as Record<string, unknown>;
  const title = typeof j.title === "string" ? j.title.trim() : "";
  const url = typeof j.url === "string" ? j.url.trim() : "";
  if (!title || !url) return null;
  return {
    source: target.provider.id,
    company: (typeof j.company === "string" && j.company.trim()) || target.entry.name,
    title,
    location: typeof j.location === "string" ? j.location : "",
    description: typeof j.description === "string" ? j.description : "",
    url,
    postedAt: typeof j.postedAt === "number" ? j.postedAt : undefined,
    salary: (j.salary as RawJob["salary"]) ?? null,
  };
}

export async function POST(req: Request) {
  let body: { limit?: number; sinceDays?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — defaults apply */
  }
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(body.limit) || DEFAULT_LIMIT));
  // The posting-window filter: 0/undefined means "any age". Postings with no
  // parseable date are NEVER excluded by it — we can't verify their age
  // either way, so exclusion would just hide postings a slow ATS doesn't
  // date, not actually enforce freshness.
  const sinceDays = Number.isFinite(Number(body.sinceDays)) && Number(body.sinceDays) > 0 ? Number(body.sinceDays) : 0;

  let profile;
  try {
    profile = loadCandidateProfile();
  } catch (e) {
    return Response.json(
      { error: `could not read job-finding-research/candidate-profile.yml: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  let targets: ScanTarget[];
  let skipped: { name: string; reason: string }[] = [];
  let totalTracked = 0;
  try {
    const resolved = await resolveScanTargets(limit);
    targets = resolved.targets;
    skipped = resolved.skipped;
    totalTracked = resolved.totalTracked;
  } catch (e) {
    return Response.json({ error: `could not read portals.yml: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  const ctx = await loadHttpCtx();
  // Pre-populate one Diagnostic object per source BEFORE the concurrent pool
  // starts. Creating it lazily inside the worker (`get(source) ?? {...}`) is
  // a lost-update race: two companies on the same source can both miss the
  // map on their first `get`, each build their OWN default object, and
  // whichever `set`s last silently discards the other's counts.
  const diagnosticsBySource = new Map<string, Diagnostic>();
  for (const id of new Set(targets.map((t) => t.provider.id))) {
    diagnosticsBySource.set(id, { source: id, companies: 0, jobs: 0, errors: [], health: "HEALTHY" });
  }
  const rawJobs: RawJob[] = [];

  await runPool(targets, CONCURRENCY, async (target) => {
    const source = target.provider.id;
    const diag = diagnosticsBySource.get(source)!;
    diag.companies += 1;
    try {
      const jobs = await withTimeout(fetchJobsFor(target, ctx), PER_TARGET_TIMEOUT_MS, target.entry.name);
      for (const j of jobs) {
        const normalized = normalizeJob(j, target);
        if (normalized) rawJobs.push(normalized);
      }
      diag.jobs += jobs.length;
    } catch (e) {
      diag.errors.push({ company: target.entry.name, message: e instanceof Error ? e.message : String(e) });
    }
  });

  for (const diag of diagnosticsBySource.values()) {
    const errorRate = diag.companies > 0 ? diag.errors.length / diag.companies : 0;
    diag.health = errorRate === 0 ? "HEALTHY" : errorRate < 0.5 ? "DEGRADED" : "ERROR";
  }

  const deduped = dedupe(rawJobs);
  const now = Date.now();
  const withinWindow = sinceDays
    ? deduped.filter((j) => !j.postedAt || (now - j.postedAt) / 86_400_000 <= sinceDays)
    : deduped;
  const filteredByWindow = deduped.length - withinWindow.length;
  const scored: ScoredJob[] = withinWindow.map((j) => scoreJob(j, profile, now)).sort((a, b) => b.fitScore - a.fitScore);

  const summary = {
    scanned: rawJobs.length,
    unique: deduped.length,
    filteredByWindow,
    apply_today: scored.filter((j) => j.tier === "APPLY_TODAY").length,
    recruiter_outreach: scored.filter((j) => j.tier === "RECRUITER_OUTREACH").length,
    watch: scored.filter((j) => j.tier === "WATCH").length,
    stretch: scored.filter((j) => j.tier === "STRETCH").length,
    skip: scored.filter((j) => j.tier === "SKIP").length,
  };

  return Response.json({
    generatedAt: new Date(now).toISOString(),
    sinceDays: sinceDays || null,
    companies: { scanned: targets.length, skipped, totalTracked },
    diagnostics: [...diagnosticsBySource.values()],
    summary,
    results: scored,
  });
}
