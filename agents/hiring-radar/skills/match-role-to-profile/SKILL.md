---
name: match-role-to-profile
description: >-
  Explain how well a role matches the candidate profile using the transparent
  technical-match breakdown (role base + skill points). Use when the user asks
  why a signal scored what it did, or whether a role title is equivalent to a
  target role (SDE, FDE, AI Engineer families).
license: Apache-2.0
metadata:
  author: careerreboot
  version: "1.0"
---

# match-role-to-profile

Never recompute by hand — read the numbers the scanner already produced:
`hiring-signals.json` → `signals[].scores.technicalBreakdown` and `.components`.

- Role equivalence lives in `config.example.yml` → `role_families` (target vs adjacent) and `exclude_roles`.
  SDE ≈ Software Engineer ≈ Backend; FDE ≈ Customer/Deployment/Solutions Engineer; AI ≈ Applied/LLM/Agentic.
  Data Scientist, Research Scientist, Frontend and Mobile are NOT equivalent.
- Technical match = role base (target 70 / adjacent 35 / unknown 20) + skill points capped at 30 − seniority penalty.
- Overall = 35% technical, 25% recency, 15% direct hiring language, 10% person relevance, 10% location, 5% company (configurable).

When explaining, quote the breakdown lines (e.g. "Java +4, Kafka +3") and the weakest component, so the user can see what would raise or lower the score.
