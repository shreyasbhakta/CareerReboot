// Search HM research: turn one job into targeted public searches, read every
// hit for people tied to the company, and rank them by the evidence found.
// Rule zero (extractors/person.mjs) holds: a person appears only when a source
// attributes them; every lead carries the evidence and links behind it.
import { engines } from '../collectors/web-search.mjs';
import { mapLimit } from '../lib/http.mjs';
import { normalizeText, sha1 } from '../lib/text.mjs';
import { decodeEntities } from '../../career-ops/providers/_html-entities.mjs';
import {
  isPlausibleName, cleanLinkedInProfileUrl, parseProfileTitle, parsePostAuthor, extractNamedContact,
} from '../extractors/person.mjs';

const COMPANY_SUFFIX = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|pbc|gmbh|sa|ag|technologies|technology|labs|hq)\b/g;
// Words that can follow a company name without making it a different company ("Cohere AI", "Acme Group").
const SAME_COMPANY_TAIL = new Set(['ai', 'global', 'us', 'usa', 'na', 'team', 'careers', 'jobs']);
// Snippet text that is site chrome, not anything the person wrote.
const BOILERPLATE = /\b(log ?in|sign in|join now|sign up) to (linkedin|see|view|keep)|agree & join|by clicking continue|cookie policy|1 billion members/i;
// Phrases that say the person has left the company.
const DEPARTED = /\b(my time at|last day at|moving on from|farewell|said goodbye|no longer at|left \w+ (after|to))\b/i;
// LinkedIn activity ids and X status ids carry their creation time in the high bits.
const X_EPOCH = 1288834974657n;
const BRAND_WORDS = /\b(official|careers?|jobs|hiring|news|updates|team|og|fans?|hq|insider|daily|stock|investors?)\b/i;
const DAY_MS = 864e5;
// Students and interns can carry "lead" titles from clubs or internships; they don't own openings.
const STUDENT = /\b(student|intern|undergrad(uate)?)\b/i;
const SELF_STUDENT = /\bI(?: am|'m) an? [^.]{0,40}\bstudent\b/i;
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

/** Function by title; when the title says nothing ("Member of Technical Staff"), the description's most frequent function terms decide. */
export function pickFunction(title, hm, text = '') {
  const hit = (s, m) => s.includes(` ${normalizeText(m)}`);
  const t = ` ${normalizeText(title)} `;
  const byTitle = hm.functions.find((f) => f.match.some((m) => hit(t, m)));
  if (byTitle) return byTitle;
  const body = ` ${normalizeText(text).slice(0, 6000)} `;
  const count = (f) => f.match.reduce((n, m) => n + (body.split(` ${normalizeText(m)}`).length - 1), 0);
  const best = hm.functions.map((f) => [f, count(f)]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 3 ? best[0] : hm.default_function;
}

/** Employer named in a profile slot ("Title - Employer", "at Employer", "Experience: Employer"). */
export function employerPhrases(text) {
  const t = String(text || '');
  const out = [];
  for (const m of t.matchAll(/(?:\bat|@|Experience:)\s+([A-Z0-9][\w&.'’-]*(?:\s+[A-Z0-9&][\w&.'’-]*){0,3})/g)) out.push(m[1].split(/[.,;]\s/)[0]);
  return out;
}

/** "Cohere Health" when looking for "Cohere": same first words, more words that are not a legal suffix. */
export function isOtherCompany(phrase, company) {
  const key = companyKey(company);
  const p = companyKey(phrase);
  if (!key || !p.startsWith(`${key} `)) return false;
  return p.slice(key.length + 1).split(' ').some((w) => !SAME_COMPANY_TAIL.has(w));
}

/** Every mention of the company runs on into another capitalized word ("Cohere Health is hiring"). */
export function onlyLongerName(text, company) {
  const name = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const all = [...String(text).matchAll(new RegExp(`\\b${name}\\b(?:\\s+([A-Z][\\w&'’-]*))?`, 'gi'))];
  const sameCompany = (w) => SAME_COMPANY_TAIL.has(w.toLowerCase()) || !companyKey(w);
  return all.length > 0 && all.every((m) => m[1] && /^[A-Z]/.test(m[1]) && !sameCompany(m[1]));
}

/** The hit names a different employer that only shares the company's first word(s). */
function namesOtherCompany(phrases, company) {
  const relevant = phrases.filter((x) => mentionsCompany(x, company) || isOtherCompany(x, company));
  return relevant.length > 0 && relevant.every((x) => isOtherCompany(x, company));
}

/** Brand / fan accounts ("Palantir OG", "Acme Careers") are not people. */
export function looksLikeBrand(name, company) {
  // All-caps names are handles ("BIGDATA DOCTOR"); "AI" ends company page names ("Fast Code AI").
  return mentionsCompany(name, company) || BRAND_WORDS.test(name) || !/[a-z]/.test(name) || /\bAI$/.test(name);
}

/** Creation time encoded in a LinkedIn activity / X status URL, else null. */
export function timeFromUrl(url) {
  const li = String(url).match(/(?:activity[-:]|ugcPost[-:]|share[-:])(\d{18,20})/i)?.[1];
  if (li) return Number(BigInt(li) >> 22n);
  const x = String(url).match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d{15,20})/i)?.[1];
  return x ? Number((BigInt(x) >> 22n) + X_EPOCH) : null;
}

/** ISO date or "3 months ago" -> ms epoch, else null. */
export function hitTime(date, now = Date.now()) {
  if (!date) return null;
  const t = Date.parse(date);
  if (!Number.isNaN(t)) return t;
  const m = String(date).match(/(\d+)\s+(hour|day|week|month|year)s?\s+ago/i);
  const unit = { hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 };
  return m ? now - Number(m[1]) * unit[m[2].toLowerCase()] * DAY_MS : null;
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
  const fn = pickFunction(job.title, hm, job.text);
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
  const t = normalizeText(personTitle);
  // A talent director is a recruiter, not the team's manager.
  if (cfg.scoring.recruiter_titles.some((r) => t.includes(normalizeText(r)))) return ['recruiter_title'];
  if (ctx.leaders.slice(1).some((l) => hasAll(personTitle, l))) ev.push('leader_title');
  if (ctx.leaders[0] && hasAll(personTitle, ctx.leaders[0])) ev.push(ctx.leaders[0] === ctx.reportsTo ? 'reports_to_title' : 'leader_title');
  return ev;
}

function contextEvidence(text, ctx) {
  const ev = [];
  if (ctx.team && hasAll(text, ctx.team)) ev.push('team_match');
  // Where someone studied is not where they work.
  const work = String(text).replace(/Education:[^·|\n]*/gi, ' ').replace(/\b(University|College|School|Institute) of [A-Z][\w ]*/g, ' ');
  if (ctx.location && normalizeText(work).includes(normalizeText(ctx.location))) ev.push('location_match');
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
  const pos = t.match(/^(.{3,60}?)['’]s?\s+Post\b/i)?.[1]?.trim();
  if (pos) return isPlausibleName(pos) ? pos : null;
  const tail = t.split(/\s+[|]\s+/).pop()?.trim();
  return tail && isPlausibleName(tail) ? tail : null;
}

const SNIPPET_PERSON = /\b([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’.-]+){1,2}),\s+(?:the\s+|our\s+)?((?:[A-Z][\w&/-]*\s+){0,4}(?:Manager|Director|Head of [A-Z][\w&/ -]{2,40}|VP[\w ,&-]{0,40}|Vice President[\w ,&-]{0,40}|Lead|Recruiter|Talent Partner|CTO|Chief [A-Z]\w+ Officer)(?:,? (?:of|for) [A-Z][\w&/ -]{2,40})?)/g;

/**
 * One search hit -> zero or more {name, title, profileUrl, evidence[], quote}.
 * @param {{url, title, snippet, provider, query}} hit
 */
// Exa returns Markdown: keep link text, drop link targets and heading marks.
const clean = (s) => decodeEntities(decodeEntities(String(s || '')).replace(/<[^>]+>/g, ''))
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/(^|\s)#{1,6}\s/g, ' ').replace(/\s+/g, ' ').trim();

/** "Jane Doe Head of X @Acme London, England, United Kingdom (GB) 500 connections … About …" -> "Head of X @Acme London". */
export function exaHeadline(snippet, name) {
  return String(snippet || '').replace(name, '')
    .split(/[.\n|]|\s\d[\d,]*\+? (?:connections|followers)\b|\sAbout\s/)[0]
    // The city can't be told apart from the headline's last words; the region and country after it can.
    .replace(/(?:,[^,()]*)*\s*\([A-Z]{2}\)\s*$/, '')
    .trim().slice(0, 140);
}

export function peopleFromHit(rawHit, ctx, cfg, now = Date.now()) {
  const snippet = clean(rawHit.snippet);
  const hit = { ...rawHit, title: clean(rawHit.title), snippet: BOILERPLATE.test(snippet) ? '' : snippet };
  const text = `${hit.title}\n${hit.snippet}`;
  if (namesOtherCompany(employerPhrases(text), ctx.company) || DEPARTED.test(text)) return [];
  const atCompany = mentionsCompany(text, ctx.company);
  const at = timeFromUrl(hit.url) ?? hitTime(hit.date, now);
  const dated = at ? `[${new Date(at).toISOString().slice(0, 10)}] ` : '';
  const isLinkedIn = /linkedin\.com/i.test(hit.url);
  const isPost = /linkedin\.com\/(posts|feed\/update|pulse)\/|(x|twitter)\.com\/[^/]+\/status\//i.test(hit.url);
  const out = [];
  const push = (p) => {
    if (p.name && isPlausibleName(p.name) && !looksLikeBrand(p.name, ctx.company)) out.push({ ...p, source: hit.provider, url: hit.url, quote: `${dated}${hit.snippet || hit.title}`.slice(0, 240), query: hit.query });
  };

  const profileUrl = cleanLinkedInProfileUrl(hit.url);
  // On a profile page every name is the owner's or a colleague's; "Contact: Name" parsing is for postings and pages.
  const named = profileUrl ? null : extractNamedContact(text);
  if (named && atCompany) push({ name: named.name, title: named.title, evidence: ['named_in_posting', 'profile_at_company', ...titleEvidence(named.title, ctx, cfg)] });

  if (isPost) {
    const name = postAuthorFromTitle(hit.title);
    if (!name) return out;
    if (onlyLongerName(text, ctx.company)) return out;
    const aboutJob = normalizeText(text).includes(normalizeText(ctx.title));
    const hiring = HIRING_WORDS.test(text);
    // An old hiring post is about an earlier opening; it says nothing about who owns this one.
    if (at !== null && now - at > cfg.hm_search.post_max_age_days * DAY_MS) return out;
    const ev = aboutJob && at !== null && (atCompany || hiring) ? ['posted_this_job'] : hiring && atCompany ? ['hiring_post'] : [];
    if (!ev.length) return out;
    push({ name, title: '', profileUrl: postProfileUrl(hit.url), evidence: [...ev, ...(atCompany ? ['profile_at_company'] : []), ...contextEvidence(text, ctx)] });
    return out;
  }

  if (profileUrl) {
    let p = parseProfileTitle(hit.title);
    // Exa's people index titles a profile with the bare name; the headline is in the text.
    if (!p) {
      const bare = String(hit.title || '').split(/\s+[|–-]\s+/)[0].trim();
      if (isPlausibleName(bare)) p = { name: bare, title: '', company: '' };
    }
    if (p && !p.title) p = { ...p, title: exaHeadline(hit.snippet, p.name) };
    if (!p || !atCompany || FORMER.test(`${p.title} ${p.company}`) || STUDENT.test(p.title) || SELF_STUDENT.test(hit.snippet)) return out;
    if (p.company && !mentionsCompany(p.company, ctx.company) && !mentionsCompany(p.title, ctx.company)) return out;
    if ([p.company, p.title].some((x) => isOtherCompany(x, ctx.company))) return out;
    // A common team word ("Delta", "Modeling") in a profile's About text is not their team; the headline is.
    const ev = contextEvidence(text, ctx).filter((e) => e !== 'team_match' || hasAll(p.title, ctx.team));
    push({ name: p.name, title: p.title, profileUrl, evidence: ['profile_at_company', ...titleEvidence(p.title, ctx, cfg), ...ev] });
    return out;
  }

  // Company team pages, blogs, news: "Jane Doe, Director of Engineering" next to the company name.
  if (!atCompany || isLinkedIn || onlyLongerName(text, ctx.company)) return out;
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
    // One evidence row per source, listing everything that source showed.
    let row = c.evidence.find((e) => e.url === p.url);
    if (!row) { row = { url: p.url, source: p.source, quote: p.quote, types: [], labels: [] }; c.evidence.push(row); }
    for (const type of p.evidence) if (!row.types.includes(type)) { row.types.push(type); row.labels.push(EVIDENCE_LABEL[type] || type); }
    byName.set(k, c);
  }
  const pts = hm.evidence_points;
  const out = [];
  for (const c of byName.values()) {
    const types = new Set(c.evidence.flatMap((e) => e.types));
    let score = [...types].reduce((s, t) => s + (pts[t] || 0), 0);
    score += Math.min(3, Math.max(0, new Set([...c.sources].map((s) => s.split('|')[1])).size - 1)) * pts.extra_source;
    score = Math.min(100, score);
    if (score < hm.min_points) continue;
    const role = types.has('recruiter_title') ? 'recruiter'
      : types.has('leader_title') || types.has('reports_to_title') ? 'hiring_manager'
        : types.has('posted_this_job') || types.has('named_in_posting') || types.has('hiring_post') ? 'poster' : 'team';
    const confidence = score >= hm.confidence.high ? 'high' : score >= hm.confidence.medium ? 'medium' : 'low';
    const weight = (e) => e.types.reduce((n, t) => n + (pts[t] || 0), 0);
    c.evidence.sort((a, b) => weight(b) - weight(a));
    out.push({ name: c.name, title: c.title, profileUrl: c.profileUrl, email: c.email || null, role, score, ruleScore: score, confidence, evidence: c.evidence, sourceCount: c.sources.size });
  }
  out.sort((a, b) => b.score - a.score || b.sourceCount - a.sourceCount);
  return out.slice(0, hm.max_candidates).map((c, i) => ({ id: `c${i + 1}`, ...c }));
}

// ---- providers ----------------------------------------------------------------------------

export function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

// Bad key / out of credits: skip the provider until the limit can have reset, not just for this search.
const OUT_OF_CREDIT = /\b(quota|credits?|usage limit|plan limit|exceeded your|payment required|insufficient)\b/i;

/** Per-search request budgets plus keys that hit a limit (remembered across searches in the cache, per key, so a new key is tried at once). */
export function createProviderPool(names, hm, cache, env = {}, now = Date.now()) {
  const left = Object.fromEntries(names.map((p) => [p, hm.budgets[p] ?? 0]));
  const mark = (p) => `hm|exhausted|${p}|${sha1(String(env[engines[p]?.env || 'HUNTER_API_KEY'] || '')).slice(0, 12)}`;
  const exhausted = new Set(names.filter((p) => { const at = cache?.get(mark(p)); return at && now - at < hm.exhausted_hours * 36e5; }));
  const requests = {};
  const ok = {};
  return {
    available: (p) => !exhausted.has(p) && left[p] > 0,
    take(p) { left[p]--; requests[p] = (requests[p] || 0) + 1; },
    answered(p) { ok[p] = (ok[p] || 0) + 1; },
    /** A 429 that survived the HTTP retries ends this search for the provider; a bad key or spent credits end it for `exhausted_hours`. */
    fail(p, e) {
      const persistent = [401, 402, 403].includes(e?.status) || OUT_OF_CREDIT.test(e?.message || '');
      if (persistent || e?.status === 429) exhausted.add(p);
      if (persistent) cache?.set(mark(p), now);
    },
    exhausted: () => [...exhausted],
    requests,
    ok,
  };
}

/** One query down the failover chain: cached answers are free; empty answers and errors move on to the next provider. */
async function searchChain({ query, chain, pool, perQuery, http, env, cache, hm, errors, category }) {
  const hits = [];
  let answered = 0;
  for (const p of chain) {
    if (answered >= perQuery) break;
    const key = `hm|${p}|${query}`;
    let found = cache?.get(key);
    if (!found) {
      if (!pool.available(p)) continue;
      pool.take(p);
      try {
        found = await engines[p].search(http, env, query, { days: null, count: hm.results_per_query, category });
      } catch (e) {
        pool.fail(p, e);
        errors.push(`${p}: ${String(e?.message || e).slice(0, 160)}`);
        continue;
      }
      if (found.length) cache?.set(key, found);
    }
    pool.answered(p);
    if (!found.length) continue;
    answered++;
    hits.push(...found.map((h) => ({ ...h, provider: p, query })));
  }
  return hits;
}

async function hunterPeople({ http, env, job, ctx, cfg, pool }) {
  const domain = hostOf(job.companyUrl) || job.emails?.[0]?.split('@')[1] || '';
  const base = `https://api.hunter.io/v2/domain-search?${domain ? `domain=${encodeURIComponent(domain)}` : `company=${encodeURIComponent(job.company)}`}&limit=${cfg.hm_search.hunter_limit}&api_key=${encodeURIComponent(env.HUNTER_API_KEY.trim())}`;
  const depts = [ctx.hunterDepartment, ...cfg.hm_search.hunter_extra_departments].filter((d, i, a) => d && a.indexOf(d) === i);
  const people = [];
  for (const d of depts) {
    if (!pool.available('hunter')) break;
    pool.take('hunter');
    let data;
    try { data = await http.getJson(`${base}&department=${d}`); } catch (e) { pool.fail('hunter', e); throw e; }
    pool.answered('hunter');
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
 * @returns {Promise<{ctx, candidates, digDeeper, providers: {used: string[], failed: string[], missing: string[], exhausted: string[], requests: object}, queries: number, errors: string[]}>}
 */
export async function researchJob({ job, cfg, env, http, cache, logger }) {
  const hm = cfg.hm_search;
  const ctx = { ...queryContext(job, cfg), reportsTo: job.reportsTo };
  const webQueries = expandTemplates(hm.queries, ctx, hm.max_queries, hm.leaders_per_query);
  const exaQueries = expandTemplates(hm.exa_queries, ctx, hm.max_queries, hm.leaders_per_query);
  const searchProviders = hm.providers.filter((p) => engines[p]);
  const ready = searchProviders.filter((p) => engines[p].ready(env));
  const hunterOn = hm.providers.includes('hunter') && Boolean(env.HUNTER_API_KEY?.trim());
  const missing = [...searchProviders.filter((p) => !ready.includes(p)), ...(hm.providers.includes('hunter') && !hunterOn ? ['hunter'] : [])];
  const pool = createProviderPool([...ready, ...(hunterOn ? ['hunter'] : [])], hm, cache, env);
  // Exa takes plain-language people queries, so it answers its own list rather than standing in for a web engine.
  const webChain = ready.filter((p) => p !== 'exa');
  const errors = [];
  const people = [];

  for (const n of job.named || []) {
    people.push({ name: n.name, title: n.title, source: 'posting', url: job.url, quote: n.quote, evidence: ['named_in_posting', 'profile_at_company', ...titleEvidence(n.title, ctx, cfg)] });
  }
  if (job.postedBy && isPlausibleName(job.postedBy)) {
    people.push({ name: job.postedBy, title: '', source: 'posting', url: job.url, quote: `Posting created by ${job.postedBy} (${job.ats})`, evidence: ['named_in_posting', 'profile_at_company'] });
  }

  let queries = 0;
  const run = async (webQs, exaQs) => {
    const batch = [
      ...(webChain.length ? webQs.map((query) => ({ query, chain: webChain })) : []),
      ...(ready.includes('exa') ? exaQs.map((query) => ({ query, chain: ['exa'], category: 'people' })) : []),
    ];
    const one = (b) => searchChain({ ...b, pool, perQuery: hm.providers_per_query, http, env, cache, hm, errors });
    // The first query runs alone so a spent key costs one request, not one per worker.
    const res = [...await mapLimit(batch.slice(0, 1), 1, one), ...await mapLimit(batch.slice(1), 4, one)];
    for (const r of res) if (r.ok) for (const hit of r.value) people.push(...peopleFromHit(hit, ctx, cfg));
    queries += batch.length;
  };
  await run(webQueries, exaQueries);
  // Narrow (team, location) queries can come back empty; widen to company-level leaders before giving up.
  const fb = hm.fallback;
  // Recruiters alone don't satisfy the search: the manager is the lead that matters.
  if (rankCandidates(people, cfg).filter((c) => c.role !== 'recruiter').length < fb.below_candidates) {
    const all = ctx.leaders.length;
    await run(expandTemplates(fb.queries, ctx, fb.max_queries, all).filter((q) => !webQueries.includes(q)),
      expandTemplates(fb.exa_queries, ctx, fb.max_queries, all).filter((q) => !exaQueries.includes(q)));
  }
  if (hunterOn) {
    try { people.push(...await hunterPeople({ http, env, job, ctx, cfg, pool })); } catch (e) { errors.push(`hunter: ${e.message.slice(0, 160)}`); }
  }
  const tried = [...new Set([...Object.keys(pool.ok), ...Object.keys(pool.requests)])];
  logger.info(`Search HM: ${queries} queries; requests ${tried.map((p) => `${p}=${pool.requests[p]}`).join(' ') || 'none (all cached)'}${pool.exhausted().length ? `; out of quota: ${pool.exhausted().join(', ')}` : ''}`);

  // A provider is "used" when it answered at least once; "failed" when every request it made errored.
  const failed = tried.filter((p) => !pool.ok[p]);
  return {
    ctx,
    candidates: rankCandidates(people, cfg),
    digDeeper: digDeeperLinks(ctx, webQueries),
    providers: { used: tried.filter((p) => pool.ok[p]), failed, missing, exhausted: pool.exhausted(), requests: pool.requests },
    queries,
    errors: [...new Set(errors)].slice(0, 12),
  };
}
