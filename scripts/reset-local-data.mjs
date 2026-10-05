#!/usr/bin/env node
// Start the app fresh: moves generated data and caches into
// .careerreboot-backups/<timestamp>/ (nothing is deleted). Config, secrets, the
// CV and LinkedIn exports stay. Dry run unless --yes.
//
//   npm run reset          # list what would move
//   npm run reset -- --yes # move it
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Generated or accumulated runtime state, relative to the repo root. */
export const TARGETS = [
  'agents/career-ops/data',
  'agents/career-ops/reports',
  'agents/career-ops/output',
  'agents/career-ops/jds',
  'agents/career-ops/batch/logs',
  'agents/career-ops/batch/tracker-additions',
  'agents/career-ops/batch/batch-state.tsv',
  'agents/career-ops/interview-prep',
  'agents/career-ops/applications.md',
  'agents/career-ops/follow-ups.md',
  'agents/career-ops/applications.db',
  'agents/career-ops/.career-ops-web',
  'agents/career-ops/web/.next',
  'agents/career-ops/web/.next-prod',
  'agents/linkedin-radar/output',
  'agents/outreach/drafts',
  '.hiring-radar-data',
];

/** Inputs the user supplied, not generated state: never moved. */
const KEEP = new Set(['Connections.csv']);

/**
 * Paths to move: untracked entries under TARGETS, never a tracked file, never a
 * KEEP file. A directory moves whole only when nothing inside it is tracked or kept.
 */
export function planReset(repo, tracked) {
  const isTracked = (rel) => tracked.has(rel);
  const holdsProtected = (abs) => {
    const rel = relative(repo, abs);
    for (const t of tracked) if (t.startsWith(`${rel}/`)) return true;
    return readdirSync(abs, { recursive: true }).some((n) => KEEP.has(String(n).split(/[\\/]/).pop()));
  };
  const out = [];
  const visit = (abs) => {
    const rel = relative(repo, abs);
    if (isTracked(rel) || KEEP.has(abs.split(/[\\/]/).pop())) return;
    if (!statSync(abs).isDirectory()) { out.push(rel); return; }
    if (!holdsProtected(abs)) { out.push(rel); return; }
    for (const name of readdirSync(abs)) visit(join(abs, name));
  };
  for (const t of TARGETS) {
    const abs = join(repo, t);
    if (existsSync(abs)) visit(abs);
  }
  return out;
}

export function applyReset(repo, paths, stamp = new Date().toISOString().replace(/[:.]/g, '-')) {
  const dest = join(repo, '.careerreboot-backups', stamp);
  for (const rel of paths) {
    const to = join(dest, rel);
    mkdirSync(dirname(to), { recursive: true });
    renameSync(join(repo, rel), to);
  }
  return relative(repo, dest);
}

function main(argv) {
  const yes = argv.includes('--yes');
  const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' }).split('\0').filter(Boolean));
  const plan = planReset(REPO, tracked);
  if (!plan.length) { console.log('Nothing to reset: no generated data or caches found.'); return; }
  console.log(`${yes ? 'Moving' : 'Would move'} ${plan.length} path(s):\n${plan.map((p) => `  ${p}`).join('\n')}`);
  if (!yes) { console.log('\nDry run. Re-run with --yes to move them into .careerreboot-backups/.'); return; }
  console.log(`\nDone. Backup: ${applyReset(REPO, plan)}\nAlso clear this site's data in your browser (theme, mode and appearance live in localStorage).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
