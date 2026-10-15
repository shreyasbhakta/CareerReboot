# Graph Report - src  (2026-10-14)

## Corpus Check
- 233 files · ~155,187 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .woff2 2, .css 1)

## Summary
- 1413 nodes · 3782 edges · 63 communities (62 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7c37818c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- report-view.tsx
- hiring-radar.ts
- followups-view.tsx
- settings.ts
- providers.ts
- apply-view.tsx
- registry.ts
- cn
- app-shell.tsx
- job-store.tsx
- ref_lucide_react
- hiring-radar-view.tsx
- assistant-console.tsx
- session.ts
- ref_node_path
- cv-envelope.mjs
- api/run/route.ts
- explore-provider.tsx
- job-registry.ts
- clis.ts
- beta-banner.tsx
- explore/route.ts
- career-ops.ts
- api/status/route.ts
- discovering-state.tsx
- explorer-view.tsx
- inbox-triage.tsx
- drive.ts
- careerOpsRoot
- explore.ts
- whats-new/route.ts
- research-view.tsx
- rootScript
- ai/route.ts
- config-form.tsx
- cv/page.tsx
- prefill/route.ts
- pipeline.ts
- drive/route.ts
- default/route.ts
- ref_node_fs
- tracker-lock.ts
- claude-invocation.mjs
- ref_node_child_process
- origin-guard.mjs
- ingest/route.ts
- move-back-to-evaluate/route.ts
- scan.ts
- diagnose.ts
- readMemory
- usage/route.ts
- delete/route.ts
- version/route.ts
- tracker-table.mjs
- back-to-top.tsx
- enrichFromAts
- Bug-report body format — v1
- save/route.ts
- pdf-paths.mjs
- cv/route.ts
- legal/page.tsx
- extractForm
- README.md

## God Nodes (most connected - your core abstractions)
1. `careerOpsRoot()` - 114 edges
2. `cn()` - 98 edges
3. `POST()` - 35 edges
4. `rootScript()` - 33 edges
5. `AssistantConsole()` - 26 edges
6. `useJobs()` - 25 edges
7. `Button()` - 23 edges
8. `Badge()` - 22 edges
9. `readApplications()` - 22 edges
10. `AppShell()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `resolveDefaultCv()`  [EXTRACTED]
  agents/career-ops/web/src/app/api/cv/default/route.ts → agents/career-ops/web/src/lib/apply/cv.ts
- `POST()` --indirect_call--> `findReportFile()`  [INFERRED]
  agents/career-ops/web/src/app/api/run/route.ts → agents/career-ops/web/src/lib/career-ops.ts
- `POST()` --calls--> `careerOpsRoot()`  [EXTRACTED]
  agents/career-ops/web/src/app/api/runs/save/route.ts → agents/career-ops/web/src/lib/career-ops.ts
- `send()` --indirect_call--> `cliId()`  [INFERRED]
  agents/career-ops/web/src/components/assistant-console.tsx → agents/career-ops/web/src/components/apply/apply-provider.tsx
- `normCompany()` --calls--> `normalizeTextKey()`  [EXTRACTED]
  agents/career-ops/web/src/app/actions/registry.ts → agents/career-ops/web/src/lib/core/normalize-text-key.mjs

## Import Cycles
- None detected.

## Communities (63 total, 1 thin omitted)

### Community 0 - "report-view.tsx"
Cohesion: 0.05
Nodes (54): Analytics(), Bar(), dynamic, Section(), STAGES, Stat(), dynamic, PipelinePage() (+46 more)

### Community 1 - "hiring-radar.ts"
Cohesion: 0.06
Nodes (66): dynamic, POST(), runtime, dynamic, POST(), runtime, dynamic, GET() (+58 more)

### Community 2 - "followups-view.tsx"
Cohesion: 0.07
Nodes (57): cell(), DELETE(), dynamic, POST(), runtime, DELETE(), dynamic, pinRe() (+49 more)

### Community 3 - "settings.ts"
Cohesion: 0.07
Nodes (47): dynamic, GET(), latexSourcePath(), POST(), runtime, dynamic, GET(), isObj() (+39 more)

### Community 4 - "providers.ts"
Cohesion: 0.08
Nodes (49): DELETE(), dynamic, errorStatus(), file(), GET(), PATCH(), POST(), runtime (+41 more)

### Community 5 - "apply-view.tsx"
Cohesion: 0.07
Nodes (47): ApplyPage(), dynamic, ApplyBackdropMount(), ApplyCtx, ApplyProvider(), cliId(), closeSession(), Ctx (+39 more)

### Community 6 - "registry.ts"
Cohesion: 0.06
Nodes (38): ActionCtx, ActionDef, ACTIONS, AUTO_FIRE_MAX, BATCH_CAP, CANON_STATUS, DispatchResult, DoneInfo (+30 more)

### Community 7 - "cn"
Cohesion: 0.09
Nodes (35): dynamic, SearchHmPage(), CopyableCommand(), agoLabel(), TriageRow(), Candidate, CandidateCard(), CONF_TONE (+27 more)

### Community 8 - "app-shell.tsx"
Cohesion: 0.10
Nodes (34): metadata, RootLayout(), viewport, Home(), AppShell(), BackgroundVideo(), CoMark(), extractWhy() (+26 more)

### Community 9 - "job-store.tsx"
Cohesion: 0.08
Nodes (33): JobsHistory(), TONE_CHIP, consumeRunStream(), Ctx, finishRun(), Job, JobResult, JobsContext (+25 more)

### Community 10 - "ref_lucide_react"
Cohesion: 0.11
Nodes (17): JobPage(), cliId(), CvIngest(), Phase, CvEditor(), outlineFromMarkdown(), LatexEditor(), GrainGradient (+9 more)

### Community 11 - "hiring-radar-view.tsx"
Cohesion: 0.11
Nodes (31): dynamic, HiringRadarPage(), AGES, ageText(), api(), applyFilters(), Checklist(), Config() (+23 more)

### Community 12 - "assistant-console.tsx"
Cohesion: 0.11
Nodes (25): dispatch(), AssistantConsole(), appendCards(), applyContext(), buildCtx(), pipelineContext(), read(), runDispatch() (+17 more)

### Community 13 - "session.ts"
Cohesion: 0.12
Nodes (25): dynamic, POST(), runtime, dynamic, maxDuration, POST(), runtime, dismissConsent() (+17 more)

### Community 14 - "ref_node_path"
Cohesion: 0.17
Nodes (20): dynamic, maxDuration, POST(), runtime, dynamic, GET(), runtime, servePdf() (+12 more)

### Community 15 - "cv-envelope.mjs"
Cohesion: 0.09
Nodes (20): CLOSE_MARK, CLOSE_MARK_TEX, CLOSER, CLOSER_ALL, CLOSER_SRC, CLOSER_TEX, CLOSER_TEX_ALL, CLOSER_TEX_SRC (+12 more)

### Community 16 - "api/run/route.ts"
Cohesion: 0.15
Nodes (20): dynamic, maxDuration, POST(), runJob(), runtime, readLanguageConfig(), resolveEvalModeFile(), attachKill() (+12 more)

### Community 17 - "explore-provider.tsx"
Cohesion: 0.11
Nodes (21): AiCost, clearRunningScan(), Ctx, ExploreCtx, ExploreProvider(), persistRunningScan(), Phase, readRunningScan() (+13 more)

### Community 18 - "job-registry.ts"
Cohesion: 0.12
Nodes (20): dynamic, GET(), maxDuration, runtime, PortalEvent, dynamic, GET(), maxDuration (+12 more)

### Community 19 - "clis.ts"
Cohesion: 0.15
Nodes (20): dynamic, GET(), binCandidates(), detectClis(), findBin(), KNOWN, searchDirs(), isReservedReportFile() (+12 more)

### Community 20 - "beta-banner.tsx"
Cohesion: 0.18
Nodes (16): BetaBanner(), findSimilar(), SimilarIssue, searchCache, searchIssues(), BUF, recentLogs(), Window (+8 more)

### Community 21 - "explore/route.ts"
Cohesion: 0.15
Nodes (18): dynamic, maxDuration, POST(), runtime, dynamic, GET(), maxDuration, runtime (+10 more)

### Community 22 - "career-ops.ts"
Cohesion: 0.15
Nodes (18): dynamic, GET(), runtime, pdfIndexEntryForReport(), pdfPathForReport(), containedRealpath(), findReportFile(), isRegularContainedFile() (+10 more)

### Community 23 - "api/status/route.ts"
Cohesion: 0.17
Nodes (17): boundedLockWait(), CLIENT_ERROR_CODES, CliResult, EXIT_TO_HTTP, POST(), runSetStatus(), runtime, canonicalizeStatus() (+9 more)

### Community 24 - "discovering-state.tsx"
Cohesion: 0.25
Nodes (15): ApplyBackdrop(), AiHuntTrace(), renderInline(), AiHuntView(), DiscoveringState(), SourceChip(), useCountUp(), DiscoveryCard() (+7 more)

### Community 25 - "explorer-view.tsx"
Cohesion: 0.19
Nodes (15): CostBadge(), AiSearchBox(), EXAMPLES, ExploreModeToggle(), BlockedCard(), CappedBanner(), CLI_NAMES, DegradedCard() (+7 more)

### Community 26 - "inbox-triage.tsx"
Cohesion: 0.22
Nodes (16): FacetChips(), Pill(), InboxTriage(), ConfirmScore(), fmtTokens(), ShortItem, ShortlistTray(), RowScore (+8 more)

### Community 27 - "drive.ts"
Cohesion: 0.17
Nodes (16): agentInterpretForm(), buildPrompt(), Cand, captureCandidates(), Interpreted, runPlanner(), VALID_TYPES, dropNewTabs() (+8 more)

### Community 28 - "careerOpsRoot"
Cohesion: 0.22
Nodes (17): dynamic, maxDuration, Msg, POST(), runtime, dirCount(), dynamic, GET() (+9 more)

### Community 29 - "explore.ts"
Cohesion: 0.18
Nodes (15): FilterBuilder(), KeywordField(), Label(), RECENCY, CHIP_CAP, cleanChips(), ATS_LABEL, ATS_SOURCES (+7 more)

### Community 30 - "whats-new/route.ts"
Cohesion: 0.19
Nodes (14): dynamic, GET(), runtime, getNormalizeTextKey(), modCache, NormalizeTextKey, MAX_SINCE_DAYS, collectWhatsNew() (+6 more)

### Community 31 - "research-view.tsx"
Cohesion: 0.13
Nodes (14): dynamic, ResearchPage(), CompanyGroup, DEPTH_OPTIONS, Diagnostic, groupByCompany(), HEALTH_TONE, ResearchView() (+6 more)

### Community 32 - "rootScript"
Cohesion: 0.16
Nodes (13): dynamic, GET(), runtime, dynamic, HmResult, POST(), run, runtime (+5 more)

### Community 33 - "ai/route.ts"
Cohesion: 0.17
Nodes (13): dynamic, GET(), runtime, codexCapabilityCache, CodexCapabilityCacheEntry, dynamic, maxDuration, POST() (+5 more)

### Community 34 - "config-form.tsx"
Cohesion: 0.21
Nodes (13): ConfigPage(), Cli, ConfigForm(), selectCli(), Mode, ModeCard(), PROVIDERS, CadenceSettings() (+5 more)

### Community 35 - "cv/page.tsx"
Cohesion: 0.26
Nodes (13): CvPage(), dynamic, dynamic, Home(), dynamic, ReportPage(), hasCli(), OnboardingBanner() (+5 more)

### Community 36 - "prefill/route.ts"
Cohesion: 0.20
Nodes (11): dynamic, maxDuration, POST(), runtime, buildAnswerPrompt(), PlannerField, PlannerRun, runPlanner() (+3 more)

### Community 37 - "pipeline.ts"
Cohesion: 0.17
Nodes (12): dynamic, POST(), runtime, dynamic, POST(), runtime, AddResult, ClearResult (+4 more)

### Community 38 - "drive/route.ts"
Cohesion: 0.22
Nodes (13): dynamic, maxDuration, POST(), runtime, captchaWarning(), classifyEmpty(), extractCurrent(), finalizeDrivenSession() (+5 more)

### Community 39 - "default/route.ts"
Cohesion: 0.24
Nodes (12): dynamic, GET(), maxDuration, POST(), runtime, resolveLatexSource(), cleanupPdfScratch(), markTrackerReady() (+4 more)

### Community 40 - "ref_node_fs"
Cohesion: 0.24
Nodes (9): dynamic, FilterLists, listFrom(), loadYaml(), seedExploreFilters(), block(), serializePortals(), writeTempPortals() (+1 more)

### Community 41 - "tracker-lock.ts"
Cohesion: 0.18
Nodes (9): modCache, TrackerUtils, AcquireFn, CoreLock, loadCoreLock(), LockDirFn, modCache, TrackerBusyError (+1 more)

### Community 42 - "claude-invocation.mjs"
Cohesion: 0.21
Nodes (10): ALWAYS_DENIED, claudeCliArgs(), grantsWriteCapability(), KNOWN_KINDS, PERSISTING_KINDS, scopeFrom(), TOOL_SCOPES, toolNames() (+2 more)

### Community 43 - "ref_node_child_process"
Cohesion: 0.31
Nodes (8): dynamic, GET(), runtime, DUE_URGENCIES, isDue(), nextDateValue(), pickNextUpcoming(), selectDueFollowups()

### Community 44 - "origin-guard.mjs"
Cohesion: 0.42
Nodes (9): block(), checkRequest(), isLoopbackHost(), normalizeHost(), normalizeOrigin(), parseAllowedHosts(), parseAllowedOrigins(), config (+1 more)

### Community 45 - "ingest/route.ts"
Cohesion: 0.31
Nodes (9): cleanupTemp(), dynamic, FILE_SRC(), ingestPrompt(), maxDuration, POST(), readCanonicalMode(), runtime (+1 more)

### Community 46 - "move-back-to-evaluate/route.ts"
Cohesion: 0.27
Nodes (8): dynamic, POST(), runtime, dynamic, POST(), run, runtime, addOffersToPipeline()

### Community 47 - "scan.ts"
Cohesion: 0.27
Nodes (9): cleanupTempPortals(), firstMatch(), JsonOffer, JsonOfferLine, parseOfferLine(), runDiscovery(), ScanJson, ExploreFilters (+1 more)

### Community 48 - "diagnose.ts"
Cohesion: 0.31
Nodes (5): CONSENT_BUTTONS, ApplyField, ExtractedForm, ApplyIssue, DriveStep

### Community 49 - "readMemory"
Cohesion: 0.36
Nodes (7): dynamic, GET(), POST(), runtime, profilePath(), readMemory(), rememberFact()

### Community 50 - "usage/route.ts"
Cohesion: 0.36
Nodes (7): compute(), dynamic, GET(), projectsDir(), runtime, Usage, walkJsonl()

### Community 51 - "delete/route.ts"
Cohesion: 0.43
Nodes (6): dynamic, parseOrphan(), POST(), runtime, trackerCanDelete(), isTrackerWriting()

### Community 52 - "version/route.ts"
Cohesion: 0.43
Nodes (6): dynamic, GET(), readVersion(), runtime, shortSha(), webVersion()

### Community 53 - "tracker-table.mjs"
Cohesion: 0.48
Nodes (6): aliasCache, detectColumnMap(), loadHeaderAliases(), parseApplications(), trackerCells(), WEB_FIELD

### Community 54 - "back-to-top.tsx"
Cohesion: 0.60
Nodes (4): BackToTop(), BACK_TO_TOP_THRESHOLD, scrollBehaviorFor(), shouldShowBackToTop()

### Community 55 - "enrichFromAts"
Cohesion: 0.40
Nodes (5): fetchGreenhouseSchema(), GH_TYPE, GhField, parseGreenhouse(), enrichFromAts()

### Community 56 - "Bug-report body format — v1"
Cohesion: 0.33
Nodes (5): Body sections (stable order), Bug-report body format — v1, Identification, Privacy floor (invariant across versions), The fingerprint

### Community 57 - "save/route.ts"
Cohesion: 0.40
Nodes (4): Body, dynamic, POST(), runtime

### Community 58 - "pdf-paths.mjs"
Cohesion: 0.70
Nodes (4): resolveCvSlugs(), resolveLatexPdfPaths(), resolvePdfPaths(), slugify()

### Community 59 - "cv/route.ts"
Cohesion: 0.83
Nodes (3): cvPath(), GET(), POST()

### Community 60 - "legal/page.tsx"
Cohesion: 0.67
Nodes (3): H(), LegalPage(), metadata

### Community 61 - "extractForm"
Cohesion: 0.83
Nodes (4): extractForm(), fieldGroup(), groupLabel(), labelFor()

## Knowledge Gaps
- **376 isolated node(s):** `AUTO_FIRE_MAX`, `BATCH_CAP`, `CANON_STATUS`, `TAB_VALUES`, `SORT_VALUES` (+371 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 430 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `careerOpsRoot()` connect `careerOpsRoot` to `hiring-radar.ts`, `followups-view.tsx`, `settings.ts`, `providers.ts`, `registry.ts`, `ref_node_path`, `api/run/route.ts`, `explore/route.ts`, `career-ops.ts`, `api/status/route.ts`, `drive.ts`, `whats-new/route.ts`, `rootScript`, `ai/route.ts`, `cv/page.tsx`, `prefill/route.ts`, `pipeline.ts`, `default/route.ts`, `ref_node_fs`, `tracker-lock.ts`, `ref_node_child_process`, `ingest/route.ts`, `move-back-to-evaluate/route.ts`, `scan.ts`, `readMemory`, `delete/route.ts`, `save/route.ts`, `cv/route.ts`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **What connects `AUTO_FIRE_MAX`, `BATCH_CAP`, `CANON_STATUS` to the rest of the system?**
  _376 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `report-view.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05333333333333334 - nodes in this community are weakly interconnected._
- **Why does `cn()` connect `cn` to `report-view.tsx`, `config-form.tsx`, `followups-view.tsx`, `apply-view.tsx`, `registry.ts`, `app-shell.tsx`, `job-store.tsx`, `ref_lucide_react`, `hiring-radar-view.tsx`, `assistant-console.tsx`, `back-to-top.tsx`, `discovering-state.tsx`, `explorer-view.tsx`, `inbox-triage.tsx`, `explore.ts`, `research-view.tsx`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Should `hiring-radar.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06018018018018018 - nodes in this community are weakly interconnected._
- **Why does `AssistantConsole()` connect `assistant-console.tsx` to `report-view.tsx`, `apply-view.tsx`, `cn`, `app-shell.tsx`, `job-store.tsx`, `discovering-state.tsx`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Should `followups-view.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06584723441615452 - nodes in this community are weakly interconnected._