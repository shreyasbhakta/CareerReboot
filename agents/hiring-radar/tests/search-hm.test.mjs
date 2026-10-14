import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cfg, silentLogger } from './helpers.mjs';
import { searchHm } from '../search-hm.mjs';
import { parseLinkedInJobUrl, parseJobPostingLd, findReportsTo, findTeam, cleanTitle, cleanCompany } from '../hm/job.mjs';
import { queryContext, expandTemplates, peopleFromHit, rankCandidates, mentionsCompany, pickFunction } from '../hm/research.mjs';

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
  assert.deepEqual(old[0].evidence.slice(0, 1), ['hiring_post'], 'an old post is an earlier opening');
  assert.match(old[0].quote, /^\[2023-03-01\] /);
  const talent = hit('Chris Smith - Director Talent Acquisition - Cohere | LinkedIn', 'Cohere', 'https://www.linkedin.com/in/chris');
  assert.ok(!talent[0].evidence.includes('leader_title') && talent[0].evidence.includes('recruiter_title'));
  assert.equal(hit('Q &amp;amp; A - x', 'Ana Ruiz, Director of Engineering at Cohere &amp;#x27;s', 'https://cohere.com/blog')[0]?.quote.includes('&amp;'), false);
  assert.equal(cleanCompany('0020 PayPal, Inc.'), 'PayPal');
  assert.equal(pickFunction('Member of Technical Staff', c.hm_search).id, 'engineering');
  assert.equal(pickFunction('Associate', c.hm_search, 'sales sales account executive pipeline sales quota').id, 'sales');
});
