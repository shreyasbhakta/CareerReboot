#!/usr/bin/env python3
"""
crawl_jobs.py — Crawl4AI bridge for career-ops's local-parser provider
(providers/local-parser.mjs).

career-ops's normal scanners (scan.mjs/scan-ats-full.mjs) read known ATS
JSON APIs (Greenhouse/Lever/Ashby/Workday/...) directly — fast, free, no
scraping needed. This script exists for the companies that fall outside
that: a custom-built careers page with no known ATS behind it. Crawl4AI's
real value there is rendering JS-heavy pages a plain HTTP fetch can't see
through; it does NOT replace a bespoke ATS integration for a board that
already has one.

Two extraction modes, in order:
  1. CSS-selector mode (--job-selector, --title-selector, --link-selector,
     [--location-selector]) — precise, reproducible. Point it at the repeated
     "job card" container and the title/link/location within each one.
  2. Fallback heuristic (no selectors given) — scans every link on the page
     and keeps ones whose visible text plausibly reads as a job title AND
     whose href plausibly points at a job/career detail page. This is
     recall-first and WILL include false positives on an unfamiliar page
     layout — it exists so the provider isn't a hard requirement to
     configure CSS selectors before it does anything at all, not as a
     substitute for them. Prefer selector mode for any company you're
     actually relying on.

No LLM extraction strategy is used on purpose — matches career-ops's own
"discovery is free, zero tokens" principle for scan.mjs/scan-ats-full.mjs.
A markdown/LLM extraction path could be added later as an explicit,
separately-costed opt-in, but it must never be the silent default.

Output: a single JSON array on stdout, each item {title, url, location},
exactly what providers/local-parser.mjs's normalizeParserJob() expects
(company/location optional, title+url required). On any failure, prints
a JSON error object to stderr and exits 1 — local-parser.mjs's JSON.parse
of stdout then fails loudly rather than silently returning zero jobs as if
the page were genuinely empty.

Usage:
  python3 crawl_jobs.py --url "https://example.com/careers"
  python3 crawl_jobs.py --url "https://example.com/careers" \\
      --job-selector ".job-card" --title-selector ".job-title" \\
      --link-selector "a" --location-selector ".job-location"
"""
import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

# Self-bootstrap into deploy/crawl4ai/venv/ when run with a plain interpreter
# that doesn't have crawl4ai installed. This exists because
# providers/local-parser.mjs (the Node side that invokes this script) only
# allows `parser.command` to be a whitelisted bare interpreter name (resolved
# via PATH) or a path that resolves — including through symlinks — INSIDE the
# repo. A venv's own python3 is normally a symlink chain ending at the real
# system interpreter OUTSIDE the repo (e.g. /opt/homebrew/.../python3.14), so
# pointing parser.command at deploy/crawl4ai/venv/bin/python3 directly is
# correctly rejected as a path escape — that check is a real security
# boundary, not a bug to route around. Re-exec'ing here (config always uses
# bare `python3`) works within that boundary instead of weakening it.
try:
    from crawl4ai import AsyncWebCrawler, CrawlerRunConfig  # noqa: F401
except ImportError:
    # A venv's own bin/python3 is typically a symlink chain that resolves to
    # the SAME underlying binary as the system python3 (confirmed on macOS +
    # Homebrew: both point at the one installed python3.14) — venv isolation
    # comes from which STARTUP PATH invoked it (Python looks for a
    # pyvenv.cfg next to that path), not from the interpreter binary having a
    # distinct identity. Comparing resolved realpaths therefore reports
    # "same interpreter" even when re-execing through the venv path WOULD
    # pick up its site-packages — an env-var guard (set on the child before
    # exec) is what actually prevents an infinite re-exec loop here.
    venv_python = Path(__file__).resolve().parent / "venv" / "bin" / "python3"
    if venv_python.exists() and not os.environ.get("CRAWL4AI_BOOTSTRAPPED"):
        os.environ["CRAWL4AI_BOOTSTRAPPED"] = "1"
        os.execve(str(venv_python), [str(venv_python), *sys.argv], os.environ)
    print(
        json.dumps({"error": "crawl4ai is not installed. Run: cd deploy/crawl4ai && ./venv/bin/pip install -U crawl4ai && ./venv/bin/crawl4ai-setup"}),
        file=sys.stderr,
    )
    sys.exit(1)

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

# Href patterns that plausibly point at a single job posting rather than a
# nav link, a marketing page, or a job-BOARD landing page.
JOB_URL_HINT = re.compile(r"/(job|jobs|careers?|positions?|opening|vacan)[a-z]*/[^/]+", re.I)
# Visible-text patterns common in real job titles — a cheap, imperfect signal
# used only to keep the heuristic mode from returning every link on the page.
TITLE_WORD_HINT = re.compile(
    r"\b(engineer|manager|director|scientist|designer|analyst|specialist|lead|architect|"
    r"developer|coordinator|associate|intern|counsel|recruiter|consultant|representative)\b",
    re.I,
)
NAV_TEXT_BLOCKLIST = {"careers", "jobs", "apply", "learn more", "view all", "see all", "home", "about", "contact"}


def heuristic_extract(links, base_url):
    seen = set()
    jobs = []
    for link in links:
        href = (link.get("href") or "").strip()
        text = (link.get("text") or "").strip()
        if not href or not text:
            continue
        if text.strip().lower() in NAV_TEXT_BLOCKLIST:
            continue
        if len(text) < 8 or len(text) > 120:
            continue
        if not TITLE_WORD_HINT.search(text):
            continue
        abs_url = urljoin(base_url, href)
        if not JOB_URL_HINT.search(abs_url):
            continue
        if abs_url in seen:
            continue
        seen.add(abs_url)
        jobs.append({"title": text, "url": abs_url, "location": ""})
    return jobs


async def run(url, job_selector, title_selector, link_selector, location_selector):
    if job_selector and title_selector and link_selector:
        fields = [
            {"name": "title", "selector": title_selector, "type": "text"},
            {"name": "url", "selector": link_selector, "type": "attribute", "attribute": "href"},
        ]
        if location_selector:
            fields.append({"name": "location", "selector": location_selector, "type": "text"})
        schema = {"name": "jobs", "baseSelector": job_selector, "fields": fields}
        strategy = JsonCssExtractionStrategy(schema)
        config = CrawlerRunConfig(extraction_strategy=strategy)
        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=url, config=config)
        if not result.success:
            raise RuntimeError(result.error_message or "crawl failed")
        raw = json.loads(result.extracted_content) if result.extracted_content else []
        jobs = []
        for item in raw:
            title = (item.get("title") or "").strip()
            href = (item.get("url") or "").strip()
            if not title or not href:
                continue
            jobs.append({
                "title": title,
                "url": urljoin(url, href),
                "location": (item.get("location") or "").strip(),
            })
        return jobs

    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=url)
    if not result.success:
        raise RuntimeError(result.error_message or "crawl failed")
    links = (result.links or {}).get("internal", []) + (result.links or {}).get("external", [])
    return heuristic_extract(links, url)


def main():
    parser = argparse.ArgumentParser(description="Crawl4AI bridge for career-ops's local-parser provider")
    parser.add_argument("--url", required=True)
    parser.add_argument("--job-selector", default=None, help="CSS selector for each repeated job-card container")
    parser.add_argument("--title-selector", default=None, help="CSS selector for the title, relative to --job-selector")
    parser.add_argument("--link-selector", default=None, help="CSS selector for the <a>, relative to --job-selector")
    parser.add_argument("--location-selector", default=None, help="optional CSS selector for location, relative to --job-selector")
    args = parser.parse_args()

    try:
        jobs = asyncio.run(run(args.url, args.job_selector, args.title_selector, args.link_selector, args.location_selector))
    except Exception as exc:  # noqa: BLE001 - this IS the top-level error boundary
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)

    print(json.dumps(jobs))


if __name__ == "__main__":
    main()
