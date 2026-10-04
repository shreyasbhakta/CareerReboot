// TSV history ledger. One row per signal; the spec'd columns are first-class,
// and `metadata_json` carries the remainder so a run can be fully re-hydrated
// (and re-scored for recency) without a second store.
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { dedupKeys, STATUSES } from './normalize.mjs';

export const COLUMNS = [
  'id', 'source', 'source_url', 'signal_type', 'person_name', 'person_title', 'person_url',
  'company', 'company_url', 'role', 'location', 'signal_text', 'published_at', 'discovered_at',
  'activity_score', 'technical_match', 'overall_score', 'confidence', 'warm_connection', 'status',
  'person_confidence', 'company_confidence', 'metadata_json',
];

const esc = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
const num = (v) => (v === '' || v == null ? null : Number(v));

export function signalToRow(s) {
  const meta = {
    title: s.title, role: s.role, scores: s.scores, directStrength: s.directStrength, phrases: s.phrases,
    technicalBreakdown: s.technicalBreakdown, matchedSkills: s.matchedSkills, ageHours: s.ageHours,
    warm: s.warm, why: s.why, outreach: s.outreach, metadata: s.metadata, lastSeenAt: s.lastSeenAt,
    person: s.person, company: s.company, locationKind: s.locationKind, dateKnown: s.dateKnown,
  };
  const row = {
    id: s.id, source: s.source, source_url: s.sourceUrl, signal_type: s.signalType,
    person_name: s.person?.name, person_title: s.person?.title, person_url: s.person?.url,
    company: s.company?.name, company_url: s.company?.url, role: s.role?.canonical || s.role?.raw,
    location: s.location, signal_text: (s.text || '').slice(0, 600), published_at: s.publishedAt, discovered_at: s.discoveredAt,
    activity_score: s.scores?.components?.activity, technical_match: s.scores?.components?.technical,
    overall_score: s.scores?.overall, confidence: s.confidence, warm_connection: s.warm?.status,
    status: s.status, person_confidence: s.person?.confidence, company_confidence: s.company?.confidence,
    metadata_json: JSON.stringify(meta),
  };
  return COLUMNS.map((c) => esc(row[c])).join('\t');
}

export function rowToSignal(cells) {
  const r = Object.fromEntries(COLUMNS.map((c, i) => [c, cells[i] ?? '']));
  let meta = {};
  try { meta = r.metadata_json ? JSON.parse(r.metadata_json) : {}; } catch { /* keep going with columns only */ }
  return {
    id: r.id, source: r.source, sourceUrl: r.source_url, signalType: r.signal_type,
    person: meta.person ?? (r.person_name ? { name: r.person_name, title: r.person_title, url: r.person_url || null, confidence: r.person_confidence || 'LOW' } : null),
    company: meta.company ?? { name: r.company, url: r.company_url || null, confidence: r.company_confidence || 'LOW' },
    role: meta.role ?? { canonical: r.role, raw: r.role, tier: 'unknown', matched: false },
    title: meta.title ?? '', location: r.location, text: r.signal_text,
    publishedAt: r.published_at || null, discoveredAt: r.discovered_at, confidence: r.confidence,
    scores: meta.scores ?? { overall: num(r.overall_score), components: { activity: num(r.activity_score), technical: num(r.technical_match) } },
    directStrength: meta.directStrength, phrases: meta.phrases ?? [], technicalBreakdown: meta.technicalBreakdown ?? [],
    matchedSkills: meta.matchedSkills ?? [], ageHours: meta.ageHours ?? null, warm: meta.warm ?? { status: r.warm_connection || 'NO_CONNECTION', connections: [] },
    why: meta.why, outreach: meta.outreach, metadata: meta.metadata ?? {}, lastSeenAt: meta.lastSeenAt,
    locationKind: meta.locationKind, dateKnown: meta.dateKnown,
    status: STATUSES.includes(r.status) ? r.status : 'NEW',
  };
}

export function loadHistory(path) {
  if (!existsSync(path)) return { signals: [], malformed: 0 };
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim());
  const signals = [];
  let malformed = 0;
  for (const [i, line] of lines.entries()) {
    if (i === 0 && line.startsWith('id\t')) continue;
    const cells = line.split('\t');
    if (cells.length < 20 || !cells[0]) { malformed++; continue; }
    signals.push(rowToSignal(cells));
  }
  return { signals, malformed };
}

export function knownKeys(signals, windowDays) {
  const set = new Set();
  for (const s of signals) dedupKeys(s, { windowDays }).forEach((k) => set.add(k));
  return set;
}

/** Atomic write (temp + rename) so an interrupted run cannot truncate the ledger. */
export function writeHistory(path, signals) {
  mkdirSync(dirname(path), { recursive: true });
  const body = [COLUMNS.join('\t'), ...signals.map(signalToRow)].join('\n') + '\n';
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, body, { mode: 0o600 });
  renameSync(tmp, path);
}

/**
 * Merge new signals into history: new rows are NEW; previously NEW rows become
 * SEEN (the human-edited statuses REVIEWED/CONTACTED/DISMISSED/CONVERTED are
 * never touched); rows past retention are pruned unless acted on.
 */
export function mergeHistory(history, fresh, { retentionDays = 90, now = new Date() } = {}) {
  const cutoff = now.getTime() - retentionDays * 864e5;
  // NEW stays NEW until the user opens the result (the dashboard marks it SEEN on click), so an
  // unread result never silently turns into "seen" just because another scan ran.
  const aged = history;
  const kept = aged.filter((s) => {
    if (['CONTACTED', 'CONVERTED'].includes(s.status)) return true;
    const t = Date.parse(s.publishedAt || s.discoveredAt);
    return Number.isNaN(t) || t >= cutoff;
  });
  return [...fresh.map((s) => ({ ...s, status: 'NEW' })), ...kept];
}
