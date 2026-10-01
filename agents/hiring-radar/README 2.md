# Hiring Radar

Finds **who is actively hiring for roles that match your profile right now** — hiring posts, hiring managers, recent job postings, companies with rising activity — scores them with a fully explainable breakdown, flags warm connections from your LinkedIn export, and writes a daily digest. It never contacts anyone.

Design, scoring model, source and dependency decisions: [`docs/architecture/hiring-radar.md`](../../docs/architecture/hiring-radar.md).

## UI (recommended)

Start the dashboard (`cd agents/career-ops/web && npm run dev`, then open http://localhost:3000) and click **Hiring Radar** — a banner on the main dashboard page and an entry in the sidebar. The page has:

* **Setup checklist** — what is configured and what is missing.
* **Results** — scored cards with the hiring person (or "not identified"), warm connection, why-this-score breakdown, a draft outreach angle, and a status dropdown (REVIEWED / CONTACTED / DISMISSED / CONVERTED).
* **Run** — days, minimum score, sources, dry-run toggle, live log. One scan at a time.
* **Keys & data** — search backend, model provider and keys, webhook, and LinkedIn `Connections.csv` upload. Secrets go to the gitignored `agents/hiring-radar/.env` (mode 600) and are never sent back to the browser.
* **Schedule** — installs/removes one marked entry in your user crontab (time, weekdays, window, sources).
* **Scoring & config** — weights, thresholds and limits as form fields, plus a YAML override editor; saved only if the scanner's own validator accepts it.

## Quick start

```bash
npm run setup                 # from the repo root: installs career-ops (no browser download) + hiring-radar
npm run hiring-radar:dry-run  # discover + score + print; writes nothing
npm run hiring-radar          # write the digest, JSON and history
npm test                      # hiring-radar test suite (no network)
npm run test:all              # + career-ops syntax lint
```

Or directly: `node agents/hiring-radar/scan.mjs --dry-run --days 3 --min-score 75`.

Works with zero keys (Hacker News "Who is hiring?" + public ATS boards). Add a search backend for hiring posts:

| Env | Effect |
|---|---|
| `SEARXNG_URL` | Self-hosted search (`agents/career-ops/deploy/searxng`). Also enables hiring-person lookup. |
| `BRAVE_SEARCH_API_KEY` | Brave Search API. |
| `MODEL_PROVIDER` (+ `MODEL_NAME`, `MODEL_BASE_URL`, provider key) | Opt-in LLM for ambiguous posts and short explanations. |
| `LINKEDIN_CONNECTIONS_CSV` | Path to your `Connections.csv` (default `agents/career-ops/data/Connections.csv`). |
| `HIRING_RADAR_NOTIFY=true` + `HIRING_RADAR_WEBHOOK_URL` | Optional webhook summary. |
| `HIRING_RADAR_DATA_DIR`, `HIRING_RADAR_CONFIG` | Redirect output dir / extra YAML config. |

`.env` files in `agents/career-ops/` and `agents/hiring-radar/` are loaded automatically; real environment variables win.

## CLI

```
--dry-run          discover, score, print; write nothing
--days <1-30>      search window (default 7)
--limit <n>        keep the best n signals per source (default 200)
--source <list>    all | jobs | hiring-posts | hn | web-search (comma-separated)
--min-score <0-100>
--fixture <file>   process a JSON file of posts instead of live sources
--no-llm  --verbose
```

Exit codes: `0` ok (including an empty scan) · `1` every attempted source failed · `2` invalid config.

## Configure

Everything tunable is in [`config.example.yml`](config.example.yml): role families and aliases, exclusions, skills and points, hiring phrases, recency bands, score weights, location rules, source limits, model routing, digest sizes. Put overrides in a gitignored `config.yml`. Candidate name, target roles and proof points come from `agents/career-ops/config/profile.yml` — contact details are never read.

## Outputs (`agents/career-ops/data/`, gitignored)

* `hiring-radar.md` — the digest (🔥 High Signal · 🟢 Active Hiring · 🟡 Relevant Jobs · 📊 Summary)
* `hiring-signals.json` — normalized signals + score breakdowns (dashboard-ready)
* `hiring-signals.tsv` — history. Edit the `status` column by hand (`REVIEWED`, `CONTACTED`, `DISMISSED`, `CONVERTED`); it survives re-runs.

### Example

```
1. Forward Deployed Engineer — Example AI 🆕
   - Overall match: 88/100 (technical 73 · activity 100 · direct language 90 · person 100 · location 100 · company 75)
   - Hiring signal: Direct hiring post (web-search)
   - Signal age: 7 hours
   - Hiring person: Jane Doe — VP Engineering · confidence HIGH
   - Warm connection: 🔥 John Smith — Engineering Manager at XYZ AI
   - Why this matches: Role maps to Forward Deployed Engineer; Mentions Forward deployed; Location matches NYC/NJ
   - Recommended action: Ask your connection for an intro
   - Suggested outreach angle (draft only, nothing is sent): Your HDFC Bank payment aggregator (Vymo) work … maps directly to the Forward Deployed Engineer scope at Example AI.
```

## Hand-off to outreach

`agents/outreach/SKILL.md` has a routing row for Hiring Radar signals: it reads the stored person, warm connection and outreach angle and drafts the note. You send it, then set `status` to `CONTACTED`.

## Automation

`.github/workflows/hiring-radar.yml` runs daily at 07:30 New York time (and on demand); see the architecture doc for secrets and behaviour. On the GCP VM, `deploy/gcp/crontab.example` can run `node agents/hiring-radar/scan.mjs` the same way.

## Limits

LinkedIn is never logged into or scraped; posts appear only if a search engine returns them. Undated posts are discarded; many ATS boards expose no date. Without a search backend, direct hiring *posts* are limited to Hacker News. Hiring-person data from search is unverified by nature. See the architecture doc for the full list.
