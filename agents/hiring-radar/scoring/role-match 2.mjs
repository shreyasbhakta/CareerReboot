// Transparent technical match: role base + capped skill points − seniority
// penalty. Returns the full breakdown so the number is always explainable.
import { termRegex, clamp } from '../lib/text.mjs';

const cache = new WeakMap();
function compiledSkills(cfg) {
  if (!cache.has(cfg)) {
    const out = [];
    for (const [group, list] of Object.entries(cfg.technical.skills)) {
      for (const s of list) out.push({ group, name: s.name, points: s.points, res: s.terms.map(termRegex) });
    }
    cache.set(cfg, out);
  }
  return cache.get(cfg);
}

/**
 * @param {{role: {tier: string, canonical?: string}, text: string, title?: string, seniorityPenalty?: number}} input
 */
export function technicalMatch({ role, text, seniorityPenalty = 0 }, cfg) {
  const base = cfg.technical.role_base;
  const roleBase = role.tier === 'target' ? base.target : role.tier === 'adjacent' ? base.adjacent : role.tier === 'excluded' ? 0 : base.unknown;
  const breakdown = [];
  if (role.canonical) breakdown.push({ label: `Role: ${role.canonical} (${role.tier})`, points: roleBase });
  else breakdown.push({ label: `Role: unspecified (${role.tier})`, points: roleBase });

  const matched = [];
  for (const s of compiledSkills(cfg)) {
    if (s.res.some((re) => re.test(text))) matched.push(s);
  }
  const rawSkill = matched.reduce((a, s) => a + s.points, 0);
  const cap = cfg.technical.skill_points_cap;
  const scale = rawSkill > cap ? cap / rawSkill : 1;           // proportional so the breakdown still sums to the total
  for (const s of matched) breakdown.push({ label: s.name, group: s.group, points: Math.round(s.points * scale * 10) / 10 });
  if (seniorityPenalty) breakdown.push({ label: 'Seniority mismatch', points: -seniorityPenalty });

  const total = clamp(roleBase + Math.min(rawSkill, cap) - seniorityPenalty);
  return {
    score: Math.round(total),
    breakdown,
    matchedSkills: matched.map((s) => s.name),
    groups: [...new Set(matched.map((s) => s.group))],
  };
}
