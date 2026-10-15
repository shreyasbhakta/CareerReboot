#!/usr/bin/env node
/**
 * Search HM: who is the hiring manager (or poster) behind one job posting?
 * Fetches the posting, runs targeted public searches across every configured
 * provider, and ranks the people found by evidence. Leads, never confirmed facts.
 * Read-only toward third parties; never logs in anywhere and never fetches LinkedIn.
 * Usage: node search-hm.mjs <job-url> [options]   (see --help)
 */
import { join, resolve } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { ROOT, CAREER_OPS_DIR, loadConfig, loadDotEnv } from './lib/config.mjs';
import { createLogger } from './lib/logger.mjs';
import { createHttp } from './lib/http.mjs';
import { createCache } from './lib/cache.mjs';
import { createLlm } from './llm/router.mjs';
import { rankHiringCandidates } from './llm/tasks.mjs';
import { fetchJob } from './hm/job.mjs';
import { researchJob } from './hm/research.mjs';
import { hasFlag, flagValue, validateFlags } from '../career-ops/lib/cli-flags.mjs';
import { getCareerOpsRoot } from '../career-ops/path-resolver.mjs';
import { isMainModule } from '../career-ops/lib/is-main-module.mjs';

const VALUE_FLAGS = ['--company', '--title', '--location', '--team', '--jd-file'];
const KNOWN_FLAGS = [...VALUE_FLAGS, '--jd-stdin', '--json', '--no-llm', '--no-save', '--verbose', '--help', '-h'];
const USAGE = `Usage: node agents/hiring-radar/search-hm.mjs <job-url> [options]

  --company <name>   Correct the company name the page gave
  --title <title>    Correct the job title
  --location <loc>   Correct the location
  --team <team>      Name the team, when the posting does not
  --jd-file <path>   Use this job description text (e.g. for LinkedIn URLs)
  --jd-stdin         Read the job description text from stdin
  --json             Print the result as JSON
  --no-llm           Never call a model provider
  --no-save          Do not add the result to data/search-hm.json
  --verbose          Debug logging
  -h, --help         This message

Search providers come from env (SEARXNG_URL, BRAVE_SEARCH_API_KEY, SERPER_API_KEY,
SERPAPI_API_KEY, EXA_API_KEY, HUNTER_API_KEY). Results are leads with evidence; confirm before reaching out.`;
const HISTORY_MAX = 30;

const readStdin = async () => { let s = ''; for await (const chunk of process.stdin) s += chunk; return s; };

const dataDirFor = (env) => (env.HIRING_RADAR_DATA_DIR ? resolve(env.HIRING_RADAR_DATA_DIR) : join(getCareerOpsRoot(), 'data'));
export const historyPath = (env = process.env) => join(dataDirFor(env), 'search-hm.json');

export function loadHistory(path) {
  try { const v = JSON.parse(readFileSync(path, 'utf8')); return Array.isArray(v) ? v : []; } catch { return []; }
}

function saveHistory(path, result) {
  const list = [result, ...loadHistory(path).filter((r) => r.job?.url !== result.job.url)].slice(0, HISTORY_MAX);
  mkdirSync(join(path, '..'), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(list, null, 1), { mode: 0o600 });
  renameSync(tmp, path);
}

/**
 * @param {{url: string, overrides?: object, env?: object, noLlm?: boolean, logger?: object, cfg?: object, fetchImpl?: Function}} opts
 */
export async function searchHm({ url, overrides = {}, env = process.env, noLlm = false, logger = createLogger({ env }), cfg = loadConfig({ env }), fetchImpl, dataDir = dataDirFor(env) }) {
  const started = Date.now();
  const hc = cfg.http;
  const stats = { requests: 0, retries: 0, failures: 0 };
  // Free search tiers allow about one request per second per host.
  const http = createHttp({ timeoutMs: hc.timeout_ms, retries: hc.retries, baseDelayMs: hc.base_delay_ms, maxDelayMs: hc.max_delay_ms, maxConcurrency: hc.max_concurrency, perHostIntervalMs: Math.max(hc.per_host_interval_ms, 1100), fetchImpl, stats });
  const cacheDir = join(dataDir, 'cache');
  const cache = createCache({ dir: cacheDir, ttlHours: cfg.hm_search.cache_hours });

  const job = await fetchJob({ url, http, overrides });
  logger.info(`Job: ${job.title || '?'} at ${job.company || '?'} (${job.sources.join(', ') || 'no source'})`);
  const warnings = [...job.warnings];
  let research = { candidates: [], digDeeper: [], providers: { used: [], failed: [], missing: [] }, queries: 0, errors: [], ctx: {} };
  if (job.company && job.title) research = await researchJob({ job, cfg, env, http, cache, logger });

  let model = null;
  const llmCfg = noLlm || !cfg.hm_search.llm_rerank ? { ...cfg, llm: { ...cfg.llm, enabled: false } } : cfg;
  const llm = createLlm({ cfg: llmCfg, env, logger, cachePath: join(cacheDir, 'hiring-radar-llm.json'), fetchImpl });
  if (llm.enabled && research.candidates.length) {
    const ranking = await rankHiringCandidates(llm, job, research.candidates);
    if (ranking) {
      const w = cfg.hm_search.llm_weight;
      for (const c of research.candidates) {
        const r = ranking[c.id];
        if (!r) continue;
        c.model = r;
        c.score = Math.round(c.ruleScore * (1 - w) + r.likelihood * w);
        c.confidence = c.score >= cfg.hm_search.confidence.high ? 'high' : c.score >= cfg.hm_search.confidence.medium ? 'medium' : 'low';
      }
      research.candidates.sort((a, b) => b.score - a.score);
      model = llm.providers[0];
    } else warnings.push('The model re-ranking step did not answer; showing rule-based ranking.');
    llm.flush();
  }

  if (!research.providers.used.length && job.company && job.title) warnings.push('No search provider answered. Add a Brave, Serper or Exa key (or a SearXNG URL) under Hiring Radar → Keys & data.');
  const { text, ...jobOut } = job;
  return {
    ok: true,
    searchedAt: new Date().toISOString(),
    job: { ...jobOut, textChars: text.length, excerpt: text.slice(0, 600) },
    query: research.ctx,
    candidates: research.candidates,
    digDeeper: research.digDeeper,
    providers: research.providers,
    model,
    queries: research.queries,
    requests: stats.requests,
    runtimeSeconds: Math.round((Date.now() - started) / 100) / 10,
    warnings: [...warnings, ...research.errors],
    note: 'Leads found in public sources, not a verified org chart. Confirm before reaching out.',
  };
}

function printText(r) {
  const j = r.job;
  console.log(`\n${j.title || '?'} — ${j.company || '?'}${j.location ? ` (${j.location})` : ''}${j.team ? ` · team: ${j.team}` : ''}${j.reportsTo ? ` · reports to: ${j.reportsTo}` : ''}`);
  console.log(`Providers: ${r.providers.used.join(', ') || 'none'}${r.providers.missing.length ? ` (not configured: ${r.providers.missing.join(', ')})` : ''} · ${r.queries} queries · ${r.runtimeSeconds}s${r.model ? ` · re-ranked by ${r.model}` : ''}\n`);
  if (!r.candidates.length) console.log('No people found with enough evidence. Try the dig-deeper searches below.\n');
  for (const c of r.candidates) {
    console.log(`${String(c.score).padStart(3)}  ${c.name}${c.title ? ` — ${c.title}` : ''}  [${c.role}, ${c.confidence}]`);
    if (c.profileUrl) console.log(`     ${c.profileUrl}`);
    if (c.model?.reason) console.log(`     model: ${c.model.reason}`);
    for (const e of c.evidence.slice(0, 4)) console.log(`     · ${e.label} (${e.source}) ${e.url}`);
  }
  console.log('\nDig deeper:');
  for (const l of r.digDeeper) console.log(`  ${l.label}\n    ${l.url}`);
  for (const w of r.warnings) console.log(`! ${w}`);
  console.log(`\n${r.note}`);
}

async function main(argv) {
  validateFlags(argv, KNOWN_FLAGS, USAGE, { valueFlags: VALUE_FLAGS, requireOperand: true });
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) { console.log(USAGE); return; }
  const url = argv.find((a, i) => !a.startsWith('-') && !VALUE_FLAGS.includes(argv[i - 1]));
  if (!url || !/^https?:\/\//i.test(url)) { console.error(`A job URL is required.\n\n${USAGE}`); process.exit(2); }

  loadDotEnv([join(CAREER_OPS_DIR, '.env'), join(ROOT, '.env')]);
  const jdFile = flagValue(argv, '--jd-file');
  const overrides = {
    company: flagValue(argv, '--company'), title: flagValue(argv, '--title'), location: flagValue(argv, '--location'), team: flagValue(argv, '--team'),
    text: jdFile ? readFileSync(resolve(jdFile), 'utf8') : hasFlag(argv, '--jd-stdin') ? await readStdin() : undefined,
  };
  const logger = createLogger({ verbose: hasFlag(argv, '--verbose') });
  const result = await searchHm({ url, overrides, noLlm: hasFlag(argv, '--no-llm'), logger });
  if (!hasFlag(argv, '--no-save')) {
    try { saveHistory(historyPath(), result); } catch (e) { logger.warn(`could not save history: ${e.message}`); }
  }
  if (hasFlag(argv, '--json')) console.log(JSON.stringify(result));
  else printText(result);
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: false, error: e.message }));
    else console.error(`Search HM failed: ${e.message}`);
    process.exit(1);
  });
}
