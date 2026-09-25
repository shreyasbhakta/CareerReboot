// Pure, deterministic fit-scoring for the /research tool. No I/O, no LLM —
// this is the cheap code-layer pre-filter described in
// job-finding-research/SKILL.md ("What this skill is (and isn't)"). It turns
// a pile of raw postings into a tiered shortlist; real judgment on any
// individual posting still belongs to a human or an LLM reading SKILL.md.

export type CandidateProfile = {
  location: { primary: string[]; secondary_signals: string[]; open_to_relocation: boolean; international_signals: string[] };
  seniority: { target: string[]; stretch: string[]; strong_stretch: string[]; exclude: string[] };
  skills: { backend: string[]; ai: string[]; infra: string[]; client_facing: string[] };
  signals: { production: string[]; fde: string[]; domain: string[]; ai_native: string[] };
  weights: { technical: number; production: number; fde_domain: number; seniority: number; location: number; freshness: number };
  tiers: { apply_today_min: number; recruiter_outreach_min: number; watch_min: number; stretch_min: number };
};

export type RawJob = {
  source: string; // provider id, e.g. "ashby"
  company: string;
  title: string;
  location: string;
  description?: string;
  url: string;
  postedAt?: number; // epoch ms
  salary?: { min?: number; max?: number; currency?: string } | null;
};

export type Tier = "APPLY_TODAY" | "RECRUITER_OUTREACH" | "WATCH" | "STRETCH" | "SKIP";
export type RoleFamily = "BACKEND" | "AI_ENGINEERING" | "AGENTIC_AI" | "FDE" | "FULL_STACK" | "PLATFORM" | "SOLUTIONS_ENGINEERING" | "OTHER";

export type ScoredJob = RawJob & {
  fitScore: number;
  tier: Tier;
  roleFamily: RoleFamily[];
  breakdown: { technical: number; production: number; fdeDomain: number; seniority: number; location: number; freshness: number };
  excluded?: string; // reason, when hard-filtered
  locationFlag?: string;
};

function includesAny(haystack: string, needles: string[]): string[] {
  const hits: string[] = [];
  for (const n of needles) if (n && haystack.includes(n)) hits.push(n);
  return hits;
}

function pct(hits: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((hits / total) * 100 * 2.2)); // a few hits saturate the score — exact keyword coverage of a whole vocabulary is not the bar
}

function daysAgo(postedAt: number | undefined, now: number): number | null {
  if (!postedAt || !Number.isFinite(postedAt)) return null;
  return Math.max(0, (now - postedAt) / 86_400_000);
}

/** Normalized dedup key: company + title + location, lowercased and whitespace-collapsed. */
export function dedupKey(job: RawJob): string {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
  return `${norm(job.company)}|${norm(job.title)}|${norm(job.location)}`;
}

export function scoreJob(job: RawJob, profile: CandidateProfile, now: number = Date.now()): ScoredJob {
  const title = (job.title || "").toLowerCase();
  const text = `${title} ${(job.description || "").toLowerCase()}`;
  const location = (job.location || "").toLowerCase();

  // Hard filters — flagged with a reason, never silently dropped from the payload.
  const exclude = includesAny(title, profile.seniority.exclude);
  const excluded = exclude.length ? `excluded: title matches "${exclude[0]}"` : undefined;

  const backendHits = includesAny(text, profile.skills.backend);
  const aiHits = includesAny(text, profile.skills.ai);
  const infraHits = includesAny(text, profile.skills.infra);
  const clientHits = includesAny(text, profile.skills.client_facing);
  const techVocabSize = profile.skills.backend.length + profile.skills.ai.length + profile.skills.infra.length + profile.skills.client_facing.length;
  const technical = pct(backendHits.length + aiHits.length + infraHits.length + clientHits.length, techVocabSize);

  const productionHits = includesAny(text, profile.signals.production);
  const production = pct(productionHits.length, profile.signals.production.length);

  const fdeHits = includesAny(text, profile.signals.fde);
  const domainHits = includesAny(text, profile.signals.domain);
  const aiNativeHits = includesAny(text, profile.signals.ai_native);
  const fdeDomain = pct(fdeHits.length + domainHits.length + aiNativeHits.length, profile.signals.fde.length + profile.signals.domain.length + profile.signals.ai_native.length);

  // Seniority: target=neutral(100), stretch=70, strong_stretch=40, unmatched=85 (assume approachable).
  let seniority = 85;
  if (includesAny(title, profile.seniority.strong_stretch).length) seniority = 40;
  else if (includesAny(title, profile.seniority.stretch).length) seniority = 70;
  else if (includesAny(title, profile.seniority.target).length) seniority = 100;

  // Location: primary hub=100, secondary (remote/US)=80, foreign hire=20,
  // open-to-relocation floor=55 (an unrecognized US-ish location), else 30.
  let locationScore = profile.location.open_to_relocation ? 55 : 30;
  let locationFlag: string | undefined;
  if (includesAny(location, profile.location.primary).length) locationScore = 100;
  else if (includesAny(location, profile.location.secondary_signals).length) locationScore = 80;
  else if (includesAny(location, profile.location.international_signals).length) {
    locationScore = 20;
    locationFlag = "location outside the US — likely a local hire, not a relocation; verify sponsorship/eligibility";
  } else if (!location.trim()) {
    locationScore = 50;
    locationFlag = "no location on posting — verify manually";
  } else {
    locationFlag = "outside primary/secondary location list — verify US eligibility";
  }

  // Freshness: <=3d=100, <=7d=85, <=14d=65, <=30d=45, older=25, unknown=50 (neutral, never penalized for missing data).
  const age = daysAgo(job.postedAt, now);
  let freshness = 50;
  if (age !== null) {
    if (age <= 3) freshness = 100;
    else if (age <= 7) freshness = 85;
    else if (age <= 14) freshness = 65;
    else if (age <= 30) freshness = 45;
    else freshness = 25;
  }

  const w = profile.weights;
  const weightSum = w.technical + w.production + w.fde_domain + w.seniority + w.location + w.freshness || 100;
  const fitScore = excluded
    ? 0
    : Math.round(
        (technical * w.technical + production * w.production + fdeDomain * w.fde_domain + seniority * w.seniority + locationScore * w.location + freshness * w.freshness) /
          weightSum,
      );

  const t = profile.tiers;
  let tier: Tier = "SKIP";
  if (!excluded) {
    if (fitScore >= t.apply_today_min) tier = "APPLY_TODAY";
    else if (fitScore >= t.recruiter_outreach_min) tier = "RECRUITER_OUTREACH";
    else if (fitScore >= t.watch_min) tier = "WATCH";
    else if (fitScore >= t.stretch_min) tier = "STRETCH";
  }
  // A likely-foreign-hire posting is a hard filter per SKILL.md ("Hard
  // Filters": non-US roles with no relocation/remote signal get rejected or
  // flagged, not just down-weighted) — location is only 10% of the weighted
  // score, so on its own it can't pull a strong technical match out of
  // APPLY_TODAY/RECRUITER_OUTREACH/WATCH. Capped at STRETCH, not SKIP: the
  // underlying fit signal is still real, it just needs a human to confirm
  // eligibility before it's actionable — "flag for human review," not silent
  // exclusion.
  if (!excluded && locationScore === 20 && (tier === "APPLY_TODAY" || tier === "RECRUITER_OUTREACH" || tier === "WATCH")) {
    tier = "STRETCH";
  }

  const roleFamily: RoleFamily[] = [];
  if (fdeHits.length || clientHits.length) roleFamily.push("FDE");
  if (aiNativeHits.length || aiHits.length >= 2) roleFamily.push(aiHits.some((h) => /agent|langgraph|mcp|multi-agent/.test(h)) ? "AGENTIC_AI" : "AI_ENGINEERING");
  if (backendHits.length && /platform|infra/.test(text)) roleFamily.push("PLATFORM");
  else if (backendHits.length) roleFamily.push("BACKEND");
  if (/full stack|full-stack/.test(text)) roleFamily.push("FULL_STACK");
  if (/solutions engineer|customer engineer/.test(title)) roleFamily.push("SOLUTIONS_ENGINEERING");
  if (!roleFamily.length) roleFamily.push("OTHER");

  return {
    ...job,
    fitScore,
    tier,
    roleFamily: [...new Set(roleFamily)],
    breakdown: { technical, production, fdeDomain, seniority, location: locationScore, freshness },
    excluded,
    locationFlag,
  };
}

export function dedupe(jobs: RawJob[]): RawJob[] {
  const seen = new Set<string>();
  const out: RawJob[] = [];
  for (const j of jobs) {
    const key = j.url || dedupKey(j);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }
  return out;
}
