#!/usr/bin/env node
// Set a signal's status (REVIEWED / CONTACTED / DISMISSED / CONVERTED / SEEN / NEW)
// in the history ledger and the JSON view.   node set-status.mjs <id> <STATUS>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getCareerOpsRoot } from '../career-ops/path-resolver.mjs';
import { loadHistory, writeHistory } from './storage/history.mjs';
import { STATUSES } from './storage/normalize.mjs';

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
  const dataDir = process.env.HIRING_RADAR_DATA_DIR ? resolve(process.env.HIRING_RADAR_DATA_DIR) : join(getCareerOpsRoot(), 'data');
  try { setStatus(dataDir, id, status); console.log('OK'); } catch (e) { console.error(e.message); process.exit(1); }
}
