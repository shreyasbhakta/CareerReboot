import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, normalizeText } from '../lib/text.mjs';
import { parsePostAuthor, parseProfileTitle, extractNamedContact, isPlausibleName, personFromResult, cleanLinkedInProfileUrl } from '../extractors/person.mjs';
import { companyFromAtsUrl, companyFromText, companyFromPipeHeader, resolveCompany } from '../extractors/company.mjs';

test('canonical URL strips tracking, fragments, www, trailing slash and sorts params', () => {
  assert.equal(canonicalUrl('HTTP://www.Example.com/jobs/123/?utm_source=x&b=2&a=1#frag'), 'https://example.com/jobs/123?a=1&b=2');
  assert.equal(canonicalUrl('https://uk.linkedin.com/posts/jane-doe_hiring-123?utm_source=share&trk=abc'), 'https://linkedin.com/posts/jane-doe_hiring-123');
  assert.equal(canonicalUrl('https://boards.greenhouse.io/acme/jobs/1?gh_src=abc'), 'https://boards.greenhouse.io/acme/jobs/1');
});
test('canonical URL rejects non-http and garbage', () => {
  for (const u of ['', null, 'javascript:alert(1)', 'not a url', 'ftp://x.com/a']) assert.equal(canonicalUrl(u), '');
});
test('normalizeText folds case, punctuation and URLs', () => {
  assert.equal(normalizeText("We're HIRING!!! https://x.com/a  now"), 'we re hiring now');
});

test('post author: "Jane Doe on LinkedIn: ..."', () => {
  assert.equal(parsePostAuthor("Jane Doe on LinkedIn: We're hiring a backend engineer"), 'Jane Doe');
  assert.equal(parsePostAuthor('Example AI on LinkedIn: we are hiring'), null, 'company pages are not people');
  assert.equal(parsePostAuthor('Careers - Example'), null);
});
test('profile title parsing', () => {
  assert.deepEqual(parseProfileTitle('Jane Doe - VP Engineering - Example AI | LinkedIn'), { name: 'Jane Doe', title: 'VP Engineering', company: 'Example AI' });
  assert.deepEqual(parseProfileTitle('Jane Doe - VP Engineering at Example AI | LinkedIn'), { name: 'Jane Doe', title: 'VP Engineering', company: 'Example AI' });
  assert.equal(parseProfileTitle('Top 10 engineering jobs | LinkedIn'), null);
});
test('explicit contact lines produce a named contact; vague text does not', () => {
  assert.deepEqual(extractNamedContact('Hiring Manager: Jane Doe, Director of Engineering'), { name: 'Jane Doe', title: 'Director of Engineering' });
  assert.equal(extractNamedContact('Our hiring manager will reach out soon.'), null);
});
test('name plausibility rejects companies, single names and junk', () => {
  for (const n of ['Example AI', 'Hiring Team', 'Jane', 'jane doe', 'J4ne Doe', '', null]) assert.equal(isPlausibleName(n), false, String(n));
  assert.equal(isPlausibleName('Jane Q. Doe'), true);
});
test('personFromResult: confidence levels and never inventing', () => {
  const named = personFromResult({ title: 'Backend role', snippet: 'Hiring Manager: Jane Doe, VP Engineering', url: 'https://x.com/a' });
  assert.equal(named.confidence, 'HIGH');
  const profile = personFromResult({ title: 'Jane Doe - CTO - Example AI | LinkedIn', snippet: '', url: 'https://www.linkedin.com/in/janedoe?utm=1' });
  assert.equal(profile.confidence, 'MEDIUM');
  assert.equal(profile.url, 'https://www.linkedin.com/in/janedoe');
  const author = personFromResult({ title: "Jane Doe on LinkedIn: I'm hiring", snippet: '', url: 'https://linkedin.com/posts/x', firstPerson: true });
  assert.equal(author.confidence, 'HIGH');
  assert.equal(personFromResult({ title: 'Engineering jobs at Example', snippet: 'We are hiring', url: 'https://example.com/careers' }), null);
  assert.equal(cleanLinkedInProfileUrl('https://example.com/in/x'), null);
});

test('company from ATS slug is MEDIUM; structured is HIGH; unknown is empty/LOW', () => {
  assert.deepEqual(companyFromAtsUrl('https://job-boards.greenhouse.io/example-ai/jobs/123'), { name: 'Example Ai', confidence: 'MEDIUM', source: 'ats-slug' });
  assert.equal(resolveCompany({ structured: 'Stripe' }).confidence, 'HIGH');
  assert.equal(resolveCompany({ url: 'https://example.com/x', title: 'hello', text: 'nothing here' }).confidence, 'LOW');
});
test('company from text patterns, rejecting pronouns', () => {
  assert.equal(companyFromText('Example AI is hiring backend engineers').name, 'Example AI');
  assert.equal(companyFromText('Join our team at Acme Robotics today').name, 'Acme Robotics');
  assert.equal(companyFromText("We're hiring engineers")?.name ?? '', '');
  assert.equal(companyFromText('We are hiring'), null);
});
test('HN header company', () => {
  assert.equal(companyFromPipeHeader('Acme Corp | Backend Engineer | NYC | REMOTE').name, 'Acme Corp');
  assert.equal(companyFromPipeHeader('just a sentence'), null);
});

import { stripHtml } from '../lib/text.mjs';
test('stripHtml decodes numeric/hex entities (HN uses &#x2F;)', () => {
  assert.equal(stripHtml('https:&#x2F;&#x2F;a.co&#x2F;x &amp; it&#39;s <p>ok'), "https://a.co/x & it's \nok");
});

import { companyFromJobTitle } from '../extractors/company.mjs';
test('company from job-page titles', () => {
  assert.equal(companyFromJobTitle('Backend Engineer (Java) - Benifex'), 'Benifex');
  assert.equal(companyFromJobTitle('Unusual Ventures hiring AI Engineer'), 'Unusual Ventures');
  assert.equal(companyFromJobTitle('Remote Senior Backend Engineer (Python/FastAPI) at Turing'), 'Turing');
  assert.equal(companyFromJobTitle('Senior AI Engineer - LLM & Machine Learning - InventYOU AB'), 'InventYOU AB');
  assert.equal(companyFromJobTitle('Backend Engineer - Remote'), '');
  assert.equal(companyFromJobTitle('Software Engineer | LinkedIn'), '');
});

test('regression: a job title is never read as a person ("Forward Deployed Engineer - Built In NYC")', () => {
  for (const t of ['Forward Deployed Engineer - Built In NYC', 'Senior AI Engineer - Acme', 'Backend Engineer - Remote', 'Software Engineer II - Stripe | LinkedIn']) {
    assert.equal(isPlausibleName(t.split(' - ')[0]), false, t);
    assert.equal(personFromResult({ title: t, snippet: '', url: 'https://builtin.com/job/x' }), null, t);
    assert.equal(parseProfileTitle(t), null, t);
  }
  // but a genuine LinkedIn profile result still works
  assert.equal(personFromResult({ title: 'Jane Doe - CTO - Acme | LinkedIn', snippet: '', url: 'https://www.linkedin.com/in/janedoe' }).name, 'Jane Doe');
  // and a profile-shaped title on a non-profile URL is not trusted
  assert.equal(personFromResult({ title: 'Jane Doe - CTO - Acme | LinkedIn', snippet: '', url: 'https://example.com/team' }), null);
});

test('company-from-title rejects skill lists, roles and locations; strips Careers suffix', () => {
  assert.equal(companyFromJobTitle('Backend Engineer - Java, Kotlin, Spring Boot'), '');
  assert.equal(companyFromJobTitle('AI Engineer - Agentic Systems & RAG'), '');
  assert.equal(companyFromJobTitle('Backend Engineer - Hitachi Careers'), 'Hitachi');
  assert.equal(companyFromJobTitle('Backend Engineer - Pinwheel • New York City'), 'Pinwheel');
});
