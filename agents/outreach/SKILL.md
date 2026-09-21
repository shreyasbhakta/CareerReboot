---
name: outreach
description: >-
  Cold outreach and follow-up agent for the job search. Use when the user
  wants to message a recruiter/hiring manager/peer about a role, draft a
  formal application email, or check who's due a follow-up. Thin router over
  career-ops' own outreach modes and ResumeSkills' cold-email-writer — no
  duplicated logic, generic across whoever's profile is loaded.
arguments: request
user_invocable: true
argument-hint: "[cold-email | followup | check-due | linkedin-note]"
license: Apache-2.0
---

# outreach — cold email & follow-up router

This is a thin router, not a new pipeline: it composes capabilities that
already exist in `agents/career-ops/` and `skills/resume-skills/` so outreach
lives in one place instead of the user having to remember which mode does
what. Nothing here duplicates their logic — it just sequences them.

**Data root:** `../career-ops/` relative to this file. All company/role
context comes from `../career-ops/data/applications.md`, `../career-ops/cv.md`,
and `../career-ops/config/profile.yml` — never invent a company, contact, or
role that isn't already in the tracker or explicitly given by the user in
this conversation.

## Routing

| User wants... | Do this |
|---|---|
| A cold email / cover letter to a specific company | Load `skills/resume-skills/skills/cold-email-writer/SKILL.md` for tone/structure, then run career-ops' `email` mode (see `agents/career-ops/modes/email.md`) — draft-only, never sends. |
| A short LinkedIn connection-request note to a recruiter/hiring manager/peer | Run career-ops' `contacto` mode (`agents/career-ops/modes/contacto.md`) — identifies the contact type and drafts within the platform's character limit (200 free / 300 Premium). |
| "Who do I need to follow up with today?" | Run `node followup-cadence.mjs --summary` from `agents/career-ops/`. Prints who's due, doesn't send anything. |
| "Draft this week's follow-ups" | For each row `followup-cadence.mjs` flags as due, draft a short follow-up email/LinkedIn message referencing the specific role + how long it's been — pull the company/role/date from the tracker row, not from memory. |
| Formal application email (subject/body/attachments) | career-ops' `email` mode — draft-only subject, body, attachment checklist, contact block. |

## Ethical rules (inherited, non-negotiable)

- **Never send anything.** Every output here is a draft the user copies,
  reviews, and sends themselves — same rule as career-ops' apply-prep.
- **No fabricated relationships or claims.** If the user hasn't actually
  talked to someone, don't imply they have. If a metric isn't in `cv.md`,
  don't put it in an outreach message.
- **Respect volume.** A tailored note to 5 relevant people beats a templated
  blast to 50 — quality-over-quantity is the whole design philosophy this
  inherits from career-ops.
- **Follow-up cadence, not nagging.** Default cadence (7 days after apply, one
  reminder) lives in `config/profile.yml`'s `followup_cadence` block — respect
  it rather than re-prompting the user to follow up more aggressively.

## Genericity

This skill reads only from the data-root files above — it has no
person-specific content baked in. Anyone dropping their own `cv.md` /
`config/profile.yml` / tracker into `agents/career-ops/` gets the same
outreach behavior for their own data.
