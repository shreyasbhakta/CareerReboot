import test from 'node:test';
import assert from 'node:assert/strict';
import { cfg, NOW } from './helpers.mjs';
import { activityScore } from '../scoring/activity.mjs';
import { technicalMatch } from '../scoring/role-match.mjs';
import { classifyLocation } from '../scoring/location.mjs';
import { scoreSignal, personScore } from '../scoring/overall.mjs';
import { parseDate, ageHours } from '../lib/dates.mjs';

const c = cfg();
const hoursAgo = (h) => new Date(NOW.getTime() - h * 36e5).toISOString();

test('recency bands match the spec', () => {
  const cases = [[1, 100], [11.9, 100], [12.5, 90], [30, 80], [60, 65], [100, 45], [150, 45], [200, 25], [330, 25], [400, 10]];
  for (const [h, want] of cases) assert.equal(activityScore(hoursAgo(h), c, NOW).score, want, `${h}h`);
});
test('unknown date gets the configured middling score and is flagged', () => {
  const r = activityScore(null, c, NOW);
  assert.deepEqual([r.score, r.known], [c.recency.unknown_age_score, false]);
});
test('future timestamps are clamped to age 0', () => {
  assert.equal(activityScore(hoursAgo(-5), c, NOW).score, 100);
});
test('recency bands are configurable', () => {
  const k = cfg();
  k.recency.bands = [{ max_hours: 1, score: 77 }];
  assert.equal(activityScore(hoursAgo(0.5), k, NOW).score, 77);
  assert.equal(activityScore(hoursAgo(5), k, NOW).score, k.recency.floor_score);
});

test('date parsing: ISO, epoch, relative', () => {
  assert.equal(parseDate('2026-10-01T10:00:00Z').toISOString(), '2026-10-01T10:00:00.000Z');
  assert.equal(parseDate(Date.parse('2026-10-01T10:00:00Z')).toISOString(), '2026-10-01T10:00:00.000Z');
  assert.equal(parseDate('3 hours ago', NOW).toISOString(), '2026-10-01T09:00:00.000Z');
  assert.equal(parseDate('2 days ago', NOW).toISOString(), '2026-09-29T12:00:00.000Z');
  assert.equal(parseDate('1 week ago', NOW).toISOString(), '2026-09-24T12:00:00.000Z');
  assert.equal(parseDate('5d', NOW).toISOString(), '2026-09-26T12:00:00.000Z');
  assert.equal(parseDate('yesterday', NOW).toISOString(), '2026-09-30T12:00:00.000Z');
  assert.equal(parseDate('not a date'), null);
  assert.equal(parseDate(''), null);
  assert.equal(ageHours('2026-10-01T06:00:00Z', NOW), 6);
});

test('technical match is a transparent sum with a capped skill component', () => {
  const r = technicalMatch({ role: { tier: 'target', canonical: 'Backend Engineer' }, text: 'Java Spring Boot Kafka Redis PostgreSQL microservices on AWS with Kubernetes, LangGraph RAG LLM agentic' }, c);
  assert.equal(r.score, 100);
  const skillPts = r.breakdown.filter((b) => b.group).reduce((a, b) => a + b.points, 0);
  assert.ok(Math.abs(skillPts - c.technical.skill_points_cap) < 0.6, `skill points ${skillPts}`);
  assert.ok(r.breakdown.some((b) => b.label === 'Java'));
});
test('java does not match javascript; excluded roles score zero base', () => {
  const r = technicalMatch({ role: { tier: 'target' }, text: 'JavaScript only' }, c);
  assert.ok(!r.matchedSkills.includes('Java'));
  assert.equal(technicalMatch({ role: { tier: 'excluded' }, text: '' }, c).score, 0);
});
test('seniority penalty is shown in the breakdown', () => {
  const r = technicalMatch({ role: { tier: 'target' }, text: '', seniorityPenalty: 15 }, c);
  assert.equal(r.score, 55);
  assert.ok(r.breakdown.some((b) => b.points === -15));
});

test('location classification', () => {
  assert.equal(classifyLocation('New York, NY', c).kind, 'home');
  assert.equal(classifyLocation('Jersey City, NJ (hybrid)', c).kind, 'home');
  assert.equal(classifyLocation('Remote - United States', c).kind, 'remote_us');
  assert.equal(classifyLocation('Austin, TX', c).kind, 'us_other');
  assert.equal(classifyLocation('London, UK', c).kind, 'non_us');
  assert.equal(classifyLocation('London, UK', c).drop, true);
  assert.equal(classifyLocation('Remote (EMEA)', c).kind, 'non_us');
  assert.equal(classifyLocation('', c).kind, 'unknown');
  assert.equal(classifyLocation('REMOTE OR ONSITE', c).kind, 'remote_us', 'OR must not read as the state of Oregon');
});

const sig = (over = {}) => ({
  role: { tier: 'target', canonical: 'Forward Deployed Engineer' }, title: 'FDE', text: 'We are hiring a Forward Deployed Engineer in New York.',
  location: 'New York', publishedAt: hoursAgo(8), directScore: 100,
  person: { name: 'Jane Doe', title: 'VP Engineering', confidence: 'HIGH' }, company: { name: 'Example AI', confidence: 'HIGH' }, ...over,
});
test('overall score is the weighted sum and fully exposed', () => {
  const s = scoreSignal(sig(), c, { now: NOW });
  const expected = Math.round(Object.entries(c.scoring.weights).reduce((a, [k, w]) => a + s.components[k] * w, 0));
  assert.equal(s.overall, expected);
  assert.equal(s.components.activity, 100);
  assert.equal(s.components.person, 100);
  assert.equal(s.components.location, 100);
  assert.ok(s.overall >= 85);
});
test('weights are configurable', () => {
  const k = cfg();
  k.scoring.weights = { technical: 1, activity: 0, direct_language: 0, person: 0, location: 0, company: 0 };
  const s = scoreSignal(sig(), k, { now: NOW });
  assert.equal(s.overall, s.components.technical);
});
test('no person lowers the score; LOW confidence counts less than HIGH', () => {
  const withP = scoreSignal(sig(), c, { now: NOW }).overall;
  const without = scoreSignal(sig({ person: null }), c, { now: NOW }).overall;
  assert.ok(without < withP);
  assert.ok(personScore({ name: 'A B', title: 'CTO', confidence: 'LOW' }, c) < personScore({ name: 'A B', title: 'CTO', confidence: 'HIGH' }, c));
  assert.ok(personScore({ name: 'A B', title: 'Recruiter', confidence: 'HIGH' }, c) < personScore({ name: 'A B', title: 'CTO', confidence: 'HIGH' }, c));
});
