import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, parseRetryAfter, mapLimit } from '../lib/http.mjs';
import { redact, createLogger } from '../lib/logger.mjs';

const res = (status, body = {}, headers = {}) => ({ ok: status < 400, status, headers: { get: (k) => headers[k.toLowerCase()] }, json: async () => body, text: async () => JSON.stringify(body) });

test('retries 429 honoring Retry-After, then succeeds', async () => {
  const sleeps = [];
  const calls = [res(429, {}, { 'retry-after': '3' }), res(500), res(200, { ok: 1 })];
  const http = createHttp({ fetchImpl: async () => calls.shift(), sleep: async (ms) => sleeps.push(ms), random: () => 1, perHostIntervalMs: 0 });
  assert.deepEqual(await http.getJson('https://a.test/x'), { ok: 1 });
  assert.equal(http.stats.retries, 2);
  assert.ok(sleeps[0] >= 3000, `waited ${sleeps[0]}`);
  assert.ok(sleeps[1] >= 800 * 2 * 0.5, 'exponential backoff');
});
test('does not retry 4xx other than 429; counts failure', async () => {
  let n = 0;
  const http = createHttp({ fetchImpl: async () => (n++, res(404)), sleep: async () => {}, perHostIntervalMs: 0 });
  await assert.rejects(http.getJson('https://a.test/x'), /HTTP 404/);
  assert.equal(n, 1);
  assert.equal(http.stats.failures, 1);
});
test('gives up after the retry budget', async () => {
  let n = 0;
  const http = createHttp({ retries: 2, fetchImpl: async () => (n++, res(503)), sleep: async () => {}, perHostIntervalMs: 0 });
  await assert.rejects(http.getJson('https://a.test/x'), /HTTP 503/);
  assert.equal(n, 3);
});
test('request timeout aborts and is retried', async () => {
  let n = 0;
  const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => {
    n++;
    if (n === 1) signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    else resolve(res(200, { done: true }));
  });
  const http = createHttp({ timeoutMs: 10, fetchImpl, sleep: async () => {}, perHostIntervalMs: 0 });
  assert.deepEqual(await http.getJson('https://a.test/x'), { done: true });
  assert.equal(n, 2);
});
test('concurrency cap is respected', async () => {
  let active = 0, peak = 0;
  const fetchImpl = async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return res(200); };
  const http = createHttp({ maxConcurrency: 2, fetchImpl, perHostIntervalMs: 0 });
  await Promise.all(Array.from({ length: 8 }, (_, i) => http.getJson(`https://a.test/${i}`)));
  assert.equal(peak, 2);
});
test('parseRetryAfter handles seconds, dates and junk', () => {
  assert.equal(parseRetryAfter('5'), 5000);
  assert.equal(parseRetryAfter('Thu, 01 Oct 2026 12:00:10 GMT', Date.parse('2026-10-01T12:00:00Z')), 10000);
  assert.equal(parseRetryAfter('soon'), null);
  assert.equal(parseRetryAfter(undefined), null);
});
test('mapLimit never rejects and preserves order', async () => {
  const out = await mapLimit([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('x'); return n * 2; });
  assert.deepEqual(out.map((o) => (o.ok ? o.value : 'err')), [2, 'err', 6]);
});
test('logger redacts secrets from env values, query strings and auth headers', () => {
  const env = { OPENAI_API_KEY: 'sk-supersecretvalue123', HOME: '/x' };
  assert.equal(redact('key is sk-supersecretvalue123 ok', env), 'key is *** ok');
  assert.equal(redact('GET https://x.test/s?q=1&api_key=abcdef12345', {}), 'GET https://x.test/s?q=1&api_key=***');
  assert.equal(redact('Authorization: Bearer abc.def.ghi', {}), 'Authorization: Bearer ***');
  const lines = [];
  createLogger({ sink: (l) => lines.push(l), env }).info('using sk-supersecretvalue123');
  assert.equal(lines[0], '[HiringRadar] using ***');
});
