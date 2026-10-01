import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, validateConfig, deepMerge } from '../lib/config.mjs';
import { cfg } from './helpers.mjs';

const hermetic = { localPath: '/nonexistent', profilePath: '/nonexistent' };

test('example config is valid and weights sum to 1', () => {
  const c = cfg();
  assert.deepEqual(validateConfig(c), []);
  assert.ok(Math.abs(Object.values(c.scoring.weights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(c.scoring.weights.technical, 0.35);
});
test('user overrides merge deeply; arrays replace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hrc-'));
  const f = join(dir, 'c.yml');
  writeFileSync(f, 'recency:\n  default_days: 3\nscoring:\n  weights: { technical: 0.5, activity: 0.2, direct_language: 0.1, person: 0.1, location: 0.05, company: 0.05 }\nsources:\n  web_search:\n    providers: [brave]\n');
  const c = loadConfig({ env: { HIRING_RADAR_CONFIG: f }, ...hermetic });
  assert.equal(c.recency.default_days, 3);
  assert.equal(c.recency.max_days, 30);
  assert.deepEqual(c.sources.web_search.providers, ['brave']);
  assert.equal(c.scoring.weights.technical, 0.5);
});
test('invalid weights fail with a readable message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hrc-'));
  const f = join(dir, 'bad.yml');
  writeFileSync(f, 'scoring:\n  weights: { technical: 0.9, activity: 0.9, direct_language: 0, person: 0, location: 0, company: 0 }\n');
  assert.throws(() => loadConfig({ env: { HIRING_RADAR_CONFIG: f }, ...hermetic }), /weights must sum to 1\.0/);
});
test('bad regex, bad bands, bad tier and empty roles are all reported', () => {
  const c = cfg();
  c.signals.strong_team = ['(unclosed'];
  c.recency.bands = [{ max_hours: 24, score: 90 }, { max_hours: 12, score: 100 }];
  c.role_families[0].tier = 'sideways';
  const errs = validateConfig(c);
  assert.ok(errs.some((e) => /invalid pattern/.test(e)));
  assert.ok(errs.some((e) => /strictly increasing/.test(e)));
  assert.ok(errs.some((e) => /tier must be/.test(e)));
  assert.ok(validateConfig({ ...cfg(), role_families: [] }).some((e) => /role_families/.test(e)));
});
test('max_days above 30 is rejected', () => {
  const c = cfg();
  c.recency.max_days = 90;
  assert.ok(validateConfig(c).some((e) => /max_days/.test(e)));
});
test('missing config file path and malformed YAML give useful errors', () => {
  assert.throws(() => loadConfig({ env: { HIRING_RADAR_CONFIG: '/definitely/missing.yml' }, ...hermetic }), /missing file/);
  const f = join(mkdtempSync(join(tmpdir(), 'hrc-')), 'x.yml');
  writeFileSync(f, 'a: [unclosed');
  assert.throws(() => loadConfig({ env: { HIRING_RADAR_CONFIG: f }, ...hermetic }), /Cannot parse YAML/);
});
test('HIRING_RADAR_NOTIFY env toggles notifications', () => {
  assert.equal(loadConfig({ env: { HIRING_RADAR_NOTIFY: 'true' }, ...hermetic }).notify.enabled, true);
  assert.equal(loadConfig({ env: { HIRING_RADAR_NOTIFY: 'false' }, ...hermetic }).notify.enabled, false);
});
test('profile.yml supplies name and proof points without being copied into config', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'hrc-')), 'profile.yml');
  writeFileSync(f, 'candidate:\n  full_name: "Test Person"\n  phone: "555-0100"\ntarget_roles:\n  primary: ["Backend Engineer"]\nnarrative:\n  proof_points:\n    - { name: "Proj", hero_metric: "did a thing" }\n');
  const c = loadConfig({ env: {}, localPath: '/nonexistent', profilePath: f });
  assert.equal(c.profile.name, 'Test Person');
  assert.deepEqual(c.profile.proof_points, [{ name: 'Proj', hero_metric: 'did a thing' }]);
  assert.ok(!JSON.stringify(c).includes('555-0100'), 'phone must never enter the config object');
});
test('deepMerge does not mutate inputs', () => {
  const a = { x: { y: 1 } };
  deepMerge(a, { x: { z: 2 } });
  assert.deepEqual(a, { x: { y: 1 } });
});
