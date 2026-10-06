// Job postings from public ATS APIs (Greenhouse / Lever / Ashby / ...), via
// career-ops' provider layer — no new HTTP code, SSRF guard included.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as yaml from 'js-yaml';
import { pathToFileURL } from 'node:url';
import { CAREER_OPS_DIR } from '../lib/config.mjs';
import { mapLimit } from '../lib/http.mjs';

const providerDir = join(CAREER_OPS_DIR, 'providers');

/** Companies to sweep: portals.yml tracked_companies when present, else config. */
function candidateCompanies(cfg, env = process.env) {
  const root = env.CAREER_OPS_ROOT || env.CAREER_OPS_DATA_DIR || CAREER_OPS_DIR;
  const portals = env.CAREER_OPS_PORTALS || join(resolve(CAREER_OPS_DIR, root), 'portals.yml');
  let list = [];
  let from = 'config';
  if (existsSync(portals)) {
    try {
      const doc = yaml.load(readFileSync(portals, 'utf8')) || {};
      list = (doc.tracked_companies || []).filter((c) => c && c.name && c.enabled !== false && (c.api || c.careers_url) && c.scan_method !== 'websearch');
      if (list.length) from = 'portals.yml';
    } catch { /* fall back to config */ }
  }
  if (!list.length) list = cfg.sources.jobs.companies || [];
  return { list, from };
}

/** Rotate the sweep window by day so every company is visited over a few days. */
export function pickCompanies(list, max, now = new Date()) {
  if (list.length <= max) return list;
  const dayIndex = Math.floor(now.getTime() / 864e5);
  const start = (dayIndex * max) % list.length;
  return Array.from({ length: max }, (_, i) => list[(start + i) % list.length]);
}

export const collector = {
  id: 'jobs',

  async discover({ cfg, logger, env, now = new Date(), http: _unused }) {
    const jc = cfg.sources.jobs;
    const { list, from } = candidateCompanies(cfg, env);
    const picked = pickCompanies(list, jc.max_companies, now);
    const cap = picked.length < list.length ? '; capped by sources.jobs.max_companies, rotated daily' : '';
    logger.info(`Source: jobs — ${picked.length}/${list.length} companies (from ${from}${cap})`);

    const { loadProviders, resolveProvider } = await import(pathToFileURL(join(providerDir, '_registry.mjs')).href);
    const { makeHttpCtx } = await import(pathToFileURL(join(providerDir, '_http.mjs')).href);
    const providers = await loadProviders(providerDir);

    const errors = [];
    const results = await mapLimit(picked, jc.concurrency, async (entry) => {
      const resolved = resolveProvider(entry, providers, { skipIds: ['local-parser'] });
      if (!resolved || resolved.error) throw new Error(`${entry.name}: ${resolved?.error || 'no provider matches this entry'}`);
      const jobs = await resolved.provider.fetch(entry, { ...makeHttpCtx(), includeUndated: true, locationHints: undefined });
      if (!Array.isArray(jobs)) throw new Error(`${entry.name}: provider returned a non-array`);
      return jobs.slice(0, jc.max_jobs_per_company * 10).map((j) => ({ ...j, company: j.company || entry.name, _provider: resolved.provider.id, _entry: entry.name }));
    });

    const raw = [];
    let ok = 0;
    results.forEach((r, i) => {
      if (r.ok) { ok++; raw.push(...r.value); }
      else errors.push(`${picked[i].name}: ${r.error.message}`);
    });
    if (picked.length && ok === 0) throw new Error(`all ${picked.length} company boards failed (${errors[0]})`);
    return { raw, errors, companies: picked.map((c) => c.name), trackedNames: list.map((c) => c.name) };
  },

  normalize(j) {
    if (!j?.title || !j?.url) return null;
    const desc = String(j.description || '');
    return {
      source: `jobs:${j._provider || 'ats'}`,
      kind: 'job',
      sourceUrl: j.url,
      title: j.title,
      text: desc ? `${j.title}\n${desc.slice(0, 3000)}` : j.title,
      snippet: '',
      publishedAt: j.postedAt ? new Date(j.postedAt).toISOString() : null,
      location: j.location || '',
      companyName: j.company || '',
      metadata: { provider: j._provider },
    };
  },
};
