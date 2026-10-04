# CareerReboot — instructions for coding agents

Local-first job-search tool. Layout: `agents/career-ops` (pipeline + Next.js dashboard in `web/`), `agents/hiring-radar` (daily hiring-signal scanner), `agents/outreach`, `deploy/`, `docs/`. Architecture: `docs/architecture/hiring-radar.md`, root `README.md`.

## Write the least code that works (Ponytail)

Adapted from [Ponytail](https://github.com/DietrichGebert/ponytail) (MIT, © DietrichGebert). Stop at the first rung that holds:

1. Does it need to exist? (YAGNI)
2. Does the codebase already have it? Reuse the helper. Do not add a parallel one.
3. Standard library → platform feature → already-installed dependency, in that order.
4. One line beats ten. Deletion beats addition. No abstraction nobody asked for.

Not lazy about: input validation at trust boundaries, security, error handling that prevents data loss, accessibility. Non-trivial logic leaves one runnable test.

## Navigating the code with Graphify

[Graphify](https://github.com/Graphify-Labs/graphify) (Apache-2.0) keeps a knowledge graph of first-party code. Query it before opening files (`graphify query "<question>"`, `graphify path "A" "B"`); rebuild after edits with `npm run graph` (AST only, no API cost). `CLAUDE.md` carries the exact rules.

## Style

- Comments say *why*, in one line. No narration of what the code does, no history, no marketing words.
- No dead code, no commented-out code, no unused exports.
- Match the surrounding idiom. Keep functions short; prefer data in config over branches in code.

## Guardrails (do not weaken)

- Never log in to, scrape, or automate LinkedIn; never auto-send, auto-apply, or auto-submit anything.
- Secrets only in gitignored `.env` files. Personal data (`Connections.csv`, CV, tracker, results) stays out of git.
- New dependency: check license and maintenance, add it to `THIRD_PARTY_NOTICES.md` and the README citations.

## Verify

`npm test` (hiring-radar suite) · `npm run test:all` (+ career-ops lint) · `cd agents/career-ops/web && npx tsc --noEmit && npm test`.
