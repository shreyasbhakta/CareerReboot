import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cfg, silentLogger } from './helpers.mjs';
import { searchHm } from '../search-hm.mjs';
import { parseLinkedInJobUrl, parseJobPostingLd, findReportsTo, findTeam, cleanTitle } from '../hm/job.mjs';
import { queryContext, expandTemplates, peopleFromHit, rankCandidates, mentionsCompany } from '../hm/research.mjs';

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
  assert.equal(r.job.company, 'Acme Corp');
  assert.equal(r.job.team, 'Payments');
  assert.equal(r.job.reportsTo, 'Director of Payments Engineering');
  assert.ok(!calls.some((u) => new URL(u).hostname.endsWith('linkedin.com')), 'LinkedIn is never fetched');
  const names = r.candidates.map((x) => x.name);
  assert.deepEqual(names.slice(0, 1), ['Riley Stone'], 'the person the posting names leads');
  assert.ok(names.includes('Jane Park') && names.includes('Sam Lee'));
  assert.ok(!names.includes('Pat Old') && !names.includes('Chris Other') && !names.includes('Dana Dev'));
  const jane = r.candidates.find((x) => x.name === 'Jane Park');
  assert.equal(jane.role, 'hiring_manager');
  assert.ok(jane.evidence.some((e) => e.type === 'team_match'));
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
