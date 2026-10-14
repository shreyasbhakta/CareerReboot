# Graph Report - hiring-radar  (2026-10-14)

## Corpus Check
- 56 files · ~37,113 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: .csv 1)

## Summary
- 391 nodes · 1021 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c37a0bfa`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- integration.test.mjs
- research.mjs
- scan.mjs
- pipeline.mjs
- search-hm.mjs
- job.mjs
- web-search.mjs
- package.json
- classifyHiringText
- Hiring Radar
- createRoleMatcher
- hiring-radar — who is hiring for me, right now?
- generate-daily-hiring-digest/SKILL.md
- generate-outreach-context/SKILL.md
- match-role-to-profile/SKILL.md

## God Nodes (most connected - your core abstractions)
1. `runScan()` - 34 edges
2. `normalizeText()` - 26 edges
3. `peopleFromHit()` - 22 edges
4. `buildSignal()` - 19 edges
5. `fetchJob()` - 16 edges
6. `researchJob()` - 14 edges
7. `createHttp()` - 13 edges
8. `createLlm()` - 13 edges
9. `cfg()` - 13 edges
10. `loadConfig()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `classify-hiring-signal` --references--> `classifyHiringText()`  [INFERRED]
  agents/hiring-radar/skills/classify-hiring-signal/SKILL.md → agents/hiring-radar/extractors/hiring-signal.mjs
- `GROUP_OF_TERM()` --calls--> `termRegex()`  [EXTRACTED]
  agents/hiring-radar/collectors/web-search.mjs → agents/hiring-radar/lib/text.mjs
- `companyFromUrl()` --calls--> `companyFromAtsUrl()`  [EXTRACTED]
  agents/hiring-radar/hm/job.mjs → agents/hiring-radar/extractors/company.mjs
- `buildSignal()` --calls--> `resolveCompany()`  [EXTRACTED]
  agents/hiring-radar/pipeline.mjs → agents/hiring-radar/extractors/company.mjs
- `buildSignal()` --calls--> `classifyHiringText()`  [EXTRACTED]
  agents/hiring-radar/pipeline.mjs → agents/hiring-radar/extractors/hiring-signal.mjs

## Import Cycles
- None detected.

## Communities (15 total, 3 thin omitted)

### Community 0 - "integration.test.mjs"
Cohesion: 0.05
Nodes (51): collector, pickCompanies(), providerDir, CAREER_OPS_DIR, deepMerge(), isObj(), loadConfig(), profileOverlay() (+43 more)

### Community 1 - "research.mjs"
Cohesion: 0.10
Nodes (48): cleanLinkedInProfileUrl(), extractNamedContact(), isPlausibleName(), NOT_NAMES, parsePostAuthor(), parseProfileTitle(), personFromResult(), clean() (+40 more)

### Community 2 - "scan.mjs"
Cohesion: 0.07
Nodes (42): buildDigest(), COMPANY_TYPES, HIDDEN, HIRING_TYPES, toJson(), toPublicSignal(), clip(), item() (+34 more)

### Community 3 - "pipeline.mjs"
Cohesion: 0.12
Nodes (33): RFC-2822, buildWhy(), outreachAngle(), proofPointsFor(), suggestedAction(), classifyPersonTitle(), ageHours(), parseDate() (+25 more)

### Community 4 - "search-hm.mjs"
Cohesion: 0.10
Nodes (29): createCache(), loadDotEnv(), createHttp(), acquire(), once(), release(), request(), spaceHost() (+21 more)

### Community 5 - "job.mjs"
Cohesion: 0.10
Nodes (20): cleanCompany(), cleanTitle(), companyFromUrl(), escapeRe(), fetchJob(), fetchSmartRecruiters(), findReportsTo(), findTeam() (+12 more)

### Community 6 - "web-search.mjs"
Cohesion: 0.12
Nodes (17): collector, braveFresh, collector, engines, generateQueries(), googleFresh, GROUP_OF_TERM(), ATS_HOST (+9 more)

### Community 7 - "package.json"
Cohesion: 0.11
Nodes (17): dependencies, js-yaml, description, engines, node, license, name, private (+9 more)

### Community 8 - "classifyHiringText"
Cohesion: 0.26
Nodes (9): cache, classifyHiringText(), compile(), firstHit(), patterns(), splitSentences(), classify-hiring-signal, c (+1 more)

### Community 9 - "Hiring Radar"
Cohesion: 0.17
Nodes (11): Automation, CLI, Configure, Example, Hand-off to outreach, Hiring Radar, Limits, Outputs (`agents/career-ops/data/`, gitignored) (+3 more)

### Community 10 - "createRoleMatcher"
Cohesion: 0.57
Nodes (6): createRoleMatcher(), match(), seniority(), normalizeRoleText(), phraseRe(), reEscape()

### Community 11 - "hiring-radar — who is hiring for me, right now?"
Cohesion: 0.40
Nodes (4): hiring-radar — who is hiring for me, right now?, Read the results, Rules, Run

## Knowledge Gaps
- **75 isolated node(s):** `providerDir`, `braveFresh`, `googleFresh`, `BAD`, `ATS_HOST` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 110 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `js-yaml` connect `integration.test.mjs` to `package.json`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **What connects `providerDir`, `braveFresh`, `googleFresh` to the rest of the system?**
  _75 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `integration.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.05493827160493827 - nodes in this community are weakly interconnected._
- **Why does `normalizeText()` connect `research.mjs` to `scan.mjs`, `pipeline.mjs`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Should `research.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.09586466165413533 - nodes in this community are weakly interconnected._
- **Why does `runScan()` connect `scan.mjs` to `integration.test.mjs`, `research.mjs`, `pipeline.mjs`, `search-hm.mjs`, `createRoleMatcher`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Should `scan.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06883116883116883 - nodes in this community are weakly interconnected._