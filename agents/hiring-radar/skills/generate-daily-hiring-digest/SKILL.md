---
name: generate-daily-hiring-digest
description: >-
  Produce or summarize the daily Hiring Radar digest: top 10 high-signal plus
  top 10 secondary opportunities. Use when the user asks for today's hiring
  summary or wants the digest regenerated with different limits.
license: Apache-2.0
metadata:
  author: careerreboot
  version: "1.0"
---

# generate-daily-hiring-digest

Run `npm run hiring-radar` (or `--dry-run` to preview). Digest tiers come from
`format/digest.mjs`: 🔥 High Signal (overall ≥ 80), 🟢 Active Hiring (≥ 65),
🟡 Relevant Jobs. Limits and diversity (`output.digest`, `output.max_per_company`)
are config. Re-age happens at render time, so an old signal drops as its recency decays.

Summarize in this order: who is hiring → for what → how recently → why it matches →
who the person is → warm connection → next action. Items that cannot answer most of
these are already ranked lower; say so rather than padding the list.
