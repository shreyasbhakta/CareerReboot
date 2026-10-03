#!/usr/bin/env node
/**
 * Hiring Radar — "Who is actively hiring for roles that match me RIGHT NOW?"
 *
 *   node agents/hiring-radar/scan.mjs --dry-run
 *   node agents/hiring-radar/scan.mjs --days 3 --min-score 75
 *   node agents/hiring-radar/scan.mjs --source jobs --limit 100
 *
 * Read-only toward the outside world: it never sends messages, applies, or
 * submits forms. Outputs (gitignored, user layer) land in career-ops data/:
 *   hiring-signals.tsv   history ledger (human-editable status column)
 *   hiring-signals.json  machine-readable view for the dashboard
 *   hiring-radar.md      the daily digest
 */
import { join, resolve } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { ROOT, CAREER_OPS_DIR, loadConfig, loadDotEnv } from './lib/config.mjs';
import { createLogger } from './lib/logger.mjs';
import { createHttp } from './lib/http.mjs';
import { createCache } from './lib/cache.mjs';
import { hasFlag, flagValue, validateFlags } from '../career-ops/lib/cli-flags.mjs';
import { getCareerOpsRoot } from '../career-ops/path-resolver.mjs';
import { isMainModule } from '../career-ops/lib/is-main-module.mjs';
import { createRoleMatcher } from './extractors/role.mjs';
import { buildSignal, scoreAndAnnotate, detectSpikes, rankSignals } from './pipeline.mjs';
import { dedupeSignals } from './storage/normalize.mjs';
import { loadHistory, writeHistory, mergeHistory, knownKeys } from './storage/history.mjs';
import { connectionsPath, loadConnections, matchWarm } from './storage/connections.mjs';
import { createLlm } from './llm/router.mjs';
import { classifyAmbiguous, explainMatch } from './llm/tasks.mjs';
import { classifyPersonTitle, parseProfileTitle } from './extractors/person.mjs';
import { buildDigest } from './format/digest.mjs';
import { toMarkdown } from './format/markdown.mjs';
import { toJson } from './format/json.mjs';
import { notify } from './notify.mjs';
import { normalizeText, shortHash } from './lib/text.mjs';
import { collector as webSearch } from './collectors/web-search.mjs';
import { collector as hn } from './collectors/hn.mjs';
import { collector as jobs } from './collectors/jobs.mjs';

const KNOWN_FLAGS = ['--check-config', '--dry-run', '--days', '--limit', '--source', '--min-score', '--verbose', '--fixture', '--no-llm', '--help', '-h'];
const VALUE_FLAGS = ['--check-config', '--days', '--limit', '--source', '--min-score', '--fixture'];
const USAGE = `Usage: node agents/hiring-radar/scan.mjs [options]

  --dry-run          Discover, score and print; write nothing
  --days <1-30>      Search window in days (default from config, 7)
  --limit <n>        Keep at most n best-scoring signals per source (default 200)
  --source <list>    all | jobs | hiring-posts | hn | web-search (comma-separated)
  --min-score <0-100> Report floor (default from config)
  --fixture <file>   Process a JSON file of posts instead of live sources
  --no-llm           Never call a model provider
  --check-config <file>  Validate a YAML override file and exit (0 ok, 2 invalid)
  --verbose          Debug logging
  -h, --help         This message`;

const SOURCE_GROUPS = { all: ['hn', 'jobs', 'web-search'], 'hiring-posts': ['hn', 'web-search'], jobs: ['jobs'], hn: ['hn'], 'web-search': ['web-search'] };
const COLLECTORS = { hn, jobs, 'web-search': webSearch };
const CFG_KEY = { hn: 'hn', jobs: 'jobs', 'web-search': 'web_search' };

export function parseArgs(argv) {
  validateFlags(argv, KNOWN_FLAGS, USAGE, { valueFlags: VALUE_FLAGS, requireOperand: true });
  const num = (flag) => {
    const raw = flagValue(argv, flag);
    if (raw === undefined) return undefined;
    if (!/^\d+(\.\d+)?$/.test(raw)) { console.error(`${flag} expects a number, got "${raw}"\n\n${USAGE}`); process.exit(2); }
    return Number(raw);
  };
  const sources = (flagValue(argv, '--source') || 'all').split(',').map((s) => s.trim()).filter(Boolean);
  for (const s of sources) if (!SOURCE_GROUPS[s]) { console.error(`Unknown --source "${s}". Choose: ${Object.keys(SOURCE_GROUPS).join(', ')}\n\n${USAGE}`); process.exit(2); }
  return {
    dryRun: hasFlag(argv, '--dry-run'),
    verbose: hasFlag(argv, '--verbose'),
    noLlm: hasFlag(argv, '--no-llm'),
    days: num('--days'),
    limit: num('--limit'),
    minScore: num('--min-score'),
    fixture: flagValue(argv, '--fixture'),
    checkConfig: flagValue(argv, '--check-config'),
    sources,
  };
}

/** Fixture posts: {text, person?, company?, publishedAt, url?, title?, location?, kind?} */
function fixtureCandidates(file) {
  const rows = JSON.parse(readFileSync(resolve(file), 'utf8'));
  return (Array.isArray(rows) ? rows : [rows]).map((f) => ({
    source: f.source || 'fixture',
    kind: f.kind || 'post',
    sourceUrl: f.url || `https://example.test/fixture/${shortHash(f.text || f.title || '')}`,
    title: f.title || String(f.text || '').split(/[.!?\n]/)[0],
    text: f.text || '',
    snippet: f.text || '',
    publishedAt: f.publishedAt,
    location: f.location || '',
    companyName: typeof f.company === 'string' ? f.company : f.company?.name,
    person: f.person ? { name: f.person.name, title: f.person.title || '', url: f.person.url || null, source: 'fixture', confidence: f.person.confidence || 'HIGH' } : undefined,
    metadata: { fixture: true },
  }));
}

export async function runScan(opts = {}, deps = {}) {
  const started = Date.now();
  const env = deps.env || process.env;
  const now = deps.now || new Date();
  const logger = deps.logger || createLogger({ verbose: opts.verbose, env });
  const cfg = deps.cfg || loadConfig({ env });
  const days = Math.min(cfg.recency.max_days, Math.max(1, opts.days ?? cfg.recency.default_days));
  const minScore = opts.minScore ?? cfg.scoring.min_score;
  const limit = opts.limit ?? 200;
  const dataDir = deps.dataDir || join(env.HIRING_RADAR_DATA_DIR ? resolve(env.HIRING_RADAR_DATA_DIR) : getCareerOpsRoot(), env.HIRING_RADAR_DATA_DIR ? '' : 'data');
  const paths = {
    tsv: join(dataDir, 'hiring-signals.tsv'),
    json: join(dataDir, 'hiring-signals.json'),
    md: join(dataDir, 'hiring-radar.md'),
    cache: join(dataDir, 'cache'),
  };

  logger.info(`Starting scan${opts.dryRun ? ' (dry run — nothing will be written)' : ''} · window ${days}d · min score ${minScore}`);

  const stats = { requests: 0, retries: 0, failures: 0 };
  const hc = cfg.http;
  const http = createHttp({
    timeoutMs: hc.timeout_ms, retries: hc.retries, baseDelayMs: hc.base_delay_ms, maxDelayMs: hc.max_delay_ms,
    maxConcurrency: hc.max_concurrency, perHostIntervalMs: hc.per_host_interval_ms, fetchImpl: deps.fetchImpl, sleep: deps.sleep, stats,
  });
  // Search cache is written even on --dry-run: it holds only public search responses, and it is what keeps repeat runs from re-spending API requests.
  const cache = createCache({ dir: paths.cache, ttlHours: cfg.sources.web_search.cache_hours });
  const llm = createLlm({
    cfg: opts.noLlm ? { ...cfg, llm: { ...cfg.llm, enabled: false } } : cfg, env, logger,
    cachePath: join(paths.cache, 'hiring-radar-llm.json'), readOnlyCache: opts.dryRun, fetchImpl: deps.fetchImpl, sleep: deps.sleep,
  });
  const matcher = createRoleMatcher(cfg);

  const hist = loadHistory(paths.tsv);
  if (hist.malformed) logger.warn(`history: ${hist.malformed} malformed row(s) skipped`);
  const known = knownKeys(hist.signals, days);
  const conns = await loadConnections(deps.connectionsPath || connectionsPath(env));
  logger.info(conns.loaded ? `Connections loaded: ${conns.connections.length}` : `Connections not loaded (${conns.reason}); warm-intro matching is off`);

  const summary = {
    sourcesAttempted: [], sourcesSuccessful: [], sourcesFailed: [], sourcesSkipped: [],
    discovered: 0, filtered: {}, deduplicated: 0, retained: 0, errors: [],
    requests: 0, modelCalls: 0, runtimeSeconds: 0, warmConnections: 0, connectionsLoaded: conns.loaded,
  };
  const addErr = (m) => { if (summary.errors.length < 50) summary.errors.push(m); };

  // ---- discover + normalize ------------------------------------------------
  let candidates = [];
  let trackedKeys = new Set();
  if (opts.fixture) {
    summary.sourcesAttempted.push('fixture');
    try { candidates = fixtureCandidates(opts.fixture); summary.sourcesSuccessful.push('fixture'); }
    catch (e) { summary.sourcesFailed.push({ source: 'fixture', error: e.message }); }
  } else {
    const wanted = [...new Set(opts.sources.flatMap((s) => SOURCE_GROUPS[s]))];
    const registry = { ...COLLECTORS, ...(deps.collectors || {}) };
    for (const id of wanted) {
      const col = registry[id];
      if (!col) continue;
      if (cfg.sources[CFG_KEY[id]]?.enabled === false) { summary.sourcesSkipped.push({ source: id, reason: 'disabled in config' }); continue; }
      summary.sourcesAttempted.push(id);
      try {
        const res = await col.discover({ cfg, http, env, cache, logger, days, now });
        if (res.skipped) {
          summary.sourcesAttempted.pop();
          summary.sourcesSkipped.push({ source: id, reason: res.skipped });
          logger.warn(`Source ${id} skipped: ${res.skipped}`);
          continue;
        }
        (res.errors || []).forEach((e) => addErr(`${id}: ${e}`));
        if (res.trackedNames) trackedKeys = new Set(res.trackedNames.map(normalizeText));
        let n = 0, bad = 0;
        const fromSource = [];
        for (const raw of res.raw) {
          try { const c = col.normalize(raw, { cfg, now }); if (c) { fromSource.push(c); n++; } }
          catch (e) { bad++; addErr(`${id}: could not parse a result (${e.message})`); }
        }
        logger.info(`Source: ${id} — Results: ${res.raw.length} · usable: ${n}${bad ? ` · unparsable: ${bad}` : ''}`);
        candidates.push(...fromSource);
        summary.sourcesSuccessful.push(id);
      } catch (e) {
        summary.sourcesFailed.push({ source: id, error: e.message });
        logger.error(`Source ${id} failed: ${e.message}`);
      }
    }
  }
  summary.discovered = candidates.length;

  // ---- build, score ---------------------------------------------------------
  const ctx = { cfg, matcher, now, days, trackedKeys };
  const built = [];
  for (const c of candidates) {
    try {
      const r = buildSignal(c, ctx);
      if (r.dropped) summary.filtered[r.dropped] = (summary.filtered[r.dropped] || 0) + 1;
      else built.push(r.signal);
    } catch (e) {
      summary.filtered['parse-error'] = (summary.filtered['parse-error'] || 0) + 1;
      addErr(`could not process ${c.sourceUrl}: ${e.message}`);
    }
  }

  // Company-level activity comes from the job signals found in this run.
  for (const spike of detectSpikes({ jobSignals: built.filter((s) => s.signalType === 'JOB_POSTING'), history: hist.signals, knownKeys: known, cfg, now })) {
    scoreAndAnnotate(spike, ctx, trackedKeys.has(normalizeText(spike.company.name)));
    built.push(spike);
  }

  // ---- per-source cap: keep the best `limit` of each source, after scoring so a
  // source's order (e.g. alphabetical company boards) cannot bias what survives ----
  const perSource = new Map();
  const capped = [];
  for (const s of rankSignals(built)) {
    const root = s.source.split(':')[0];
    const n = perSource.get(root) || 0;
    if (n >= limit) { summary.filtered['over-limit'] = (summary.filtered['over-limit'] || 0) + 1; continue; }
    perSource.set(root, n + 1);
    capped.push(s);
  }

  // ---- dedupe (before any expensive step) --------------------------------------
  const ordered = capped;
  const { kept, dropped } = dedupeSignals(ordered, { windowDays: days, known });
  summary.deduplicated = dropped;
  let fresh = kept;
  logger.info(`New signals: ${fresh.length} · Deduplicated: ${dropped}`);

  // ---- LLM: only ambiguous posts ---------------------------------------------------
  if (llm.enabled) {
    const [lo, hi] = cfg.llm.ambiguous_range;
    const ambiguous = fresh.filter((s) => s.signalType !== 'JOB_POSTING' && s.directScore >= lo && s.directScore <= hi && s.source !== 'hn').slice(0, cfg.llm.max_calls);
    for (const s of ambiguous) {
      const verdict = await classifyAmbiguous(llm, { text: s.text, company: s.company?.name });
      if (!verdict) continue;
      if (verdict.isHiring && verdict.confidence >= 0.7) {
        s.directScore = Math.max(s.directScore, 80);
        s.metadata.llmClassified = true;
        if (s.signalType === 'HIRING_ANNOUNCEMENT') s.signalType = 'DIRECT_HIRING_POST';
      } else if (!verdict.isHiring && verdict.confidence >= 0.7) {
        s.metadata.llmRejected = verdict.reason;
        s._drop = true;
      }
      scoreAndAnnotate(s, ctx, trackedKeys.has(normalizeText(s.company.name)));
    }
    const rejected = fresh.filter((s) => s._drop).length;
    if (rejected) { fresh = fresh.filter((s) => !s._drop); summary.filtered['llm-not-hiring'] = rejected; }
  }

  // ---- people lookup (unverified candidates; never invented) ----------------------------
  if (cfg.enrichment.lookup_people && env.SEARXNG_URL) {
    try {
      const { findHiringManager } = await import('../career-ops/find-hiring-manager.mjs');
      const targets = rankSignals(fresh).filter((s) => !s.person && s.company?.name && s.scores.overall >= minScore).slice(0, cfg.enrichment.max_people_lookups);
      for (const s of targets) {
        const r = await findHiringManager({ company: s.company.name, role: s.role?.canonical, limit: 5, searxngUrl: env.SEARXNG_URL });
        if (!r.ok) { addErr(`people lookup for ${s.company.name}: ${r.error.slice(0, 120)}`); break; }
        const coKey = normalizeText(s.company.name);
        for (const cand of r.candidates) {
          const parsed = parseProfileTitle(`${cand.name} - ${cand.title}`);
          const mentionsCompany = normalizeText(`${cand.title}`).includes(coKey);
          if (!parsed || !mentionsCompany) continue;                       // unverifiable association -> do not surface
          const kind = classifyPersonTitle(parsed.title, cfg);
          if (kind === 'other' || kind === 'unknown') continue;
          s.person = { name: parsed.name, title: parsed.title, url: cand.url, source: 'lookup', confidence: 'MEDIUM' };
          s.metadata.personSource = 'search association (unverified)';
          scoreAndAnnotate(s, ctx, trackedKeys.has(coKey));
          break;
        }
      }
    } catch (e) { addErr(`people lookup unavailable: ${e.message}`); }
  }

  // ---- warm connections ------------------------------------------------------------------
  for (const s of fresh) {
    s.warm = matchWarm(s, conns);
    s.outreach.action = (await import('./extractors/outreach.mjs')).suggestedAction(s, cfg);
  }
  summary.warmConnections = fresh.filter((s) => s.warm.status === 'WARM_INTRO_AVAILABLE').length;

  // ---- retain + explain ----------------------------------------------------------------------
  const retained = rankSignals(fresh).filter((s) => s.scores.overall >= cfg.scoring.persist_min_score);
  summary.retained = retained.length;
  if (llm.enabled) {
    for (const s of retained.filter((x) => x.scores.overall >= minScore).slice(0, cfg.llm.explain_top)) {
      const ex = await explainMatch(llm, cfg, s);
      if (ex) { s.llmWhy = ex.why; s.outreach.angle = ex.outreachAngle; }
    }
  }
  llm.flush();

  // Connections can be added (or updated) after a signal was first stored, so re-match saved rows every run.
  if (conns.loaded) for (const h of hist.signals) h.warm = matchWarm(h, conns);

  // ---- merge, render ---------------------------------------------------------------------------------
  const merged = mergeHistory(hist.signals, retained.map((s) => ({ ...s, warm: s.warm })), { retentionDays: cfg.output.retention_days, now });
  const digest = buildDigest(merged, cfg, { now, minScore, days });
  summary.requests = stats.requests;
  summary.modelCalls = llm.stats.calls;
  summary.modelTokens = { in: llm.stats.tokensIn, out: llm.stats.tokensOut, cacheHits: llm.stats.cacheHits };
  summary.runtimeSeconds = Math.round((Date.now() - started) / 100) / 10;

  const markdown = toMarkdown({ digest, summary, generatedAt: now, days });
  const json = toJson({ digest, summary, config: cfg, generatedAt: now, days, dryRun: opts.dryRun });

  if (!opts.dryRun) {
    mkdirSync(dataDir, { recursive: true });
    writeHistory(paths.tsv, merged);
    const atomic = (p, body) => { const t = `${p}.tmp-${process.pid}`; writeFileSync(t, body, { mode: 0o600 }); renameSync(t, p); };
    atomic(paths.json, JSON.stringify(json, null, 2) + '\n');
    atomic(paths.md, markdown);
    logger.info(`Wrote ${paths.tsv}, ${paths.json}, ${paths.md}`);
  }

  const result = { summary, digest, json, markdown, paths, fresh: retained };
  const note = await notify({ digest, cfg, env, http, logger }).catch((e) => ({ sent: false, reason: e.message }));
  result.notification = note;
  return result;
}

function printDryRun(res) {
  const { digest, summary, paths } = res;
  console.log('\n=== DRY RUN: signals that would be persisted ===');
  if (!res.fresh.length) console.log('(none)');
  for (const s of res.fresh) {
    const c = s.scores.components;
    console.log(`${String(s.scores.overall).padStart(3)}  ${s.signalType.padEnd(20)} ${(s.role?.canonical || s.title).slice(0, 38).padEnd(38)} @ ${(s.company?.name || '?').slice(0, 24).padEnd(24)} ` +
      `age=${s.ageHours == null ? '?' : s.ageHours + 'h'} tech=${c.technical} act=${c.activity} dir=${c.direct_language} person=${s.person?.name ? s.person.name + ' [' + s.person.confidence + ']' : '-'} warm=${s.warm?.status}`);
  }
  console.log(`\nWould write: ${paths.tsv}\n             ${paths.json}\n             ${paths.md}`);
  console.log(`Report would list ${digest.high.length} high-signal, ${digest.active.length} active, ${digest.jobs.length} job(s).`);
  void summary;
}

function printSummary(summary, logger) {
  const filtered = Object.entries(summary.filtered).map(([k, v]) => `${k}=${v}`).join(' ') || 'none';
  logger.info('---- Summary ----');
  logger.info(`Sources attempted: ${summary.sourcesAttempted.join(', ') || 'none'}`);
  logger.info(`Sources successful: ${summary.sourcesSuccessful.join(', ') || 'none'}`);
  logger.info(`Sources failed: ${summary.sourcesFailed.map((f) => `${f.source} (${f.error})`).join('; ') || 'none'}`);
  if (summary.sourcesSkipped.length) logger.info(`Sources skipped: ${summary.sourcesSkipped.map((f) => `${f.source} (${f.reason})`).join('; ')}`);
  logger.info(`Signals discovered: ${summary.discovered} · filtered: ${filtered}`);
  logger.info(`Signals deduplicated: ${summary.deduplicated} · retained: ${summary.retained} · warm connections: ${summary.warmConnections}`);
  logger.info(`Requests: ${summary.requests} · model calls: ${summary.modelCalls} · completed in ${summary.runtimeSeconds}s`);
  logger.info(`Errors: ${summary.errors.length}${summary.errors.length ? '\n  - ' + summary.errors.slice(0, 10).join('\n  - ') : ''}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  loadDotEnv([join(CAREER_OPS_DIR, '.env'), join(ROOT, '.env')]);
  if (opts.checkConfig) {
    try { loadConfig({ localPath: resolve(opts.checkConfig) }); console.log('OK'); return; }
    catch (e) { console.error(e.message); process.exit(2); }
  }
  const logger = createLogger({ verbose: opts.verbose });
  let res;
  try {
    res = await runScan(opts, { logger });
  } catch (e) {
    logger.error(e.message);
    process.exit(e.message.startsWith('Invalid Hiring Radar configuration') ? 2 : 1);
  }
  if (opts.dryRun) printDryRun(res);
  printSummary(res.summary, logger);
  // A scan where every attempted source failed is a failure CI should surface;
  // an empty-but-successful scan is not.
  if (res.summary.sourcesAttempted.length > 0 && res.summary.sourcesSuccessful.length === 0) process.exit(1);
}

if (isMainModule(import.meta.url)) await main();
