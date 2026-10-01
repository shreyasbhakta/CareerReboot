import { termRegex } from '../lib/text.mjs';

const US_STATE = /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;
const US_CITIES = ['san francisco', 'seattle', 'austin', 'boston', 'chicago', 'los angeles', 'denver', 'atlanta', 'washington', 'palo alto', 'mountain view', 'sunnyvale', 'san jose', 'san mateo', 'menlo park', 'redwood city', 'miami', 'dallas', 'houston', 'philadelphia', 'pittsburgh', 'san diego', 'portland', 'raleigh'];

const cache = new WeakMap();
function compiled(cfg) {
  if (!cache.has(cfg)) {
    const l = cfg.location;
    const pair = (terms) => terms.map((term) => ({ term, re: termRegex(term) }));
    cache.set(cfg, {
      home: pair(cfg.profile.home_locations || []),
      remote: pair(l.remote_terms),
      us: pair(l.us_terms),
      nonUs: pair(l.non_us_terms),
      usCities: pair(US_CITIES),
    });
  }
  return cache.get(cfg);
}

/**
 * @returns {{kind: 'home'|'remote_us'|'us_other'|'unknown'|'non_us', score: number, drop: boolean, matches: string[]}}
 *   `matches` are the location phrases found, so callers can store a short
 *   location string instead of a slice of the post body.
 */
export function classifyLocation(locationText, cfg) {
  const s = cfg.location.scores;
  const text = String(locationText || '').trim();
  const c = compiled(cfg);
  const hits = (list) => list.filter((x) => x.re.test(text)).map((x) => x.term);
  const home = hits(c.home), remote = hits(c.remote), nonUs = hits(c.nonUs), usTerms = hits(c.us), usCities = hits(c.usCities);
  const state = text.match(US_STATE)?.[0].replace(/^,\s*/, '');
  const us = usTerms.length > 0 || Boolean(state) || usCities.length > 0;
  const matches = [...new Set([...home, ...remote, ...usTerms, ...usCities, ...(state ? [state] : []), ...nonUs])].slice(0, 4);
  const out = (kind) => ({ kind, score: s[kind], drop: kind === 'non_us' && !!cfg.location.drop_non_us, matches });
  if (!text) return out('unknown');
  if (home.length) return out('home');
  if (remote.length && (us || !nonUs.length)) return out('remote_us');
  if (us) return out('us_other');
  if (nonUs.length) return out('non_us');
  return out('unknown');
}
