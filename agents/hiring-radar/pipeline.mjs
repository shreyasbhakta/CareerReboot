// Candidate -> normalized, scored signal. Pure and synchronous (no I/O), which
// is what makes the unit tests cheap. Order follows the spec: normalize URL,
// title, date, person, company, role, type, activity, match, score.
import { canonicalUrl, truncate, normalizeText } from './lib/text.mjs';
import { parseDate } from './lib/dates.mjs';
import { classifyHiringText } from './extractors/hiring-signal.mjs';
import { personFromResult, extractNamedContact, classifyPersonTitle } from './extractors/person.mjs';
import { resolveCompany } from './extractors/company.mjs';
import { scoreSignal, overallConfidence, personScore } from './scoring/overall.mjs';
import { activityScore } from './scoring/activity.mjs';
import { classifyLocation } from './scoring/location.mjs';
import { technicalMatch } from './scoring/role-match.mjs';
import { signalId } from './storage/normalize.mjs';
import { buildWhy, outreachAngle, suggestedAction } from './extractors/outreach.mjs';

const ENGINEERING = /\b(engineer|engineers|developer|developers|sde|swe|fde|programmer)\b/i;
const drop = (reason) => ({ dropped: reason });

export function buildSignal(c, ctx) {
  const { cfg, matcher, now, days, trackedKeys = new Set() } = ctx;

  const url = canonicalUrl(c.sourceUrl);
  if (!url) return drop('invalid-url');

  const published = parseDate(c.publishedAt, now);
  const hours = published ? Math.max(0, (now - published) / 36e5) : null;
  if (hours != null && hours > days * 24) return drop('stale');
  if (hours == null && c.kind === 'post' && !cfg.recency.allow_undated_posts) return drop('undated-post');
  // Search-engine job hits with no date and no structured company are the noisiest input; the ATS-API source covers real jobs reliably.
  if (hours == null && c.source === 'web-search' && c.kind === 'job' && !cfg.recency.allow_undated_web_jobs) return drop('undated-web-job');

  // ---- role ----
  const headerText = c.kind === 'hn' ? c.title : c.kind === 'job' ? c.title : `${c.title}\n${c.snippet || ''}`;
  let role = matcher.match(headerText, { isTitle: c.kind === 'job' });
  // HN: the header line states the role; a role only mentioned deep in the body is too loose.
  const bodyForRole = c.kind === 'hn' ? c.text.slice(0, 300) : c.text;
  if (!role.matched && role.tier !== 'excluded' && c.kind !== 'job') role = matcher.match(bodyForRole);
  if (role.tier === 'excluded') return drop('excluded-role');
  if (c.kind !== 'post' && !role.matched) return drop('role-not-matched');
  if (c.kind === 'post' && !role.matched && !ENGINEERING.test(c.text)) return drop('no-engineering-role');
  const sen = c.kind === 'post' ? { drop: false, penalty: 0 } : matcher.seniority(c.title);
  if (sen.drop) return drop('seniority');

  // ---- hiring language ----
  let direct;
  if (c.kind === 'job') {
    direct = { strength: 'job_posting', directScore: cfg.signals.strength_scores.job_posting, signalType: 'JOB_POSTING', phrases: [], negatives: [], broad: false };
  } else if (c.kind === 'hn') {
    const strength = role.matched ? 'team_role' : 'team_generic';
    direct = { strength, directScore: cfg.signals.strength_scores[strength], signalType: role.matched ? 'DIRECT_HIRING_POST' : 'HIRING_ANNOUNCEMENT', phrases: ['hn: who is hiring'], negatives: [], broad: false };
  } else {
    direct = classifyHiringText(`${c.title}\n${c.snippet || c.text}`, cfg, { hasRole: role.matched });
    if (direct.strength === 'none') return drop('not-a-hiring-signal');
  }

  // ---- person ----
  let person = null;
  if (c.person) person = c.person;
  else if (c.kind === 'post') {
    person = personFromResult({ title: c.title, snippet: c.snippet, url, firstPerson: direct.strength.startsWith('first_person') });
  } else if (c.kind === 'job') {
    const named = extractNamedContact(c.text);
    if (named) person = { name: named.name, title: named.title, url: null, source: 'jd', confidence: 'HIGH' };
  }

  // ---- company ----
  let company;
  if (c.companyName) company = { name: c.companyName, confidence: c.kind === 'job' ? 'HIGH' : 'MEDIUM' };
  else if (person?.company) company = { name: person.company, confidence: 'MEDIUM' };
  else {
    const r = resolveCompany({ structured: null, url, title: c.title, text: c.text });
    company = { name: r.name, confidence: r.confidence };
  }
  company.url = null;
  if (person) delete person.company;

  // ---- location ----
  const locText = c.location || (c.kind === 'job' ? '' : truncate(c.text, 700));
  const loc = classifyLocation(locText, cfg);
  if (loc.drop) return drop('non-us');

  let signalType = direct.signalType;
  if (signalType !== 'JOB_POSTING' && person && classifyPersonTitle(person.title, cfg) === 'recruiter') signalType = 'RECRUITER_ACTIVITY';

  const sig = {
    source: c.source,
    sourceUrl: url,
    signalType,
    person,
    company,
    role: { raw: role.alias || c.title, canonical: role.canonical, familyId: role.familyId, tier: role.tier, matched: role.matched },
    title: c.title,
    location: c.location || loc.matches.join(', '),
    text: truncate(c.text, 1500),
    publishedAt: published ? published.toISOString() : null,
    discoveredAt: now.toISOString(),
    directStrength: direct.strength,
    directScore: direct.directScore,
    phrases: direct.phrases,
    seniorityPenalty: sen.penalty,
    metadata: { ...(c.metadata || {}), negatives: direct.negatives },
  };
  scoreAndAnnotate(sig, ctx, trackedKeys.has(normalizeText(company.name)));
  return { signal: sig };
}

/** (Re)compute scores and derived annotations in place. Call again after person/LLM enrichment. */
export function scoreAndAnnotate(sig, ctx, tracked = false) {
  const { cfg, now } = ctx;
  sig.scores = scoreSignal(sig, cfg, { now, tracked });
  const s = sig.scores;
  Object.assign(sig, {
    technicalBreakdown: s.technicalBreakdown, matchedSkills: s.matchedSkills, skillGroups: s.skillGroups,
    ageHours: s.ageHours, dateKnown: s.dateKnown, locationKind: s.locationKind,
  });
  sig.confidence = overallConfidence(sig, s);
  sig.id = signalId(sig);
  sig.why = buildWhy(sig);
  sig.outreach = { action: suggestedAction(sig, cfg), angle: outreachAngle(sig, cfg) };
  return sig;
}

/** Re-age a stored signal so the daily report reflects today's recency, not the day it was found. */
export function refreshRecency(sig, cfg, now) {
  if (!sig.scores?.components) return sig;
  const act = activityScore(sig.publishedAt, cfg, now);
  const comps = { ...sig.scores.components, activity: act.score };
  const w = cfg.scoring.weights;
  const overall = Math.round(Object.entries(w).reduce((a, [k, wt]) => a + (comps[k] ?? 0) * wt, 0));
  return { ...sig, ageHours: act.ageHours, dateKnown: act.known, scores: { ...sig.scores, components: comps, overall, ageHours: act.ageHours } };
}

/**
 * Company-level "recent hiring activity increased" detection. Deliberately
 * conservative: needs min_recent_jobs, and a baseline from history to claim an
 * increase; otherwise it can only say several matching roles are open.
 */
export function detectSpikes({ jobSignals, history, knownKeys, cfg, now }) {
  const sp = cfg.spike;
  const byCompany = new Map();
  for (const j of jobSignals) {
    const k = normalizeText(j.company.name);
    if (!k) continue;
    if (!byCompany.has(k)) byCompany.set(k, []);
    byCompany.get(k).push(j);
  }
  const histJobs = history.filter((h) => h.signalType === 'JOB_POSTING');
  const earliest = histJobs.reduce((m, h) => Math.min(m, Date.parse(h.discoveredAt) || Infinity), Infinity);
  const historyDays = Number.isFinite(earliest) ? (now - earliest) / 864e5 : 0;
  const out = [];

  for (const [k, jobs] of byCompany) {
    const recent = jobs.filter((j) => {
      const isNew = !knownKeys.has(`url:${j.sourceUrl}`);
      const dated = j.publishedAt ? (now - Date.parse(j.publishedAt)) / 864e5 <= sp.recent_days : false;
      return dated || (!j.publishedAt && isNew && historyDays >= 1);
    });
    const distinct = new Set(recent.map((j) => normalizeText(j.title)));
    if (distinct.size < sp.min_recent_jobs) continue;

    const baselineWeeks = Math.max(1, (sp.baseline_days - sp.recent_days) / 7);
    const histCount = histJobs.filter((h) => {
      if (normalizeText(h.company?.name) !== k) return false;
      const ageD = (now - (Date.parse(h.publishedAt) || Date.parse(h.discoveredAt))) / 864e5;
      return ageD > sp.recent_days && ageD <= sp.baseline_days;
    }).length;
    const perWeek = histCount / baselineWeeks;
    const haveBaseline = historyDays >= sp.recent_days + 7;
    const increased = haveBaseline && distinct.size >= sp.ratio * Math.max(perWeek, 0.5);
    const type = increased ? 'COMPANY_HIRING_SPIKE' : 'NEW_ROLE_CLUSTER';
    if (!increased && !(distinct.size >= sp.min_recent_jobs)) continue;

    const best = [...recent].sort((a, b) => b.scores.components.technical - a.scores.components.technical)[0];
    const dated = recent.filter((j) => j.publishedAt).map((j) => j.publishedAt).sort().pop() || null;
    const titles = [...distinct].slice(0, 5);
    const text = increased
      ? `Recent hiring activity increased at ${best.company.name}: ${distinct.size} matching roles in the last ${sp.recent_days} days vs ~${perWeek.toFixed(1)} per week before (${titles.join('; ')}).`
      : `${best.company.name} has ${distinct.size} matching roles open at once (${titles.join('; ')}).`;
    const sig = {
      source: 'jobs:aggregate',
      sourceUrl: best.sourceUrl,
      signalType: type,
      person: null,
      company: best.company,
      role: { ...best.role },
      title: `${best.company.name}: ${distinct.size} matching roles`,
      location: best.location,
      text,
      publishedAt: dated,
      discoveredAt: now.toISOString(),
      directStrength: 'spike',
      directScore: cfg.signals.strength_scores.spike,
      phrases: [],
      seniorityPenalty: 0,
      metadata: { jobCount: distinct.size, baselinePerWeek: Number(perWeek.toFixed(2)), titles },
    };
    // Aggregate signals inherit the best job's skills evidence rather than re-parsing generic text.
    sig.text = `${text}\n${recent.map((j) => j.title).join('\n')}`;
    out.push(sig);
  }
  return out;
}

export function rankSignals(signals) {
  const warmRank = { WARM_INTRO_AVAILABLE: 2, COMPANY_CONNECTION: 1, NO_CONNECTION: 0 };
  return [...signals].sort((a, b) =>
    (b.scores.overall - a.scores.overall)
    || ((b.scores.components.direct_language ?? 0) - (a.scores.components.direct_language ?? 0))
    || ((b.scores.components.activity ?? 0) - (a.scores.components.activity ?? 0))
    || ((warmRank[b.warm?.status] ?? 0) - (warmRank[a.warm?.status] ?? 0)));
}

export { personScore, technicalMatch };
