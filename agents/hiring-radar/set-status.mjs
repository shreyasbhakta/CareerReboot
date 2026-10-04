#!/usr/bin/env node
// Set a signal's status (REVIEWED / CONTACTED / DISMISSED / CONVERTED / SEEN / NEW)
// in the history ledger and the JSON view.   node set-status.mjs <id> <STATUS>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getCareerOpsRoot } from '../career-ops/path-resolver.mjs';
import { loadHistory, writeHistory } from './storage/history.mjs';
import { STATUSES, dedupKeys } from './storage/normalize.mjs';

/** Set every row's status at once (e.g. reset the ledger to NEW). Returns the row count. */
export function setAllStatus(dataDir, status) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  const tsv = join(dataDir, 'hiring-signals.tsv');
  const { signals } = loadHistory(tsv);
  for (const s of signals) s.status = status;
  writeHistory(tsv, signals);
  const jf = join(dataDir, 'hiring-signals.json');
  if (existsSync(jf)) {
    const j = JSON.parse(readFileSync(jf, 'utf8'));
    for (const s of j.signals || []) s.status = status;
    writeFileSync(jf, JSON.stringify(j, null, 2) + '\n', { mode: 0o600 });
  }
  return signals.length;
}

const tombstonePath = (dataDir) => join(dataDir, 'hiring-signals-deleted.txt');

/** Dedup keys of deleted results. A scan treats them as "already seen" so a deleted result never comes back. */
export function loadTombstones(dataDir) {
  try { return new Set(readFileSync(tombstonePath(dataDir), 'utf8').split('\n').filter(Boolean)); } catch { return new Set(); }
}

/** Remove results from the ledger and JSON view; remember their keys so rescans don't resurrect them. */
export function deleteSignals(dataDir, ids) {
  const want = new Set(ids);
  const tsv = join(dataDir, 'hiring-signals.tsv');
  const { signals } = loadHistory(tsv);
  const gone = signals.filter((s) => want.has(s.id));
  if (!gone.length && !ids.length) return 0;
  const keys = loadTombstones(dataDir);
  for (const g of gone) for (const k of dedupKeys(g, { windowDays: 7 })) keys.add(k);
  writeFileSync(tombstonePath(dataDir), [...keys].join('\n') + '\n', { mode: 0o600 });
  if (gone.length) writeHistory(tsv, signals.filter((s) => !want.has(s.id)));
  const jf = join(dataDir, 'hiring-signals.json');
  if (existsSync(jf)) {
    const j = JSON.parse(readFileSync(jf, 'utf8'));
    j.signals = (j.signals || []).filter((s) => !want.has(s.id));
    writeFileSync(jf, JSON.stringify(j, null, 2) + '\n', { mode: 0o600 });
  }
  return gone.length;
}

/** Set one status on many results at once. */
export function setStatusMany(dataDir, ids, status) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  const want = new Set(ids);
  const tsv = join(dataDir, 'hiring-signals.tsv');
  const { signals } = loadHistory(tsv);
  let n = 0;
  for (const s of signals) if (want.has(s.id)) { s.status = status; n++; }
  writeHistory(tsv, signals);
  const jf = join(dataDir, 'hiring-signals.json');
  if (existsSync(jf)) {
    const j = JSON.parse(readFileSync(jf, 'utf8'));
    for (const s of j.signals || []) if (want.has(s.id)) s.status = status;
    writeFileSync(jf, JSON.stringify(j, null, 2) + '\n', { mode: 0o600 });
  }
  return n;
}

export function setStatus(dataDir, id, status) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  const tsv = join(dataDir, 'hiring-signals.tsv');
  const { signals } = loadHistory(tsv);
  const hit = signals.find((s) => s.id === id);
  if (!hit) throw new Error(`no signal with id ${id}`);
  hit.status = status;
  writeHistory(tsv, signals);
  const jf = join(dataDir, 'hiring-signals.json');
  if (existsSync(jf)) {
    const j = JSON.parse(readFileSync(jf, 'utf8'));
    for (const s of j.signals || []) if (s.id === id) s.status = status;
    writeFileSync(jf, JSON.stringify(j, null, 2) + '\n', { mode: 0o600 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [id, status] = process.argv.slice(2);
  const dir0 = process.env.HIRING_RADAR_DATA_DIR ? resolve(process.env.HIRING_RADAR_DATA_DIR) : join(getCareerOpsRoot(), 'data');
  if (id === '--delete' || id === '--bulk') {
    try {
      if (id === '--delete') console.log(`OK deleted ${deleteSignals(dir0, status.split(',').filter(Boolean))}`);
      else console.log(`OK updated ${setStatusMany(dir0, (process.argv[4] || '').split(',').filter(Boolean), status)}`);
    } catch (e) { console.error(e.message); process.exit(1); }
    process.exit(0);
  }
  if (id === '--all') {
    const dir = process.env.HIRING_RADAR_DATA_DIR ? resolve(process.env.HIRING_RADAR_DATA_DIR) : join(getCareerOpsRoot(), 'data');
    try { console.log(`OK ${setAllStatus(dir, status)} rows`); } catch (e) { console.error(e.message); process.exit(1); }
    process.exit(0);
  }
  const dataDir = process.env.HIRING_RADAR_DATA_DIR ? resolve(process.env.HIRING_RADAR_DATA_DIR) : join(getCareerOpsRoot(), 'data');
  try { setStatus(dataDir, id, status); console.log('OK'); } catch (e) { console.error(e.message); process.exit(1); }
}
