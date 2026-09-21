# Crawl4AI (opt-in, for companies with no known ATS)

career-ops's normal scanners (`scan.mjs` / `scan-ats-full.mjs`) read known ATS
JSON APIs directly (Greenhouse, Lever, Ashby, Workday, ...) — fast, free, zero
scraping. This is for the minority of companies that fall outside that: a
custom-built careers page with no known ATS behind it, where nothing today
can see the listings at all.

**This is entirely opt-in.** Nothing else in career-ops requires Python. If
you never set this up, every other scanner keeps working exactly as before.

## Setup (one-time)

```bash
cd deploy/crawl4ai
python3 -m venv venv
./venv/bin/pip install -U crawl4ai
./venv/bin/crawl4ai-setup   # downloads its own Chromium (~250MB)
```

## Wiring a company to it

Add a `tracked_companies` entry in `portals.yml` using `provider:
local-parser` (an existing, generic external-script bridge — see
`providers/local-parser.mjs`) pointed at `crawl_jobs.py`:

```yaml
- name: Some Custom-Site Co
  careers_url: https://example.com/careers
  parser:
    command: python3   # bare, whitelisted interpreter — NOT a venv path
    args:
      - deploy/crawl4ai/crawl_jobs.py
      - --url
      - "{careers_url}"
      # Best results: point these at the page's actual structure (inspect
      # once in a browser). Without them, a best-effort link heuristic runs
      # instead — recall-first, will include some false positives.
      - --job-selector
      - ".job-card"
      - --title-selector
      - ".job-title"
      - --link-selector
      - "a"
      - --location-selector      # optional
      - ".job-location"
  enabled: true
```

`command: python3` (bare, resolved via PATH) is required, not a path into
`venv/` — `providers/local-parser.mjs` only allows a whitelisted interpreter
name or an in-repo path, and a venv's own `bin/python3` is a symlink chain
that resolves OUTSIDE the repo (a real security boundary, not a bug).
`crawl_jobs.py` re-execs itself into `venv/` automatically when run this way
— see the comment at the top of that file.

## How extraction works

1. **CSS-selector mode** (`--job-selector`/`--title-selector`/`--link-selector`,
   optional `--location-selector`) — precise. Point it at the repeated job-card
   container and the title/link/location within each one. Preferred.
2. **Heuristic fallback** (no selectors given) — scans every link on the
   rendered page, keeps ones whose text plausibly reads as a job title and
   whose URL plausibly points at a job detail page. Works with zero
   configuration but is approximate — use selector mode for anything you
   actually rely on.

No LLM extraction is used, by design — matches career-ops's own "discovery is
free, zero tokens" principle. Crawl4AI's real value here is rendering
JS-heavy pages a plain HTTP fetch can't see through, not summarization.

## Test it directly

```bash
python3 deploy/crawl4ai/crawl_jobs.py --url "https://example.com/careers"
# with selectors:
python3 deploy/crawl4ai/crawl_jobs.py --url "https://example.com/careers" \
  --job-selector ".job-card" --title-selector ".job-title" --link-selector "a"
```

Prints a JSON array to stdout (Crawl4AI's own progress logs go to stderr, so
piping stdout to `jq` or a file always gets clean JSON). A failure prints
`{"error": "..."}` to stderr and exits 1, rather than silently reporting zero
jobs as if the page were genuinely empty.
