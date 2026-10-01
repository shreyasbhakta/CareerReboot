// Person extraction. Rule zero: never invent a person. A name is only emitted
// when it is attributed by the source itself (post author, search-result title,
// an explicit "Hiring Manager: X" line) and passes plausibility checks.

const NAME_TOKEN = /^[A-Z][a-zA-Z'’.-]{1,24}$/;
const NOT_NAMES = new Set(['team', 'hiring', 'careers', 'jobs', 'engineering', 'recruiting', 'talent', 'company', 'linkedin', 'the', 'we', 'our', 'apply', 'join', 'staff', 'admin', 'support', 'hr', 'people', 'ai', 'labs', 'lab', 'inc', 'llc', 'ltd', 'technologies', 'software', 'systems', 'group', 'capital', 'bank', 'cloud', 'data', 'solutions', 'ventures', 'studio', 'studios', 'health', 'robotics', 'security', 'network', 'networks', 'platform', 'works']);

export function isPlausibleName(name) {
  if (!name) return false;
  const toks = name.trim().split(/\s+/);
  if (toks.length < 2 || toks.length > 4) return false;
  if (!toks.every((t) => NAME_TOKEN.test(t))) return false;
  return !toks.some((t) => NOT_NAMES.has(t.toLowerCase()));
}

export function cleanLinkedInProfileUrl(url) {
  const m = String(url || '').match(/^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#]+)/i);
  return m ? `https://www.linkedin.com/in/${m[1]}` : null;
}

/** "Jane Doe - VP Engineering - Example AI | LinkedIn" → {name,title,company} */
export function parseProfileTitle(raw) {
  const cleaned = String(raw || '').replace(/\s*[|\-–]\s*LinkedIn\s*$/i, '').trim();
  const parts = cleaned.split(/\s+[-–|]\s+/).map((x) => x.trim()).filter(Boolean);
  const name = parts[0];
  if (!isPlausibleName(name)) return null;
  const title = parts[1] || '';
  let company = parts[2] || '';
  const at = title.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
  if (at) return { name, title: at[1].trim(), company: at[2].trim() };
  return { name, title, company };
}

/** "Jane Doe on LinkedIn: We're hiring…" / "Jane Doe (@jane) on X: …" → author name. */
export function parsePostAuthor(title) {
  const m = String(title || '').match(/^(.{3,60}?)\s+(?:on\s+LinkedIn|\(@[\w.]+\)\s+on\s+X|on\s+X)\s*[:\-–]/i);
  if (!m) return null;
  const name = m[1].replace(/\s*[|\-–].*$/, '').trim();
  return isPlausibleName(name) ? name : null;
}

/** Explicit attribution inside a job description / post body. */
export function extractNamedContact(text) {
  const t = String(text || '');
  const m = t.match(/\b([Hh]iring [Mm]anager|[Rr]ecruiter|[Tt]alent [Pp]artner|[Ee]ngineering [Mm]anager|[Rr]each out to|[Cc]ontact)\s*[:\-–]\s*([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+){1,2})(?:\s*[,(–-]\s*([^).\n]{3,60}))?/);
  if (!m || !isPlausibleName(m[2])) return null;
  const labelTitle = /manager|recruiter|talent/i.test(m[1]) ? m[1].replace(/\b\w/g, (c) => c.toUpperCase()) : '';
  return { name: m[2], title: (m[3] || labelTitle || '').trim() };
}

export function classifyPersonTitle(title, cfg) {
  const t = String(title || '').toLowerCase();
  if (!t) return 'unknown';
  if (cfg.scoring.recruiter_titles.some((x) => t.includes(x))) return 'recruiter';
  if (cfg.scoring.leader_titles.some((x) => t.includes(x))) return 'leader';
  return 'other';
}

/**
 * Build the person object for a search/post result.
 * @returns {null | {name, title, url, source, confidence}}
 */
export function personFromResult({ title, snippet, url, firstPerson }) {
  const author = parsePostAuthor(title);
  const profile = parseProfileTitle(title);
  const named = extractNamedContact(`${title}\n${snippet}`);
  const profileUrl = cleanLinkedInProfileUrl(url);

  if (named) return { name: named.name, title: named.title, url: null, source: 'text', confidence: 'HIGH' };
  if (profile) {
    // A profile page itself is not a hiring act; association is inferred -> MEDIUM.
    return { name: profile.name, title: profile.title, url: profileUrl, source: 'profile', confidence: 'MEDIUM', company: profile.company };
  }
  if (author) {
    // Post author: first-person hiring text by the author is direct attribution.
    const title2 = (String(snippet || '').match(new RegExp(`${author}[^\\n]{0,20}?[,–-]\\s*([A-Za-z &/]{4,50}?)\\s+(?:at|@)\\s+`)) || [])[1] || '';
    return { name: author, title: title2, url: null, source: 'post-author', confidence: firstPerson ? 'HIGH' : 'MEDIUM' };
  }
  return null;
}
