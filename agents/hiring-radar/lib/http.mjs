// Polite HTTP client for the collectors: bounded concurrency, per-host spacing,
// request timeout, retry with exponential backoff + jitter, Retry-After /
// HTTP 429 handling, and request accounting. fetch/sleep are injectable so
// tests never touch the network or wait on real timers.

export const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(value);
  return Number.isNaN(when) ? null : Math.max(0, when - now);
}

export function createHttp({
  timeoutMs = 15000,
  retries = 3,
  baseDelayMs = 800,
  maxDelayMs = 20000,
  maxConcurrency = 4,
  perHostIntervalMs = 400,
  userAgent = 'hiring-radar/1.0 (+https://github.com/shreyasbhakta/CareerReboot)',
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  random = Math.random,
  stats = { requests: 0, retries: 0, failures: 0 },
} = {}) {
  let active = 0;
  const waiters = [];
  const nextSlotByHost = new Map();

  async function acquire() {
    if (active < maxConcurrency) { active++; return; }
    await new Promise((resolve) => waiters.push(resolve));
    active++;
  }
  function release() {
    active--;
    const w = waiters.shift();
    if (w) w();
  }

  async function spaceHost(host) {
    if (!perHostIntervalMs) return;
    const now = Date.now();
    const slot = Math.max(now, nextSlotByHost.get(host) ?? 0);
    nextSlotByHost.set(host, slot + perHostIntervalMs);
    if (slot > now) await sleep(slot - now);
  }

  async function once(url, init) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      stats.requests++;
      const res = await fetchImpl(url, {
        ...init,
        headers: { 'user-agent': userAgent, accept: 'application/json, text/plain, */*', ...(init.headers || {}) },
        signal: ctl.signal,
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.retryAfterMs = parseRetryAfter(res.headers?.get?.('retry-after'));
        throw err;
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  const retryable = (e) => e.name === 'AbortError' || e.status === 429 || e.status >= 500 || (e.status === undefined && !/^HTTP/.test(e.message));

  async function request(url, init = {}, parse = 'json') {
    let host = '';
    try { host = new URL(url).host; } catch { throw new Error(`invalid URL`); }
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      await acquire();
      try {
        await spaceHost(host);
        const res = await once(url, init);
        return parse === 'json' ? await res.json() : await res.text();
      } catch (e) {
        lastErr = e.name === 'AbortError' ? Object.assign(new Error(`timeout after ${timeoutMs}ms`), { name: 'AbortError' }) : e;
        if (attempt === retries || !retryable(lastErr)) break;
        stats.retries++;
        const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
        const wait = Math.min(maxDelayMs, Math.max(lastErr.retryAfterMs ?? 0, backoff * (0.5 + random() * 0.5)));
        release();
        await sleep(wait);
        await acquire(); // re-enter so the finally below balances
      } finally {
        release();
      }
    }
    stats.failures++;
    throw lastErr;
  }

  return {
    stats,
    getJson: (url, init) => request(url, { method: 'GET', ...init }, 'json'),
    getText: (url, init) => request(url, { method: 'GET', ...init }, 'text'),
    postJson: (url, body, init = {}) =>
      request(url, { method: 'POST', body: JSON.stringify(body), ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }, 'json'),
  };
}

/** Run async tasks with a concurrency cap; never rejects — returns settled results in order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = { ok: true, value: await fn(items[idx], idx) }; }
      catch (error) { out[idx] = { ok: false, error }; }
    }
  });
  await Promise.all(workers);
  return out;
}
