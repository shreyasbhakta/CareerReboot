#!/usr/bin/env node
/**
 * find-hiring-manager.mjs — candidate hiring-manager/team lookups via a
 * self-hosted SearXNG instance (deploy/searxng/), for the Follow-up column's
 * "Find hiring manager" action.
 *
 * This was previously a deliberate stub ("not yet implemented — needs a
 * reliable way to find the hiring manager, which doesn't exist yet") rather
 * than an unreliable scraper wearing a working button. SearXNG changes that
 * calculus: it is a real, queryable search index, not a guess — but its
 * results are still web-search hits, not a verified org chart. This script
 * is explicit about that distinction end to end: every result is a
 * CANDIDATE, never asserted as confirmed, and the caller (the web UI) must
 * keep surfacing it as unverified.
 *
 * No LLM involved — pure HTTP + string heuristics, so this is free (0
 * tokens), same "discovery is free" principle as scan.mjs.
 *
 * Usage:
 *   node find-hiring-manager.mjs --company "Anthropic"
 *   node find-hiring-manager.mjs --company "Anthropic" --role "backend engineer"
 *   node find-hiring-manager.mjs --company "Anthropic" --json
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { validateFlags, flagValue, hasFlag } from './lib/cli-flags.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

// Deliberately NOT providers/_http.mjs's fetchJson: that helper wraps every
// call in the SSRF guard (_ip-guard.mjs) that rejects loopback/private
// addresses — correct for a provider fetching a URL that came from
// portals.yml (untrusted-ish, could be crafted to probe internal services),
// wrong here, where the target is SEARXNG_URL, a trusted, first-party,
// typically-localhost instance THIS script's own deploy/searxng/ set up.
// Blocking loopback here would make the documented, expected configuration
// unusable.
async function fetchJsonLocal(url, { timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const CAREER_OPS = getCareerOpsRoot();
dotenv.config({ path: join(CAREER_OPS, '.env'), quiet: true });

const KNOWN_FLAGS = ['--company', '--role', '--json', '--limit', '--help', '-h'];
const VALUE_FLAGS = ['--company', '--role', '--limit'];
const USAGE = `Usage:
  node find-hiring-manager.mjs --company "Anthropic" [--role "backend engineer"] [--limit 8] [--json]

Requires a running SearXNG instance — see deploy/searxng/README.md.
Set SEARXNG_URL in .env (defaults to http://localhost:8888).

Results are candidates found via web search, NOT a verified org chart —
confirm identity before reaching out.`;

/**
 * Titles worth ranking higher — the actual decision-maker roles a candidate
 * would want to reach, versus an individual-contributor mention that merely
 * happens to be at the company and show up in the same search.
 */
const SIGNAL_TITLES = [
  { re: /\b(head of|director of|vp,?|vice president)\b/i, weight: 3 },
  { re: /\bengineering manager\b/i, weight: 3 },
  { re: /\bhiring manager\b/i, weight: 3 },
  { re: /\btalent (acquisition|partner)|recruiter\b/i, weight: 2 },
  { re: /\b(lead|staff|principal)\b/i, weight: 1 },
];

function titleWeight(title) {
  let w = 0;
  for (const { re, weight } of SIGNAL_TITLES) if (re.test(title)) w += weight;
  return w;
}

/**
 * LinkedIn result titles are one of a few shapes:
 *   "First Last - Title - Company | LinkedIn"
 *   "First Last - Title at Company | LinkedIn"
 *   "First Last | LinkedIn"
 * Split on " - " / " | " and take the first segment as the name, the rest
 * (joined) as the title/context. Best-effort — a search snippet is not a
 * structured API, so a malformed split just yields an empty title rather
 * than throwing.
 * @param {string} rawTitle
 * @returns {{name: string, title: string}}
 */
export function parseLinkedInResultTitle(rawTitle) {
  const cleaned = rawTitle.replace(/\s*[|-]\s*LinkedIn\s*$/i, '').trim();
  const parts = cleaned.split(/\s+-\s+/);
  const name = (parts[0] || '').trim();
  const title = parts.slice(1).join(' - ').trim();
  return { name, title };
}

/**
 * Build the SearXNG query for a company + optional role/team scope.
 * @param {string} company
 * @param {string} [role]
 * @returns {string}
 */
export function buildQuery(company, role) {
  const roleTerm = role ? ` ${JSON.stringify(role)}` : '';
  return `${JSON.stringify(company)} (engineering manager OR hiring manager OR "director of engineering" OR "VP of engineering" OR "head of engineering")${roleTerm} site:linkedin.com/in`;
}

/**
 * @param {{company: string, role?: string, limit?: number, searxngUrl: string}} opts
 * @returns {Promise<{ok: true, query: string, candidates: {name:string, title:string, url:string, score:number}[]} | {ok: false, error: string}>}
 */
export async function findHiringManager({ company, role, limit = 8, searxngUrl }) {
  if (!company || !company.trim()) return { ok: false, error: 'company is required' };
  const query = buildQuery(company.trim(), role?.trim());
  const url = `${searxngUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json`;

  let data;
  try {
    data = await fetchJsonLocal(url, { timeoutMs: 15_000 });
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach SearXNG at ${searxngUrl} — is it running? (cd deploy/searxng && docker compose up -d). ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const results = Array.isArray(data?.results) ? data.results : [];
  const seen = new Set();
  const candidates = [];
  for (const r of results) {
    const rawUrl = typeof r?.url === 'string' ? r.url : '';
    if (!/linkedin\.com\/in\//i.test(rawUrl)) continue;
    // Strip tracking params so the same profile linked twice with different
    // query strings doesn't produce two candidates.
    const normalized = rawUrl.split('?')[0];
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const { name, title } = parseLinkedInResultTitle(String(r?.title ?? ''));
    if (!name) continue;
    candidates.push({ name, title, url: normalized, score: titleWeight(title) });
  }
  candidates.sort((a, b) => b.score - a.score);
  return { ok: true, query, candidates: candidates.slice(0, limit) };
}

async function main() {
  const argv = process.argv.slice(2);
  validateFlags(argv, KNOWN_FLAGS, USAGE, { valueFlags: VALUE_FLAGS, requireOperand: true });

  const company = flagValue(argv, '--company');
  if (!company) {
    console.error('Error: --company is required.\n\n' + USAGE);
    process.exit(1);
  }
  const role = flagValue(argv, '--role');
  const limit = Math.min(20, Math.max(1, Number(flagValue(argv, '--limit')) || 8));
  const jsonOut = hasFlag(argv, '--json');
  const searxngUrl = (process.env.SEARXNG_URL || 'http://localhost:8888').trim();

  const result = await findHiringManager({ company, role, limit, searxngUrl });

  if (!result.ok) {
    if (jsonOut) console.log(JSON.stringify({ ok: false, error: result.error }));
    else console.error(result.error);
    process.exit(1);
  }

  if (jsonOut) {
    console.log(JSON.stringify({
      ok: true,
      company,
      role: role || null,
      query: result.query,
      candidates: result.candidates,
      verification: 'unconfirmed',
      note: 'Found via web search — confirm identity before reaching out. This is not a verified org chart.',
    }, null, 2));
    return;
  }

  if (!result.candidates.length) {
    console.log(`No LinkedIn candidates found for ${company}${role ? ` (role: ${role})` : ''}.`);
    return;
  }
  console.log(`Candidates for ${company}${role ? ` — ${role}` : ''} (unverified — confirm before reaching out):\n`);
  for (const c of result.candidates) {
    console.log(`- ${c.name}${c.title ? ` — ${c.title}` : ''}\n  ${c.url}`);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
