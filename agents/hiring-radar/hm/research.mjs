// Search HM research: turn one job into targeted public searches, read every
// hit for people tied to the company, and rank them by the evidence found.
// Rule zero (extractors/person.mjs) holds: a person appears only when a source
// attributes them; every lead carries the evidence and links behind it.
import { engines } from '../collectors/web-search.mjs';
import { mapLimit } from '../lib/http.mjs';
import { normalizeText } from '../lib/text.mjs';
import {
  isPlausibleName, cleanLinkedInProfileUrl, parseProfileTitle, parsePostAuthor, extractNamedContact,
} from '../extractors/person.mjs';

const COMPANY_SUFFIX = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|sa|ag|technologies|technology|labs|hq)\b/g;
const FORMER = /\b(former(ly)?|ex-|previously|past|alum(nus|na|ni)?|retired)\b/i;
const HIRING_WORDS = /\b(hiring|we'?re looking|i'?m looking|join (my|our) team|open role|apply|opening|recruiting)\b/i;
const STOP = new Set(['the', 'and', 'of', 'for', 'a', 'an', 'to', 'in', 'at', 'team', 'senior', 'sr', 'junior', 'jr', 'staff', 'principal', 'lead', 'ii', 'iii', 'iv', 'i']);

const tokens = (s) => normalizeText(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t));
const hasAll = (hay, needle) => { const h = new Set(normalizeText(hay).split(' ')); const n = tokens(needle); return n.length > 0 && n.every((t) => h.has(t)); };

export function companyKey(name) {
  return normalizeText(name).replace(COMPANY_SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}
export function mentionsCompany(text, company) {
  const key = companyKey(company);
  if (!key) return false;
  const t = normalizeText(text);
  // "AcmeCorp" for "Acme Corp"; single-word keys need a word boundary so "Acme" never matches "Acmeville".
  return ` ${t} `.includes(` ${key} `) || (key.includes(' ') && t.replace(/\s/g, '').includes(key.replace(/\s/g, '')));
}

export function pickFunction(title, hm) {
  const t = ` ${normalizeText(title)} `;
  return hm.functions.find((f) => f.match.some((m) => t.includes(` ${normalizeText(m)}`))) || hm.default_function;
}

/** "Senior Software Engineer, Payments (Remote)" -> {core: "Senior Software Engineer", suffix: "Payments"}. */
export function splitTitle(title) {
  const noParens = String(title || '').replace(/\s*[([].*?[)\]]\s*/g, ' ').trim();
  const [core, ...rest] = noParens.split(/\s*,\s*|\s+[-–—|]\s+/);
  return { core: (core || '').trim(), suffix: rest.join(' ').trim() };
}

/** Everything the templates can use, derived once from the job. */
export function queryContext(job, cfg) {
  const hm = cfg.hm_search;
  const { core, suffix } = splitTitle(job.title);
  const fn = pickFunction(job.title, hm);
  const team = job.team || (suffix && !/remote|hybrid|onsite|\d/i.test(suffix) ? suffix : '');
  const leaders = [job.reportsTo, ...fn.leaders].filter((v, i, a) => v && a.findIndex((x) => normalizeText(x) === normalizeText(v)) === i);
  return {
    company: job.company, title: core || job.title, team, function: fn.label, hunterDepartment: fn.hunter_department || '',
    location: String(job.location || '').split(/[,;|·]/)[0].replace(/\b(remote|hybrid|on-?site)\b/ig, '').trim(),
    leaders,
  };
}

const fill = (tpl, vars) => {
  let ok = true;
  const q = tpl.replace(/\{(\w+)\}/g, (_, k) => { const v = vars[k]; if (!v) ok = false; return v || ''; });
  return ok ? q.replace(/\s+/g, ' ').trim() : null;
};

/** Round-robin over leader titles so a capped list still covers every template. */
export function expandTemplates(templates, ctx, max, leadersPerQuery) {
  const out = [];
  const add = (q) => { if (q && !out.includes(q)) out.push(q); };
  const leaders = ctx.leaders.slice(0, leadersPerQuery);
  for (let i = 0; i < Math.max(1, leaders.length); i++) {
    for (const tpl of templates) {
      const usesLeader = tpl.includes('{leader}');
      if (!usesLeader && i > 0) continue;
      add(fill(tpl, { ...ctx, leader: leaders[i] }));
    }
  }
  return out.slice(0, max);
}

// ---- reading one search hit -------------------------------------------------------------

function titleEvidence(personTitle, ctx, cfg) {
  const ev = [];
  if (!personTitle) return ev;
  if (ctx.leaders.slice(1).some((l) => hasAll(personTitle, l))) ev.push('leader_title');
  if (ctx.leaders[0] && hasAll(personTitle, ctx.leaders[0])) ev.push(ctx.leaders[0] === ctx.reportsTo ? 'reports_to_title' : 'leader_title');
  const t = normalizeText(personTitle);
  if (cfg.scoring.recruiter_titles.some((r) => t.includes(normalizeText(r)))) ev.push('recruiter_title');
  return ev;
}

function contextEvidence(text, ctx) {
  const ev = [];
  if (ctx.team && hasAll(text, ctx.team)) ev.push('team_match');
  if (ctx.location && normalizeText(text).includes(normalizeText(ctx.location))) ev.push('location_match');
  return ev;
}

const postProfileUrl = (url) => {
  const m = String(url).match(/linkedin\.com\/posts\/([a-z0-9-]+?)_/i);
  return m ? `https://www.linkedin.com/in/${m[1]}` : null;
};

/** "Jane Doe's Post" / "Jane Doe on LinkedIn: …" / "… | Jane Doe" -> author name. */
export function postAuthorFromTitle(title) {
  const t = String(title || '');
  const a = parsePostAuthor(t);
  if (a) return a;
  const pos = t.match(/^(.{3,60}?)['’]s Post\b/i)?.[1]?.trim();
  if (pos && isPlausibleName(pos)) return pos;
  const tail = t.split(/\s+[|]\s+/).pop()?.trim();
  return tail && isPlausibleName(tail) ? tail : null;
}

const SNIPPET_PERSON = /\b([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’.-]+){1,2}),\s+(?:the\s+|our\s+)?((?:[A-Z][\w&/-]*\s+){0,4}(?:Manager|Director|Head of [A-Z][\w&/ -]{2,40}|VP[\w ,&-]{0,40}|Vice President[\w ,&-]{0,40}|Lead|Recruiter|Talent Partner|CTO|Chief [A-Z]\w+ Officer)(?:,? (?:of|for) [A-Z][\w&/ -]{2,40})?)/g;

/**
 * One search hit -> zero or more {name, title, profileUrl, evidence[], quote}.
 * @param {{url, title, snippet, provider, query}} hit
 */
export function peopleFromHit(hit, ctx, cfg) {
  const text = `${hit.title || ''}\n${hit.snippet || ''}`;
  const atCompany = mentionsCompany(text, ctx.company);
  const isLinkedIn = /linkedin\.com/i.test(hit.url);
  const isPost = /linkedin\.com\/(posts|feed\/update|pulse)\/|(x|twitter)\.com\/[^/]+\/status\//i.test(hit.url);
  const out = [];
  const push = (p) => { if (p.name && isPlausibleName(p.name)) out.push({ ...p, source: hit.provider, url: hit.url, quote: (hit.snippet || hit.title || '').slice(0, 240), query: hit.query }); };

  const named = extractNamedContact(text);
  if (named && atCompany) push({ name: named.name, title: named.title, evidence: ['named_in_posting', 'profile_at_company', ...titleEvidence(named.title, ctx, cfg)] });

  if (isPost) {
    const name = postAuthorFromTitle(hit.title);
    if (!name) return out;
    const aboutJob = hasAll(text, ctx.title);
    const hiring = HIRING_WORDS.test(text);
    if (!atCompany && !aboutJob) return out;
    const ev = aboutJob && (atCompany || hiring) ? ['posted_this_job'] : hiring ? ['hiring_post'] : [];
    if (!ev.length) return out;
    push({ name, title: '', profileUrl: postProfileUrl(hit.url), evidence: [...ev, ...(atCompany ? ['profile_at_company'] : []), ...contextEvidence(text, ctx)] });
    return out;
  }

  const profileUrl = cleanLinkedInProfileUrl(hit.url);
  if (profileUrl) {
    let p = parseProfileTitle(hit.title);
    // Exa's people index titles a profile with the bare name; the headline is in the text.
    if (!p) {
      const bare = String(hit.title || '').split(/\s+[|–-]\s+/)[0].trim();
      if (isPlausibleName(bare)) p = { name: bare, title: String(hit.snippet || '').split(/[.\n|]/)[0].slice(0, 140), company: '' };
    }
    if (!p || !atCompany || FORMER.test(`${p.title} ${p.company}`)) return out;
    if (p.company && !mentionsCompany(p.company, ctx.company) && !mentionsCompany(p.title, ctx.company)) return out;
    push({ name: p.name, title: p.title, profileUrl, evidence: ['profile_at_company', ...titleEvidence(p.title, ctx, cfg), ...contextEvidence(text, ctx)] });
    return out;
  }

  // Company team pages, blogs, news: "Jane Doe, Director of Engineering" next to the company name.
  if (!atCompany || isLinkedIn) return out;
  for (const m of String(hit.snippet || '').matchAll(SNIPPET_PERSON)) {
    const ev = titleEvidence(m[2], ctx, cfg);
    if (ev.length) push({ name: m[1], title: m[2].trim(), evidence: ['profile_at_company', ...ev, ...contextEvidence(text, ctx)] });
  }
  return out;
}

// ---- merging + scoring ------------------------------------------------------------------

const EVIDENCE_LABEL = {
  named_in_posting: 'Named in the posting', posted_this_job: 'Posted about this job', hiring_post: 'Posted that the company is hiring',
  leader_title: 'Leader title for this kind of role', reports_to_title: 'Title matches who this role reports to', team_match: 'Same team as the job',
  recruiter_title: 'Recruiter / talent title', profile_at_company: 'Public profile ties them to the company', location_match: 'Same location as the job',
  staff_directory: 'Listed in the company staff directory (Hunter)',
};

export function personKey(p) {
  const slug = p.profileUrl?.match(/\/in\/([^/?#]+)/)?.[1];
  return slug ? `in:${slug.toLowerCase()}` : `name:${normalizeText(p.name)}`;
}

/** Merge per-hit people into candidates and score them. Same name = same person at one company. */
export function rankCandidates(people, cfg) {
  const hm = cfg.hm_search;
  const byName = new Map();
  for (const p of people) {
    const k = normalizeText(p.name);
    const c = byName.get(k) || { name: p.name, title: '', profileUrl: null, evidence: [], sources: new Set(), keys: new Set() };
    if (!c.title && p.title) c.title = p.title;
    if (!c.profileUrl && p.profileUrl) c.profileUrl = p.profileUrl;
    if (p.email) c.email = p.email;
    c.keys.add(personKey(p));
    c.sources.add(`${p.source}|${p.url}`);
    for (const type of p.evidence) {
      if (!c.evidence.some((e) => e.type === type && e.url === p.url)) c.evidence.push({ type, label: EVIDENCE_LABEL[type] || type, source: p.source, url: p.url, quote: p.quote });
    }
    byName.set(k, c);
  }
  const pts = hm.evidence_points;
  const out = [];
  for (const c of byName.values()) {
    const types = new Set(c.evidence.map((e) => e.type));
    let score = [...types].reduce((s, t) => s + (pts[t] || 0), 0);
    score += Math.min(3, Math.max(0, new Set([...c.sources].map((s) => s.split('|')[1])).size - 1)) * pts.extra_source;
    score = Math.min(100, score);
    if (score < hm.min_points) continue;
    const role = types.has('leader_title') || types.has('reports_to_title') ? 'hiring_manager'
      : types.has('recruiter_title') ? 'recruiter'
        : types.has('posted_this_job') || types.has('named_in_posting') || types.has('hiring_post') ? 'poster' : 'team';
    const confidence = score >= hm.confidence.high ? 'high' : score >= hm.confidence.medium ? 'medium' : 'low';
    // Strongest evidence first, one line per distinct (type, url).
    c.evidence.sort((a, b) => (pts[b.type] || 0) - (pts[a.type] || 0));
    out.push({ name: c.name, title: c.title, profileUrl: c.profileUrl, email: c.email || null, role, score, ruleScore: score, confidence, evidence: c.evidence, sourceCount: c.sources.size });
  }
  out.sort((a, b) => b.score - a.score || b.sourceCount - a.sourceCount);
  return out.slice(0, hm.max_candidates).map((c, i) => ({ id: `c${i + 1}`, ...c }));
}

// ---- providers ----------------------------------------------------------------------------

export function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

async function hunterPeople({ http, env, job, ctx, cfg }) {
  const domain = hostOf(job.companyUrl) || job.emails?.[0]?.split('@')[1] || '';
  const base = `https://api.hunter.io/v2/domain-search?${domain ? `domain=${encodeURIComponent(domain)}` : `company=${encodeURIComponent(job.company)}`}&limit=${cfg.hm_search.hunter_limit}&api_key=${encodeURIComponent(env.HUNTER_API_KEY.trim())}`;
  const depts = [ctx.hunterDepartment, ...cfg.hm_search.hunter_extra_departments].filter((d, i, a) => d && a.indexOf(d) === i);
  const people = [];
  for (const d of depts) {
    const data = await http.getJson(`${base}&department=${d}`);
    for (const e of data?.data?.emails || []) {
      const name = [e.first_name, e.last_name].filter(Boolean).join(' ');
      if (!isPlausibleName(name)) continue;
      people.push({
        name, title: e.position || '', profileUrl: cleanLinkedInProfileUrl(e.linkedin), email: e.value, source: 'hunter',
        url: e.sources?.[0]?.uri || `https://hunter.io/search/${data?.data?.domain || ''}`, quote: `${e.position || 'Staff'} · ${e.value} (Hunter confidence ${e.confidence ?? '?'})`,
        evidence: ['staff_directory', ...titleEvidence(e.position, ctx, cfg), ...contextEvidence(`${e.position} ${e.department}`, ctx)],
      });
    }
  }
  return people;
}

/** Links the user can open to keep digging by hand (search pages only; nothing is automated). */
export function digDeeperLinks(ctx, webQueries) {
  const g = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const links = webQueries.slice(0, 8).map((q) => ({ label: q, url: g(q) }));
  for (const l of ctx.leaders.slice(0, 2)) links.push({ label: `LinkedIn people search: ${l} at ${ctx.company}`, url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${l} ${ctx.company}`)}` });
  links.push({ label: `LinkedIn people search: recruiters at ${ctx.company}`, url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`recruiter ${ctx.company}`)}` });
  return links;
}

/**
 * @returns {Promise<{ctx, candidates, digDeeper, providers: {used: string[], missing: string[]}, queries: number, errors: string[]}>}
 */
export async function researchJob({ job, cfg, env, http, cache, logger }) {
  const hm = cfg.hm_search;
  const ctx = { ...queryContext(job, cfg), reportsTo: job.reportsTo };
  const webQueries = expandTemplates(hm.queries, ctx, hm.max_queries, hm.leaders_per_query);
  const exaQueries = expandTemplates(hm.exa_queries, ctx, hm.max_queries, hm.leaders_per_query);
  const searchProviders = hm.providers.filter((p) => engines[p]);
  const used = searchProviders.filter((p) => engines[p].ready(env));
  const hunterOn = hm.providers.includes('hunter') && Boolean(env.HUNTER_API_KEY?.trim());
  const missing = [...searchProviders.filter((p) => !used.includes(p)), ...(hm.providers.includes('hunter') && !hunterOn ? ['hunter'] : [])];
  const errors = [];
  const people = [];

  for (const n of job.named || []) {
    people.push({ name: n.name, title: n.title, source: 'posting', url: job.url, quote: n.quote, evidence: ['named_in_posting', 'profile_at_company', ...titleEvidence(n.title, ctx, cfg)] });
  }
  if (job.postedBy && isPlausibleName(job.postedBy)) {
    people.push({ name: job.postedBy, title: '', source: 'posting', url: job.url, quote: `Posting created by ${job.postedBy} (${job.ats})`, evidence: ['named_in_posting', 'profile_at_company'] });
  }

  const jobs = [];
  for (const p of used) for (const q of p === 'exa' ? exaQueries : webQueries) jobs.push({ provider: p, query: q });
  logger.info(`Search HM: ${jobs.length} queries across ${used.join(', ') || 'no search provider'}${hunterOn ? ' + hunter' : ''}`);

  const results = await mapLimit(jobs, 4, async ({ provider, query }) => {
    const key = `hm|${provider}|${query}`;
    let hits = cache?.get(key);
    if (!hits) {
      hits = await engines[provider].search(http, env, query, { days: null, count: hm.results_per_query, category: provider === 'exa' ? 'people' : undefined });
      if (hits.length) cache?.set(key, hits);
    }
    return hits.map((h) => ({ ...h, provider, query }));
  });
  results.forEach((r, i) => {
    if (!r.ok) { errors.push(`${jobs[i].provider}: ${String(r.error?.message || r.error).slice(0, 160)}`); return; }
    for (const hit of r.value) people.push(...peopleFromHit(hit, ctx, cfg));
  });

  if (hunterOn) {
    try { people.push(...await hunterPeople({ http, env, job, ctx, cfg })); } catch (e) { errors.push(`hunter: ${e.message.slice(0, 160)}`); }
  }

  const failedProviders = used.filter((p) => results.every((r, i) => jobs[i].provider !== p || !r.ok));
  return {
    ctx,
    candidates: rankCandidates(people, cfg),
    digDeeper: digDeeperLinks(ctx, webQueries),
    providers: { used: used.filter((p) => !failedProviders.includes(p)).concat(hunterOn ? ['hunter'] : []), failed: failedProviders, missing },
    queries: jobs.length,
    errors: [...new Set(errors)].slice(0, 12),
  };
}
