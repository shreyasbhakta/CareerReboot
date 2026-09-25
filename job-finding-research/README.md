# Job Finding Research

An experimental, side track for a more "elite recruiter"-grade take on job
discovery — kept separate from the production `agents/career-ops/` pipeline
so it can move fast without risking the tracker/scoring system you actually
depend on.

## What's here

- [`SKILL.md`](SKILL.md) — the reasoning rubric (fit scoring, FDE/agentic-AI
  detection, recruiter research, outreach drafting, tiering). This is meant
  to be *read and applied by an AI agent* (Claude Code, this assistant, etc.)
  on top of the tool's output — it's not something the code executes.
- [`candidate-profile.yml`](candidate-profile.yml) — the keyword/weights
  config the deterministic scorer reads. Edit this to retune scoring; it's a
  user-layer file, never overwritten.

## What this is *not*

It is **not** a second ATS-scraping engine. `agents/career-ops/` already has
~70 real provider adapters (`providers/*.mjs`) and two working discovery
paths:

- **Explore** (`/explore` in the web app) — reverse-market discovery across
  the *entire* public ATS universe (Greenhouse/Lever/Ashby/Workday), keyword
  filtered. This is the "find companies I've never heard of" tool.
- **Portals / `scan.mjs`** — targeted scanning of your own curated
  `portals.yml` company list. This is the "watch companies I already track"
  tool.

Neither of those does fit-*scoring* — they filter by keyword and hand you raw
postings; a human (or an LLM) still does the judgment call per posting. That
judgment call, made systematically and at scale, is the actual gap this
folder fills:

- **`/research` in the web app** (new) — runs your existing `tracked_companies:`
  through the real Ashby/Greenhouse/Lever/SmartRecruiters provider modules
  (the same code Explore and `scan.mjs` use), then applies a **deterministic,
  code-only pre-score** (see `candidate-profile.yml`'s weights) so you see a
  triaged, tiered shortlist instead of a raw list of 500 postings. Zero LLM
  cost, same "discovery is free" principle as the rest of career-ops.
- **`SKILL.md`** is the second pass on top of that: point Claude at the
  scan's JSON output and ask it to apply the full rubric — real JD
  understanding, FDE/agentic-AI detection, company/recruiter research,
  outreach drafts. That step needs a reasoning model; it's intentionally not
  automated in the UI.

## Using it

1. Open the web app → **Research** in the sidebar (or `/research`).
2. Click **Run scan**. It reads `agents/career-ops/portals.yml`'s
   `tracked_companies:`, hits each one's real Ashby/Greenhouse/Lever/
   SmartRecruiters board, scores + tiers the results, and shows you
   Apply Today / Recruiter Outreach / Watch / Stretch, plus per-source
   health (a broken board shows up as `ERROR`, not silence).
3. For anything you're serious about, hand the result to Claude with:
   > "Read `job-finding-research/SKILL.md` and give me the full report for
   > the top N results from this scan: `<paste JSON or link>`."

## Ethics (same rules as the rest of career-ops)

Never auto-applies, never auto-sends outreach, never fabricates a job,
person, or fact. See `agents/career-ops/AGENTS.md`'s "Ethical Use" and
"Untrusted External Content" sections — they apply here unchanged.
