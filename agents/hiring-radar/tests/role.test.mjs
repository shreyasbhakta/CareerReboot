import test from 'node:test';
import assert from 'node:assert/strict';
import { cfg } from './helpers.mjs';
import { createRoleMatcher } from '../extractors/role.mjs';

const m = createRoleMatcher(cfg());
const fam = (t, opts) => m.match(t, opts).familyId;

test('SDE / SWE / Software Development Engineer collapse to swe', () => {
  for (const t of ['SDE II', 'Software Development Engineer', 'SWE', 'Software Engineer, New Grad Platform']) assert.equal(fam(t, { isTitle: true }), 'swe', t);
});
test('backend variants map to backend', () => {
  for (const t of ['Backend Engineer', 'Back-end Software Engineer', 'Software Engineer, Backend', 'Backend Software Engineer (Payments)']) assert.equal(fam(t, { isTitle: true }), 'backend', t);
});
test('FDE family includes forward deployed, deployment, customer and solutions engineers', () => {
  for (const t of ['Forward Deployed Engineer', 'FDE', 'Forward Deployment Engineer', 'Customer Engineer', 'Deployment Engineer', 'Technical Solutions Engineer']) assert.equal(fam(t, { isTitle: true }), 'fde', t);
});
test('AI family includes applied/LLM/generative/agentic engineers', () => {
  for (const t of ['Applied AI Engineer', 'LLM Engineer', 'Generative AI Engineer', 'Agentic AI Engineer', 'AI Software Engineer', 'AI Platform Engineer']) assert.equal(fam(t, { isTitle: true }), 'ai', t);
});
test('plural phrases in free text match', () => {
  assert.equal(fam("We're hiring backend engineers and AI engineers"), 'backend');
});
test('unrelated roles are NOT matched', () => {
  for (const t of ['Data Scientist', 'Machine Learning Research Scientist', 'Frontend Engineer', 'iOS Engineer', 'Mobile Engineer', 'Android Developer']) {
    const r = m.match(t, { isTitle: true });
    assert.equal(r.matched, false, t);
    assert.equal(r.tier, 'excluded', t);
  }
});
test('qualifier next to a generic role excludes it ("Software Engineer, Mobile")', () => {
  assert.equal(m.match('Software Engineer, iOS Engineer', { isTitle: true }).matched, false);
});
test('unknown titles are unknown, not matched', () => {
  const r = m.match('Office Manager', { isTitle: true });
  assert.deepEqual([r.matched, r.tier], [false, 'unknown']);
});
test('adjacent tier for full stack and ML engineers', () => {
  assert.equal(m.match('Full Stack Engineer', { isTitle: true }).tier, 'adjacent');
  assert.equal(m.match('Machine Learning Engineer', { isTitle: true }).tier, 'adjacent');
});
test('seniority: interns and directors dropped; staff penalized', () => {
  assert.equal(m.seniority('Software Engineer Intern').drop, true);
  assert.equal(m.seniority('Director of Engineering').drop, true);
  assert.equal(m.seniority('Staff Software Engineer').penalty, 15);
  assert.deepEqual(m.seniority('Software Engineer II'), { drop: false, penalty: 0 });
});

test('mobile/ios/android/frontend qualifiers exclude generic software engineer titles', () => {
  for (const t of ['Software Engineer, Mobile Platform (iOS)', 'Android Software Engineer', 'Senior Software Engineer, Native Mobile', 'Software Engineer, Frontend', 'Cybersecurity Solutions Engineer', 'Software Engineer, QA']) {
    assert.equal(m.match(t, { isTitle: true }).matched, false, t);
  }
});
test('a qualifier far from the role phrase in free text does not exclude it', () => {
  assert.equal(m.match("We're hiring a backend engineer to build the APIs behind our mobile app and many other things you will love").matched, true);
});
test('lead titles are penalized', () => {
  assert.equal(m.seniority('Lead Software Engineer').penalty, 15);
});
