# Graph Report - hiring-radar  (2026-10-04)

## Corpus Check
- 52 files · ~28,129 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 1 file(s) not represented in the graph (top: .csv 1)

## Summary
- 307 nodes · 774 edges · 16 communities (13 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `44112907`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- runScan
- text.mjs
- pipeline.mjs
- integration.test.mjs
- ref_node_assert
- scan.mjs
- extract.test.mjs
- package.json
- createHttp
- Hiring Radar
- markdown.mjs
- createRoleMatcher
- hiring-radar — who is hiring for me, right now?
- generate-daily-hiring-digest/SKILL.md
- generate-outreach-context/SKILL.md
- match-role-to-profile/SKILL.md

## God Nodes (most connected - your core abstractions)
1. `runScan()` - 34 edges
2. `buildSignal()` - 19 edges
3. `normalizeText()` - 14 edges
4. `dedupKeys()` - 12 edges
5. `cfg()` - 12 edges
6. `loadConfig()` - 11 edges
7. `createHttp()` - 11 edges
8. `createLlm()` - 11 edges
9. `createRoleMatcher()` - 10 edges
10. `scoreAndAnnotate()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `classify-hiring-signal` --references--> `classifyHiringText()`  [INFERRED]
  agents/hiring-radar/skills/classify-hiring-signal/SKILL.md → agents/hiring-radar/extractors/hiring-signal.mjs
- `GROUP_OF_TERM()` --calls--> `termRegex()`  [EXTRACTED]
  agents/hiring-radar/collectors/web-search.mjs → agents/hiring-radar/lib/text.mjs
- `buildSignal()` --calls--> `resolveCompany()`  [EXTRACTED]
  agents/hiring-radar/pipeline.mjs → agents/hiring-radar/extractors/company.mjs
- `buildSignal()` --calls--> `classifyHiringText()`  [EXTRACTED]
  agents/hiring-radar/pipeline.mjs → agents/hiring-radar/extractors/hiring-signal.mjs
- `cls()` --calls--> `classifyHiringText()`  [EXTRACTED]
  agents/hiring-radar/tests/signal.test.mjs → agents/hiring-radar/extractors/hiring-signal.mjs

## Import Cycles
- None detected.

## Communities (16 total, 3 thin omitted)

### Community 0 - "runScan"
Cohesion: 0.11
Nodes (33): canonicalUrl(), normalizeText(), shortHash(), detectSpikes(), fixtureCandidates(), parseArgs(), runScan(), deleteSignals() (+25 more)

### Community 1 - "text.mjs"
Cohesion: 0.10
Nodes (25): collector, createCache(), sha1(), stripHtml(), truncate(), adapters(), createLlm(), complete() (+17 more)

### Community 2 - "pipeline.mjs"
Cohesion: 0.14
Nodes (29): RFC-2822, buildWhy(), outreachAngle(), proofPointsFor(), suggestedAction(), classifyPersonTitle(), ageHours(), parseDate() (+21 more)

### Community 3 - "integration.test.mjs"
Cohesion: 0.11
Nodes (21): collector, pickCompanies(), providerDir, CAREER_OPS_DIR, deepMerge(), isObj(), loadConfig(), profileOverlay() (+13 more)

### Community 4 - "ref_node_assert"
Cohesion: 0.09
Nodes (19): cache, classifyHiringText(), compile(), firstHit(), patterns(), splitSentences(), js-yaml, classify-hiring-signal (+11 more)

### Community 5 - "scan.mjs"
Cohesion: 0.10
Nodes (17): buildDigest(), COMPANY_TYPES, HIDDEN, HIRING_TYPES, toJson(), toPublicSignal(), loadDotEnv(), rankSignals() (+9 more)

### Community 6 - "extract.test.mjs"
Cohesion: 0.15
Nodes (21): braveFresh, collector, engines, generateQueries(), GROUP_OF_TERM(), ATS_HOST, BAD, companyFromAtsUrl() (+13 more)

### Community 7 - "package.json"
Cohesion: 0.11
Nodes (17): dependencies, js-yaml, description, engines, node, license, name, private (+9 more)

### Community 8 - "createHttp"
Cohesion: 0.24
Nodes (10): createHttp(), acquire(), once(), release(), request(), spaceHost(), mapLimit(), parseRetryAfter() (+2 more)

### Community 9 - "Hiring Radar"
Cohesion: 0.18
Nodes (10): Automation, CLI, Configure, Example, Hand-off to outreach, Hiring Radar, Limits, Outputs (`agents/career-ops/data/`, gitignored) (+2 more)

### Community 10 - "markdown.mjs"
Cohesion: 0.36
Nodes (9): clip(), item(), personLine(), section(), toMarkdown(), TYPE_LABEL, warmLine(), formatEt() (+1 more)

### Community 11 - "createRoleMatcher"
Cohesion: 0.57
Nodes (6): createRoleMatcher(), match(), seniority(), normalizeRoleText(), phraseRe(), reEscape()

### Community 12 - "hiring-radar — who is hiring for me, right now?"
Cohesion: 0.40
Nodes (4): hiring-radar — who is hiring for me, right now?, Read the results, Rules, Run

## Knowledge Gaps
- **67 isolated node(s):** `providerDir`, `braveFresh`, `engines`, `BAD`, `ATS_HOST` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 94 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `js-yaml` connect `ref_node_assert` to `integration.test.mjs`, `package.json`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **What connects `providerDir`, `braveFresh`, `engines` to the rest of the system?**
  _67 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `runScan` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Why does `runScan()` connect `runScan` to `text.mjs`, `pipeline.mjs`, `integration.test.mjs`, `scan.mjs`, `extract.test.mjs`, `createHttp`, `markdown.mjs`, `createRoleMatcher`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `text.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.0960960960960961 - nodes in this community are weakly interconnected._
- **Should `pipeline.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.14264264264264265 - nodes in this community are weakly interconnected._
- **Should `integration.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11174242424242424 - nodes in this community are weakly interconnected._