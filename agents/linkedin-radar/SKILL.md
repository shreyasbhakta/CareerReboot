---
name: linkedin-radar
description: >-
  Tech-trend scanner and LinkedIn post drafter for job-search visibility.
  Use when the user wants to know what's trending in tech right now, or
  wants a LinkedIn post drafted around a current topic relevant to their
  target roles. Pulls from public APIs only (Hacker News, DEV Community) —
  no scraping, no ToS-violating access.
arguments: request
user_invocable: true
argument-hint: "[scan | draft-post <topic>]"
license: Apache-2.0
---

# linkedin-radar — trend scan + post drafting

Posting informed takes during an active search keeps a candidate visible to
recruiters browsing LinkedIn activity. This agent finds a real, current
trend to react to — it never invents one — and drafts a post grounded in the
user's own experience from `agents/career-ops/cv.md`.

## Step 1 — Scan

```bash
node scan-tech-trends.mjs                          # last 24h
node scan-tech-trends.mjs --hours 48 --limit 20     # wider window
node scan-tech-trends.mjs --topic "agentic AI"      # HN search on a topic
```

Sources: Hacker News (via the public Algolia search API) and DEV Community
(via its public articles API). Both are official, documented, no-auth-key
APIs — this is why there's no LinkedIn or Twitter/X source here: neither
exposes a public trends API, and scraping either violates their ToS, so
they're out of scope by design, not an oversight.

## Step 2 — Pick an angle

From the returned items, prefer a topic that:
1. Genuinely connects to something in `agents/career-ops/cv.md` (a real
   project, a real production incident, a real opinion the user has stated
   in this conversation) — never a generic hot-take with no personal anchor.
2. Is substantive enough to survive a week of feed decay — avoid pure news
   reactions ("X raised $Y") in favor of technical/craft discussion the user
   can add real perspective to.

Ask the user which item to run with if more than one is a good fit — don't
silently pick for them.

## Step 3 — Draft the post

Structure (LinkedIn text post, no external tool needed):
- Hook line (1 sentence) — the specific claim or question, not a topic label.
- 2-4 short paragraphs: what the trend is, then the user's actual angle on
  it, grounded in something specific from `cv.md` (a project, a metric, a
  lesson learned) — never a fabricated anecdote.
- Close with a genuine question or a soft signal that the user is looking
  (e.g. "open to backend/AI roles" mention), not a hashtag dump.
- 1300-1900 characters is the sweet spot for LinkedIn's algorithm; never pad
  to hit a length target.

Save the draft to `output/YYYY-MM-DD-<slug>.md` (gitignored) for the user to
review and post themselves — **this agent never posts anything**, same
never-auto-submit rule as the rest of this repo.

## Genericity

`cv.md` is the only person-specific input. Anyone dropping their own CV into
`agents/career-ops/cv.md` gets trend-scanning and post-drafting angled at
their own background, unchanged code.
