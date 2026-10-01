import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cfg, ctx, NOW } from './helpers.mjs';
import { buildSignal } from '../pipeline.mjs';
import { dedupKeys, dedupeSignals } from '../storage/normalize.mjs';
import { loadHistory, writeHistory, mergeHistory, signalToRow, COLUMNS } from '../storage/history.mjs';
import { loadConnections, matchWarm } from '../storage/connections.mjs';

const mk = (over = {}) => {
  const r = buildSignal({
    source: 'web-search', kind: 'post', sourceUrl: 'https://linkedin.com/posts/jane_hiring-1', title: 'Jane Doe on LinkedIn: hiring',
    text: "We're hiring a Forward Deployed Engineer in New York.", snippet: "We're hiring a Forward Deployed Engineer in New York.",
    publishedAt: '2026-10-01T10:00:00Z', companyName: 'Example AI',
    person: { name: 'Jane Doe', title: 'VP Engineering', confidence: 'HIGH' }, ...over,
  }, ctx());
  assert.ok(r.signal, JSON.stringify(r));
  return r.signal;
};

test('spec fixture: DIRECT_HIRING_POST, FDE, activity >= 90, high technical match', () => {
  const s = mk();
  assert.equal(s.signalType, 'DIRECT_HIRING_POST');
  assert.equal(s.role.canonical, 'Forward Deployed Engineer');
  assert.ok(s.scores.components.activity >= 90);
  assert.ok(s.scores.components.technical >= 70);
  assert.equal(s.person.name, 'Jane Doe');
  assert.equal(s.company.name, 'Example AI');
  assert.ok(s.scores.overall >= 85);
});

test('dedup keys: same URL with tracking params collapses', () => {
  const a = mk();
  const b = mk({ sourceUrl: 'https://www.linkedin.com/posts/jane_hiring-1?utm_source=share' });
  const { kept, dropped } = dedupeSignals([a, b]);
  assert.equal(kept.length, 1);
  assert.equal(dropped, 1);
});
test('dedup: same company+role+person+window on a different URL collapses; different date window does not', () => {
  const a = mk();
  const b = mk({ sourceUrl: 'https://x.com/jane/status/9' });
  assert.equal(dedupeSignals([a, b]).kept.length, 1);
  const old = mk({ sourceUrl: 'https://x.com/jane/status/10', publishedAt: '2026-09-26T10:00:00Z', text: "We're hiring a Forward Deployed Engineer — different words entirely, remote." });
  assert.equal(dedupeSignals([a, old], { windowDays: 3 }).kept.length, 2);
});
test('dedup: known keys from history suppress re-discovery', () => {
  const a = mk();
  const known = new Set(dedupKeys(a));
  assert.equal(dedupeSignals([mk()], { known }).kept.length, 0);
});
test('dedup: same job on two URLs (same company/title/location)', () => {
  const job = (url) => buildSignal({ source: 'jobs:greenhouse', kind: 'job', sourceUrl: url, title: 'Backend Engineer', text: 'Backend Engineer', location: 'New York, NY', publishedAt: '2026-10-01T05:00:00Z', companyName: 'Acme' }, ctx()).signal;
  assert.equal(dedupeSignals([job('https://boards.greenhouse.io/acme/jobs/1'), job('https://acme.com/careers/backend?id=9')]).kept.length, 1);
});

test('history TSV roundtrip preserves signals and human-edited status; NEW becomes SEEN', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hr-'));
  const path = join(dir, 'h.tsv');
  const s = { ...mk(), status: 'NEW', warm: { status: 'NO_CONNECTION', connections: [] } };
  writeHistory(path, [s, { ...mk({ sourceUrl: 'https://x.com/other', text: "I'm hiring a backend engineer. Java." }), status: 'CONTACTED', warm: { status: 'NO_CONNECTION', connections: [] } }]);
  const header = readFileSync(path, 'utf8').split('\n')[0].split('\t');
  assert.deepEqual(header, COLUMNS);
  assert.ok(COLUMNS.slice(0, 20).join(',') === 'id,source,source_url,signal_type,person_name,person_title,person_url,company,company_url,role,location,signal_text,published_at,discovered_at,activity_score,technical_match,overall_score,confidence,warm_connection,status');
  const { signals } = loadHistory(path);
  assert.equal(signals.length, 2);
  assert.equal(signals[0].person.name, 'Jane Doe');
  assert.equal(signals[0].scores.overall, s.scores.overall);
  const merged = mergeHistory(signals, [], { now: NOW });
  assert.equal(merged.find((x) => x.status === 'CONTACTED').status, 'CONTACTED');
  assert.equal(merged.filter((x) => x.status === 'SEEN').length, 1);
});
test('history: tabs/newlines in text cannot corrupt rows; malformed rows are counted and skipped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hr-'));
  const path = join(dir, 'h.tsv');
  const s = { ...mk({ text: "We're hiring a backend engineer.\tTab\nNewline" }), status: 'NEW', warm: { status: 'NO_CONNECTION', connections: [] } };
  writeHistory(path, [s]);
  writeFileSync(path, readFileSync(path, 'utf8') + 'garbage line\n');
  const r = loadHistory(path);
  assert.equal(r.signals.length, 1);
  assert.equal(r.malformed, 1);
  assert.equal(signalToRow(s).split('\t').length, COLUMNS.length);
});
test('history retention prunes old rows but keeps CONTACTED', () => {
  const old = { ...mk(), publishedAt: '2025-01-01T00:00:00Z', status: 'SEEN' };
  const oldContacted = { ...old, id: 'z', status: 'CONTACTED' };
  const merged = mergeHistory([old, oldContacted], [], { retentionDays: 90, now: NOW });
  assert.deepEqual(merged.map((m) => m.id), ['z']);
});

const csv = new URL('./fixtures/Connections.csv', import.meta.url).pathname;
test('warm connections: direct, company, none, and not-loaded', async () => {
  const conns = await loadConnections(csv);
  assert.equal(conns.loaded, true);
  const direct = matchWarm(mk(), conns);
  assert.equal(direct.status, 'WARM_INTRO_AVAILABLE');
  assert.equal(direct.connections[0].name, 'Jane Doe');

  const relevantAtCompany = matchWarm(mk({ person: undefined, title: 'post about hiring', companyName: 'XYZ AI', text: "We're hiring a backend engineer. Java." }), conns);
  assert.equal(relevantAtCompany.status, 'WARM_INTRO_AVAILABLE');
  assert.equal(relevantAtCompany.connections[0].name, 'John Smith');

  const nonRelevant = matchWarm({ company: { name: 'Acme Robotics' }, person: null }, conns);
  assert.equal(nonRelevant.status, 'COMPANY_CONNECTION');

  assert.equal(matchWarm({ company: { name: 'Nobody Corp' }, person: null }, conns).status, 'NO_CONNECTION');
  const missing = await loadConnections('/nonexistent/Connections.csv');
  assert.equal(missing.loaded, false);
  assert.equal(matchWarm(mk(), missing).status, 'NO_CONNECTION');
  assert.match(matchWarm(mk(), missing).note, /no Connections/);
});
test('warm output never carries connection emails', async () => {
  const conns = await loadConnections(csv);
  const w = matchWarm(mk(), conns);
  assert.ok(!JSON.stringify(w).includes('@'));
});
