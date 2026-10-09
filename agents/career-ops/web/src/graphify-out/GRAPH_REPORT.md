# Graph Report - src  (2026-10-09)

## Corpus Check
- 230 files · ~153,242 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .woff2 2, .css 1)

## Summary
- 1390 nodes · 3720 edges · 70 communities (69 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `40cafd9b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- hiring-radar.ts
- followups-view.tsx
- providers.ts
- session.ts
- hiring-radar-view.tsx
- job-store.tsx
- explore/route.ts
- explore-provider.tsx
- settings.ts
- api/run/route.ts
- portals.ts
- ref_lucide_react
- ref_node_path
- followups.ts
- careerOpsRoot
- ref_node_fs
- report-view.tsx
- cv-envelope.mjs
- inbox-triage.tsx
- ai/route.ts
- apply-view.tsx
- cv-ingest.tsx
- ref_next
- clis.ts
- save/route.ts
- beta-banner.tsx
- followups-server.ts
- api/status/route.ts
- discovering-state.tsx
- explorer-view.tsx
- registry.ts
- career-ops.ts
- AssistantConsole
- drive/route.ts
- prefill/route.ts
- default/route.ts
- app-shell.tsx
- explore.ts
- cn.ts
- cn
- kanban-board.tsx
- ref_react
- drive.ts
- worker-card.tsx
- logo/route.ts
- whats-new/route.ts
- fonts.ts
- log/route.ts
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
- normalizeTextKey
- tracker-table.mjs
- back-to-top.tsx
- pipeline-provider.tsx
- Bug-report body format — v1
- dashboard/page.tsx
- README.md
- readMemory
- pdf-render.mjs
- session/route.ts
- url-key.mjs

## God Nodes (most connected - your core abstractions)
1. `careerOpsRoot()` - 114 edges
2. `cn()` - 96 edges
3. `POST()` - 35 edges
4. `rootScript()` - 33 edges
5. `AssistantConsole()` - 26 edges
6. `useJobs()` - 25 edges
7. `readApplications()` - 22 edges
8. `Button()` - 21 edges
9. `AppShell()` - 20 edges
10. `ExplorerView()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `openSession()`  [EXTRACTED]
  agents/career-ops/web/src/app/api/apply/session/route.ts → agents/career-ops/web/src/lib/apply/session.ts
- `GET()` --calls--> `resolveDefaultCv()`  [EXTRACTED]
  agents/career-ops/web/src/app/api/cv/default/route.ts → agents/career-ops/web/src/lib/apply/cv.ts
- `POST()` --calls--> `addOffersToPipeline()`  [EXTRACTED]
  agents/career-ops/web/src/app/api/explore/add/route.ts → agents/career-ops/web/src/lib/core/pipeline.ts
- `POST()` --indirect_call--> `findReportFile()`  [INFERRED]
  agents/career-ops/web/src/app/api/run/route.ts → agents/career-ops/web/src/lib/career-ops.ts
- `POST()` --calls--> `careerOpsRoot()`  [EXTRACTED]
  agents/career-ops/web/src/app/api/runs/save/route.ts → agents/career-ops/web/src/lib/career-ops.ts

## Import Cycles
- None detected.

## Communities (70 total, 1 thin omitted)

### Community 0 - "hiring-radar.ts"
Cohesion: 0.07
Nodes (58): dynamic, POST(), runtime, dynamic, POST(), runtime, dynamic, GET() (+50 more)

### Community 1 - "followups-view.tsx"
Cohesion: 0.14
Nodes (22): dynamic, FollowupsPage(), CadenceResponse, COLUMNS, EmptyPanel(), FollowupRow(), FollowupsView(), HistoryPanel() (+14 more)

### Community 2 - "providers.ts"
Cohesion: 0.08
Nodes (49): DELETE(), dynamic, errorStatus(), file(), GET(), PATCH(), POST(), runtime (+41 more)

### Community 3 - "session.ts"
Cohesion: 0.13
Nodes (27): dynamic, POST(), runtime, captchaWarning(), dismissConsent(), multiStepInfo(), statusBlock(), tryApplyTrigger() (+19 more)

### Community 4 - "hiring-radar-view.tsx"
Cohesion: 0.10
Nodes (32): dynamic, HiringRadarPage(), AGES, ageText(), api(), applyFilters(), Checklist(), Config() (+24 more)

### Community 5 - "job-store.tsx"
Cohesion: 0.06
Nodes (45): ConfigPage(), dynamic, PortalsPage(), CompanyLogo(), Cli, ConfigForm(), selectCli(), Mode (+37 more)

### Community 6 - "explore/route.ts"
Cohesion: 0.06
Nodes (44): dynamic, maxDuration, POST(), runtime, dynamic, GET(), maxDuration, runtime (+36 more)

### Community 7 - "explore-provider.tsx"
Cohesion: 0.11
Nodes (21): dynamic, POST(), runtime, AiCost, clearRunningScan(), Ctx, ExploreCtx, ExploreProvider() (+13 more)

### Community 8 - "settings.ts"
Cohesion: 0.07
Nodes (44): dynamic, GET(), latexSourcePath(), POST(), runtime, cvPath(), GET(), POST() (+36 more)

### Community 9 - "api/run/route.ts"
Cohesion: 0.15
Nodes (20): dynamic, maxDuration, POST(), runJob(), runtime, readScanDates(), attachKill(), acquireTrackerWrite() (+12 more)

### Community 10 - "portals.ts"
Cohesion: 0.16
Nodes (17): cleanupTempPortals(), FilterLists, listFrom(), loadYaml(), seedExploreFilters(), block(), serializePortals(), writeTempPortals() (+9 more)

### Community 11 - "ref_lucide_react"
Cohesion: 0.23
Nodes (10): useApply(), ApplyButton(), ApplyWithDefaultButton(), CvEditor(), outlineFromMarkdown(), LatexEditor(), ReadyToApplyRow, ReadyToApplyWorkspace() (+2 more)

### Community 12 - "ref_node_path"
Cohesion: 0.18
Nodes (19): dynamic, GET(), runtime, servePdf(), dynamic, POST(), run, runtime (+11 more)

### Community 13 - "followups.ts"
Cohesion: 0.18
Nodes (14): FIELDS, NextDateDialog(), plusDays(), CadenceEntry, CadenceMetadata, Channel, CHANNELS, FollowupLogEntry (+6 more)

### Community 14 - "careerOpsRoot"
Cohesion: 0.16
Nodes (22): POST(), dynamic, GET(), runtime, dynamic, GET(), runtime, dirCount() (+14 more)

### Community 15 - "ref_node_fs"
Cohesion: 0.08
Nodes (30): dynamic, GET(), runtime, dynamic, HmResult, POST(), run, runtime (+22 more)

### Community 16 - "report-view.tsx"
Cohesion: 0.14
Nodes (20): DeleteFromTracker(), extractWhy(), FirstScoreView(), isMachine(), preview(), ReportView(), BLOCKS, DIMENSIONS (+12 more)

### Community 17 - "cv-envelope.mjs"
Cohesion: 0.09
Nodes (20): CLOSE_MARK, CLOSE_MARK_TEX, CLOSER, CLOSER_ALL, CLOSER_SRC, CLOSER_TEX, CLOSER_TEX_ALL, CLOSER_TEX_SRC (+12 more)

### Community 18 - "inbox-triage.tsx"
Cohesion: 0.18
Nodes (19): FacetChips(), Pill(), InboxTriage(), ConfirmScore(), fmtTokens(), ShortItem, ShortlistTray(), agoLabel() (+11 more)

### Community 19 - "ai/route.ts"
Cohesion: 0.12
Nodes (21): dynamic, maxDuration, Msg, runtime, codexCapabilityCache, CodexCapabilityCacheEntry, dynamic, maxDuration (+13 more)

### Community 20 - "apply-view.tsx"
Cohesion: 0.10
Nodes (29): ApplyPage(), dynamic, ApplyBackdropMount(), ApplyCtx, ApplyProvider(), cliId(), closeSession(), Ctx (+21 more)

### Community 21 - "cv-ingest.tsx"
Cohesion: 0.17
Nodes (12): JobPage(), cliId(), CvIngest(), Phase, GrainGradient, HeroGlow(), FirstRunHome(), CvIngestResult (+4 more)

### Community 22 - "ref_next"
Cohesion: 0.15
Nodes (15): dynamic, PipelinePage(), ClearPipeline(), InboxEmpty(), PipelineView(), SORT_KEYS, SortKey, Tab (+7 more)

### Community 23 - "clis.ts"
Cohesion: 0.18
Nodes (18): dynamic, GET(), binCandidates(), detectClis(), findBin(), KNOWN, searchDirs(), codexStreamArgs() (+10 more)

### Community 24 - "save/route.ts"
Cohesion: 0.40
Nodes (4): Body, dynamic, POST(), runtime

### Community 25 - "beta-banner.tsx"
Cohesion: 0.18
Nodes (16): BetaBanner(), findSimilar(), SimilarIssue, searchCache, searchIssues(), BUF, recentLogs(), Window (+8 more)

### Community 26 - "followups-server.ts"
Cohesion: 0.29
Nodes (7): CoreWithFollowupsLock, FollowupsBusyError, loadCoreLock(), modCache, withFollowupsLock(), queue, withLogLock()

### Community 27 - "api/status/route.ts"
Cohesion: 0.17
Nodes (17): boundedLockWait(), CLIENT_ERROR_CODES, CliResult, EXIT_TO_HTTP, POST(), runSetStatus(), runtime, canonicalizeStatus() (+9 more)

### Community 28 - "discovering-state.tsx"
Cohesion: 0.24
Nodes (14): ApplyBackdrop(), AiHuntTrace(), renderInline(), AiHuntView(), DiscoveringState(), SourceChip(), useCountUp(), DiscoveryCard() (+6 more)

### Community 29 - "explorer-view.tsx"
Cohesion: 0.19
Nodes (15): CostBadge(), AiSearchBox(), EXAMPLES, ExploreModeToggle(), BlockedCard(), CappedBanner(), CLI_NAMES, DegradedCard() (+7 more)

### Community 30 - "registry.ts"
Cohesion: 0.12
Nodes (10): ActionDef, ACTIONS, AUTO_FIRE_MAX, BATCH_CAP, CANON_STATUS, DispatchResult, ProfilePatch, SORT_VALUES (+2 more)

### Community 31 - "career-ops.ts"
Cohesion: 0.12
Nodes (24): dynamic, parseOrphan(), POST(), runtime, CvPage(), dynamic, dynamic, ReportPage() (+16 more)

### Community 32 - "AssistantConsole"
Cohesion: 0.18
Nodes (13): dispatch(), AssistantConsole(), appendCards(), applyContext(), buildCtx(), pipelineContext(), read(), runDispatch() (+5 more)

### Community 33 - "drive/route.ts"
Cohesion: 0.15
Nodes (18): dynamic, maxDuration, POST(), runtime, dynamic, maxDuration, POST(), runtime (+10 more)

### Community 34 - "prefill/route.ts"
Cohesion: 0.21
Nodes (10): dynamic, maxDuration, POST(), runtime, buildAnswerPrompt(), PlannerField, PlannerRun, runPlanner() (+2 more)

### Community 35 - "default/route.ts"
Cohesion: 0.24
Nodes (10): dynamic, GET(), maxDuration, POST(), runtime, resolveCvSlugs(), resolveLatexPdfPaths(), resolveLatexSource() (+2 more)

### Community 36 - "app-shell.tsx"
Cohesion: 0.27
Nodes (16): AppShell(), CoMark(), WorkerPills(), MobileNav(), PipelineProvider(), SettingsButton(), ThemeToggle(), toggle() (+8 more)

### Community 37 - "explore.ts"
Cohesion: 0.18
Nodes (15): FilterBuilder(), KeywordField(), Label(), RECENCY, CHIP_CAP, cleanChips(), ATS_SOURCES, clampNum() (+7 more)

### Community 38 - "cn.ts"
Cohesion: 0.11
Nodes (14): dynamic, ResearchPage(), CompanyGroup, DEPTH_OPTIONS, Diagnostic, groupByCompany(), HEALTH_TONE, ResearchView() (+6 more)

### Community 39 - "cn"
Cohesion: 0.29
Nodes (10): CopyableCommand(), AppearancePanel(), call(), DocPanel(), Msg, SettingsPanel(), Button(), ButtonVariants (+2 more)

### Community 40 - "kanban-board.tsx"
Cohesion: 0.23
Nodes (11): COLUMN_DROP_STATUS, KanbanCard(), Application, InboxJob, findEvaluatedApplication(), buildKanbanColumns(), columnForStatus(), KANBAN_COLUMN_LABEL (+3 more)

### Community 41 - "ref_react"
Cohesion: 0.17
Nodes (11): Home(), CARDS, EASE, Launcher(), listeners, Mode, MODES, read() (+3 more)

### Community 42 - "drive.ts"
Cohesion: 0.20
Nodes (12): CONSENT_BUTTONS, dropNewTabs(), Action, DriveResult, driveSession(), parseAction(), plannerTurn(), snapshot() (+4 more)

### Community 43 - "worker-card.tsx"
Cohesion: 0.20
Nodes (13): JobsHistory(), TONE_CHIP, fmtElapsed(), fmtTokens(), humanizeStep(), pillTone(), STEP_LABELS, TONE (+5 more)

### Community 44 - "logo/route.ts"
Cohesion: 0.39
Nodes (7): cacheDir(), companyDomains(), dynamic, fetchFavicon(), GET(), runtime, companyDomain()

### Community 45 - "whats-new/route.ts"
Cohesion: 0.24
Nodes (12): dynamic, GET(), runtime, getNormalizeTextKey(), MAX_SINCE_DAYS, collectWhatsNew(), DEFAULT_OFFER_LIMIT, MAX_OFFER_LIMIT (+4 more)

### Community 46 - "fonts.ts"
Cohesion: 0.13
Nodes (17): metadata, RootLayout(), viewport, H(), LegalPage(), metadata, BackgroundVideo(), CORNERS (+9 more)

### Community 47 - "log/route.ts"
Cohesion: 0.30
Nodes (15): cell(), DELETE(), dynamic, POST(), runtime, DELETE(), dynamic, pinRe() (+7 more)

### Community 48 - "job-card-popup.tsx"
Cohesion: 0.29
Nodes (12): AppliedActions(), EvaluateActions(), FindHiringManagerButton(), FollowUpActions(), HmCandidate, JobCardPopup(), MoveButtons(), OutcomeActions() (+4 more)

### Community 49 - "extractForm"
Cohesion: 0.83
Nodes (4): extractForm(), fieldGroup(), groupLabel(), labelFor()

### Community 50 - "claude-invocation.mjs"
Cohesion: 0.21
Nodes (10): ALWAYS_DENIED, claudeCliArgs(), grantsWriteCapability(), KNOWN_KINDS, PERSISTING_KINDS, scopeFrom(), TOOL_SCOPES, toolNames() (+2 more)

### Community 51 - "assistant-console.tsx"
Cohesion: 0.21
Nodes (11): ActionCtx, DoneInfo, codeRanges(), Env, inRanges(), migrate(), Msg, parseEnvelopes() (+3 more)

### Community 52 - "origin-guard.mjs"
Cohesion: 0.42
Nodes (9): block(), checkRequest(), isLoopbackHost(), normalizeHost(), normalizeOrigin(), parseAllowedHosts(), parseAllowedOrigins(), config (+1 more)

### Community 53 - "analytics/page.tsx"
Cohesion: 0.31
Nodes (9): Analytics(), Bar(), dynamic, Section(), STAGES, Stat(), scoreNum(), countOf() (+1 more)

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
Cohesion: 0.13
Nodes (12): modCache, resolvePdfIndexPath(), TrackerUtils, modCache, NormalizeTextKey, AcquireFn, CoreLock, loadCoreLock() (+4 more)

### Community 58 - "cadence/route.ts"
Cohesion: 0.48
Nodes (6): dynamic, GET(), isObj(), POST(), readCoreDefaults(), runtime

### Community 59 - "normalizeTextKey"
Cohesion: 0.36
Nodes (6): normCompany(), COMPANY_KEY_VERSION, companyCacheKey(), truncateCodePoints(), normalizeTextKey(), norm()

### Community 60 - "tracker-table.mjs"
Cohesion: 0.48
Nodes (6): aliasCache, detectColumnMap(), loadHeaderAliases(), parseApplications(), trackerCells(), WEB_FIELD

### Community 61 - "back-to-top.tsx"
Cohesion: 0.60
Nodes (4): BackToTop(), BACK_TO_TOP_THRESHOLD, scrollBehaviorFor(), shouldShowBackToTop()

### Community 62 - "pipeline-provider.tsx"
Cohesion: 0.50
Nodes (3): PipelineContext, Snapshot, usePipeline()

### Community 63 - "Bug-report body format — v1"
Cohesion: 0.33
Nodes (5): Body sections (stable order), Bug-report body format — v1, Identification, Privacy floor (invariant across versions), The fingerprint

### Community 64 - "dashboard/page.tsx"
Cohesion: 0.27
Nodes (9): dynamic, Home(), Column(), KanbanBoard(), Doctor, hasCli(), LABELS, OnboardingBanner() (+1 more)

### Community 66 - "readMemory"
Cohesion: 0.36
Nodes (7): dynamic, GET(), POST(), runtime, profilePath(), readMemory(), rememberFact()

### Community 67 - "pdf-render.mjs"
Cohesion: 0.57
Nodes (6): cleanupPdfScratch(), markTrackerReady(), renderAndMarkLatexPdf(), renderAndMarkPdf(), spawnGenerateLatex(), spawnGeneratePdf()

### Community 68 - "session/route.ts"
Cohesion: 0.40
Nodes (4): dynamic, maxDuration, POST(), runtime

### Community 69 - "url-key.mjs"
Cohesion: 0.50
Nodes (4): RFC-3986, normalizeUrl(), promoteKnownFragmentIdentity(), TRACKING_PARAMS

## Knowledge Gaps
- **364 isolated node(s):** `AUTO_FIRE_MAX`, `BATCH_CAP`, `CANON_STATUS`, `TAB_VALUES`, `SORT_VALUES` (+359 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 418 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `followups-view.tsx`, `hiring-radar-view.tsx`, `job-store.tsx`, `ref_lucide_react`, `followups.ts`, `report-view.tsx`, `inbox-triage.tsx`, `apply-view.tsx`, `cv-ingest.tsx`, `ref_next`, `discovering-state.tsx`, `explorer-view.tsx`, `AssistantConsole`, `app-shell.tsx`, `explore.ts`, `cn.ts`, `kanban-board.tsx`, `worker-card.tsx`, `fonts.ts`, `assistant-console.tsx`, `back-to-top.tsx`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **What connects `AUTO_FIRE_MAX`, `BATCH_CAP`, `CANON_STATUS` to the rest of the system?**
  _364 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hiring-radar.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0675990675990676 - nodes in this community are weakly interconnected._
- **Why does `careerOpsRoot()` connect `careerOpsRoot` to `hiring-radar.ts`, `providers.ts`, `explore/route.ts`, `settings.ts`, `api/run/route.ts`, `portals.ts`, `ref_node_path`, `ref_node_fs`, `ai/route.ts`, `save/route.ts`, `followups-server.ts`, `api/status/route.ts`, `career-ops.ts`, `prefill/route.ts`, `default/route.ts`, `drive.ts`, `logo/route.ts`, `whats-new/route.ts`, `log/route.ts`, `ingest/route.ts`, `followups/route.ts`, `tracker-lock.ts`, `cadence/route.ts`, `readMemory`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Should `followups-view.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14492753623188406 - nodes in this community are weakly interconnected._
- **Why does `AssistantConsole()` connect `AssistantConsole` to `app-shell.tsx`, `cn`, `ref_lucide_react`, `assistant-console.tsx`, `analytics/page.tsx`, `discovering-state.tsx`, `pipeline-provider.tsx`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `providers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07792207792207792 - nodes in this community are weakly interconnected._