// Public web-search discovery. Queries are generated from configured roles,
// phrases and skills; the engine adapter (SearXNG / Brave) is isolated so
// adding another provider is one function.
import { termRegex } from '../lib/text.mjs';

const GROUP_OF_TERM = (cfg) => {
  const map = [];
  for (const [group, list] of Object.entries(cfg.technical.skills)) for (const s of list) for (const t of s.terms) map.push({ group, re: termRegex(t) });
  return (text) => map.find((m) => m.re.test(text))?.group;
};

/** Deterministic, priority-ordered, de-duplicated query list capped at max_queries. */
export function generateQueries(cfg) {
  const ws = cfg.sources.web_search;
  const targets = cfg.role_families.filter((f) => f.tier === 'target');
  const labels = targets.map((f) => f.label);
  const aiLabel = targets.find((f) => f.id === 'ai')?.label || labels[0];
  const backendLabel = targets.find((f) => f.id === 'backend')?.label || labels[0];
  const groupOf = GROUP_OF_TERM(cfg);
  const q = [];
  const add = (s) => { const t = s.replace(/\s+/g, ' ').trim(); if (t && !q.includes(t)) q.push(t); };
  const [firstLoc] = ws.location_terms;

  // 1. Direct first-person / team phrases per target role.
  for (const L of labels) add(`"${L}" hiring`);
  for (const L of labels) add(`"I'm hiring" "${L}"`);
  for (const L of labels) add(`"we're hiring" "${L}" ${firstLoc}`);
  // 2. Role x skill pairs (the skill picks the family via its group).
  for (const pair of ws.skill_pairs) {
    const fam = groupOf(pair) === 'ai' ? aiLabel : backendLabel;
    add(`"${fam}" hiring ${pair}`);
  }
  // 3. Generic team-expansion language.
  add(`"join our engineering team" AI`);
  add(`"we're hiring" engineer ${firstLoc}`);
  add(`"building out the engineering team" ${aiLabel}`);
  // 4. Site-scoped variants (LinkedIn posts etc.) for the most important phrasings.
  for (const site of ws.site_hints) {
    add(`site:${site} "I'm hiring" "${backendLabel}"`);
    add(`site:${site} "we're hiring" "${aiLabel}"`);
  }
  // 5. Remaining phrase x role x location combinations.
  for (const loc of ws.location_terms.slice(1)) for (const L of labels) add(`"hiring" "${L}" ${loc}`);
  for (const phrase of ws.phrases) for (const L of labels) add(`"${phrase}" "${L}"`);

  return q.slice(0, ws.max_queries);
}

const rangeFor = (days) => (days <= 1 ? 'day' : days <= 7 ? 'week' : days <= 31 ? 'month' : 'year');
const braveFresh = { day: 'pd', week: 'pw', month: 'pm', year: 'py' };

export const engines = {
  searxng: {
    ready: (env) => Boolean(env.SEARXNG_URL),
    async search(http, env, query, { days, count }) {
      const url = `${env.SEARXNG_URL.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json&time_range=${rangeFor(days)}`;
      const data = await http.getJson(url);
      return (data?.results || []).slice(0, count).map((r) => ({ url: r.url, title: r.title, snippet: r.content, date: r.publishedDate || r.published_date || null }));
    },
  },
  brave: {
    ready: (env) => Boolean(env.BRAVE_SEARCH_API_KEY),
    async search(http, env, query, { days, count }) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(count, 20)}&freshness=${braveFresh[rangeFor(days)]}`;
      const data = await http.getJson(url, { headers: { 'x-subscription-token': env.BRAVE_SEARCH_API_KEY } });
      return (data?.web?.results || []).slice(0, count).map((r) => ({
        url: r.url, title: r.title, snippet: (r.description || '').replace(/<[^>]+>/g, ''), date: r.page_age || r.age || null,
      }));
    },
  },
};

export const collector = {
  id: 'web-search',

  /** @returns {Promise<{raw: object[], errors: string[], skipped?: string, queries: number}>} */
  async discover({ cfg, http, env, cache, logger, days }) {
    const ws = cfg.sources.web_search;
    const available = ws.providers.filter((p) => engines[p]?.ready(env));
    if (!available.length) {
      return { raw: [], errors: [], queries: 0, skipped: 'no search provider configured (set SEARXNG_URL or BRAVE_SEARCH_API_KEY)' };
    }
    const queries = generateQueries(cfg);
    logger.info(`Source: web-search — providers: ${available.join(',')} — Queries: ${queries.length}`);
    const raw = [];
    const errors = [];
    let okQueries = 0;
    let consecutiveFails = 0;
    for (const query of queries) {
      // A dead backend fails every query; stop after a few instead of burning retries on all of them.
      if (consecutiveFails >= 3 && okQueries === 0) { errors.push(`aborted after ${consecutiveFails} consecutive failures`); break; }
      const cacheKey = `search|${available[0]}|${days}|${query}`;
      let results = cache?.get(cacheKey);
      if (!results) {
        let lastErr;
        for (const name of available) {
          try {
            results = await engines[name].search(http, env, query, { days, count: ws.results_per_query });
            cache?.set(cacheKey, results);
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            logger.debug(`search ${name} failed for "${query}": ${e.message}`);
          }
        }
        if (lastErr) { errors.push(`query "${query}": ${lastErr.message}`); consecutiveFails++; continue; }
        consecutiveFails = 0;
      }
      okQueries++;
      for (const r of results) raw.push({ ...r, query });
    }
    // If every single query failed, the source failed; partial failure is just reported.
    if (okQueries === 0 && queries.length) throw new Error(`search backend unreachable: ${errors.length} failed queries (${errors[0]})`);
    return { raw, errors, queries: queries.length };
  },

  /** Raw search hit -> candidate. Host allow-list keeps noise out. */
  normalize(r, { cfg }) {
    let host = '';
    try { host = new URL(r.url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
    const allowed = cfg.sources.web_search.allowed_hosts;
    if (!allowed.some((h) => host === h || host.endsWith(`.${h}`))) return null;
    const isJob = /\/jobs\/view\/|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|wellfound\.com\/jobs|wellfound\.com\/company|ziprecruiter|indeed\.com/.test(r.url);
    return {
      source: 'web-search',
      kind: isJob ? 'job' : 'post',
      sourceUrl: r.url,
      title: r.title || '',
      text: [r.title, r.snippet].filter(Boolean).join('\n'),
      snippet: r.snippet || '',
      publishedAt: r.date,
      location: '',
      metadata: { query: r.query, host },
    };
  },
};
