import test from 'node:test';
import assert from 'node:assert/strict';
import { cfg, silentLogger } from './helpers.mjs';
import { createLlm, extractJson } from '../llm/router.mjs';
import { classifyAmbiguous } from '../llm/tasks.mjs';

const ok = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
const fail = (status) => ({ ok: false, status, headers: { get: () => null }, json: async () => ({}), text: async () => '' });
const openaiBody = (obj) => ok({ choices: [{ message: { content: JSON.stringify(obj) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
const anthropicBody = (obj) => ok({ content: [{ type: 'text', text: JSON.stringify(obj) }], usage: { input_tokens: 7, output_tokens: 3 } });

const mkLlm = (env, fetchImpl, over = {}) => {
  const c = cfg();
  Object.assign(c.llm, over);
  return createLlm({ cfg: c, env, logger: silentLogger, fetchImpl, sleep: async () => {} });
};
const verdict = { is_hiring: true, role: 'Backend Engineer', confidence: 0.9, reason: 'explicit' };

test('disabled by default even when keys exist (no surprise spend)', () => {
  const llm = mkLlm({ OPENAI_API_KEY: 'k'.repeat(20) }, async () => { throw new Error('should not be called'); });
  assert.equal(llm.enabled, false);
});
test('enabled when MODEL_PROVIDER is set; routes to the chosen provider', async () => {
  const seen = [];
  const llm = mkLlm({ MODEL_PROVIDER: 'openai', MODEL_NAME: 'my-model', OPENAI_API_KEY: 'k'.repeat(20) }, async (url, init) => { seen.push([url, JSON.parse(init.body).model]); return openaiBody(verdict); });
  const r = await classifyAmbiguous(llm, { text: "We're hiring", company: 'X' });
  assert.equal(r.isHiring, true);
  assert.deepEqual(seen[0], ['https://api.openai.com/v1/chat/completions', 'my-model']);
  assert.deepEqual([llm.stats.tokensIn, llm.stats.tokensOut], [10, 5]);
});
test('falls back to the next provider when the first fails', async () => {
  const env = { MODEL_PROVIDER: 'openai', OPENAI_API_KEY: 'k'.repeat(20), ANTHROPIC_API_KEY: 'a'.repeat(20) };
  const llm = mkLlm(env, async (url) => (url.includes('openai') ? fail(500) : anthropicBody(verdict)), { retries: 0 });
  const r = await classifyAmbiguous(llm, { text: 'hi' });
  assert.equal(r.isHiring, true);
  assert.equal(llm.stats.fallbacks, 1);
  assert.equal(llm.stats.failures, 1);
});
test('all providers failing returns null, never throws', async () => {
  const env = { MODEL_PROVIDER: 'openai', OPENAI_API_KEY: 'k'.repeat(20), ANTHROPIC_API_KEY: 'a'.repeat(20) };
  const llm = mkLlm(env, async () => fail(503), { retries: 0 });
  assert.equal(await classifyAmbiguous(llm, { text: 'hi' }), null);
});
test('invalid structured output is rejected by the validator and falls through', async () => {
  const llm = mkLlm({ MODEL_PROVIDER: 'openai', OPENAI_API_KEY: 'k'.repeat(20) }, async () => openaiBody({ is_hiring: 'maybe', confidence: 7 }), { retries: 0 });
  assert.equal(await classifyAmbiguous(llm, { text: 'hi' }), null);
});
test('OpenAI-compatible gateway via MODEL_BASE_URL (OmniRoute / Ollama / OpenRouter)', async () => {
  let url;
  const llm = mkLlm({ MODEL_PROVIDER: 'omniroute', MODEL_BASE_URL: 'http://localhost:20128/v1/', OMNIROUTE_API_KEY: 'k'.repeat(20) }, async (u) => { url = u; return openaiBody(verdict); });
  assert.ok(await classifyAmbiguous(llm, { text: 'x' }));
  assert.equal(url, 'http://localhost:20128/v1/chat/completions');
});
test('call budget is enforced and identical prompts are served from cache', async () => {
  let n = 0;
  const llm = mkLlm({ MODEL_PROVIDER: 'openai', OPENAI_API_KEY: 'k'.repeat(20) }, async () => (n++, openaiBody(verdict)), { max_calls: 1 });
  await classifyAmbiguous(llm, { text: 'one' });
  await classifyAmbiguous(llm, { text: 'one' });
  assert.equal(n, 1);
  assert.equal(llm.stats.cacheHits, 1);
  assert.equal(await classifyAmbiguous(llm, { text: 'two' }), null, 'budget exhausted');
});
test('extractJson tolerates prose around the object and rejects non-JSON', () => {
  assert.deepEqual(extractJson('Sure! {"a":1} done'), { a: 1 });
  assert.throws(() => extractJson('no json here'));
});
