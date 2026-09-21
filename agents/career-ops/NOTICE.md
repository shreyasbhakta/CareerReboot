# Provenance

Vendored from https://github.com/career-ops-hq/career-ops at commit
`da8c6f9193ac3d7a48a583f815b7d0feab742b81` (2026-09-10), MIT licensed.
See [../../THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) for the full
license text.

## Removed from this checkout

To keep this vendored copy focused on the runtime pipeline, the following
were dropped relative to upstream (all optional/non-functional for running
scan → tailor → tracker → apply-prep):

- `docs/` — marketing images, banners, press assets (~28MB)
- `tests/`, `test-fixtures/`, `evals/` — upstream's own test suite
- `dashboard/` — Go-based terminal dashboard (optional, needs a Go toolchain;
  the Next.js `web/` dashboard is kept and is what's actually used here)
- `batch/` — optional batch-evaluation runner
- Root `*-tests.mjs` files, `CHANGELOG.md`, `CONTRIBUTORS.md`, `HIRED.md`,
  translated `README.*.md` variants, CI/community-health files

Nothing in the kept scan/tailor/tracker/apply-prep pipeline was modified.
If you need any of the removed pieces later, pull them from upstream directly.
