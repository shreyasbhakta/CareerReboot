import test from 'node:test';
import assert from 'node:assert/strict';
import { cfg } from './helpers.mjs';
import { classifyHiringText } from '../extractors/hiring-signal.mjs';

const c = cfg();
const cls = (t, hasRole = true) => classifyHiringText(t, c, { hasRole });

test('first-person hiring with a role is the strongest signal', () => {
  const r = cls("I'm hiring a backend engineer for my team.");
  assert.equal(r.strength, 'first_person_role');
  assert.equal(r.signalType, 'DIRECT_HIRING_POST');
  assert.equal(r.directScore, 100);
});
test('team hiring phrase variants', () => {
  for (const t of ["We're hiring a Forward Deployed Engineer in New York.", 'We are hiring AI engineers', 'Looking for a software engineer to join us', 'Hiring backend engineers (Java)', 'Join our team: we need a backend engineer']) {
    assert.ok(['team_role', 'first_person_role'].includes(cls(t).strength), t);
  }
});
test('team expansion phrasing', () => {
  const r = cls('Growing our engineering team this quarter.', false);
  assert.equal(r.strength, 'team_expansion');
  assert.equal(r.signalType, 'TEAM_EXPANSION');
});
test('false positives: hires and announcements are not signals', () => {
  for (const t of ['We recently hired John.', 'Excited to announce our new engineer.', 'Welcome Jane to the team!', 'Congrats to our new hire', "I'm looking for my next role as a backend engineer #opentowork"]) {
    assert.equal(cls(t).strength, 'none', t);
  }
});
test('a negated sentence does not poison a later real signal', () => {
  const r = cls('We recently hired John. We\'re hiring a backend engineer.');
  assert.equal(r.strength, 'team_role');
});
test('broad "across 20 departments" copy is weak, not direct', () => {
  const r = cls("Join us at Company X — we're hiring across 20 departments.", false);
  assert.equal(r.strength, 'weak');
  assert.ok(r.directScore <= 35);
});
test('vague recruiting copy is weak', () => {
  assert.equal(cls('Come work with us!', false).strength, 'weak');
});
test('empty / garbage input is safe', () => {
  for (const t of ['', null, undefined, '🔥🔥🔥']) assert.equal(cls(t).strength, 'none');
});
