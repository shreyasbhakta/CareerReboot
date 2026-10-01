// Overall score = weighted sum of six 0-100 components. Every component and
// weight is returned so the final number can be audited.
import { clamp } from '../lib/text.mjs';
import { activityScore } from './activity.mjs';
import { technicalMatch } from './role-match.mjs';
import { classifyLocation } from './location.mjs';
import { classifyPersonTitle } from '../extractors/person.mjs';

export function personScore(person, cfg) {
  if (!person?.name) return 0;
  const ps = cfg.scoring.person_scores;
  const kind = classifyPersonTitle(person.title, cfg);
  const base = kind === 'leader' ? ps.leader_high : kind === 'recruiter' ? ps.recruiter_high : ps.other_high;
  const factor = person.confidence === 'HIGH' ? 1 : person.confidence === 'MEDIUM' ? ps.medium_factor : ps.low_factor;
  return Math.round(base * factor);
}

export function companyScore(company, text, cfg, { tracked = false } = {}) {
  const cr = cfg.scoring.company_relevance;
  if (!company?.name) return 0;
  let s = cr.base;
  const hay = `${company.name} ${text}`.toLowerCase();
  if (cr.domain_terms.some((t) => new RegExp(`(?<![a-z])${t}(?![a-z])`).test(hay))) s += cr.domain_bonus;
  if (tracked) s += cr.tracked_bonus;
  return clamp(s);
}

/**
 * Score a partially built signal. `signal` needs: role, text, title, person,
 * company, location, publishedAt, direct (classifier result), seniorityPenalty.
 */
export function scoreSignal(signal, cfg, { now = new Date(), tracked = false } = {}) {
  const haystack = `${signal.title || ''}\n${signal.text || ''}`;
  const tech = technicalMatch({ role: signal.role, text: haystack, seniorityPenalty: signal.seniorityPenalty || 0 }, cfg);
  const act = activityScore(signal.publishedAt, cfg, now);
  const loc = classifyLocation(signal.location || '', cfg);
  const comps = {
    technical: tech.score,
    activity: act.score,
    direct_language: signal.directScore ?? 0,
    person: personScore(signal.person, cfg),
    location: loc.score,
    company: companyScore(signal.company, haystack, cfg, { tracked }),
  };
  const w = cfg.scoring.weights;
  const overall = Math.round(Object.entries(w).reduce((a, [k, wt]) => a + (comps[k] ?? 0) * wt, 0));
  return {
    overall: clamp(overall),
    components: comps,
    weights: w,
    technicalBreakdown: tech.breakdown,
    matchedSkills: tech.matchedSkills,
    skillGroups: tech.groups,
    ageHours: act.ageHours,
    dateKnown: act.known,
    locationKind: loc.kind,
    dropLocation: loc.drop,
  };
}

export function overallConfidence(signal, s) {
  // HIGH: dated, role identified, company identified. LOW: missing two of the three.
  const have = [s.dateKnown, signal.role?.matched, signal.company?.name && signal.company.confidence !== 'LOW'].filter(Boolean).length;
  return have === 3 ? 'HIGH' : have === 2 ? 'MEDIUM' : 'LOW';
}
