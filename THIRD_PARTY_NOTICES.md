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
