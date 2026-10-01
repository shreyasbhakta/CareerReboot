<div align="center">

# CareerReboot

**An agentic job-search pipeline — scan, tailor, apply, track.**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](agents/career-ops)

</div>

CareerReboot scans job boards, tailors your CV and cover letter for each
role, prefills application forms, tracks every application to an outcome,
and drafts your outreach and follow-ups — with a human reviewing and
clicking submit at every step. Nothing is ever auto-submitted or auto-sent.

## Features

- **Scan** — pulls open roles directly from Greenhouse, Lever, Ashby, and
  Workday and scores them against your own targeting profile, at zero LLM
  cost.
- **Tailor** — generates a tailored CV and cover letter PDF per shortlisted
  role.
- **Prepare, never submit** — prefills ATS application forms for you to
  review and send yourself.
- **Track** — every application's status, from evaluated through offer, in
  one file-based tracker with follow-up cadence built in.
- **Outreach** — drafts cold emails, LinkedIn notes, and follow-ups from the
  tracker.
- **Dashboard** — a local web UI (pipeline board, CV editor, analytics) that
  reads and writes the same files as the CLI.
- **Hiring Radar** — a daily scan for *who is hiring right now*: HN "Who is hiring?" posts, fresh ATS postings, optional search-engine discovery of hiring posts, scored with an explainable breakdown, matched against your LinkedIn export for warm intros. Discovery only; nothing is sent.
- **Sponsorship lookup** — checks a company's H-1B/PERM filing history
  against a local DOL data index, entirely offline.

## Structure

| Path | What it is |
|---|---|
| [`agents/career-ops/`](agents/career-ops/) | The core pipeline: scan, evaluate, tailor, apply-prep, track, follow-up. |
| [`agents/career-ops/web/`](agents/career-ops/web/) | The local web dashboard, backed by the same data files as the CLI. |
| [`agents/hiring-radar/`](agents/hiring-radar/) | Daily active-hiring intelligence: signals, people, warm intros, digest. Design: [`docs/architecture/hiring-radar.md`](docs/architecture/hiring-radar.md). |
| [`agents/outreach/`](agents/outreach/) | Cold email, LinkedIn, and follow-up drafting. |
| [`agents/linkedin-radar/`](agents/linkedin-radar/) | Drafts LinkedIn posts grounded in your own CV, from public tech-discussion sources. |
| [`skills/resume-skills/`](skills/resume-skills/) | A library of resume, cover-letter, and interview-prep prompt skills. |
| [`deploy/gcp/`](deploy/gcp/) | Scripts to run the pipeline and dashboard unattended on a small GCP VM. |

## Quick start

```bash
cd agents/career-ops
npm install
cp .env.example .env               # add a model API key
cp config/profile.example.yml config/profile.yml   # your targeting criteria
# drop your resume into cv.md, then:
node scan.mjs
```

**Hiring Radar:**

```bash
npm run setup                  # repo root
npm run hiring-radar:dry-run   # preview, writes nothing
npm run hiring-radar           # digest -> agents/career-ops/data/hiring-radar.md
npm test                       # hiring-radar tests
```

See [`agents/hiring-radar/README.md`](agents/hiring-radar/README.md).

**Web dashboard:**

```bash
cd agents/career-ops/web
cp .env.example .env.local
npm ci && npm run dev
```

Open `http://localhost:3000`. See [`agents/career-ops/AGENTS.md`](agents/career-ops/AGENTS.md)
for the full command reference and [`deploy/gcp/README.md`](deploy/gcp/README.md)
for running it unattended.

## Privacy

Every file that could contain your resume, targeting criteria, applications,
or API keys is gitignored — cloning this repo gets you the pipeline, not
anyone's data. Model and cloud spend are yours: keys and GCP project IDs are
read from your own local config at runtime, never hardcoded.

## License

Apache 2.0 for code original to this repository — see [LICENSE](LICENSE).
Two subtrees are vendored from third-party MIT-licensed projects and remain
under their original terms — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
