---
name: generate-outreach-context
description: >-
  Build draft-only outreach context for a hiring signal: the hiring person,
  warm-intro path, and a one-line angle tied to the user's real proof points.
  Use before handing off to the outreach skill. Never sends anything.
license: Apache-2.0
metadata:
  author: careerreboot
  version: "1.0"
---

# generate-outreach-context

1. Take a signal from `hiring-signals.json` (`person`, `company`, `role`, `metadata.warm`, `metadata.outreachAngle`).
2. If `warm.status` is `WARM_INTRO_AVAILABLE`, recommend asking that connection first.
3. Otherwise, if the person's `confidence` is HIGH/MEDIUM, recommend a direct note; if LOW or null, recommend applying and finding a contact.
4. The angle must use only proof points from `../career-ops/config/profile.yml` (`narrative.proof_points`). Do not invent employers, metrics, or relationships.
5. Hand the context to `agents/outreach/SKILL.md` (cold-email / linkedin-note). The user reviews and sends.
