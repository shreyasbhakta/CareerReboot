// Provider-agnostic LLM router with ordered fallback (openai-compatible, anthropic, gemini).
// MODEL_PROVIDER picks the first provider; MODEL_NAME / MODEL_BASE_URL override model and endpoint
// (OmniRoute, OpenRouter, Ollama). Any failure degrades to "no answer": callers must handle null.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHttp } from '../lib/http.mjs';
import { sha1 } from '../lib/text.mjs';

const OPENAI_COMPAT = {
  openai: { base: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY' },
  openrouter: { base: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY' },
  omniroute: { base: null, keyEnv: 'OMNIROUTE_API_KEY' },   // base from MODEL_BASE_URL (self-hosted gateway)
  ollama: { base: 'http://localhost:11434/v1', keyEnv: null },
};

function adapters(env) {
  const compat = (name) => ({
    name,
    ready: () => {
      const c = OPENAI_COMPAT[name];
      const base = (name === env.MODEL_PROVIDER ? env.MODEL_BASE_URL : null) || c.base;
      return Boolean(base && (c.keyEnv === null || env[c.keyEnv]));
    },
    call: async (http, { model, system, user }) => {
      const c = OPENAI_COMPAT[name];
      const base = ((name === env.MODEL_PROVIDER ? env.MODEL_BASE_URL : null) || c.base).replace(/\/+$/, '');
      const headers = c.keyEnv && env[c.keyEnv] ? { authorization: `Bearer ${env[c.keyEnv]}` } : {};
      const r = await http.postJson(`${base}/chat/completions`, {
        model, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
      }, { headers });
      return { text: r?.choices?.[0]?.message?.content ?? '', usage: r?.usage ? { in: r.usage.prompt_tokens, out: r.usage.completion_tokens } : null };
    },
  });
  return {
    openai: compat('openai'),
    openrouter: compat('openrouter'),
    omniroute: compat('omniroute'),
    ollama: compat('ollama'),
    anthropic: {
      name: 'anthropic',
      ready: () => Boolean(env.ANTHROPIC_API_KEY),
      call: async (http, { model, system, user }) => {
        const r = await http.postJson('https://api.anthropic.com/v1/messages', {
          model, max_tokens: 600, temperature: 0, system, messages: [{ role: 'user', content: user }],
        }, { headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' } });
        return { text: (r?.content || []).map((b) => b.text || '').join(''), usage: r?.usage ? { in: r.usage.input_tokens, out: r.usage.output_tokens } : null };
      },
    },
    gemini: {
      name: 'gemini',
      ready: () => Boolean(env.GEMINI_API_KEY),
      call: async (http, { model, system, user }) => {
        const r = await http.postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
        const u = r?.usageMetadata;
        return { text: r?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ?? '', usage: u ? { in: u.promptTokenCount, out: u.candidatesTokenCount } : null };
      },
    },
  };
}

export function extractJson(text) {
  const s = String(text ?? '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(s.slice(start, end + 1));
}

/**
 * @returns {{enabled: boolean, providers: string[], complete: Function, stats: object, flush: Function}}
 */
export function createLlm({ cfg, env = process.env, logger, cachePath, readOnlyCache = false, fetchImpl, sleep } = {}) {
  const stats = { calls: 0, cacheHits: 0, failures: 0, tokensIn: 0, tokensOut: 0, fallbacks: 0 };
  const table = adapters(env);
  const order = [env.MODEL_PROVIDER, ...cfg.llm.providers].filter((p, i, a) => p && table[p] && a.indexOf(p) === i);
  const usable = order.filter((p) => table[p].ready());
  // 'auto' = opt-in via MODEL_PROVIDER, so merely having API keys for other
  // tools in the environment never starts spending tokens.
  const want = cfg.llm.enabled;
  const enabled = want === true || (want === 'auto' && Boolean(env.MODEL_PROVIDER) && usable.length > 0);
  const http = createHttp({
    timeoutMs: cfg.llm.timeout_ms, retries: cfg.llm.retries, baseDelayMs: 1000, perHostIntervalMs: 0,
    fetchImpl, sleep,
  });

  let cache = {};
  if (cachePath && existsSync(cachePath)) { try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch { cache = {}; } }
  let dirty = false;
  const TTL = 14 * 864e5;

  function modelFor(provider) {
    if (provider === env.MODEL_PROVIDER && env.MODEL_NAME) return env.MODEL_NAME;
    // Reuse career-ops' existing per-provider model env vars when set.
    const existing = { openai: env.OPENAI_MODEL, gemini: env.GEMINI_MODEL }[provider];
    return existing || cfg.llm.default_models[provider] || env.MODEL_NAME || '';
  }

  /**
   * @param {{task: string, system: string, user: string, validate: (obj: any) => any}} req
   * @returns {Promise<{ok: true, data: any, provider: string, cached?: boolean} | {ok: false, error: string}>}
   */
  async function complete({ task, system, user, validate }) {
    if (!enabled || usable.length === 0) return { ok: false, error: 'llm disabled or no provider configured' };
    const key = sha1(`${task}\n${system}\n${user}`);
    const hit = cache[key];
    if (hit && Date.now() - hit.at < TTL) { stats.cacheHits++; return { ok: true, data: hit.data, provider: 'cache', cached: true }; }
    if (stats.calls >= cfg.llm.max_calls) return { ok: false, error: 'llm call budget exhausted' };

    const errors = [];
    for (const [i, name] of usable.entries()) {
      if (stats.calls >= cfg.llm.max_calls) break;
      stats.calls++;
      try {
        const out = await table[name].call(http, { model: modelFor(name), system, user });
        const data = validate(extractJson(out.text));
        if (out.usage) { stats.tokensIn += out.usage.in || 0; stats.tokensOut += out.usage.out || 0; }
        cache[key] = { data, at: Date.now() };
        dirty = true;
        if (i > 0) stats.fallbacks++;
        return { ok: true, data, provider: name };
      } catch (e) {
        stats.failures++;
        errors.push(`${name}: ${e.message}`);
        logger?.warn(`llm ${task} via ${name} failed (${e.message}); ${i < usable.length - 1 ? 'trying next provider' : 'giving up'}`);
      }
    }
    return { ok: false, error: errors.join('; ') || 'no provider answered' };
  }

  function flush() {
    if (!dirty || !cachePath || readOnlyCache) return;
    try {
      mkdirSync(dirname(cachePath), { recursive: true });
      const fresh = Object.fromEntries(Object.entries(cache).filter(([, v]) => Date.now() - v.at < TTL));
      writeFileSync(cachePath, JSON.stringify(fresh), { mode: 0o600 });
    } catch { /* cache is best-effort */ }
  }

  return { enabled: enabled && usable.length > 0, providers: usable, complete, stats, flush };
}
