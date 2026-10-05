# Hiring Radar — architecture & decisions

**Question it answers every day:** *Who is actively hiring for roles that match my background right now?*

A job posting that has been open for 45 days is worth less than a VP Engineering who posted "I'm hiring a Forward Deployed Engineer" yesterday, so recency and direct hiring language are first-class scoring inputs — not tie-breakers.

Hiring Radar is **discovery and scoring only**. It never sends a message, applies to a job, or submits a form. Outreach output is draft context for a human.

---

## 1. What exists today (audit findings)

| Area | Finding | Consequence for the design |
|---|---|---|
| `agents/career-ops` | Node ESM, file-based. `scan.mjs` sweeps `portals.yml` via a **provider plugin layer** (`providers/*.mjs`, ~97 ATS/job-board adapters, shared `_http.mjs` with SSRF guard + retry). Zero-LLM. | Reuse the provider layer for the `jobs` source. No new ATS HTTP code. |
| Dedup (existing) | URL-based (`scan-history.tsv`), plus `fingerprint-core.mjs` for JD text similarity. | Different problem (jobs by URL/text). Signals need person/company/date-window keys, so `storage/normalize.mjs` adds those — it does not fork the job dedup. |
| LinkedIn data | `linkedin-join.mjs` parses `Connections.csv` and has a tested company matcher (`exact`/`strong`/`weak`, generic-token stripping). Exports are importable (the CLI part is guarded by `isMainModule`). | Warm-intro matching **imports** `parseConnections`, `companyTokens`, `matchCompany`. No second name matcher. |
| People search | `find-hiring-manager.mjs` (SearXNG, returns *unverified* candidates). | Reused for optional person lookup; results are only surfaced when title **and** company are corroborated, otherwise discarded. |
| Outreach | `agents/outreach` is a SKILL.md router over career-ops `email`/`contacto` modes — draft-only. | Integrated by (a) emitting `outreach` context in the JSON/MD and (b) one routing row in `agents/outreach/SKILL.md`. No code coupling. |
| Config/profile | `config/profile.yml` (gitignored, personal) is canonical for name, target roles, proof points. | Read at runtime and overlaid on config. Contact details (email/phone) are **never** read. |
| Notifications | None in the repo (no SMTP/Slack code). | Optional JSON webhook only; off by default. No new dependency. |
| CI | There was no `.github/`. Deployment is a VM (`deploy/vm`, GCP or AWS). | New workflow added; GCP crontab can run the same command. |
| Tests | `agents/career-ops/test-all.mjs` imports `tests/helpers.mjs`, which is **not present** in this checkout, so it cannot run (pre-existing). `web/` has 492 tests, 2 pre-existing failures (font-asset assertion). | Hiring Radar ships its own self-contained `node:test` suite. Pre-existing failures documented, untouched. |
| Data contract | `data/*` is gitignored (personal). | Outputs are **not committed**. In CI they are published as an artifact + job summary, and history persists via `actions/cache`. |

## 2. Component layout

```
agents/hiring-radar/
  scan.mjs                CLI + orchestrator (runScan)
  pipeline.mjs            candidate → normalized, scored signal; spike detection; re-aging
  config.example.yml      ALL tunables (roles, skills, phrases, weights, bands, sources)
  collectors/             hn.mjs · jobs.mjs · web-search.mjs   (discover() + normalize())
  extractors/             role · hiring-signal · person · company · outreach
  scoring/                activity · role-match · location · overall
  storage/                normalize (dedup keys) · history (TSV) · connections (warm intros)
  llm/                    router (provider fallback) · tasks (2 prompts)
  format/                 digest · markdown · json
  lib/                    config · http · logger · cache · dates · text
  notify.mjs              optional webhook
  SKILL.md, skills/*      Agent Skills definitions
  tests/                  116 tests, fixtures, no live network
```

### Data flow

```
 sources ──► collector.discover() ──► collector.normalize() ──► candidate
 (hn, jobs,                                                        │
  web-search)                                                      ▼
                         role match → drop excluded/seniority → hiring-language classify
                         → person → company → location → age window → score (6 components)
                                                                   │
              spikes (jobs, per company) ───────────────────────────┤
                                                                   ▼
                    per-source cap → dedup (in-run + history) → [LLM: ambiguous only]
                    → people lookup (top jobs) → warm-intro match → persist floor
                                                                   │
                       TSV ledger (history, status) ◄──────────────┤
                       JSON (dashboard)  · Markdown digest  ·  optional webhook
```

Everything left of "LLM" is deterministic, synchronous and unit-tested without the network.

## 3. Sources

| Source | What | Key needed | Dates | Notes |
|---|---|---|---|---|
| `hn` | Latest "Ask HN: Who is hiring?" thread via the public Algolia API | none | yes (`created_at`) | Written by people actively recruiting; person is an HN handle, so `person` stays `null` (never guessed). Reuses `parseHnComment`/`resolveLatestThreadId` helpers from career-ops' provider. |
| `jobs` | Public ATS APIs (Greenhouse/Lever/Ashby/Workday/…) through career-ops providers. Companies from `portals.yml` (or `config.yml` seed list in CI). | none | when the ATS exposes one | Rotated daily over `max_companies` (default 40) so it is never a mass crawl. Undated jobs are kept but get a middling recency score. |
| `web-search` | Targeted queries generated from roles × phrases × skills × locations | SearXNG URL **or** Brave API key | when the engine returns one | Result hosts are allow-listed. Undated social posts are dropped (`allow_undated_posts: false`). 12h disk cache. Skipped (not failed) when no provider is configured. |

**LinkedIn.** No login, no cookies, no scraping, no CAPTCHA/anti-bot bypass. LinkedIn posts are only seen when a search engine indexes them and returns a snippet; the connection export is the user's own file. Wellfound/Indeed/ZipRecruiter appear only as allowed *search-result* hosts — they are not crawled directly (their terms and bot protection make that fragile and rude).

## 4. Scoring

All numbers are config; every component is emitted so the final score is auditable.

```
overall = 0.35·technical + 0.25·activity + 0.15·direct_language
        + 0.10·person    + 0.10·location + 0.05·company
```

* **technical** = role base (target 70 / adjacent 35 / unknown 20) + matched-skill points (cap 30) − seniority penalty. Output lists each contributor (`Java +4, Kafka +3, …`).
* **activity** (hours since publish): <12h 100 · <24h 90 · <48h 80 · <96h 65 · <7d 45 · <14d 25 · older 10 · unknown 30. Re-computed on every render, so an old signal decays without being re-scanned.
* **direct_language**: first-person + role 100 · team + role 90 · first-person 85 · team expansion 75 · team generic 70 · job posting 70 · spike 40 · weak 30.
* **person**: leader (founder/CTO/VP/head/EM) 100, recruiter 75, other 60 — times confidence factor (HIGH 1.0, MEDIUM 0.8, LOW 0.4). No person = 0, which is what pushes "can't tell who to contact" results down.
* **location**: NYC/NJ 100 · remote US 90 · other US 60 · unknown 50 · non-US 0 (dropped by default).
* **company**: base 50, +25 domain terms (fintech/payments/AI/…), +25 if in `portals.yml`.

**False-positive control** is sentence-scoped: "We recently hired John. We're hiring a backend engineer." is a signal; "Excited to announce our new engineer" is not; "hiring across 20 departments" with no role is capped at *weak*.

**Role equivalence** is explicit config, not embeddings: SDE ≈ Software Engineer ≈ Backend; FDE ≈ Customer/Deployment/Solutions Engineer; AI ≈ Applied/LLM/Generative/Agentic. Data Scientist, Research Scientist, Frontend and Mobile are excluded; Full Stack and ML Engineer are *adjacent* (lower base).

**Hiring spikes** compare matching jobs seen in the last 7 days against the company's own history. Without ≥14 days of history it can only say *"N matching roles open"* (`NEW_ROLE_CLUSTER`); with a baseline it says *"Recent hiring activity increased"* (`COMPANY_HIRING_SPIKE`). It never claims expansion.

## 5. Where an LLM is (and is not) used

Never for: URL normalization, dedup, dates, phrase matching, scoring, filtering, extraction from structured data.
Only for: (1) classifying posts whose deterministic direct-language score falls in 40–75 (not job postings, not HN), and (2) a short *why / outreach angle* for the top N. Both are timeout- and retry-protected, JSON-validated, cached 14 days on disk, capped at `llm.max_calls`, and send only truncated post text plus a profile summary of roles and skills — **no email, phone, address or resume**.

It is **opt-in**: nothing is called unless `MODEL_PROVIDER` is set. With it unset (or every provider failing) the scan runs identically, using deterministic "why" and outreach text built from `profile.yml` proof points.

```
MODEL_PROVIDER=openai|anthropic|gemini|openrouter|omniroute|ollama
MODEL_NAME=<model>                MODEL_BASE_URL=<OpenAI-compatible endpoint>
```
The configured provider is tried first, then the remaining `llm.providers` that have credentials.

## 6. Storage

| File (under `agents/career-ops/data/`) | Purpose |
|---|---|
| `hiring-signals.tsv` | History ledger. The spec'd 20 columns plus `person_confidence`, `company_confidence`, `metadata_json` (lets a run re-hydrate full signals). The `status` column (`NEW`→`SEEN`, or hand-set `REVIEWED/CONTACTED/DISMISSED/CONVERTED`) is preserved across runs. 90-day retention except CONTACTED/CONVERTED. |
| `hiring-signals.json` | Normalized signals + full score breakdown for the dashboard. Written atomically. |
| `hiring-radar.md` | The digest. |
| `cache/` | Search-response cache and LLM cache. |

All are gitignored by career-ops' `data/*` rule. `HIRING_RADAR_DATA_DIR` redirects them (used by CI and tests).

Dedup keys (any match ⇒ duplicate): canonical URL · company+role+person within the date window · company+role+text fingerprint · for jobs, company+title+location.

## 7. External tools: how each is used

Evaluated 2026-10-01 to 2026-10-04 (README, license, activity, install requirements, runtime fit).

| Tool | License | Where it fits | Integration |
|---|---|---|---|
| **Agent Skills** | Apache-2.0 | Skill definitions | `SKILL.md` format for `agents/hiring-radar/skills/*`, validated by a test. Format only, no code. |
| **Ponytail** | MIT | Development (coding agents) | Rule ladder adapted in `AGENTS.md`; Claude Code plugin pre-registered in `.claude/settings.json`. Not a runtime dependency. Applied here as a review lens: unused exports and dead code were removed. |
| **Graphify** | Apache-2.0 | Development (code navigation) | Installed with `uv tool install graphifyy`; project rules in `CLAUDE.md`; `npm run graph` rebuilds the AST-only graph (no API cost). Only `GRAPH_REPORT.md` is committed. Cuts agent token use by answering structure questions from the graph instead of reading files. |
| **OmniRoute** | MIT | Optional runtime model gateway | `deploy/omniroute/docker-compose.yml` (loopback only). Selected with `MODEL_PROVIDER=omniroute`; speaks the OpenAI protocol, so the router needs no special code. It needs at least one provider key configured in its dashboard: its keyless free tier rejected requests from non-OpenCode clients during testing (HTTP 403). |

**Relationship model.** The entity graph (Person → Company → Job → Signal → Connection → Outreach) is represented by fields on each signal row (`person`, `company`, `role`, `warm.connections`, `status`) plus a join to the connections export at match time. At daily volumes (hundreds of rows) a graph store has no benefit; the TSV + JSON are enough and diff-able. If an interactive graph view is ever wanted, `hiring-signals.json` already contains the nodes and edges.

## 8. Dependencies

| Dependency | Why | Check |
|---|---|---|
| `js-yaml@^5` (hiring-radar) | Parse YAML config. | Already used by career-ops (same major, MIT). `npm audit`: 0 vulnerabilities. |
| `motion` (dashboard, MIT) | Launcher animation. | Maintained, MIT, tree-shaken client bundle. |
| *(none else)* | HTTP is `fetch`; tests are `node:test`; env loading is `process.loadEnvFile`. | — |

Reused from career-ops (not duplicated): `lib/cli-flags`, `lib/is-main-module`, `path-resolver`, `linkedin-join` (parser + matcher), `find-hiring-manager`, `providers/_registry` + `_http` + ATS providers, `hackernews` helpers.

## 9. Resilience, rate limiting, cost

* Per-source isolation: a throwing source is recorded in `sourcesFailed`; others continue. A bad record is counted in `errors` and skipped. Zero results is a successful empty scan. The CLI exits **1 only if every attempted source failed**; **2** for invalid config.
* HTTP: timeout, exponential backoff with jitter, honors `Retry-After`/429, per-host spacing (500 ms), global concurrency 4, in-flight accounting.
* Only public JSON APIs and search engines are called — no HTML crawling, so `robots.txt` is not in play. Job boards are rotated (40/day), search is capped at 18 queries/day and cached 12h.
* Cost: deterministic by default; model calls are opt-in, ≤25/run, cached. Run summary reports requests, model calls, tokens and runtime.
* Dedup and the per-source cap happen **before** any LLM or people-lookup step.

## 10. GitHub Actions

`.github/workflows/hiring-radar.yml` — manual (`workflow_dispatch`: days, min score, source, dry-run) and daily.

* **Schedule:** ~07:35 `America/New_York` (minute 35 avoids the :00/:30 peaks where GitHub delays or drops scheduled runs). Cron is UTC and ignores DST, so both `35 11` (EDT) and `35 12` (EST) are scheduled and a gate step runs only the one that is 07:xx in New York.
* `concurrency: hiring-radar`, `cancel-in-progress: false`; `permissions: contents: read`; 20-minute timeout.
* Installs with `--ignore-scripts` (career-ops' postinstall downloads Chromium, which is unused), runs the hiring-radar suite and career-ops lint, restores history from `actions/cache`, scans, publishes the digest to the job summary and uploads the three output files for 14 days.
* **Does not commit.** `data/` is gitignored by design (personal data). Persistence is the cache.
* Secrets (all optional): `SEARXNG_URL`, `BRAVE_SEARCH_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `OMNIROUTE_API_KEY`, `HIRING_RADAR_WEBHOOK_URL`, `LINKEDIN_CONNECTIONS_CSV_B64` (base64 of your export, written to a 0600 temp file), `HIRING_RADAR_CONFIG_YML`. Variables: `MODEL_PROVIDER`, `MODEL_NAME`, `MODEL_BASE_URL`, `HIRING_RADAR_NOTIFY`.
* **Public repo caution:** if the repo is public *and* a connections secret is configured, the summary/artifact steps are skipped so names from your export are not exposed.

## 10b. Dashboard page

`/hiring-radar` in the career-ops web app (nav entry + banner on the home page). It is a thin shell: `src/lib/hiring-radar.ts` and `src/app/api/hiring-radar/*` resolve paths, edit the gitignored `.env` / `config.yml` / one marked crontab block, supervise a single `scan.mjs` child process and read `hiring-signals.json`. Config saves are validated by `scan.mjs --check-config <file>`; status changes go through `set-status.mjs`. It inherits the app's existing origin guard and optional password gate. Cron writes use the *user* crontab only and touch nothing outside the `careerreboot-hiring-radar` markers; on macOS the system may ask for permission the first time (the request times out after 20 s with a message rather than hanging).

## 11. Limitations (honest)

* **Search coverage is the weak link.** Without a SearXNG instance or Brave key the `web-search` source is skipped, leaving `hn` + `jobs`. Public search engines index only a fraction of LinkedIn/X posts and often omit dates; undated posts are dropped on purpose, so recall for "someone posted yesterday" is limited by the engine.
* **Direct hiring posts are mostly invisible without that search layer.** The keyless sources skew toward job postings and the HN thread.
* **Persons are rarely known** for job postings. When absent, the item is ranked lower and the action is "apply, then look for a contact". Lookup associations are unverified search hits and labelled `MEDIUM` at best.
* **Warm intros need your export.** Only first-degree connections from `Connections.csv` are known; second-degree edges are not exportable. In CI this requires the base64 secret.
* **Many ATS boards expose no posted date**, so those jobs get the unknown-age score (30), not a recency bonus.
* **False positives remain possible** in free text (sarcasm, quoted posts). Scores are explanations, not verdicts; the human decides.
* Role equivalence is rule-based: an unusual title ("Member of Technical Staff, Applied") may be missed until added to `role_families`.

## 12. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Invalid Hiring Radar configuration: …` (exit 2) | Fix the listed key in `config.yml` (weights must sum to 1, bands strictly increasing, valid regexes). |
| `Source web-search skipped: no search provider configured` | Set `SEARXNG_URL` (see `agents/career-ops/deploy/searxng`) or `BRAVE_SEARCH_API_KEY`. |
| `Connections not loaded` | Put the LinkedIn export at `agents/career-ops/data/Connections.csv` or set `LINKEDIN_CONNECTIONS_CSV`. |
| Every source failed (exit 1) | Network/API outage — check the `Sources failed` lines. History is untouched. |
| Jobs source slow | Lower `sources.jobs.max_companies` or `concurrency`. |
| Nothing in the digest | Raise `--days`, lower `--min-score`, or check the `filtered:` counts in the summary line to see which gate removed candidates. |
| LLM warnings in logs | Expected when a provider key/model is wrong; the scan continues with the next provider, then deterministically. |
