// Company extraction with explicit confidence. A company is HIGH only when a
// structured source states it; text patterns and ATS slugs are MEDIUM; and we
// never infer a company from an arbitrary domain.

const BAD = new Set(['we', 'our', 'us', 'i', 'my', 'the', 'this', 'that', 'it', 'they', 'you', 'linkedin', 'hacker news', 'join', 'now', 'team', 'engineering']);

const ATS_HOST = [
  { re: /^(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io$/, slugAt: 0 },
  { re: /^jobs\.lever\.co$/, slugAt: 0 },
  { re: /^jobs\.ashbyhq\.com$/, slugAt: 0 },
  { re: /^apply\.workable\.com$/, slugAt: 0 },
  { re: /^[a-z0-9-]+\.bamboohr\.com$/, subdomain: true },
];

const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

export function companyFromAtsUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  for (const h of ATS_HOST) {
    if (!h.re.test(u.hostname)) continue;
    const slug = h.subdomain ? u.hostname.split('.')[0] : u.pathname.split('/').filter(Boolean)[h.slugAt];
    if (slug && !/^\d+$/.test(slug)) return { name: titleCase(decodeURIComponent(slug)), confidence: 'MEDIUM', source: 'ats-slug' };
  }
  return null;
}

const NAME = "([A-Z][\\w&.'’-]*(?:\\s+(?:[A-Z][\\w&.'’-]*|AI|of|and|&)){0,3})";
const TEXT_PATTERNS = [
  new RegExp(`${NAME}\\s+is\\s+hiring`),
  new RegExp(`${NAME}\\s+(?:are|is)\\s+(?:now\\s+)?(?:hiring|looking)`),
  new RegExp(`(?:hiring|joining|join(?:ing)?\\s+(?:us|our\\s+team|the\\s+team))\\s+(?:at|with)\\s+${NAME}`),
  new RegExp(`\\b(?:at|@)\\s+${NAME}(?=[\\s,.!)\\-–|]|$)`),
];

export function companyFromText(text) {
  const t = String(text || '');
  for (const re of TEXT_PATTERNS) {
    const m = t.match(re);
    const name = m?.[1]?.trim().replace(/[.,]+$/, '');
    if (name && name.length >= 2 && !BAD.has(name.toLowerCase())) return { name, confidence: 'MEDIUM', source: 'text' };
  }
  return null;
}

/** Hacker News header "Company | Role | Location": first cell is the company by convention. */
export function companyFromPipeHeader(line) {
  const parts = String(line || '').split('|').map((x) => x.trim());
  if (parts.length >= 3 && parts[0] && parts[0].length <= 60 && !/https?:/.test(parts[0])) {
    return { name: parts[0].replace(/\s*\(.*$/, '').trim(), confidence: 'MEDIUM', source: 'hn-header' };
  }
  return null;
}

export function resolveCompany({ structured, url, title, text }) {
  if (structured) return { name: structured, confidence: 'HIGH', source: 'structured' };
  return companyFromAtsUrl(url) || companyFromText(title) || companyFromText(text) || { name: '', confidence: 'LOW', source: 'unknown' };
}

const SITE_WORDS = /^(linkedin|indeed|glassdoor|ziprecruiter|workable|lever|greenhouse|ashby|wellfound|builtin|built in|jobs?|careers?|apply|remote|hybrid|onsite|new york|nyc)\b/i;
/**
 * Job-page titles come as "Role - Company", "Role at Company", "Company hiring Role",
 * "Role | Company | LinkedIn". Returns a company name or '' — never a guess from the domain.
 */
export function companyFromJobTitle(title) {
  const t = String(title || '').replace(/\s*[|\-–]\s*(LinkedIn|Indeed|Glassdoor|Workable|Lever|Greenhouse|Built In( NYC)?)\s*$/i, '').trim();
  let m = t.match(/^(.{2,50}?)\s+hiring\s+/i);
  if (m && !SITE_WORDS.test(m[1])) return m[1].trim();
  m = t.match(/\s+at\s+([A-Z][^|\-–(),]{1,45}?)\s*(?:[|\-–(]|$)/);
  if (m && !SITE_WORDS.test(m[1])) return m[1].trim();
  const parts = t.split(/\s+[-–|]\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].replace(/\s+(careers|jobs)$/i, '').replace(/\s*[•·].*$/, '').trim();
    // A tail that is a skill list, role phrase or location is not an employer.
    const notEmployer = /[,&/]|\b(engineer|engineering|developer|manager|remote|hybrid|ii|iii|senior|java|kotlin|python|spring|boot|rag|llm|ai|systems|agentic|full[- ]?time|contract|apply|usa|us|new york)\b/i;
    if (last.length >= 3 && last.length <= 40 && !SITE_WORDS.test(last) && !notEmployer.test(last)) return last;
  }
  return '';
}
