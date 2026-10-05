import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cfg, NOW, silentLogger, ctx, PERSONA } from './helpers.mjs';
import { runScan } from '../scan.mjs';
import { generateQueries, collector as webSearch } from '../collectors/web-search.mjs';
import { collector as hn } from '../collectors/hn.mjs';
import { collector as jobsCollector, pickCompanies } from '../collectors/jobs.mjs';
import { detectSpikes, buildSignal } from '../pipeline.mjs';
import { buildDigest } from '../format/digest.mjs';
import { buildMessages, notify } from '../notify.mjs';
import { toPublicSignal } from '../format/json.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const dataDir = () => mkdtempSync(join(tmpdir(), 'hr-int-'));
const conns = join(ROOT, 'tests/fixtures/Connections.csv');
const base = (over = {}) => ({ cfg: cfg(), env: {}, now: NOW, logger: silentLogger, dataDir: dataDir(), connectionsPath: conns, ...over });
const opts = (o = {}) => ({ dryRun: false, sources: ['all'], ...o });

const post = (n, text, extra = {}) => ({ id: n, url: `https://linkedin.com/posts/p-${n}`, title: `Jane Doe on LinkedIn: ${text.slice(0, 30)}`, snippet: text, date: '2026-10-01T09:00:00Z', ...extra });
const fakeSearch = (raws) => ({
  id: 'web-search',
  discover: async () => ({ raw: raws, errors: [] }),
  normalize: (r) => (r?.url ? { source: 'web-search', kind: 'post', sourceUrl: r.url, title: r.title, text: `${r.title}\n${r.snippet}`, snippet: r.snippet, publishedAt: r.date, location: '', metadata: {} } : (() => { throw new Error('malformed record'); })()),
});

test('full scan over fake collectors writes TSV/JSON/MD, scores, finds people and warm intros', async () => {
  const deps = base({
    collectors: { 'web-search': fakeSearch([post(1, "I'm hiring a Forward Deployed Engineer at Example AI in New York. Python, RAG, LangGraph."), post(2, 'We recently hired Sam as designer.')]), hn: { id: 'hn', discover: async () => ({ raw: [], errors: [] }), normalize: () => null }, jobs: { id: 'jobs', discover: async () => ({ raw: [], errors: [] }), normalize: () => null } },
  });
  const res = await runScan(opts(), deps);
  assert.equal(res.summary.sourcesSuccessful.length, 3);
  assert.equal(res.summary.retained, 1);
  assert.equal(res.summary.filtered['excluded-role'], 1, 'designer is an excluded role');
  const s = res.digest.high[0];
  assert.equal(s.warm.status, 'WARM_INTRO_AVAILABLE', 'Jane Doe is a first-degree connection in the fixture');
  for (const f of ['hiring-signals.tsv', 'hiring-signals.json', 'hiring-radar.md']) assert.ok(existsSync(join(deps.dataDir, f)), f);
  const json = JSON.parse(readFileSync(join(deps.dataDir, 'hiring-signals.json'), 'utf8'));
  assert.equal(json.schema, 'hiring-radar/v1');
  assert.equal(json.signals[0].person.name, 'Jane Doe');
  assert.ok(!JSON.stringify(json).includes('janedoe@'), 'no emails');
  const md = readFileSync(join(deps.dataDir, 'hiring-radar.md'), 'utf8');
  assert.match(md, /# Hiring Radar/);
  assert.match(md, /🔥 High Signal/);
  assert.match(md, /Recommended action/);
  assert.match(md, /Suggested outreach angle \(draft only/);
});

test('second run deduplicates against history and leaves unread rows NEW', async () => {
  const deps = base({ collectors: { 'web-search': fakeSearch([post(1, "I'm hiring a backend engineer. Java, Kafka. New York.")]), hn: { id: 'hn', discover: async () => ({ raw: [], errors: [] }), normalize: () => null }, jobs: { id: 'jobs', discover: async () => ({ raw: [], errors: [] }), normalize: () => null } } });
  await runScan(opts(), deps);
  const r2 = await runScan(opts(), deps);
  assert.equal(r2.summary.deduplicated, 1);
  assert.equal(r2.summary.retained, 0);
  const tsv = readFileSync(join(deps.dataDir, 'hiring-signals.tsv'), 'utf8').trim().split('\n');
  assert.equal(tsv.length, 2, 'header + exactly one row');
  assert.ok(tsv[1].split('\t')[19] === 'NEW');
});

test('duplicate raw results inside one source collapse to one signal', async () => {
  const p = post(1, "We're hiring a backend engineer. Java. New York.");
  const deps = base({ collectors: { 'web-search': fakeSearch([p, { ...p, id: 2, url: p.url + '?utm_source=x' }]) } });
  const res = await runScan(opts({ sources: ['web-search'] }), deps);
  assert.equal(res.summary.deduplicated, 1);
  assert.equal(res.summary.retained, 1);
});

test('empty source is a successful empty scan, not a crash', async () => {
  const deps = base({ collectors: { 'web-search': fakeSearch([]) } });
  const res = await runScan(opts({ sources: ['web-search'] }), deps);
  assert.deepEqual(res.summary.sourcesSuccessful, ['web-search']);
  assert.equal(res.summary.discovered, 0);
  assert.match(res.markdown, /Nothing cleared the high-signal bar/);
});

test('a failed source does not stop the others, and is reported', async () => {
  const deps = base({ collectors: {
    'web-search': { id: 'web-search', discover: async () => { throw new Error('search provider exploded'); }, normalize: () => null },
    hn: { id: 'hn', discover: async () => ({ raw: [{}], errors: [] }), normalize: () => ({ source: 'hn', kind: 'hn', sourceUrl: 'https://news.ycombinator.com/item?id=1', title: 'Acme | Backend Engineer | New York', text: 'Acme | Backend Engineer | New York\nJava Kafka', publishedAt: '2026-10-01T08:00:00Z', location: 'New York', companyName: 'Acme', metadata: {} }) },
  } });
  const res = await runScan(opts({ sources: ['hiring-posts'] }), deps);
  assert.deepEqual(res.summary.sourcesFailed.map((f) => f.source), ['web-search']);
  assert.match(res.summary.sourcesFailed[0].error, /exploded/);
  assert.deepEqual(res.summary.sourcesSuccessful, ['hn']);
  assert.equal(res.summary.retained, 1);
});

test('malformed records are counted as errors and skipped; good ones survive', async () => {
  const deps = base({ collectors: { 'web-search': fakeSearch([null, {}, { url: 'not a url', title: 'x' }, post(9, "We're hiring a backend engineer. Java. New York.")].filter((x) => x !== null)) } });
  const res = await runScan(opts({ sources: ['web-search'] }), deps);
  assert.equal(res.summary.retained, 1);
  assert.ok(res.summary.errors.some((e) => /could not parse/.test(e)));
});

test('provider "skipped" (no search credentials) is reported as skipped, not failed', async () => {
  const deps = base({ collectors: { 'web-search': { id: 'web-search', discover: async () => ({ raw: [], errors: [], skipped: 'no search provider configured' }), normalize: () => null } } });
  const res = await runScan(opts({ sources: ['web-search'] }), deps);
  assert.equal(res.summary.sourcesFailed.length, 0);
  assert.equal(res.summary.sourcesSkipped[0].source, 'web-search');
});

test('dry run writes nothing', async () => {
  const deps = base({ collectors: { 'web-search': fakeSearch([post(1, "We're hiring a backend engineer. Java. New York.")]) } });
  const res = await runScan(opts({ dryRun: true, sources: ['web-search'] }), deps);
  assert.equal(res.summary.retained, 1);
  assert.equal(existsSync(join(deps.dataDir, 'hiring-signals.tsv')), false);
  assert.equal(existsSync(join(deps.dataDir, 'hiring-radar.md')), false);
});

test('stale posts, undated posts and non-US locations are filtered', async () => {
  const deps = base({ collectors: { 'web-search': fakeSearch([
    post(1, "We're hiring a backend engineer. Java. New York.", { date: '2026-08-01T00:00:00Z' }),
    post(2, "We're hiring a backend engineer. Java. New York.", { date: null }),
    post(3, "We're hiring a backend engineer in London, UK.", { date: '2026-10-01T08:00:00Z' }),
  ]) } });
  const res = await runScan(opts({ sources: ['web-search'] }), deps);
  assert.equal(res.summary.retained, 0);
  assert.deepEqual([res.summary.filtered.stale, res.summary.filtered['undated-post'], res.summary.filtered['non-us']], [1, 1, 1]);
});

test('--days clamps to the configured max (30)', async () => {
  const deps = base({ collectors: { 'web-search': fakeSearch([post(1, "We're hiring a backend engineer. Java. New York.", { date: '2026-09-10T00:00:00Z' })]) } });
  assert.equal((await runScan(opts({ sources: ['web-search'], days: 99 }), deps)).summary.retained, 1);
});

test('LLM failure never fails the scan', async () => {
  const deps = base({
    env: { MODEL_PROVIDER: 'openai', OPENAI_API_KEY: 'k'.repeat(20) },
    fetchImpl: async () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}), text: async () => '' }),
    sleep: async () => {},
    collectors: { 'web-search': fakeSearch([post(1, "Join our team! We need a backend engineer. Java. New York.")]) },
  });
  const res = await runScan(opts({ sources: ['web-search'] }), deps);
  assert.equal(res.summary.retained, 1);
});

// ---- collectors -----------------------------------------------------------------
test('query generation is config-driven, capped, unique, and covers each target role', () => {
  const c = cfg();
  assert.equal(c.sources.web_search.max_queries, 8, 'default keeps API usage minimal');
  assert.equal(generateQueries(c).length, 8);
  c.sources.web_search.max_queries = 40;
  const q = generateQueries(c);
  assert.ok(q.length <= c.sources.web_search.max_queries);
  assert.equal(new Set(q).size, q.length);
  for (const label of ['Forward Deployed Engineer', 'AI Engineer', 'Backend Engineer', 'Software Engineer']) assert.ok(q.some((x) => x.includes(label)), label);
  assert.ok(q.some((x) => /LangGraph/.test(x) && /AI Engineer/.test(x)), 'AI skill pairs use the AI role');
  c.role_families = c.role_families.filter((f) => f.id !== 'fde');
  assert.ok(!generateQueries(c).some((x) => x.includes('Forward Deployed')), 'removing a role from config removes its queries');
});
test('web search with no provider configured is skipped, with a clear reason', async () => {
  const r = await webSearch.discover({ cfg: cfg(), env: {}, http: {}, logger: silentLogger, days: 7 });
  assert.match(r.skipped, /SEARXNG_URL or BRAVE_SEARCH_API_KEY/);
});
test('web search: falls back to the next provider and caches results', async () => {
  const c = cfg();
  c.sources.web_search.max_queries = 2;
  const store = new Map();
  const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
  const urls = [];
  const http = { getJson: async (url) => { urls.push(url); if (url.includes('searx')) throw new Error('down'); return { web: { results: [{ url: 'https://linkedin.com/posts/a', title: 'T', description: 'D <b>x</b>', page_age: '2026-10-01T00:00:00Z' }] } }; } };
  const env = { SEARXNG_URL: 'http://searx', BRAVE_SEARCH_API_KEY: 'k'.repeat(20) };
  const r1 = await webSearch.discover({ cfg: c, env, http, logger: silentLogger, days: 7, cache });
  assert.equal(r1.raw.length, 2);
  const before = urls.length;
  await webSearch.discover({ cfg: c, env, http, logger: silentLogger, days: 7, cache });
  assert.equal(urls.length, before, 'second pass is fully cached');
});
test('web search: an EMPTY answer falls through to the next provider and empties are not cached', async () => {
  const c = cfg();
  c.sources.web_search.max_queries = 1;
  const store = new Map();
  const cache = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
  const hit = { url: 'https://linkedin.com/posts/a', title: 'T', description: 'D' };
  const http = { getJson: async (url) => (url.includes('brave') ? { web: { results: [] } } : { results: [{ url: hit.url, title: 'T', content: 'D' }] }) };
  const env = { SEARXNG_URL: 'http://searx', BRAVE_SEARCH_API_KEY: 'k'.repeat(20) };
  const r = await webSearch.discover({ cfg: c, env, http, logger: silentLogger, days: 7, cache });
  assert.equal(r.raw.length, 1, 'brave was empty -> searxng answered');
  const empty = { getJson: async () => ({ web: { results: [] }, results: [] }) };
  const store2 = new Map();
  await webSearch.discover({ cfg: c, env, http: empty, logger: silentLogger, days: 7, cache: { get: (k) => store2.get(k), set: (k, v) => store2.set(k, v) } });
  assert.equal(store2.size, 0, 'empty results are never cached');
});
test('web search: every query failing marks the source failed', async () => {
  const c = cfg();
  c.sources.web_search.max_queries = 2;
  await assert.rejects(webSearch.discover({ cfg: c, env: { SEARXNG_URL: 'http://x' }, http: { getJson: async () => { throw new Error('boom'); } }, logger: silentLogger, days: 7 }), /search backend unreachable/);
});
test('web search normalize keeps allowed hosts only and tags job pages', () => {
  const c = cfg();
  assert.equal(webSearch.normalize({ url: 'https://spam.example/x', title: 't' }, { cfg: c }), null);
  assert.equal(webSearch.normalize({ url: 'https://jobs.lever.co/acme/1', title: 't', snippet: 's' }, { cfg: c }).kind, 'job');
  assert.equal(webSearch.normalize({ url: 'https://www.linkedin.com/posts/a', title: 't', snippet: 's' }, { cfg: c }).kind, 'post');
  assert.equal(webSearch.normalize({ url: 'https://careers.benifex.com/j/1', title: 'Backend Engineer - Benifex', snippet: 's' }, { cfg: c }).companyName, 'Benifex', 'careers.* hosts are accepted');
  assert.equal(webSearch.normalize({ url: 'https://www.indeed.com/q-backend-jobs.html', title: 'Now Hiring: 100 Forward Deployed Engineer Jobs in Manhattan Beach, CA', snippet: 'Browse 189 jobs' }, { cfg: c }), null, 'aggregator listing pages are dropped');
  assert.equal(webSearch.normalize({ url: 'https://jobs.lever.co/acme/1', title: '1,727 Remote Backend Developer job openings', snippet: 's' }, { cfg: c }), null);
});
test('HN normalize parses header, company, and date; skips non-engineering', () => {
  const c = hn.normalize({ id: 7, author: 'founder1', createdAt: '2026-10-01T08:00:00Z', html: 'Acme Corp | Backend Engineer | New York, NY | REMOTE<p>We use Java &amp; Kafka. <a href="https://acme.example/jobs">apply</a>' });
  assert.equal(c.companyName, 'Acme Corp');
  assert.equal(c.sourceUrl, 'https://news.ycombinator.com/item?id=7');
  assert.match(c.location, /New York/);
  assert.equal(c.metadata.hnUser, 'founder1');
  assert.equal(hn.normalize({ id: 8, author: 'x', createdAt: '2026-10-01T08:00:00Z', html: 'Bakery | Head Baker | Paris' }), null);
});
test('HN discover: honours the window and fails loudly when the thread is missing', async () => {
  const mk = (children) => ({ getJson: async (u) => (u.includes('search_by_date') ? { hits: [{ objectID: '1', title: 'Ask HN: Who is hiring? (October 2026)', created_at: '2026-10-01T00:00:00Z' }] } : { children }) });
  const r = await hn.discover({ cfg: cfg(), http: mk([{ id: 1, text: 'a', created_at: '2026-10-01T01:00:00Z' }, { id: 2, text: 'b', created_at: '2026-09-01T01:00:00Z' }, { id: 3, deleted: true }]), days: 7, now: NOW });
  assert.deepEqual(r.raw.map((x) => x.id), [1]);
  await assert.rejects(hn.discover({ cfg: cfg(), http: { getJson: async () => ({ hits: [] }) }, days: 7, now: NOW }), /could not find/);
});
test('jobs rotation visits every company over successive days', () => {
  const list = Array.from({ length: 10 }, (_, i) => ({ name: `c${i}` }));
  const seen = new Set();
  for (let d = 0; d < 5; d++) pickCompanies(list, 4, new Date(Date.UTC(2026, 9, 1 + d))).forEach((c) => seen.add(c.name));
  assert.equal(seen.size, 10);
  assert.equal(pickCompanies(list, 20).length, 10);
});
test('jobs normalize maps provider output and carries the posting date', () => {
  const j = jobsCollector.normalize({ title: 'Backend Engineer', url: 'https://boards.greenhouse.io/a/jobs/1', company: 'A', location: 'NYC', postedAt: Date.parse('2026-10-01T05:00:00Z'), _provider: 'greenhouse' });
  assert.equal(j.publishedAt, '2026-10-01T05:00:00.000Z');
  assert.equal(j.kind, 'job');
  assert.equal(jobsCollector.normalize({ title: '', url: '' }), null);
});

// ---- spikes -----------------------------------------------------------------------
const job = (n, title, company = 'Acme', date = '2026-10-01T05:00:00Z', days = 7) => buildSignal({ source: 'jobs:greenhouse', kind: 'job', sourceUrl: `https://boards.greenhouse.io/acme/jobs/${n}`, title, text: title, location: 'New York, NY', publishedAt: date, companyName: company, metadata: {} }, ctx({ days })).signal;
test('spike: needs min jobs; without a baseline it only claims "several roles open"', () => {
  const c = cfg();
  const jobs = [job(1, 'Backend Engineer'), job(2, 'AI Engineer'), job(3, 'Forward Deployed Engineer')];
  assert.equal(detectSpikes({ jobSignals: jobs.slice(0, 2), history: [], knownKeys: new Set(), cfg: c, now: NOW }).length, 0);
  const out = detectSpikes({ jobSignals: jobs, history: [], knownKeys: new Set(), cfg: c, now: NOW });
  assert.equal(out.length, 1);
  assert.equal(out[0].signalType, 'NEW_ROLE_CLUSTER');
  assert.doesNotMatch(out[0].text, /expand|growth/i);
});
test('spike: with history baseline, an increase is COMPANY_HIRING_SPIKE and worded cautiously', () => {
  const c = cfg();
  const old = (n) => ({ ...job(100 + n, `Backend Engineer ${n}`, 'Acme', '2026-09-15T00:00:00Z', 30), discoveredAt: '2026-09-15T00:00:00Z', status: 'SEEN' });
  const history = [old(1), old(2)];
  const jobs = [job(1, 'Backend Engineer'), job(2, 'AI Engineer'), job(3, 'Forward Deployed Engineer'), job(4, 'Software Engineer')];
  const [spike] = detectSpikes({ jobSignals: jobs, history, knownKeys: new Set(), cfg: c, now: NOW });
  assert.equal(spike.signalType, 'COMPANY_HIRING_SPIKE');
  assert.match(spike.text, /^Recent hiring activity increased/);
});

// ---- digest / notify / json -------------------------------------------------------------
test('digest respects caps and per-company diversity; hides DISMISSED', () => {
  const c = cfg();
  c.output.digest = { primary: 2, secondary: 2 };
  const sigs = Array.from({ length: 6 }, (_, i) => ({ ...job(i, 'Backend Engineer', 'Acme'), status: i === 0 ? 'DISMISSED' : 'NEW', warm: { status: 'NO_CONNECTION', connections: [] } }));
  const d = buildDigest(sigs, c, { now: NOW, minScore: 0 });
  assert.ok(!d.ranked.some((s) => s.status === 'DISMISSED'));
  assert.ok(d.jobs.length + d.active.length + d.high.length <= 2, 'max_per_company=2 across tiers');
});
test('notifications are optional: off by default; when on, EVERY new result goes out with its score, chunked under 2000 chars', async () => {
  const c = cfg();
  const mkSig = (i, score, status = 'NEW') => { const x = { ...job(i, 'Backend Engineer', `Company${i}`), status, warm: { status: i === 1 ? 'WARM_INTRO_AVAILABLE' : 'NO_CONNECTION', connections: [] } }; x.scores.overall = score; return x; };
  const ranked = [mkSig(1, 95), ...Array.from({ length: 30 }, (_, i) => mkSig(i + 2, 70 - i)), mkSig(99, 80, 'SEEN')];
  const d = { ranked, high: [], active: [], freshIds: new Set(ranked.filter((x) => x.status === 'NEW').map((x) => x.id)) };
  assert.deepEqual(await notify({ digest: d, cfg: c, env: {}, http: {}, logger: silentLogger }), { sent: false, reason: 'disabled' });
  c.notify.enabled = true;
  assert.equal((await notify({ digest: d, cfg: c, env: {}, http: {}, logger: silentLogger })).reason, 'no webhook');
  const bodies = [];
  const http = { postJson: async (u, b) => { bodies.push(b.text); } };
  const r = await notify({ digest: d, cfg: c, env: { HIRING_RADAR_WEBHOOK_URL: 'https://hooks.test/x' }, http, logger: silentLogger, sleep: async () => {} });
  assert.equal(r.sent, true);
  assert.ok(bodies.length > 1, 'chunked into several messages');
  assert.ok(bodies.every((t) => t.length <= 1900));
  const all = bodies.join('\n');
  assert.equal((all.match(/Backend Engineer @/g) || []).length, 31, 'all 31 NEW results, not just a top few; SEEN ones are not re-announced');
  assert.match(all, /\*\*95\*\* Backend Engineer @ Company1.*warm intro/s);
  assert.ok(all.indexOf('**95**') < all.indexOf('**70**'), 'best score first');
  // scope "all" includes already-seen results; min_score trims
  c.notify.scope = 'all'; c.notify.min_score = 79;
  const sent2 = [];
  await notify({ digest: d, cfg: c, env: { HIRING_RADAR_WEBHOOK_URL: 'https://hooks.test/x' }, http: { postJson: async (u, b) => { sent2.push(b.text); } }, logger: silentLogger, sleep: async () => {} });
  assert.equal((sent2.join('\n').match(/Backend Engineer @/g) || []).length, 2);
  // heartbeat when nothing is new; silent when heartbeat off
  c.notify.scope = 'new';
  const quiet = { ranked: [mkSig(5, 70, 'SEEN')] };
  assert.match(buildMessages(quiet, c, { discovered: 100, deduplicated: 40 })[0], /no new results \(100 checked, 40 already seen\)/);
  c.notify.heartbeat = false;
  assert.deepEqual(buildMessages(quiet, c, {}), []);
  // a failing webhook never throws
  const failing = await notify({ digest: d, cfg: c, env: { HIRING_RADAR_WEBHOOK_URL: 'https://hooks.test/x' }, http: { postJson: async () => { throw new Error('nope'); } }, logger: silentLogger, sleep: async () => {} });
  assert.equal(failing.sent, false);
});
test('public JSON shape has the spec fields and no raw email', () => {
  const p = toPublicSignal({ ...job(1, 'Backend Engineer'), warm: { status: 'NO_CONNECTION', connections: [] } });
  for (const k of ['id', 'source', 'sourceUrl', 'signalType', 'person', 'company', 'role', 'location', 'text', 'publishedAt', 'discoveredAt', 'confidence', 'metadata']) assert.ok(k in p, k);
});

// ---- CLI / GitHub Actions command ---------------------------------------------------------------
const cli = (args, env = {}) => spawnSync(process.execPath, [join(ROOT, 'scan.mjs'), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, HIRING_RADAR_CONFIG: PERSONA, ...env } });

test('CLI: fixture dry run exits 0, prints scores, writes nothing', () => {
  const dir = dataDir();
  const r = cli(['--fixture', join(ROOT, 'tests/fixtures/posts.json'), '--days', '30', '--dry-run'], { HIRING_RADAR_DATA_DIR: dir, LINKEDIN_CONNECTIONS_CSV: conns });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY RUN/);
  assert.match(r.stdout, /Forward Deployed Engineer/);
  assert.match(r.stderr, /Sources attempted: fixture/);
  assert.equal(existsSync(join(dir, 'hiring-signals.tsv')), false);
});
test('CLI: normal fixture run writes the three outputs', () => {
  const dir = dataDir();
  const r = cli(['--fixture', join(ROOT, 'tests/fixtures/posts.json'), '--days', '30'], { HIRING_RADAR_DATA_DIR: dir });
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['hiring-signals.tsv', 'hiring-signals.json', 'hiring-radar.md']) assert.ok(existsSync(join(dir, f)), f);
});
test('CLI: malformed fixture file is a clean failure, bad flags exit non-zero with usage', () => {
  const dir = dataDir();
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{not json');
  assert.equal(cli(['--fixture', bad, '--dry-run'], { HIRING_RADAR_DATA_DIR: dir }).status, 1, 'every attempted source failed -> CI sees a failure');
  const unknown = cli(['--dryrun']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr + unknown.stdout, /unrecognized flag/);
  assert.notEqual(cli(['--source', 'nope']).status, 0);
  assert.notEqual(cli(['--days', 'abc']).status, 0);
});
test('CLI: invalid config exits 2 with a readable message', () => {
  const dir = dataDir();
  const f = join(dir, 'c.yml');
  writeFileSync(f, 'scoring:\n  min_score: 500\n');
  const r = cli(['--fixture', join(ROOT, 'tests/fixtures/posts.json'), '--dry-run'], { HIRING_RADAR_CONFIG: f, HIRING_RADAR_DATA_DIR: dir });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Invalid Hiring Radar configuration/);
  assert.match(r.stderr, /min_score must be 0-100/);
});
test('CLI never prints secrets from the environment', () => {
  const secret = 'sk-live-ABCDEFGH1234567890';
  const r = cli(['--fixture', join(ROOT, 'tests/fixtures/posts.json'), '--dry-run', '--verbose'], { OPENAI_API_KEY: secret, HIRING_RADAR_DATA_DIR: dataDir() });
  assert.ok(!(r.stdout + r.stderr).includes(secret));
});

test('set-status updates ledger and JSON, rejects bad input', async () => {
  const { setStatus } = await import('../set-status.mjs');
  const deps = base({ collectors: { 'web-search': fakeSearch([post(1, "We're hiring a backend engineer. Java. New York.")]) } });
  await runScan(opts({ sources: ['web-search'] }), deps);
  const json = JSON.parse(readFileSync(join(deps.dataDir, 'hiring-signals.json'), 'utf8'));
  const id = json.signals[0].id;
  setStatus(deps.dataDir, id, 'CONTACTED');
  assert.equal(JSON.parse(readFileSync(join(deps.dataDir, 'hiring-signals.json'), 'utf8')).signals[0].status, 'CONTACTED');
  assert.equal(readFileSync(join(deps.dataDir, 'hiring-signals.tsv'), 'utf8').split('\n')[1].split('\t')[19], 'CONTACTED');
  assert.throws(() => setStatus(deps.dataDir, id, 'BOGUS'), /status must be/);
  assert.throws(() => setStatus(deps.dataDir, 'nope', 'SEEN'), /no signal/);
});
test('CLI --check-config validates an override file', () => {
  const dir = dataDir();
  const good = join(dir, 'g.yml'); writeFileSync(good, 'recency:\n  default_days: 5\n');
  const bad = join(dir, 'b.yml'); writeFileSync(bad, 'scoring:\n  min_score: 999\n');
  assert.equal(cli(['--check-config', good]).status, 0);
  const r = cli(['--check-config', bad]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /min_score/);
});

test('set-status --all resets every row (TSV and JSON)', async () => {
  const { setAllStatus, setStatus } = await import('../set-status.mjs');
  const deps = base({ collectors: { 'web-search': fakeSearch([post(1, "We're hiring a backend engineer. Java. New York."), post(2, "I'm hiring an AI engineer. RAG. New York.")]) } });
  await runScan(opts({ sources: ['web-search'] }), deps);
  const id = JSON.parse(readFileSync(join(deps.dataDir, 'hiring-signals.json'), 'utf8')).signals[0].id;
  setStatus(deps.dataDir, id, 'DISMISSED');
  assert.equal(setAllStatus(deps.dataDir, 'NEW'), 2);
  const rows = readFileSync(join(deps.dataDir, 'hiring-signals.tsv'), 'utf8').trim().split('\n').slice(1);
  assert.ok(rows.every((r) => r.split('\t')[19] === 'NEW'));
  assert.ok(JSON.parse(readFileSync(join(deps.dataDir, 'hiring-signals.json'), 'utf8')).signals.every((s) => s.status === 'NEW'));
});

test('connections added later are matched against already-saved signals on the next run', async () => {
  const collectors = { 'web-search': fakeSearch([post(1, "I'm hiring a Forward Deployed Engineer at Example AI in New York. Python.")]) };
  const dir = dataDir();
  await runScan(opts({ sources: ['web-search'] }), base({ dataDir: dir, collectors, connectionsPath: '/nonexistent.csv' }));
  assert.equal(JSON.parse(readFileSync(join(dir, 'hiring-signals.json'), 'utf8')).signals[0].metadata.warm.status, 'NO_CONNECTION');
  await runScan(opts({ sources: ['web-search'] }), base({ dataDir: dir, collectors, connectionsPath: conns }));
  assert.equal(JSON.parse(readFileSync(join(dir, 'hiring-signals.json'), 'utf8')).signals[0].metadata.warm.status, 'WARM_INTRO_AVAILABLE');
});

test('every result links to a LinkedIn 2nd-degree search for its company (connections of connections)', async () => {
  const { toPublicSignal } = await import('../format/json.mjs');
  const p = toPublicSignal({ ...job(1, 'Backend Engineer', 'Acme Corp'), warm: { status: 'NO_CONNECTION', connections: [] } });
  assert.equal(p.metadata.secondDegreeUrl, 'https://www.linkedin.com/search/results/people/?keywords=Acme%20Corp&network=%5B%22S%22%5D');
  assert.equal(toPublicSignal({ ...job(2, 'Backend Engineer', ''), company: { name: '', confidence: 'LOW' }, warm: { status: 'NO_CONNECTION', connections: [] } }).metadata.secondDegreeUrl, null);
});

test('delete removes results for good: gone from ledger and JSON, and a rescan does not resurrect them; bulk status works', async () => {
  const { deleteSignals, setStatusMany } = await import('../set-status.mjs');
  const deps = base({ collectors: { 'web-search': fakeSearch([post(1, "We're hiring a backend engineer. Java. New York."), post(2, "I'm hiring an AI engineer. RAG. New York."), post(3, "We're hiring a forward deployed engineer. Python. New York.")]) } });
  await runScan(opts({ sources: ['web-search'] }), deps);
  let json = JSON.parse(readFileSync(join(deps.dataDir, 'hiring-signals.json'), 'utf8'));
  const [a, b, c] = json.signals.map((s) => s.id);
  assert.equal(setStatusMany(deps.dataDir, [a, b], 'REVIEWED'), 2);
  assert.equal(deleteSignals(deps.dataDir, [b, c]), 2);
  json = JSON.parse(readFileSync(join(deps.dataDir, 'hiring-signals.json'), 'utf8'));
  assert.deepEqual(json.signals.map((s) => s.id), [a]);
  assert.equal(readFileSync(join(deps.dataDir, 'hiring-signals.tsv'), 'utf8').trim().split('\n').length, 2);
  const again = await runScan(opts({ sources: ['web-search'] }), deps);
  assert.equal(again.summary.retained, 0, 'deleted results are remembered and not re-added');
  assert.deepEqual(JSON.parse(readFileSync(join(deps.dataDir, 'hiring-signals.json'), 'utf8')).signals.map((s) => s.id), [a]);
});

test('unread NEW results from earlier runs are not announced again; only this run\'s fresh ones', () => {
  const c = cfg();
  const mkSig = (i) => { const x = { ...job(i, 'Backend Engineer', `Co${i}`), status: 'NEW', warm: { status: 'NO_CONNECTION', connections: [] } }; return x; };
  const [a, b] = [mkSig(1), mkSig(2)];
  const msgs = buildMessages({ ranked: [a, b], freshIds: new Set([b.id]) }, c, {}).join('\n');
  assert.match(msgs, /Co2/);
  assert.doesNotMatch(msgs, /Co1/);
});
