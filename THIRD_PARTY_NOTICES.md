# Third-Party Notices

This project (CareerReboot) is licensed under the terms in [LICENSE](LICENSE)
(Apache 2.0), which cover code original to this repository.

Two subtrees are vendored from third-party open-source projects and remain
under their **original MIT licenses**, unmodified by the Apache license above.
Per each project's MIT terms, their copyright notices and license text are
reproduced below and retained in each subtree's own `NOTICE.md` and `LICENSE`
file.

---

## agents/career-ops/

Vendored from **career-ops** (career-ops-hq/career-ops), by Santiago
Fernández de Valderrama.

- Source: https://github.com/career-ops-hq/career-ops
- Commit: `da8c6f9193ac3d7a48a583f815b7d0feab742b81` (2026-09-10)
- License: MIT (see `agents/career-ops/LICENSE`)
- Local changes: trimmed to the operational core (scan/tailor/tracker/apply-prep
  pipeline, modes, providers, templates). Removed: marketing docs/assets, the
  bundled Next.js web dashboard, the Go terminal dashboard, unit tests, and
  optional third-party plugins (Notion/Gmail/Apify) not in use here. See
  `agents/career-ops/NOTICE.md` for the full list.

```
MIT License

Copyright (c) 2026 Santiago Fernández de Valderrama

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## skills/resume-skills/

Vendored from **ResumeSkills** (Paramchoudhary/ResumeSkills), by Param
Choudhary and contributors.

- Source: https://github.com/Paramchoudhary/ResumeSkills
- Commit: `74ae19e7c62b0516d1c298328e5544976c12da5d` (2026-06-19)
- License: MIT (see `skills/resume-skills/LICENSE`)
- Local changes: kept the canonical `skills/` prompt library only; removed
  duplicate per-CLI mirror directories (`.claude/`, `.cursor/`, `.gemini/`,
  etc.) that shipped empty/stale copies of the same content in this checkout.

```
MIT License

Copyright (c) 2026 Resume Skills

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Dependencies and tools (not vendored)

Used as libraries or run as separate processes; their code is not copied into this repository except where stated.

| Component | Role | License |
|---|---|---|
| [Next.js](https://github.com/vercel/next.js), [React](https://github.com/facebook/react) | Dashboard framework | MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss), [lucide-react](https://github.com/lucide-icons/lucide) | Styling, icons | MIT, ISC |
| [Motion](https://github.com/motiondivision/motion) | Dashboard animation | MIT |
| [js-yaml](https://github.com/nodeca/js-yaml) | YAML configuration | MIT |
| [Playwright](https://github.com/microsoft/playwright) | Browser automation in career-ops | Apache-2.0 |
| [Ponytail](https://github.com/DietrichGebert/ponytail) | Coding-agent ruleset; the rule ladder is adapted in `AGENTS.md` (© DietrichGebert) | MIT |
| [Graphify](https://github.com/Graphify-Labs/graphify) | Developer tool: code knowledge graph; only its generated `GRAPH_REPORT.md` files are committed | Apache-2.0 |
| [OmniRoute](https://github.com/diegosouzapw/OmniRoute) | Optional local AI gateway, run via `deploy/omniroute/docker-compose.yml` (image pulled, not bundled) | MIT |
| [SearXNG](https://github.com/searxng/searxng) | Optional self-hosted search, run via `agents/career-ops/deploy/searxng` (image pulled, not bundled) | AGPL-3.0 |
| [Agent Skills specification](https://github.com/agentskills/agentskills) | `SKILL.md` format used by the skills in this repo | Apache-2.0 |

Data services are used under their own terms: the public [Hacker News API](https://github.com/HackerNews/API) via [Algolia HN Search](https://hn.algolia.com/api), employer job-board APIs (Greenhouse, Lever, Ashby, Workday), and the [Brave Search API](https://brave.com/search/api/).
