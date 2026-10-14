# Graph Report - hiring-radar  (2026-10-14)

## Corpus Check
- 56 files · ~37,656 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: .csv 1)

## Summary
- 392 nodes · 1027 edges · 17 communities (14 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7c37818c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- integration.test.mjs
- research.mjs
- scan.mjs
- pipeline.mjs
- createHttp
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
- storage.test.mjs
- connections.mjs

## God Nodes (most connected - your core abstractions)
1. `runScan()` - 34 edges
2. `normalizeText()` - 26 edges
3. `peopleFromHit()` - 23 edges
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

## Communities (17 total, 3 thin omitted)

### Community 0 - "integration.test.mjs"
Cohesion: 0.07
Nodes (33): collector, pickCompanies(), providerDir, deepMerge(), isObj(), loadConfig(), profileOverlay(), readYaml() (+25 more)

### Community 1 - "research.mjs"
Cohesion: 0.12
Nodes (42): cleanLinkedInProfileUrl(), extractNamedContact(), isPlausibleName(), NOT_NAMES, parsePostAuthor(), parseProfileTitle(), personFromResult(), clean() (+34 more)

### Community 2 - "scan.mjs"
Cohesion: 0.07
Nodes (44): buildDigest(), COMPANY_TYPES, HIDDEN, HIRING_TYPES, createCache(), CAREER_OPS_DIR, loadDotEnv(), ROOT (+36 more)

### Community 3 - "pipeline.mjs"
Cohesion: 0.10
Nodes (35): collector, RFC-2822, buildWhy(), outreachAngle(), proofPointsFor(), suggestedAction(), classifyPersonTitle(), ageHours() (+27 more)

### Community 4 - "createHttp"
Cohesion: 0.17
Nodes (15): createHttp(), acquire(), once(), release(), request(), spaceHost(), mapLimit(), parseRetryAfter() (+7 more)

### Community 5 - "job.mjs"
Cohesion: 0.10
Nodes (20): cleanCompany(), cleanTitle(), companyFromUrl(), escapeRe(), fetchJob(), fetchSmartRecruiters(), findReportsTo(), findTeam() (+12 more)

### Community 6 - "web-search.mjs"
Cohesion: 0.14
Nodes (15): braveFresh, collector, engines, generateQueries(), googleFresh, GROUP_OF_TERM(), ATS_HOST, BAD (+7 more)

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

### Community 15 - "storage.test.mjs"
Cohesion: 0.19
Nodes (22): canonicalUrl(), shortHash(), deleteSignals(), loadTombstones(), setAllStatus(), setStatus(), setStatusMany(), tombstonePath() (+14 more)

### Community 16 - "connections.mjs"
Cohesion: 0.14
Nodes (15): toJson(), toPublicSignal(), clip(), item(), personLine(), section(), toMarkdown(), TYPE_LABEL (+7 more)

## Knowledge Gaps
- **75 isolated node(s):** `providerDir`, `braveFresh`, `googleFresh`, `BAD`, `ATS_HOST` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 109 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `js-yaml` connect `integration.test.mjs` to `package.json`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **What connects `providerDir`, `braveFresh`, `googleFresh` to the rest of the system?**
  _75 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `integration.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06883116883116883 - nodes in this community are weakly interconnected._
- **Why does `normalizeText()` connect `research.mjs` to `connections.mjs`, `scan.mjs`, `pipeline.mjs`, `storage.test.mjs`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `research.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11563367252543941 - nodes in this community are weakly interconnected._
- **Should `scan.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.07005649717514124 - nodes in this community are weakly interconnected._
- **Should `pipeline.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.10195035460992907 - nodes in this community are weakly interconnected._