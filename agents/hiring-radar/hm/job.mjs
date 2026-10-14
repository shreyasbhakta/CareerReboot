// Job details for Search HM: title, company, team, location, "reports to" and
// any people the posting itself names, read from the posting's own sources
// (ATS public API, schema.org JobPosting, page meta). LinkedIn is never fetched.
import {
  jdHtmlToText, compactText, normalizeGreenhouseJob, normalizeLeverJob, normalizeAshbyJob, normalizeWorkdayJob,
} from '../../career-ops/browser-extract.mjs';
import { resolveAtsApi } from '../../career-ops/liveness-api.mjs';
import { rejectPrivateOrInvalid } from '../../career-ops/liveness-browser.mjs';
import { companyFromAtsUrl } from '../extractors/company.mjs';
import { extractNamedContact } from '../extractors/person.mjs';

const TEXT_CAP = 20_000;
const titleCase = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
const LEADER_WORD = /\b(manager|director|head|vp|vice president|lead|chief|cto|ceo|coo|founder|president|partner|principal)\b/i;
const GENERIC_EMAIL = /^(careers?|jobs?|recruit\w*|talent|hr|people|privacy|accommodations?|accessibility|no-?reply|info|support|hello|contact|apply|hiring|team|legal|security|press|admin)@/i;

export const isLinkedInUrl = (url) => { try { return /(^|\.)linkedin\.com$/i.test(new URL(url).hostname); } catch { return false; } };

/** linkedin.com/jobs/view/senior-backend-engineer-at-acme-corp-4012345678 -> {title, company} (no fetch). */
export function parseLinkedInJobUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const m = u.pathname.match(/\/jobs\/view\/([a-z0-9-]+?)-at-([a-z0-9-]+?)-(\d{6,})\/?$/i);
  return m ? { title: titleCase(decodeURIComponent(m[1])), company: titleCase(decodeURIComponent(m[2])) } : null;
}

/** Company from an ATS URL shape when the payload has none. */
export function companyFromUrl(url) {
  const ats = companyFromAtsUrl(url);
  if (ats) return ats.name;
  let u;
  try { u = new URL(url); } catch { return ''; }
  const wd = u.hostname.match(/^([\w-]+)\.wd[\w-]*\.myworkdayjobs\.com$/i);
  if (wd) return titleCase(wd[1]);
  const sr = u.hostname === 'jobs.smartrecruiters.com' && u.pathname.split('/').filter(Boolean)[0];
  if (sr) return titleCase(sr.replace(/\d+$/, ''));
  return '';
}

/** Every schema.org JobPosting in the page's JSON-LD blocks. */
export function parseJobPostingLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of String(html || '').matchAll(re)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
      const type = [].concat(node['@type'] || []);
      if (type.includes('JobPosting')) out.push(node);
    }
  }
  const p = out[0];
  if (!p) return null;
  const org = [].concat(p.hiringOrganization || [])[0] || {};
  const loc = [].concat(p.jobLocation || [])[0]?.address || {};
  return {
    title: str(p.title),
    company: str(typeof org === 'string' ? org : org.name),
    companyUrl: str(org.sameAs) || str(org.url),
    location: [str(loc.addressLocality), str(loc.addressRegion), str(loc.addressCountry?.name || loc.addressCountry)].filter(Boolean).join(', '),
    datePosted: str(p.datePosted),
    text: jdHtmlToText(p.description),
  };
}

/** "0020 PayPal, Inc." (Workday legal entity) -> "PayPal". */
export function cleanCompany(name) {
  return String(name || '').replace(/^\d+\s+/, '').replace(/,?\s+(inc|llc|l\.?l\.?c|ltd|corp|corporation|co|plc|pbc|gmbh|l\.?p)\.?$/i, '').trim();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Drop the " at Acme | Careers" tails page titles carry. */
export function cleanTitle(title, company) {
  let t = String(title || '').replace(/\s*[|–—]\s*(careers?|jobs?)\b.*$/i, '');
  if (company) t = t.replace(new RegExp(`\\s*(?:\\bat\\b|[-|@–—])\\s*${escapeRe(company)}\\b.*$`, 'i'), '');
  return t.replace(/^job application for\s+/i, '').trim();
}

export function metaContent(html, name) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i');
  const m = String(html || '').match(re);
  return str(m?.[1] ?? m?.[2]);
}

export function findTeam(text) {
  const t = String(text || '');
  const pats = [
    /^\s*(?:Team|Department|Org(?:anization)?|Function)\s*:\s*([^\n|]{2,60})$/im,
    /\b[Jj]oin (?:the|our) ([A-Z][\w&/+-]*(?:\s+[A-Z&][\w&/+-]*){0,4}) team\b/,
    /\b(?:on|in) the ([A-Z][\w&/+-]*(?:\s+[A-Z&][\w&/+-]*){0,4}) team\b/,
    /\bthe ([A-Z][\w&/+-]*(?:\s+[A-Z&][\w&/+-]*){0,4}) team (?:is|at|builds|owns)\b/,
  ];
  for (const re of pats) {
    const m = t.match(re);
    const team = m?.[1]?.trim().replace(/[.,;]+$/, '');
    if (team && !/^(our|the|a|this|engineering team)$/i.test(team)) return team;
  }
  return '';
}

/** "You will report to the Director of Platform Engineering" -> "Director of Platform Engineering". */
export function findReportsTo(text) {
  const m = String(text || '').match(/\breport(?:s|ing)?\s+(?:directly\s+)?(?:in)?to\s+(?:the\s+|our\s+|a\s+|an\s+)?([A-Z][A-Za-z&/+-]*(?:\s+(?:[A-Z][A-Za-z&/+-]*|of|and|for|&)){0,7})/);
  const title = m?.[1]?.trim().replace(/(\s+(?:of|and|for|&))+$/i, '');
  return title && LEADER_WORD.test(title) ? title : '';
}

/** People the posting names (contact lines, "posted by"). Never inferred. */
export function namedInText(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const c = extractNamedContact(line);
    if (c && !out.some((o) => o.name === c.name)) out.push({ ...c, quote: line.trim().slice(0, 200) });
  }
  return out;
}

export function personalEmails(text) {
  const all = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(all.map((e) => e.toLowerCase()))].filter((e) => !GENERIC_EMAIL.test(e)).slice(0, 10);
}

/** Map one ATS payload to structured fields; text/title come from career-ops' own normalizers. */
function fromAtsPayload(ats, json, parts, url) {
  if (ats === 'greenhouse') {
    const n = normalizeGreenhouseJob(json, url, TEXT_CAP);
    return n && { ...n, company: str(json.company_name), team: str(json.departments?.[0]?.name), location: str(json.location?.name), datePosted: str(json.first_published || json.updated_at) };
  }
  if (ats === 'lever') {
    const n = normalizeLeverJob(json, url, TEXT_CAP);
    const c = json?.categories || {};
    return n && { ...n, team: str(c.team) || str(c.department), location: str(c.location), datePosted: json.createdAt ? new Date(json.createdAt).toISOString() : '' };
  }
  if (ats === 'ashby') {
    const n = normalizeAshbyJob(json, parts.jobId, url, TEXT_CAP);
    const job = (json?.jobs || []).find((j) => String(j?.id).toLowerCase() === String(parts.jobId).toLowerCase()) || {};
    return n && { ...n, team: str(job.team) || str(job.department), location: str(job.location), datePosted: str(job.publishedAt) };
  }
  if (ats === 'workday') {
    const n = normalizeWorkdayJob(json, url, TEXT_CAP);
    const info = json?.jobPostingInfo || {};
    return n && { ...n, company: str(json?.hiringOrganization?.name), location: str(info.location), datePosted: str(info.startDate) };
  }
  return null;
}

async function fetchSmartRecruiters(http, url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname !== 'jobs.smartrecruiters.com') return null;
  const [company, slug] = u.pathname.split('/').filter(Boolean);
  const id = slug?.match(/^(\d+)/)?.[1];
  if (!company || !id || !/^[\w-]+$/.test(company)) return null;
  const j = await http.getJson(`https://api.smartrecruiters.com/v1/companies/${company}/postings/${id}`);
  const sections = j?.jobAd?.sections || {};
  const text = ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation'].map((k) => jdHtmlToText(sections[k]?.text)).filter(Boolean).join('\n\n');
  const loc = j?.location || {};
  return {
    title: str(j?.name), text: compactText(text, TEXT_CAP), company: str(j?.company?.name), team: str(j?.department?.label),
    location: [str(loc.city), str(loc.region), str(loc.country)].filter(Boolean).join(', '), datePosted: str(j?.releasedDate),
    // SmartRecruiters exposes who created the posting — a direct "posted by".
    postedBy: str(j?.creator?.name),
  };
}

/**
 * @param {{url: string, http: object, overrides?: {company?, title?, location?, team?, text?}}} args
 * @returns {Promise<{url, ats, title, company, team, location, datePosted, reportsTo, text, named: object[], emails: string[], postedBy, sources: string[], warnings: string[]}>}
 */
export async function fetchJob({ url, http, overrides = {} }) {
  const job = { url, ats: '', title: '', company: '', team: '', location: '', datePosted: '', text: '', postedBy: '', companyUrl: '', sources: [], warnings: [] };
  const merge = (src, label) => {
    if (!src) return;
    for (const k of ['title', 'company', 'team', 'location', 'datePosted', 'text', 'postedBy', 'companyUrl']) if (!job[k] && str(src[k])) job[k] = str(src[k]);
    job.sources.push(label);
  };

  const guard = rejectPrivateOrInvalid(url);
  if (guard) throw new Error(`Cannot use this URL: ${guard.reason}`);

  if (isLinkedInUrl(url)) {
    merge(parseLinkedInJobUrl(url), 'linkedin-url');
    if (!overrides.text) job.warnings.push('LinkedIn pages are never fetched. Paste the job description (and check its "Meet the hiring team" box yourself) for better results.');
  } else {
    const resolved = resolveAtsApi(url);
    if (resolved && ['greenhouse', 'lever', 'ashby', 'workday'].includes(resolved.ats)) {
      try {
        const apiUrl = resolved.ats === 'greenhouse' ? `${resolved.apiUrl}?content=true` : resolved.apiUrl;
        merge(fromAtsPayload(resolved.ats, await http.getJson(apiUrl), resolved.parts, url), `${resolved.ats}-api`);
        job.ats = resolved.ats;
      } catch (e) { job.warnings.push(`${resolved.ats} API: ${e.message}`); }
    }
    try {
      const sr = await fetchSmartRecruiters(http, url);
      if (sr) { merge(sr, 'smartrecruiters-api'); job.ats = 'smartrecruiters'; }
    } catch (e) { job.warnings.push(`SmartRecruiters API: ${e.message}`); }

    let html = '';
    try { html = await http.getText(url, { headers: { accept: 'text/html' } }); } catch (e) { if (!job.text) job.warnings.push(`Job page: ${e.message}`); }
    if (html) {
      merge(parseJobPostingLd(html), 'schema.org JobPosting');
      // Company career sites often embed Greenhouse (?gh_jid=…); its API names the department.
      const ghJid = new URL(url).searchParams.get('gh_jid');
      const ghBoard = html.match(/greenhouse\.io\/(?:embed\/job_board(?:\/js)?|embed\/job_app)\?for=([\w-]+)/i)?.[1];
      if (ghJid && ghBoard && !job.ats && /^\d+$/.test(ghJid)) {
        try {
          const gUrl = `https://job-boards.greenhouse.io/${ghBoard}/jobs/${ghJid}`;
          merge(fromAtsPayload('greenhouse', await http.getJson(`https://boards-api.greenhouse.io/v1/boards/${ghBoard}/jobs/${ghJid}?content=true`), {}, gUrl), 'greenhouse-api');
          job.ats = 'greenhouse';
        } catch (e) { job.warnings.push(`Greenhouse embed: ${e.message}`); }
      }
      const pageTitle = metaContent(html, 'og:title') || str(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]);
      merge({ title: pageTitle, company: metaContent(html, 'og:site_name'), text: job.text ? '' : compactText(jdHtmlToText(html), TEXT_CAP) }, 'page');
    }
    if (!job.company) job.company = companyFromUrl(url);
  }

  for (const k of ['company', 'title', 'location', 'team']) if (str(overrides[k])) job[k] = str(overrides[k]);
  job.company = cleanCompany(job.company);
  if (str(overrides.text)) { job.text = compactText(overrides.text, TEXT_CAP); job.sources.push('pasted description'); }

  job.title = cleanTitle(job.title, job.company);
  job.team ||= findTeam(job.text);
  job.reportsTo = findReportsTo(job.text);
  job.named = namedInText(job.text);
  job.emails = personalEmails(job.text);
  if (!job.company) job.warnings.push('Could not tell the company from this page. Fill in Company and search again.');
  if (!job.title) job.warnings.push('Could not tell the job title from this page. Fill in Title and search again.');
  return job;
}
