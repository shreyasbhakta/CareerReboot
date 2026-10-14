import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cfg, silentLogger } from './helpers.mjs';
import { searchHm } from '../search-hm.mjs';
import { parseLinkedInJobUrl, parseJobPostingLd, findReportsTo, findTeam, cleanTitle, cleanCompany } from '../hm/job.mjs';
import { queryContext, expandTemplates, peopleFromHit, rankCandidates, mentionsCompany, pickFunction, timeFromUrl, isOtherCompany } from '../hm/research.mjs';

const JOB_URL = 'https://job-boards.greenhouse.io/acmecorp/jobs/123456';
const GH = {
  title: 'Senior Software Engineer, Payments',
  company_name: 'Acme Corp',
  location: { name: 'New York, NY' },
  departments: [{ name: 'Payments' }],
  content: '&lt;p&gt;Join the Payments team. You will report to the Director of Payments Engineering.&lt;/p&gt;&lt;p&gt;Recruiter: Riley Stone&lt;/p&gt;',
};
const HITS = [
  { url: 'https://www.linkedin.com/in/jane-park-1', title: 'Jane Park - Engineering Manager, Payments - Acme Corp | LinkedIn', description: 'Engineering Manager at Acme Corp. New York. Payments platform.' },
  { url: 'https://www.linkedin.com/posts/sam-lee-9_hiring-activity-1', title: 'Sam Lee on LinkedIn: We are hiring a Senior Software Engineer at Acme Corp', description: "We're hiring a Senior Software Engineer for Payments at Acme Corp." },
  { url: 'https://www.linkedin.com/in/old-timer', title: 'Pat Old - Former Engineering Manager at Acme Corp | LinkedIn', description: 'Former Acme Corp' },
  { url: 'https://www.linkedin.com/in/other-co', title: 'Chris Other - Engineering Manager - Globex | LinkedIn', description: 'Globex' },
  { url: 'https://www.linkedin.com/in/ic-dev', title: 'Dana Dev - Software Engineer - Acme Corp | LinkedIn', description: 'Acme Corp' },
];

const res = (body, ok = true) => ({ ok, status: ok ? 200 : 404, headers: { get: () => null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
function fakeFetch(calls) {
  return async (url) => {
    calls.push(String(url));
    if (url.startsWith('https://boards-api.greenhouse.io/')) return res(GH);
    if (url.startsWith('https://api.search.brave.com/')) return res({ web: { results: HITS } });
    if (url === JOB_URL) return res('<html><title>Acme</title></html>');
    return res('', false);
  };
}

test('search-hm: fetches the posting, ranks the team manager and the poster, drops noise', async () => {
  const calls = [];
  const c = cfg();
  c.hm_search.max_queries = 3;
  const r = await searchHm({ url: JOB_URL, env: { BRAVE_SEARCH_API_KEY: 'k' }, cfg: c, logger: silentLogger, fetchImpl: fakeFetch(calls), dataDir: mkdtempSync(join(tmpdir(), 'hm-')) });
  assert.equal(r.job.company, 'Acme', 'legal suffix dropped for searching');
  assert.equal(r.job.team, 'Payments');
  assert.equal(r.job.reportsTo, 'Director of Payments Engineering');
  assert.ok(!calls.some((u) => new URL(u).hostname.endsWith('linkedin.com')), 'LinkedIn is never fetched');
  const names = r.candidates.map((x) => x.name);
  assert.deepEqual(names.slice(0, 1), ['Riley Stone'], 'the person the posting names leads');
  assert.ok(names.includes('Jane Park') && names.includes('Sam Lee'));
  assert.ok(!names.includes('Pat Old') && !names.includes('Chris Other') && !names.includes('Dana Dev'));
  const jane = r.candidates.find((x) => x.name === 'Jane Park');
  assert.equal(jane.role, 'hiring_manager');
  assert.ok(jane.evidence.some((e) => e.types.includes('team_match')));
  assert.equal(r.candidates.find((x) => x.name === 'Sam Lee').profileUrl, 'https://www.linkedin.com/in/sam-lee-9');
  assert.deepEqual(r.providers.used, ['brave']);
  assert.ok(r.providers.missing.includes('exa'));
  assert.ok(r.digDeeper.length > 0);
});

test('search-hm: helpers', () => {
  assert.deepEqual(parseLinkedInJobUrl('https://www.linkedin.com/jobs/view/staff-engineer-at-acme-corp-4012345678/'), { title: 'Staff Engineer', company: 'Acme Corp' });
  assert.equal(findReportsTo('This role reports directly to our VP of Engineering and Product.'), 'VP of Engineering and Product');
  assert.equal(findReportsTo('Reports to the team.'), '');
  assert.equal(findTeam('Team: Growth\nAbout'), 'Growth');
  assert.equal(cleanTitle('Job Application for Backend Engineer at Acme | Careers', 'Acme'), 'Backend Engineer');
  assert.ok(mentionsCompany('Manager at ACME Inc.', 'Acme') && !mentionsCompany('Acmeville', 'Acme Corp'));
  const ld = parseJobPostingLd('<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"JobPosting","title":"SRE","hiringOrganization":{"name":"Globex","sameAs":"https://globex.com"},"jobLocation":{"address":{"addressLocality":"Austin","addressRegion":"TX"}},"description":"<p>Hi</p>"}]}</script>');
  assert.deepEqual([ld.title, ld.company, ld.companyUrl, ld.location, ld.text], ['SRE', 'Globex', 'https://globex.com', 'Austin, TX', 'Hi']);
});

test('search-hm: queries cover every template before a second leader title', () => {
  const c = cfg();
  const ctx = queryContext({ title: 'Backend Engineer, Payments (Remote)', company: 'Acme', team: '', location: 'Remote', reportsTo: '' }, c);
  assert.equal(ctx.title, 'Backend Engineer');
  assert.equal(ctx.team, 'Payments');
  const qs = expandTemplates(['"{company}" "{title}"', '"{company}" "{leader}"', '"{company}" "{location}"'], ctx, 10, 2);
  assert.deepEqual(qs, ['"Acme" "Backend Engineer"', '"Acme" "engineering manager"', '"Acme" "director of engineering"'], 'empty placeholders skip the template');
});

test('search-hm: a post author with no company and no job match is not a lead', () => {
  const c = cfg();
  const ctx = { ...queryContext({ title: 'Data Scientist', company: 'Acme', team: '', location: '' }, c), reportsTo: '' };
  assert.deepEqual(peopleFromHit({ url: 'https://www.linkedin.com/posts/x_y', title: 'Jo Smith on LinkedIn: we are hiring', snippet: 'Hiring a designer at Globex', provider: 'brave' }, ctx, c), []);
  const ranked = rankCandidates([{ name: 'Jo Smith', title: '', source: 'brave', url: 'u', quote: '', evidence: ['profile_at_company'] }], c);
  assert.deepEqual(ranked, [], 'a bare company tie is below min_points');
});

test('search-hm: live-run regressions (similar company names, brand accounts, old posts, legal entities)', () => {
  const c = cfg();
  const ctx = { ...queryContext({ title: 'Member of Technical Staff', company: 'Cohere', team: '', location: '', text: 'engineers building models in python' }, c), reportsTo: '' };
  const hit = (title, snippet, url, date) => peopleFromHit({ url, title, snippet, date, provider: 'brave' }, ctx, c, Date.parse('2026-10-14'));
  assert.deepEqual(hit('Jon Snydal - Cohere Health | LinkedIn', 'Experience: Cohere Health · Location: Boston', 'https://www.linkedin.com/in/jon'), [], 'Cohere Health is not Cohere');
  assert.equal(hit('Ana Ruiz - Engineering Manager - Cohere | LinkedIn', 'Experience: Cohere · Toronto', 'https://www.linkedin.com/in/ana').length, 1);
  assert.deepEqual(hit('Cohere OG on X: Cohere is hiring a Member of Technical Staff', '', 'https://x.com/cohereog/status/1'), [], 'brand accounts are not people');
  const old = hit('Ed Kim on LinkedIn: We are hiring a Member of Technical Staff at Cohere', 'hiring', 'https://www.linkedin.com/posts/ed_x', '2023-03-01T00:00:00Z');
  assert.deepEqual(old, [], 'an old post is about an earlier opening');
  const fresh = hit('Ed Kim on LinkedIn: We are hiring a Member of Technical Staff at Cohere', 'hiring', 'https://www.linkedin.com/posts/ed_x', '2026-09-01T00:00:00Z');
  assert.equal(fresh[0].evidence[0], 'posted_this_job');
  assert.match(fresh[0].quote, /^\[2026-09-01\] /);
  const talent = hit('Chris Smith - Director Talent Acquisition - Cohere | LinkedIn', 'Cohere', 'https://www.linkedin.com/in/chris');
  assert.ok(!talent[0].evidence.includes('leader_title') && talent[0].evidence.includes('recruiter_title'));
  assert.equal(hit('Q &amp;amp; A - x', 'Ana Ruiz, Director of Engineering at Cohere &amp;#x27;s', 'https://cohere.com/blog')[0]?.quote.includes('&amp;'), false);
  assert.equal(cleanCompany('0020 PayPal, Inc.'), 'PayPal');
  assert.equal(pickFunction('Member of Technical Staff', c.hm_search).id, 'engineering');
  assert.equal(pickFunction('Associate', c.hm_search, 'sales sales account executive pipeline sales quota').id, 'sales');
});

test('search-hm: second live round (dates from ids, boilerplate, education, departures, longer names)', () => {
  const c = cfg();
  const now = Date.parse('2026-10-14');
  const ctx = { ...queryContext({ title: 'Software Engineer', company: 'Cohere', team: '', location: 'Austin, TX' }, c), reportsTo: '' };
  const hit = (title, snippet, url) => peopleFromHit({ url, title, snippet, provider: 'brave' }, ctx, c, now);
  assert.equal(timeFromUrl('https://www.linkedin.com/posts/x_hiring-activity-6885000000000000000-abcd'), Number(6885000000000000000n >> 22n));
  assert.deepEqual(hit('Ed Kim on LinkedIn: hiring a Software Engineer at Cohere', 'hiring', 'https://www.linkedin.com/posts/ed_x-activity-6885000000000000000-ab'), [], 'a 2022 post (date from its id) is ignored');
  assert.deepEqual(hit('Cohere Health is hiring | Julian Kutman', 'Cohere Health is hiring a Software Engineer', 'https://www.linkedin.com/posts/julian_x'), [], 'every mention is a longer company name');
  assert.deepEqual(hit('Megan McCreary on LinkedIn: grateful for my time at Cohere', 'Cohere', 'https://www.linkedin.com/posts/m_x'), [], 'people who left are dropped');
  const kartik = hit('Kartik Agarwaal on LinkedIn: Software Engineer at Cohere', 'Login to LinkedIn to keep in touch with people you know', 'https://www.linkedin.com/posts/k_x');
  assert.ok(kartik.every((p) => !p.evidence.includes('posted_this_job') && !/Login/.test(p.quote)), 'boilerplate is not evidence and an undated post is not "this job"');
  const sneha = hit('Sneha Swamy - Engineering Manager - Cohere | LinkedIn', 'Experience: Cohere · Education: University of Texas at Austin · Location: Omaha', 'https://www.linkedin.com/in/sneha');
  assert.ok(!sneha[0].evidence.includes('location_match'));
  assert.ok(isOtherCompany('Cohere Technology Group', 'Cohere'));
});

test('search-hm: third live round (company-level fallback, team word only from the headline)', async () => {
  const c = cfg();
  c.hm_search.max_queries = 2;
  const queries = [];
  const fetchImpl = async (url) => {
    if (url.startsWith('https://boards-api.greenhouse.io/')) return res(GH);
    if (url.startsWith('https://api.search.brave.com/')) {
      const q = new URL(url).searchParams.get('q');
      queries.push(q);
      return res({ web: { results: q.includes('"tech lead"') ? [HITS[0]] : [] } });
    }
    return res('', false);
  };
  const r = await searchHm({ url: JOB_URL, env: { BRAVE_SEARCH_API_KEY: 'k' }, cfg: c, logger: silentLogger, fetchImpl, dataDir: mkdtempSync(join(tmpdir(), 'hm-')) });
  assert.ok(queries.length > 2 && queries.includes('site:linkedin.com/in "Acme" "tech lead"'), 'few leads widen to every leader title');
  assert.ok(r.candidates.some((x) => x.name === 'Jane Park'));

  const ctx = { ...queryContext({ title: 'Deployment Strategist', company: 'Palantir', team: 'Delta', location: '' }, c), reportsTo: '' };
  const ghazy = peopleFromHit({ url: 'https://www.linkedin.com/in/ng', title: 'Nermine Ghazy - Palantir Technologies | LinkedIn', snippet: 'Palantir. Flew Delta to Denver.', provider: 'brave' }, ctx, c);
  assert.ok(!ghazy[0].evidence.includes('team_match'));
});

test('search-hm: fourth live round (students are not leads)', () => {
  const c = cfg();
  const ctx = { ...queryContext({ title: 'Software Engineer', company: 'Palantir', team: '', location: '' }, c), reportsTo: '' };
  const hit = (title, snippet) => peopleFromHit({ url: 'https://www.linkedin.com/in/w', title, snippet, provider: 'brave' }, ctx, c);
  assert.deepEqual(hit('Walter Stark - Tech Lead - Palantir | LinkedIn', "I am a master's student in computer science at Cornell."), []);
  assert.equal(hit('Ana Ruiz - Engineering Manager - Palantir | LinkedIn', 'I mentor students and interns.').length, 1);
});

test('search-hm: a provider out of credits is skipped and its queries go to the next one', async () => {
  const calls = [];
  const c = cfg();
  c.hm_search.max_queries = 3;
  c.hm_search.providers = ['serper', 'brave'];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (url.startsWith('https://google.serper.dev/')) return { ok: false, status: 402, headers: { get: () => null }, text: async () => 'Not enough credits' };
    return fakeFetch([])(url);
  };
  const dataDir = mkdtempSync(join(tmpdir(), 'hm-'));
  const env = { SERPER_API_KEY: 's', BRAVE_SEARCH_API_KEY: 'b' };
  const r = await searchHm({ url: JOB_URL, env, cfg: c, logger: silentLogger, fetchImpl, dataDir });
  const serperCalls = () => calls.filter((u) => u.startsWith('https://google.serper.dev/')).length;
  assert.equal(serperCalls(), 1, 'one failed request, then serper is skipped');
  assert.deepEqual(r.providers.exhausted, ['serper']);
  assert.deepEqual(r.providers.used, ['brave']);
  assert.equal(r.providers.requests.brave, r.queries, 'every query was answered by brave instead');
  assert.ok(r.candidates.some((x) => x.name === 'Jane Park'));
  c.hm_search.queries = ['"{company}" engineering manager'];
  await searchHm({ url: JOB_URL, env, cfg: c, logger: silentLogger, fetchImpl, dataDir });
  assert.equal(serperCalls(), 1, 'the spent key stays skipped on the next search');
  c.hm_search.queries = ['"{company}" director of engineering'];
  await searchHm({ url: JOB_URL, env: { ...env, SERPER_API_KEY: 'new' }, cfg: c, logger: silentLogger, fetchImpl, dataDir });
  assert.equal(serperCalls(), 2, 'a replaced key is tried again straight away');
});

test('search-hm: Exa Markdown profiles name the profile owner, not a phrase from the text', () => {
  const c = cfg();
  const ctx = { ...queryContext({ title: 'Software Engineer', company: 'PayPal', team: '', location: '' }, c), reportsTo: '' };
  const snippet = '# Sunil Shetty Engineering Leader at Paypal | Ex-Intuit ## Experience ### Engineering Manager - Merchant Reliability - [PayPal](https://www.paypal.com)';
  const people = peopleFromHit({ url: 'https://linkedin.com/in/sunil-shetty-1', title: 'Sunil Shetty', snippet, provider: 'exa' }, ctx, c);
  assert.deepEqual(people.map((p) => p.name), ['Sunil Shetty']);
  assert.equal(people[0].title, 'Engineering Leader at Paypal');
});
