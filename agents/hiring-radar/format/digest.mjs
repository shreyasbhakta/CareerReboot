// Groups ranked signals into the daily digest tiers. Quality over volume:
// the digest is capped (default 10 + 10) and everything below min_score is out.
import { rankSignals, refreshRecency } from '../pipeline.mjs';

const HIRING_TYPES = new Set(['DIRECT_HIRING_POST', 'HIRING_ANNOUNCEMENT', 'TEAM_EXPANSION', 'RECRUITER_ACTIVITY', 'HIRING_MANAGER_ASSOCIATION']);
const COMPANY_TYPES = new Set(['COMPANY_HIRING_SPIKE', 'NEW_ROLE_CLUSTER']);
const HIDDEN = new Set(['DISMISSED', 'CONVERTED']);

export function buildDigest(allSignals, cfg, { now = new Date(), minScore, days } = {}) {
  const min = minScore ?? cfg.scoring.min_score;
  const windowH = (days ?? cfg.recency.default_days) * 24;
  const fresh = allSignals
    .filter((s) => !HIDDEN.has(s.status))
    .map((s) => refreshRecency(s, cfg, now))
    .filter((s) => s.scores.overall >= min && (s.ageHours == null || s.ageHours <= windowH));
  const ranked = rankSignals(fresh);

  const { primary, secondary } = cfg.output.digest;
  // Ten identical "Software Engineer" reqs from one employer are one lead, not ten.
  const perCompany = new Map();
  const maxPer = cfg.output.max_per_company ?? 2;
  const take = (list, n) => {
    const out = [];
    for (const s of list) {
      if (out.length >= n) break;
      const k = (s.company?.name || s.id).toLowerCase();
      if ((perCompany.get(k) || 0) >= maxPer) continue;
      perCompany.set(k, (perCompany.get(k) || 0) + 1);
      out.push(s);
    }
    return out;
  };
  const high = take(ranked.filter((s) => s.scores.overall >= cfg.output.high_signal_min), primary);
  const used = new Set(high.map((s) => s.id));
  const active = take(ranked.filter((s) => !used.has(s.id) && s.scores.overall >= cfg.output.active_min && (HIRING_TYPES.has(s.signalType) || COMPANY_TYPES.has(s.signalType))), secondary);
  active.forEach((s) => used.add(s.id));
  const jobs = take(ranked.filter((s) => !used.has(s.id) && s.signalType === 'JOB_POSTING'), secondary);

  const isNew = (s) => s.status === 'NEW';
  const people = new Set(ranked.filter((s) => s.person?.name).map((s) => s.person.name.toLowerCase()));
  const newPeople = new Set(ranked.filter((s) => isNew(s) && s.person?.name).map((s) => s.person.name.toLowerCase()));
  const summary = {
    newDirectHiringSignals: ranked.filter((s) => isNew(s) && s.signalType === 'DIRECT_HIRING_POST').length,
    newRelevantJobs: ranked.filter((s) => isNew(s) && s.signalType === 'JOB_POSTING').length,
    newHiringPeople: newPeople.size,
    totalHiringPeople: people.size,
    warmOpportunities: ranked.filter((s) => s.warm?.status === 'WARM_INTRO_AVAILABLE').length,
    companiesWithIncreasedActivity: [...new Set(ranked.filter((s) => s.signalType === 'COMPANY_HIRING_SPIKE').map((s) => s.company.name))],
    totalEligible: ranked.length,
  };
  return { high, active, jobs, summary, ranked };
}
