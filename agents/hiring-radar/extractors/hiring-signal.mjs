// Deterministic hiring-language classifier. Sentence-scoped so
// "We recently hired John. We're hiring a backend engineer." is a signal but
// "Excited to announce our new engineer." is not.

const compile = (list) => (list || []).map((p) => new RegExp(p, 'i'));

const cache = new WeakMap();
function patterns(cfg) {
  if (!cache.has(cfg)) {
    const s = cfg.signals;
    cache.set(cfg, {
      firstPerson: compile(s.strong_first_person),
      team: compile(s.strong_team),
      expansion: compile(s.team_expansion),
      weak: compile(s.weak),
      broad: compile(s.broad_scope),
      negative: compile(s.negative),
    });
  }
  return cache.get(cfg);
}

function splitSentences(text) {
  return String(text ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?\n])\s+|\s[|•·]\s/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const firstHit = (res, s) => { for (const re of res) { const m = s.match(re); if (m) return m[0]; } return null; };

/**
 * @param {string} text
 * @param {object} cfg
 * @param {{hasRole?: boolean}} [opts] hasRole: a target/adjacent role was extracted from the text.
 * @returns {{strength: string, directScore: number, signalType: string|null, phrases: string[], negatives: string[], broad: boolean}}
 */
export function classifyHiringText(text, cfg, { hasRole = false } = {}) {
  const p = patterns(cfg);
  const scores = cfg.signals.strength_scores;
  const phrases = [];
  const negatives = [];
  let fp = false, team = false, expansion = false, weak = false, broad = false;

  for (const sentence of splitSentences(text)) {
    const neg = firstHit(p.negative, sentence);
    if (neg) { negatives.push(neg); continue; }   // a negated sentence contributes nothing
    const f = firstHit(p.firstPerson, sentence);
    const t = firstHit(p.team, sentence);
    const x = firstHit(p.expansion, sentence);
    const w = firstHit(p.weak, sentence);
    const b = firstHit(p.broad, sentence);
    if (b) broad = true;
    if (f) { fp = true; phrases.push(f); }
    if (t) { team = true; phrases.push(t); }
    if (x) { expansion = true; phrases.push(x); }
    if (w && !f && !t && !x) { weak = true; phrases.push(w); }
  }

  let strength = 'none';
  if (fp) strength = hasRole ? 'first_person_role' : 'first_person';
  else if (team) strength = hasRole ? 'team_role' : 'team_generic';
  else if (expansion) strength = 'team_expansion';
  else if (weak) strength = 'weak';

  // "We're hiring across 20 departments" — real but non-specific. Without an
  // actual engineering role it is a weak signal, never a direct one.
  if (broad && !hasRole && strength !== 'none') strength = 'weak';

  const typeByStrength = {
    first_person_role: 'DIRECT_HIRING_POST',
    team_role: 'DIRECT_HIRING_POST',
    first_person: 'DIRECT_HIRING_POST',
    team_expansion: 'TEAM_EXPANSION',
    team_generic: 'HIRING_ANNOUNCEMENT',
    weak: 'HIRING_ANNOUNCEMENT',
    none: null,
  };
  return {
    strength,
    directScore: strength === 'none' ? 0 : scores[strength] ?? 0,
    signalType: typeByStrength[strength],
    phrases: [...new Set(phrases.map((x) => x.toLowerCase()))],
    negatives,
    broad,
  };
}
