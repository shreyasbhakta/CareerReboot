#!/usr/bin/env node
/**
 * scan-tech-trends.mjs — pulls current trending tech discussion from public,
 * no-auth-required APIs and prints a compact JSON digest for an LLM to turn
 * into a LinkedIn post angle. Zero dependencies (relies on Node 18+'s global
 * fetch). No scraping: both sources below are official public JSON APIs.
 *
 * Usage:
 *   node scan-tech-trends.mjs                # last 24h, top 15 per source
 *   node scan-tech-trends.mjs --hours 48 --limit 20
 *   node scan-tech-trends.mjs --topic "agentic AI"   # HN search instead of front-page
 */

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

const hours = Number(flag('hours', '24'));
const limit = Number(flag('limit', '15'));
const topic = flag('topic', null);

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchHackerNews() {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const base = 'https://hn.algolia.com/api/v1/search_by_date';
  const url = topic
    ? `${base}?query=${encodeURIComponent(topic)}&tags=story&numericFilters=created_at_i>${since}`
    : `${base}?tags=story&numericFilters=created_at_i>${since},points>50`;
  const data = await fetchJson(url);
  return (data.hits || [])
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .slice(0, limit)
    .map((h) => ({
      source: 'Hacker News',
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discussion_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points,
      comments: h.num_comments,
      created_at: h.created_at,
    }));
}

async function fetchDevTo() {
  // dev.to's public API; `top=N` = top articles over the last N days.
  const days = Math.max(1, Math.round(hours / 24));
  const url = `https://dev.to/api/articles?top=${days}&per_page=${limit}`;
  const data = await fetchJson(url);
  return (data || []).map((a) => ({
    source: 'DEV Community',
    title: a.title,
    url: a.url,
    discussion_url: a.url,
    points: a.public_reactions_count,
    comments: a.comments_count,
    tags: a.tag_list,
    created_at: a.published_at,
  }));
}

const results = await Promise.allSettled([fetchHackerNews(), fetchDevTo()]);
const items = [];
const errors = [];
for (const [i, r] of results.entries()) {
  const label = i === 0 ? 'Hacker News' : 'DEV Community';
  if (r.status === 'fulfilled') items.push(...r.value);
  else errors.push({ source: label, error: String(r.reason) });
}

items.sort((a, b) => (b.points || 0) - (a.points || 0));

console.log(JSON.stringify({ generated_at: new Date().toISOString(), window_hours: hours, topic, items, errors }, null, 2));
