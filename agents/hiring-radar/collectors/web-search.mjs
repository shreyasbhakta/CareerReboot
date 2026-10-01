// Public web-search discovery. Queries are generated from configured roles,
// phrases and skills; the engine adapter (SearXNG / Brave) is isolated so
// adding another provider is one function.
import { termRegex } from '../lib/text.mjs';
import { companyFromJobTitle } from '../extractors/company.mjs';

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

  // Priority order — the list is capped at max_queries (default 8) to keep paid-API usage minimal.
  // 1. One plain query per target role.
  for (const L of labels) add(`"${L}" hiring`);
  // 2. Site-scoped first-person / team phrasing where hiring posts actually live.
  const [firstSite] = ws.site_hints;
  if (firstSite) {
    add(`site:${firstSite} "I'm hiring" "${backendLabel}"`);
    add(`site:${firstSite} "we're hiring" "${aiLabel}"`);
  }
  // 3. First-person per role, then role x skill pairs, then the rest.
  for (const L of labels) add(`"I'm hiring" "${L}"`);
  for (const pair of ws.skill_pairs) {
    const fam = groupOf(pair) === 'ai' ? aiLabel : backendLabel;
    add(`"${fam}" hiring ${pair}`);
  }
  for (const L of labels) add(`"we're hiring" "${L}" ${firstLoc}`);
  add(`"join our engineering team" AI`);
  add(`"building out the engineering team" ${aiLabel}`);
  for (const site of ws.site_hints.slice(1)) {
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
    ready: (env) => Boolean(env.SEARXNG_URL?.trim()),
    async search(http, env, query, { days, count }) {
      const url = `${env.SEARXNG_URL.trim().replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json&time_range=${rangeFor(days)}`;
      const data = await http.getJson(url);
      return (data?.results || []).slice(0, count).map((r) => ({ url: r.url, title: r.title, snippet: r.content, date: r.publishedDate || r.published_date || null }));
    },
  },
  brave: {
    ready: (env) => Boolean(env.BRAVE_SEARCH_API_KEY?.trim()),
    async search(http, env, query, { days, count }) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(count, 20)}&freshness=${braveFresh[rangeFor(days)]}`;
      const data = await http.getJson(url, { headers: { 'x-subscription-token': env.BRAVE_SEARCH_API_KEY.trim() } });
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
    const used = {};
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
            used[name] = (used[name] || 0) + 1;
            const r = await engines[name].search(http, env, query, { days, count: ws.results_per_query });
            // An empty answer usually means the engine is rate-limited/suspended (SearXNG's scraped
            // upstreams do this after a burst), so try the next provider before accepting "nothing".
            if (!r.length && name !== available[available.length - 1]) { logger.debug(`search ${name} returned nothing for "${query}"; trying next provider`); results = r; continue; }
            results = r;
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            logger.debug(`search ${name} failed for "${query}": ${e.message}`);
          }
        }
        if (results?.length) cache?.set(cacheKey, results);
        if (lastErr) { errors.push(`query "${query}": ${lastErr.message}`); consecutiveFails++; continue; }
        consecutiveFails = 0;
      }
      okQueries++;
      for (const r of results) raw.push({ ...r, query });
    }
    // If every single query failed, the source failed; partial failure is just reported.
    if (okQueries === 0 && queries.length) throw new Error(`search backend unreachable: ${errors.length} failed queries (${errors[0]})`);
    logger.info(`web-search requests: ${Object.entries(used).map(([k, v]) => `${k}=${v}`).join(' ') || 'none (all cached)'}`);
    return { raw, errors, queries: queries.length, providerRequests: used };
  },

  /** Raw search hit -> candidate. Host allow-list keeps noise out. */
  normalize(r, { cfg }) {
    let host = '';
    try { host = new URL(r.url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
    const allowed = cfg.sources.web_search.allowed_hosts;
    const prefixes = cfg.sources.web_search.allowed_host_prefixes || [];
    if (!allowed.some((h) => host === h || host.endsWith(`.${h}`)) && !prefixes.some((p) => host.startsWith(p))) return null;
    // Listing / SEO pages ("Browse 189 jobs in Manhattan Beach") describe no single opening.
    const dropRes = (cfg.sources.web_search.drop_title_patterns || []).map((p) => new RegExp(p, 'i'));
    if (dropRes.some((re) => re.test(r.title || '')) || /^browse\s/i.test(r.snippet || '')) return null;
    const company = companyFromJobTitle(r.title);
    const isJob = /^(careers|jobs|apply)\./.test(host) || /\/jobs\/view\/|builtin|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|wellfound\.com\/jobs|wellfound\.com\/company|ziprecruiter|indeed\.com/.test(r.url);
    return {
      source: 'web-search',
      kind: isJob ? 'job' : 'post',
      sourceUrl: r.url,
      title: r.title || '',
      text: [r.title, r.snippet].filter(Boolean).join('\n'),
      snippet: r.snippet || '',
      publishedAt: r.date,
      location: '',
      companyName: isJob ? company : undefined,
      metadata: { query: r.query, host },
    };
  },
};
