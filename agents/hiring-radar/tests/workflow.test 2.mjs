// Validates the GitHub Actions workflow without running Actions: structure,
// safety properties, and that every command it runs exists in this checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'js-yaml';

const repo = resolve(import.meta.dirname, '../../..');
const wfPath = resolve(repo, '.github/workflows/hiring-radar.yml');
const wf = yaml.load(readFileSync(wfPath, 'utf8'));
const raw = readFileSync(wfPath, 'utf8');
const steps = wf.jobs.scan.steps;

test('triggers: manual dispatch and a daily schedule at 07:30 New York (both DST offsets)', () => {
  assert.ok('workflow_dispatch' in wf.on);
  const crons = wf.on.schedule.map((s) => s.cron);
  assert.deepEqual(crons.sort(), ['30 11 * * *', '30 12 * * *']);
});
test('no concurrent runs; in-flight runs are never cancelled', () => {
  assert.equal(wf.concurrency.group, 'hiring-radar');
  assert.equal(wf['concurrency']['cancel-in-progress'], false);
});
test('least-privilege permissions and a timeout', () => {
  assert.deepEqual(wf.permissions, { contents: 'read' });
  assert.ok(wf.jobs.scan['timeout-minutes'] <= 30);
});
test('runs tests before the scan, and installs without career-ops postinstall scripts', () => {
  const names = steps.map((s) => s.name || s.uses);
  assert.ok(names.indexOf('Test') < names.indexOf('Scan'));
  const install = steps.find((s) => s.name === 'Install dependencies').run;
  assert.match(install, /career-ops ci --ignore-scripts/);
});
test('secrets come from the secrets context and are never echoed or put in the command line', () => {
  assert.ok(!/echo[^\n]*secrets\./.test(raw));
  const scan = steps.find((s) => s.name === 'Scan');
  for (const k of ['SEARXNG_URL', 'BRAVE_SEARCH_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'HIRING_RADAR_WEBHOOK_URL']) assert.match(scan.env[k], /^\$\{\{ secrets\./, k);
  assert.ok(!/\$\{\{\s*(inputs|github\.event\.inputs)[^}]*\}\}/.test(scan.run), 'inputs must flow through env, not be interpolated into the shell script');
});
test('does not commit or push anything (data/ is gitignored by design)', () => {
  assert.ok(!/git (commit|push|add)/.test(raw));
});
test('results are published only when no private connection data could leak', () => {
  const pub = steps.find((s) => s.name === 'Publish digest');
  assert.match(pub.if, /repository\.private/);
});
test('every npm/node command the workflow runs exists in this checkout', () => {
  const rootPkg = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
  assert.ok(rootPkg.scripts['hiring-radar'] && rootPkg.scripts['hiring-radar:dry-run'] && rootPkg.scripts.test);
  for (const p of ['agents/hiring-radar/scan.mjs', 'agents/hiring-radar/package-lock.json', 'agents/career-ops/package-lock.json']) assert.ok(existsSync(resolve(repo, p)), p);
  const hr = JSON.parse(readFileSync(resolve(repo, 'agents/hiring-radar/package.json'), 'utf8'));
  assert.ok(hr.scripts.test);
  const co = JSON.parse(readFileSync(resolve(repo, 'agents/career-ops/package.json'), 'utf8'));
  assert.ok(co.scripts.lint);
  assert.ok(Number(hr.engines.node.match(/\d+/)[0]) <= Number(steps.find((s) => s.uses?.startsWith('actions/setup-node')).with['node-version']));
});
