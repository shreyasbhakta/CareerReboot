// Role normalization and equivalence. Families, aliases and exclusions come
// from config; nothing about the candidate is hardcoded here.
import { reEscape } from '../lib/text.mjs';

export function normalizeRoleText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bback end\b/g, 'backend')
    .replace(/\bfront end\b/g, 'frontend')
    .replace(/\bfull stack\b/g, 'fullstack')
    .replace(/\bserver side\b/g, 'serverside')
    .trim();
}

// Trailing optional "s" so "backend engineers" matches the "backend engineer" alias.
const phraseRe = (phrase) =>
  new RegExp(`(?<![a-z0-9])${reEscape(normalizeRoleText(phrase)).replace(/ /g, '\\s+')}s?(?![a-z0-9])`, 'g');

/**
 * @param {object} cfg loaded config
 * @returns {{match(text: string, opts?: {isTitle?: boolean}): object, seniority(title: string): object}}
 */
export function createRoleMatcher(cfg) {
  const aliases = [];
  for (const fam of cfg.role_families) {
    for (const alias of fam.aliases) {
      aliases.push({ familyId: fam.id, label: fam.label, tier: fam.tier, alias: normalizeRoleText(alias), re: phraseRe(alias) });
    }
  }
  const exclusions = (cfg.exclude_roles || []).map((e) => ({ term: e, re: phraseRe(e) }));
  const tokenStart = (text, idx) => text.slice(0, idx).split(' ').length - 1;

  function match(text, { isTitle = false } = {}) {
    const norm = normalizeRoleText(text);
    let best = null;
    for (const a of aliases) {
      a.re.lastIndex = 0;
      let m;
      while ((m = a.re.exec(norm))) {
        const cand = { ...a, start: m.index, end: m.index + m[0].length };
        const better = !best
          || cand.alias.length > best.alias.length
          || (cand.alias.length === best.alias.length && cand.tier === 'target' && best.tier !== 'target')
          || (cand.alias.length === best.alias.length && cand.tier === best.tier && cand.start < best.start);
        if (better) best = cand;
        if (m[0].length === 0) a.re.lastIndex++;
      }
    }

    const hitsExclusion = (windowText) => exclusions.find((e) => { e.re.lastIndex = 0; return e.re.test(windowText); });

    if (best) {
      // Look at the role phrase plus ~3 tokens either side ("Software Engineer, Mobile").
      const tokens = norm.split(' ');
      const s = Math.max(0, tokenStart(norm, best.start) - 3);
      const e = tokenStart(norm, best.end) + 4;
      const windowText = isTitle ? norm : tokens.slice(s, e).join(' ');
      const ex = hitsExclusion(windowText);
      if (ex) return { matched: false, tier: 'excluded', familyId: null, canonical: null, alias: best.alias, excludedBy: ex.term };
      return { matched: true, tier: best.tier, familyId: best.familyId, canonical: best.label, alias: best.alias };
    }
    // No target role anywhere, but an excluded one is named: not for us (title or free text).
    const ex = hitsExclusion(norm);
    if (ex) return { matched: false, tier: 'excluded', familyId: null, canonical: null, alias: null, excludedBy: ex.term };
    return { matched: false, tier: 'unknown', familyId: null, canonical: null, alias: null };
  }

  const dropTerms = (cfg.seniority?.exclude_title_terms || []).map(phraseRe);
  const penaltyTerms = (cfg.seniority?.penalty_title_terms || []).map(phraseRe);
  function seniority(title) {
    const norm = normalizeRoleText(title);
    const test = (re) => { re.lastIndex = 0; return re.test(norm); };
    if (dropTerms.some(test)) return { drop: true, penalty: 0 };
    return { drop: false, penalty: penaltyTerms.some(test) ? cfg.seniority?.penalty_points ?? 0 : 0 };
  }

  return { match, seniority };
}
