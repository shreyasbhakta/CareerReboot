---
name: hiring-radar
description: >-
  Daily active-hiring intelligence for the job search. Use when the user asks
  who is hiring right now, which hiring managers or founders posted a role that
  matches their profile, whether they know someone at a company that is
  hiring, or wants the Hiring Radar scan run, explained, or its results triaged.
  Discovery and scoring only — never sends messages, applies, or submits forms.
license: Apache-2.0
compatibility: Requires Node >= 20.12. Network access for live scans. Reads ../career-ops profile and optional LinkedIn Connections.csv.
metadata:
  author: careerreboot
  version: "1.0"
---

# hiring-radar — who is hiring for me, right now?

Deterministic code does the work (HTTP, parsing, dedup, scoring); this skill is
the human-facing router. Do not re-implement any of it in prose.

## Run

| Goal | Command (repo root) |
|---|---|
| Preview, write nothing | `npm run hiring-radar:dry-run` |
| Real run (writes TSV/JSON/MD under `agents/career-ops/data/`) | `npm run hiring-radar` |
| Tighter window / stricter bar | `node agents/hiring-radar/scan.mjs --days 3 --min-score 75` |
| One source | `--source jobs` · `hiring-posts` · `hn` · `web-search` |

## Read the results

1. Open `agents/career-ops/data/hiring-radar.md` (digest) or `hiring-signals.json` (structured).
2. For each item answer: who is hiring, for what, how recent, why it matches
   (`technicalBreakdown`), who the person is (and `confidence`), whether there is a
   warm connection, and the recommended action.
3. Update a signal's `status` column in `hiring-signals.tsv` (REVIEWED, CONTACTED,
   DISMISSED, CONVERTED) when the user acts on it — those statuses are preserved
   across runs.

## Rules

- **Never invent a person or company.** Report `personConfidence`/`company.confidence` as stored; LOW means unverified.
- **Draft-only outreach.** Hand a chosen signal to the `outreach` skill (`agents/outreach/SKILL.md`) for a cold email or LinkedIn note; the user sends it.
- Scoring weights, role aliases, skills, phrases and recency bands live in `config.example.yml` (override in a gitignored `config.yml`). Change config, not code.
- Sub-skills: `skills/classify-hiring-signal`, `skills/match-role-to-profile`, `skills/generate-outreach-context`, `skills/generate-daily-hiring-digest`.
