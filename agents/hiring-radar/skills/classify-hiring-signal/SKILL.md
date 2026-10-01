---
name: classify-hiring-signal
description: >-
  Decide whether a short public post is a real, current hiring signal and how
  strong it is (direct first-person, team-level, expansion, weak, or none).
  Use for ambiguous posts the deterministic classifier scored 40-75, or when
  the user asks "is this actually someone hiring?".
license: Apache-2.0
metadata:
  author: careerreboot
  version: "1.0"
---

# classify-hiring-signal

Deterministic first: `extractors/hiring-signal.mjs` (`classifyHiringText`) handles
the phrase lists in `config.example.yml` → `signals`. Use judgment only for the
ambiguous band.

**Is a signal:** "I'm hiring a backend engineer for my team", "We're hiring a Forward
Deployed Engineer", "Growing our engineering team — DM me".

**Is NOT a signal:** "We recently hired John", "Excited to announce our new engineer",
"Welcome Jane to the team", "#OpenToWork", job seekers, congratulations.

**Weak:** "Come work with us!", "We're hiring across 20 departments" (no role named).

Answer as JSON only: `{"is_hiring": bool, "role": string|null, "confidence": 0-1, "reason": "<=140 chars"}`.
The router (`llm/tasks.mjs`) validates this shape and ignores answers below 0.7 confidence.
