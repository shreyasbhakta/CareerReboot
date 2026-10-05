import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { applyReset, planReset } from './reset-local-data.mjs';

function repoWith(files) {
  const repo = mkdtempSync(join(tmpdir(), 'reset-'));
  for (const f of files) { mkdirSync(dirname(join(repo, f)), { recursive: true }); writeFileSync(join(repo, f), 'x'); }
  return repo;
}

test('moves generated data, keeps tracked scaffolding and LinkedIn exports', () => {
  const repo = repoWith([
    'agents/career-ops/data/.gitkeep',
    'agents/career-ops/data/applications.md',
    'agents/career-ops/data/cache/hr-1.json',
    'agents/career-ops/data/Connections.csv',
    'agents/career-ops/data/offers/.gitkeep',
    'agents/career-ops/data/offers/acme.pdf',
    'agents/career-ops/reports/001-acme.md',
    'agents/career-ops/web/.next/build.json',
    'agents/career-ops/config/profile.yml',
  ]);
  const tracked = new Set(['agents/career-ops/data/.gitkeep', 'agents/career-ops/data/offers/.gitkeep']);
  const plan = planReset(repo, tracked).sort();
  assert.deepEqual(plan, [
    'agents/career-ops/data/applications.md',
    'agents/career-ops/data/cache',
    'agents/career-ops/data/offers/acme.pdf',
    'agents/career-ops/reports',
    'agents/career-ops/web/.next',
  ]);

  const backup = applyReset(repo, plan, 'stamp');
  assert.equal(backup, join('.careerreboot-backups', 'stamp'));
  assert.ok(existsSync(join(repo, backup, 'agents/career-ops/data/cache/hr-1.json')));
  assert.ok(!existsSync(join(repo, 'agents/career-ops/reports')));
  for (const kept of ['agents/career-ops/data/.gitkeep', 'agents/career-ops/data/Connections.csv', 'agents/career-ops/config/profile.yml']) {
    assert.ok(existsSync(join(repo, kept)), kept);
  }
  assert.deepEqual(planReset(repo, tracked), [], 'a second run finds nothing');
});
