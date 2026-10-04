# Graph Report - src  (2026-10-04)

## Corpus Check
- 224 files · ~151,370 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: .woff2 4, .css 1)

## Summary
- 1349 nodes · 3602 edges · 66 communities (65 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `44112907`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- hiring-radar.ts
- followups-view.tsx
- providers.ts
- session.ts
- hiring-radar-view.tsx
- job-store.tsx
- job-registry.ts
- explore-provider.tsx
- profile/route.ts
- api/run/route.ts
- rootScript
- ref_lucide_react
- cv-pdf/route.ts
- CompanyLogo
- careerOpsRoot
- pipeline.ts
- report-view.tsx
- cv-envelope.mjs
- inbox-triage.tsx
- ai/route.ts
- apply-view.tsx
- cv-ingest.tsx
- pipeline-view.tsx
- clis.ts
- ref_node_fs
- beta-banner.tsx
- career-ops.ts
- api/status/route.ts
- discovering-state.tsx
- explorer-view.tsx
- registry.ts
- cv/page.tsx
- AssistantConsole
- agent-interpret.ts
- prefill/route.ts
- default/route.ts
- app-shell.tsx
- explore.ts
- research-view.tsx
- cn
- kanban-board.tsx
- launcher.tsx
- drive.ts
- worker-card.tsx
- logo/route.ts
- whats-new/route.ts
- fonts.ts
- apply-provider.tsx
- job-card-popup.tsx
- extractForm
- claude-invocation.mjs
- assistant-console.tsx
- origin-guard.mjs
- analytics/page.tsx
- ingest/route.ts
- followups/route.ts
- usage/route.ts
- tracker-lock.ts
- cadence/route.ts
- version/route.ts
- tracker-table.mjs
- back-to-top.tsx
- pipeline-provider.tsx
- Bug-report body format — v1
- onboarding-banner.tsx
- README.md

## God Nodes (most connected - your core abstractions)
1. `careerOpsRoot()` - 112 edges
2. `cn()` - 93 edges
3. `POST()` - 35 edges
4. `rootScript()` - 33 edges
5. `AssistantConsole()` - 26 edges
6. `useJobs()` - 25 edges
7. `readApplications()` - 22 edges
8. `ExplorerView()` - 20 edges
9. `ReportView()` - 20 edges
10. `openSession()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `resolveDefaultCv()`  [EXTRACTED]
  agents/career-ops/web/src/app/api/cv/default/route.ts → agents/career-ops/web/src/lib/apply/cv.ts
- `POST()` --indirect_call--> `findReportFile()`  [INFERRED]
  agents/career-ops/web/src/app/api/run/route.ts → agents/career-ops/web/src/lib/career-ops.ts
- `POST()` --calls--> `careerOpsRoot()`  [EXTRACTED]
  agents/career-ops/web/src/app/api/runs/save/route.ts → agents/career-ops/web/src/lib/career-ops.ts
- `RootLayout()` --calls--> `AppShell()`  [EXTRACTED]
  agents/career-ops/web/src/app/layout.tsx → agents/career-ops/web/src/components/app-shell.tsx
- `send()` --indirect_call--> `cliId()`  [INFERRED]
  agents/career-ops/web/src/components/assistant-console.tsx → agents/career-ops/web/src/components/apply/apply-provider.tsx

## Import Cycles
- None detected.

## Communities (66 total, 1 thin omitted)

### Community 0 - "hiring-radar.ts"
Cohesion: 0.07
Nodes (58): dynamic, POST(), runtime, dynamic, POST(), runtime, dynamic, GET() (+50 more)

### Community 1 - "followups-view.tsx"
Cohesion: 0.08
Nodes (51): cell(), DELETE(), dynamic, POST(), runtime, DELETE(), dynamic, pinRe() (+43 more)

### Community 2 - "providers.ts"
Cohesion: 0.08
Nodes (49): DELETE(), dynamic, errorStatus(), file(), GET(), PATCH(), POST(), runtime (+41 more)

### Community 3 - "session.ts"
Cohesion: 0.11
Nodes (31): dynamic, POST(), runtime, dynamic, maxDuration, POST(), runtime, captchaWarning() (+23 more)

### Community 4 - "hiring-radar-view.tsx"
Cohesion: 0.11
Nodes (31): dynamic, HiringRadarPage(), AGES, ageText(), api(), applyFilters(), Checklist(), Config() (+23 more)

### Community 5 - "job-store.tsx"
Cohesion: 0.10
Nodes (28): ConfigPage(), Cli, ConfigForm(), selectCli(), Mode, ModeCard(), PROVIDERS, CadenceSettings() (+20 more)

### Community 6 - "job-registry.ts"
Cohesion: 0.09
Nodes (27): dynamic, GET(), maxDuration, runtime, dynamic, maxDuration, PortalEvent, runtime (+19 more)

### Community 7 - "explore-provider.tsx"
Cohesion: 0.09
Nodes (27): AiCost, clearRunningScan(), Ctx, ExploreCtx, ExploreProvider(), persistRunningScan(), Phase, readRunningScan() (+19 more)

### Community 8 - "profile/route.ts"
Cohesion: 0.12
Nodes (24): dynamic, GET(), latexSourcePath(), POST(), runtime, cvPath(), GET(), POST() (+16 more)

### Community 9 - "api/run/route.ts"
Cohesion: 0.13
Nodes (25): GET(), dynamic, maxDuration, POST(), runJob(), runtime, readLanguageConfig(), resolveEvalModeFile() (+17 more)

### Community 10 - "rootScript"
Cohesion: 0.12
Nodes (24): dynamic, maxDuration, POST(), runtime, rootScript(), cleanupTempPortals(), FilterLists, listFrom() (+16 more)

### Community 11 - "ref_lucide_react"
Cohesion: 0.17
Nodes (12): JobsHistory(), TONE_CHIP, useApply(), ApplyButton(), ApplyWithDefaultButton(), CvEditor(), outlineFromMarkdown(), LatexEditor() (+4 more)

### Community 12 - "cv-pdf/route.ts"
Cohesion: 0.17
Nodes (21): dynamic, GET(), runtime, servePdf(), dynamic, POST(), run, runtime (+13 more)

### Community 13 - "CompanyLogo"
Cohesion: 0.12
Nodes (20): dynamic, PortalsPage(), CompanyLogo(), Job, Company, EMPTY_FORM, FormState, PortalCompaniesManager() (+12 more)

### Community 14 - "careerOpsRoot"
Cohesion: 0.16
Nodes (22): dynamic, maxDuration, Msg, POST(), runtime, dynamic, GET(), runtime (+14 more)

### Community 15 - "pipeline.ts"
Cohesion: 0.11
Nodes (20): dynamic, POST(), runtime, dynamic, POST(), runtime, dynamic, POST() (+12 more)

### Community 16 - "report-view.tsx"
Cohesion: 0.17
Nodes (18): DeleteFromTracker(), extractWhy(), FirstScoreView(), isMachine(), preview(), ReportView(), BLOCKS, DIMENSIONS (+10 more)

### Community 17 - "cv-envelope.mjs"
Cohesion: 0.09
Nodes (18): CLOSE_MARK, CLOSE_MARK_TEX, CLOSER, CLOSER_ALL, CLOSER_SRC, CLOSER_TEX, CLOSER_TEX_ALL, CLOSER_TEX_SRC (+10 more)

### Community 18 - "inbox-triage.tsx"
Cohesion: 0.18
Nodes (19): FacetChips(), Pill(), InboxTriage(), ConfirmScore(), fmtTokens(), ShortItem, ShortlistTray(), agoLabel() (+11 more)

### Community 19 - "ai/route.ts"
Cohesion: 0.13
Nodes (19): dynamic, GET(), runtime, codexCapabilityCache, CodexCapabilityCacheEntry, dynamic, maxDuration, POST() (+11 more)

### Community 20 - "apply-view.tsx"
Cohesion: 0.15
Nodes (20): ApplyPage(), dynamic, ApplyBackdropMount(), ApplyExitBar(), leave(), markApplied(), ApplyIssues(), ApplyView() (+12 more)

### Community 21 - "cv-ingest.tsx"
Cohesion: 0.16
Nodes (13): JobPage(), cliId(), CvIngest(), Phase, GrainGradient, HeroGlow(), FirstRunHome(), Badge() (+5 more)

### Community 22 - "pipeline-view.tsx"
Cohesion: 0.15
Nodes (17): dynamic, PipelinePage(), ClearPipeline(), InboxEmpty(), PipelineView(), SORT_KEYS, SortKey, Tab (+9 more)

### Community 23 - "clis.ts"
Cohesion: 0.17
Nodes (19): dynamic, GET(), binCandidates(), detectClis(), findBin(), KNOWN, resolveCli(), searchDirs() (+11 more)

### Community 24 - "ref_node_fs"
Cohesion: 0.10
Nodes (16): dynamic, GET(), runtime, dynamic, HmResult, POST(), run, runtime (+8 more)

### Community 25 - "beta-banner.tsx"
Cohesion: 0.18
Nodes (16): BetaBanner(), findSimilar(), SimilarIssue, searchCache, searchIssues(), BUF, recentLogs(), Window (+8 more)

### Community 26 - "career-ops.ts"
Cohesion: 0.13
Nodes (15): containedRealpath(), findReportFile(), LanguageConfig, LifecyclePhase, PdfPathForReportResult, ReportData, CoreWithFollowupsLock, loadCoreLock() (+7 more)

### Community 27 - "api/status/route.ts"
Cohesion: 0.16
Nodes (18): boundedLockWait(), CLIENT_ERROR_CODES, CliResult, EXIT_TO_HTTP, POST(), runSetStatus(), runtime, canonicalizeStatus() (+10 more)

### Community 28 - "discovering-state.tsx"
Cohesion: 0.24
Nodes (14): ApplyBackdrop(), AiHuntTrace(), renderInline(), AiHuntView(), DiscoveringState(), SourceChip(), useCountUp(), DiscoveryCard() (+6 more)

### Community 29 - "explorer-view.tsx"
Cohesion: 0.19
Nodes (16): CostBadge(), AiSearchBox(), EXAMPLES, ExploreModeToggle(), BlockedCard(), CappedBanner(), CLI_NAMES, DegradedCard() (+8 more)

### Community 30 - "registry.ts"
Cohesion: 0.11
Nodes (13): ActionDef, ACTIONS, AUTO_FIRE_MAX, BATCH_CAP, CANON_STATUS, DispatchResult, normCompany(), ProfilePatch (+5 more)

### Community 31 - "cv/page.tsx"
Cohesion: 0.18
Nodes (16): dynamic, parseOrphan(), POST(), runtime, CvPage(), dynamic, dynamic, Home() (+8 more)

### Community 32 - "AssistantConsole"
Cohesion: 0.15
Nodes (15): dispatch(), AssistantConsole(), appendCards(), applyContext(), buildCtx(), pipelineContext(), read(), runDispatch() (+7 more)

### Community 33 - "agent-interpret.ts"
Cohesion: 0.15
Nodes (15): dynamic, maxDuration, POST(), runtime, agentInterpretForm(), buildPrompt(), Cand, captureCandidates() (+7 more)

### Community 34 - "prefill/route.ts"
Cohesion: 0.16
Nodes (12): dynamic, maxDuration, POST(), runtime, buildAnswerPrompt(), PlannerField, PlannerRun, runPlanner() (+4 more)

### Community 35 - "default/route.ts"
Cohesion: 0.18
Nodes (16): dynamic, GET(), maxDuration, POST(), runtime, resolveCvSlugs(), resolveLatexPdfPaths(), resolveLatexSource() (+8 more)

### Community 36 - "app-shell.tsx"
Cohesion: 0.28
Nodes (15): AppShell(), CoMark(), WorkerPills(), MobileNav(), PipelineProvider(), ThemeToggle(), toggle(), DEFAULT_BUDGET (+7 more)

### Community 37 - "explore.ts"
Cohesion: 0.18
Nodes (16): FilterBuilder(), KeywordField(), Label(), RECENCY, CHIP_CAP, cleanChips(), ATS_SOURCES, clampNum() (+8 more)

### Community 38 - "research-view.tsx"
Cohesion: 0.13
Nodes (14): dynamic, ResearchPage(), CompanyGroup, DEPTH_OPTIONS, Diagnostic, groupByCompany(), HEALTH_TONE, ResearchView() (+6 more)

### Community 39 - "cn"
Cohesion: 0.22
Nodes (7): CopyableCommand(), Button(), ButtonVariants, CORNERS, CORNERS, StatCard(), cn()

### Community 40 - "kanban-board.tsx"
Cohesion: 0.23
Nodes (10): Column(), COLUMN_DROP_STATUS, KanbanBoard(), KanbanCard(), buildKanbanColumns(), columnForStatus(), KANBAN_COLUMN_LABEL, KANBAN_COLUMNS (+2 more)

### Community 41 - "launcher.tsx"
Cohesion: 0.21
Nodes (10): Home(), CARDS, Launcher(), listeners, Mode, MODES, read(), setMode() (+2 more)

### Community 42 - "drive.ts"
Cohesion: 0.22
Nodes (12): dynamic, maxDuration, POST(), runtime, classifyEmpty(), dropNewTabs(), Action, DriveResult (+4 more)

### Community 43 - "worker-card.tsx"
Cohesion: 0.26
Nodes (11): fmtElapsed(), fmtTokens(), humanizeStep(), pillTone(), STEP_LABELS, TONE, useElapsed(), WorkerCard() (+3 more)

### Community 44 - "logo/route.ts"
Cohesion: 0.24
Nodes (10): cacheDir(), companyDomains(), dynamic, fetchFavicon(), GET(), runtime, companyDomain(), COMPANY_KEY_VERSION (+2 more)

### Community 45 - "whats-new/route.ts"
Cohesion: 0.29
Nodes (10): dynamic, GET(), runtime, getNormalizeTextKey(), collectWhatsNew(), DEFAULT_OFFER_LIMIT, resolveOfferLimit(), evaluatedKeys() (+2 more)

### Community 46 - "fonts.ts"
Cohesion: 0.22
Nodes (9): metadata, RootLayout(), viewport, H(), LegalPage(), metadata, instrumentSerif, instrumentSerifItalic (+1 more)

### Community 47 - "apply-provider.tsx"
Cohesion: 0.22
Nodes (11): ApplyCtx, ApplyProvider(), cliId(), closeSession(), Ctx, FillStep, Meta, Status (+3 more)

### Community 48 - "job-card-popup.tsx"
Cohesion: 0.29
Nodes (12): AppliedActions(), EvaluateActions(), FindHiringManagerButton(), FollowUpActions(), HmCandidate, JobCardPopup(), MoveButtons(), OutcomeActions() (+4 more)

### Community 49 - "extractForm"
Cohesion: 0.21
Nodes (11): extractForm(), fieldGroup(), groupLabel(), labelFor(), fetchGreenhouseSchema(), GH_TYPE, GhField, parseGreenhouse() (+3 more)

### Community 50 - "claude-invocation.mjs"
Cohesion: 0.21
Nodes (10): ALWAYS_DENIED, claudeCliArgs(), grantsWriteCapability(), KNOWN_KINDS, PERSISTING_KINDS, scopeFrom(), TOOL_SCOPES, toolNames() (+2 more)

### Community 51 - "assistant-console.tsx"
Cohesion: 0.25
Nodes (9): ActionCtx, DoneInfo, codeRanges(), Env, inRanges(), Msg, parseEnvelopes(), Part (+1 more)

### Community 52 - "origin-guard.mjs"
Cohesion: 0.42
Nodes (9): block(), checkRequest(), isLoopbackHost(), normalizeHost(), normalizeOrigin(), parseAllowedHosts(), parseAllowedOrigins(), config (+1 more)

### Community 53 - "analytics/page.tsx"
Cohesion: 0.33
Nodes (8): Analytics(), Bar(), dynamic, Section(), STAGES, Stat(), countOf(), cumulativeTiles()

### Community 54 - "ingest/route.ts"
Cohesion: 0.31
Nodes (9): cleanupTemp(), dynamic, FILE_SRC(), ingestPrompt(), maxDuration, POST(), readCanonicalMode(), runtime (+1 more)

### Community 55 - "followups/route.ts"
Cohesion: 0.36
Nodes (8): dynamic, GET(), runtime, DUE_URGENCIES, isDue(), nextDateValue(), pickNextUpcoming(), selectDueFollowups()

### Community 56 - "usage/route.ts"
Cohesion: 0.31
Nodes (7): compute(), dynamic, GET(), projectsDir(), runtime, Usage, walkJsonl()

### Community 57 - "tracker-lock.ts"
Cohesion: 0.28
Nodes (7): AcquireFn, CoreLock, loadCoreLock(), LockDirFn, modCache, TrackerBusyError, withTrackerLock()

### Community 58 - "cadence/route.ts"
Cohesion: 0.48
Nodes (6): dynamic, GET(), isObj(), POST(), readCoreDefaults(), runtime

### Community 59 - "version/route.ts"
Cohesion: 0.43
Nodes (6): dynamic, GET(), readVersion(), runtime, shortSha(), webVersion()

### Community 60 - "tracker-table.mjs"
Cohesion: 0.48
Nodes (6): aliasCache, detectColumnMap(), loadHeaderAliases(), parseApplications(), trackerCells(), WEB_FIELD

### Community 61 - "back-to-top.tsx"
Cohesion: 0.60
Nodes (4): BackToTop(), BACK_TO_TOP_THRESHOLD, scrollBehaviorFor(), shouldShowBackToTop()

### Community 62 - "pipeline-provider.tsx"
Cohesion: 0.33
Nodes (5): PipelineContext, Snapshot, usePipeline(), Application, InboxJob

### Community 63 - "Bug-report body format — v1"
Cohesion: 0.33
Nodes (5): Body sections (stable order), Bug-report body format — v1, Identification, Privacy floor (invariant across versions), The fingerprint

### Community 64 - "onboarding-banner.tsx"
Cohesion: 0.50
Nodes (4): Doctor, hasCli(), LABELS, OnboardingBanner()

## Knowledge Gaps
- **354 isolated node(s):** `AUTO_FIRE_MAX`, `BATCH_CAP`, `CANON_STATUS`, `TAB_VALUES`, `SORT_VALUES` (+349 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 407 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `careerOpsRoot()` connect `careerOpsRoot` to `hiring-radar.ts`, `followups-view.tsx`, `providers.ts`, `job-registry.ts`, `profile/route.ts`, `api/run/route.ts`, `rootScript`, `cv-pdf/route.ts`, `pipeline.ts`, `ai/route.ts`, `ref_node_fs`, `career-ops.ts`, `api/status/route.ts`, `cv/page.tsx`, `agent-interpret.ts`, `prefill/route.ts`, `default/route.ts`, `drive.ts`, `logo/route.ts`, `whats-new/route.ts`, `ingest/route.ts`, `followups/route.ts`, `tracker-lock.ts`, `cadence/route.ts`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **What connects `AUTO_FIRE_MAX`, `BATCH_CAP`, `CANON_STATUS` to the rest of the system?**
  _354 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hiring-radar.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0675990675990676 - nodes in this community are weakly interconnected._
- **Why does `cn()` connect `cn` to `followups-view.tsx`, `hiring-radar-view.tsx`, `job-store.tsx`, `ref_lucide_react`, `CompanyLogo`, `report-view.tsx`, `inbox-triage.tsx`, `apply-view.tsx`, `cv-ingest.tsx`, `pipeline-view.tsx`, `discovering-state.tsx`, `explorer-view.tsx`, `AssistantConsole`, `app-shell.tsx`, `explore.ts`, `research-view.tsx`, `kanban-board.tsx`, `worker-card.tsx`, `assistant-console.tsx`, `back-to-top.tsx`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Should `followups-view.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07740112994350283 - nodes in this community are weakly interconnected._
- **Why does `extractForm()` connect `extractForm` to `agent-interpret.ts`, `session.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `providers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07792207792207792 - nodes in this community are weakly interconnected._