// "Ask HN: Who is hiring?" — public, keyless, dated, and written by people who
// are actively recruiting. Reuses career-ops' hackernews provider helpers.
import { stripHtml } from '../lib/text.mjs';
import { parseDate } from '../lib/dates.mjs';
import { companyFromPipeHeader } from '../extractors/company.mjs';

const SEARCH = 'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5';
const ITEM = (id) => `https://hn.algolia.com/api/v1/items/${id}`;
const THREAD_RE = /ask\s+hn[:\s]+who\s+is\s+hiring/i;
const ENGINEERING = /\b(engineer|developer|sde|swe|software|backend|back[- ]end|ai|ml|llm|full[- ]?stack|forward deployed|solutions)\b/i;

export const collector = {
  id: 'hn',

  async discover({ cfg, http, days, now = new Date() }) {
    const search = await http.getJson(SEARCH);
    const threads = (search?.hits || []).filter((h) => THREAD_RE.test(h.title || '')).slice(0, 2);
    if (!threads.length) throw new Error('could not find an "Ask HN: Who is hiring?" thread');
    const cutoff = now.getTime() - days * 864e5;
    const raw = [];
    for (const t of threads) {
      // The second-newest thread only matters while the window still reaches into it.
      if (raw.length && Date.parse(t.created_at) + 31 * 864e5 < cutoff) break;
      const item = await http.getJson(ITEM(t.objectID));
      for (const c of item?.children || []) {
        if (!c || c.deleted || c.dead || !c.text) continue;
        const created = Date.parse(c.created_at);
        if (!Number.isNaN(created) && created < cutoff) continue;
        raw.push({ id: c.id, author: c.author, createdAt: c.created_at, html: c.text });
        if (raw.length >= cfg.sources.hn.max_comments) break;
      }
    }
    return { raw, errors: [] };
  },

  normalize(r) {
    const plain = stripHtml(r.html.replace(/<a\s[^>]*href="([^"]+)"[^>]*>.*?<\/a>/gi, ' $1 '));
    const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    const header = lines[0];
    if (!ENGINEERING.test(plain)) return null;
    const parts = header.split('|').map((x) => x.trim());
    const company = companyFromPipeHeader(header);
    return {
      source: 'hn',
      kind: 'hn',
      sourceUrl: `https://news.ycombinator.com/item?id=${r.id}`,
      title: header.slice(0, 200),
      text: plain.slice(0, 2500),
      snippet: '',
      publishedAt: parseDate(r.createdAt)?.toISOString() ?? null,
      location: parts.slice(1).find((p) => /remote|onsite|hybrid|,\s*[A-Z]{2}\b|new york|nyc|san francisco|london|berlin/i.test(p)) || '',
      companyName: company?.name || '',
      metadata: { hnUser: r.author },
    };
  },
};
