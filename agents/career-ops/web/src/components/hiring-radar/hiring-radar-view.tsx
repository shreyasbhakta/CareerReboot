"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as yaml from "js-yaml";
import { CheckCircle2, Circle, Loader2, Play, ExternalLink, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/* eslint-disable @typescript-eslint/no-explicit-any */
type State = any;
type Tab = "results" | "run" | "settings" | "schedule" | "config";

const STATUSES = ["NEW", "SEEN", "REVIEWED", "CONTACTED", "DISMISSED", "CONVERTED"];
const SOURCES = [
  ["all", "All sources"],
  ["jobs", "Job boards only"],
  ["hiring-posts", "Hiring posts (HN + web search)"],
  ["hn", "Hacker News only"],
  ["web-search", "Web search only"],
];
const WEEKDAYS = [["*", "Every day"], ["1-5", "Weekdays"], ["1", "Mondays"], ["0,6", "Weekends"]];

async function api(path: string, body?: unknown) {
  const res = await fetch(`/api/hiring-radar/${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const inputCls = "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand/50";
const labelCls = "block text-xs font-medium text-muted mb-1";

export function HiringRadarView() {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>("results");
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setState(await api("state")); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : "failed to load"); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Poll while a scan is running.
  const running = state?.run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [running, refresh]);

  if (err && !state) return <p className="text-sm text-red-600">{err}</p>;
  if (!state) return <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Loading…</p>;

  const tabs: [Tab, string][] = [["results", "Results"], ["run", "Run"], ["settings", "Keys & data"], ["schedule", "Schedule"], ["config", "Scoring & config"]];
  return (
    <div className="space-y-5">
      <Checklist state={state} goto={setTab} />
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === id ? "border-brand text-foreground" : "border-transparent text-muted hover:text-foreground")}>
            {label}{id === "run" && running ? " ●" : ""}
          </button>
        ))}
      </div>
      {tab === "results" && <Results state={state} refresh={refresh} goto={setTab} />}
      {tab === "run" && <Run state={state} refresh={refresh} />}
      {tab === "settings" && <Settings state={state} refresh={refresh} />}
      {tab === "schedule" && <Schedule state={state} refresh={refresh} />}
      {tab === "config" && <Config state={state} refresh={refresh} />}
    </div>
  );
}

/* ---------- setup checklist ---------- */
function Checklist({ state, goto }: { state: State; goto: (t: Tab) => void }) {
  const e = state.env;
  const items: { ok: boolean; label: string; hint: string; tab?: Tab; required?: boolean }[] = [
    { ok: state.installed, required: true, label: "Installed", hint: "Run `npm run setup` once from the repo root, then reload." },
    { ok: true, required: true, label: "Free sources ready", hint: "Hacker News “Who is hiring?” and public job boards work with no keys." },
    { ok: e.SEARXNG_URL.set || e.BRAVE_SEARCH_API_KEY.set, label: "Search backend (for LinkedIn/X hiring posts)", hint: "Add a SearXNG URL or Brave Search API key. Without it you only get HN + job boards.", tab: "settings" },
    { ok: state.connections.present, label: "LinkedIn connections (warm intros)", hint: "Upload your Connections.csv export.", tab: "settings" },
    { ok: !!e.MODEL_PROVIDER.set, label: "Model provider (optional)", hint: "Only used for ambiguous posts and short explanations.", tab: "settings" },
    { ok: state.schedule.installed, label: "Daily schedule (optional)", hint: "Install a cron job so it runs without you.", tab: "schedule" },
  ];
  return (
    <Card className="p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Setup</p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.label} className="flex items-start gap-2 text-sm">
            {i.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 size-4 shrink-0 text-faint" />}
            <span>
              <span className={i.ok ? "text-foreground" : "text-foreground"}>{i.label}</span>
              {!i.ok && <span className="block text-xs text-muted">{i.hint}{i.tab && <> <button className="text-brand underline" onClick={() => goto(i.tab!)}>Open</button></>}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- results ---------- */
// Sorting. Unknown dates always sort last for the date-based orders, and ties fall back to score.
const t = (v: string | null | undefined) => { const n = v ? Date.parse(v) : NaN; return Number.isNaN(n) ? -Infinity : n; };
const byScore = (a: any, b: any) => b.scores.overall - a.scores.overall;
type SortKey = "score" | "recent" | "found" | "age";
const SORTS: Record<SortKey, { label: string; cmp: (a: any, b: any) => number }> = {
  score: { label: "Best score first", cmp: (a, b) => byScore(a, b) || t(b.publishedAt) - t(a.publishedAt) },
  recent: { label: "Most recent signal first", cmp: (a, b) => (t(b.publishedAt) === t(a.publishedAt) ? byScore(a, b) : t(b.publishedAt) - t(a.publishedAt)) },
  found: { label: "Newest found first", cmp: (a, b) => (t(b.discoveredAt) === t(a.discoveredAt) ? byScore(a, b) : t(b.discoveredAt) - t(a.discoveredAt)) },
  age: { label: "Oldest signal first", cmp: (a, b) => { const x = t(a.publishedAt), y = t(b.publishedAt); if (x === y) return byScore(a, b); if (x === -Infinity) return 1; if (y === -Infinity) return -1; return x - y; } },
};

function scoreTone(n: number): "good" | "warn" | "muted" { return n >= 80 ? "good" : n >= 65 ? "warn" : "muted"; }

type Filters = { statuses: string[]; type: string; source: string; warm: string; person: string; loc: string; role: string; minScore: number; age: string; q: string };
const DEFAULT_FILTERS: Filters = { statuses: ["NEW", "SEEN", "REVIEWED", "CONTACTED"], type: "", source: "", warm: "", person: "", loc: "", role: "", minScore: 0, age: "", q: "" };
const AGES: [string, string, number][] = [["", "Any age", Infinity], ["24", "Last 24 hours", 24], ["72", "Last 3 days", 72], ["168", "Last 7 days", 168]];
const WARM_LABEL: Record<string, string> = { WARM_INTRO_AVAILABLE: "🔥 Warm intro", COMPANY_CONNECTION: "Knows someone there", NO_CONNECTION: "No connection" };
const LOC_LABEL: Record<string, string> = { home: "NYC / NJ", remote_us: "Remote (US)", us_other: "Other US", unknown: "Not stated", non_us: "Outside US" };

function applyFilters(list: any[], f: Filters) {
  const q = f.q.trim().toLowerCase();
  const maxAge = AGES.find((a) => a[0] === f.age)?.[2] ?? Infinity;
  return list.filter((s) =>
    f.statuses.includes(s.status)
    && (!f.type || s.signalType === f.type)
    && (!f.source || String(s.source).split(":")[0] === f.source)
    && (!f.warm || s.metadata.warm?.status === f.warm)
    && (!f.person || (f.person === "known" ? !!s.person : !s.person))
    && (!f.loc || s.metadata.locationKind === f.loc)
    && (!f.role || s.role.canonical === f.role)
    && s.scores.overall >= f.minScore
    && (maxAge === Infinity || (s.metadata.ageHours != null && s.metadata.ageHours <= maxAge))
    && (!q || `${s.company.name} ${s.role.canonical} ${s.title ?? ""} ${s.text} ${s.person?.name ?? ""}`.toLowerCase().includes(q)));
}

function Results({ state, refresh, goto }: { state: State; refresh: () => void; goto: (t: Tab) => void }) {
  const data = state.results;
  const [sort, setSort] = useState<SortKey>("score");
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  // Remember sort + filters across reloads (best-effort; storage may be unavailable).
  useEffect(() => {
    try {
      const v = localStorage.getItem("hiring-radar:sort"); if (v && v in SORTS) setSort(v as SortKey);
      const raw = localStorage.getItem("hiring-radar:filters"); if (raw) setF({ ...DEFAULT_FILTERS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  const update = (patch: Partial<Filters>) => { const n = { ...f, ...patch }; setF(n); try { localStorage.setItem("hiring-radar:filters", JSON.stringify(n)); } catch { /* ignore */ } };
  const changeSort = (v: SortKey) => { setSort(v); try { localStorage.setItem("hiring-radar:sort", v); } catch { /* ignore */ } };

  const [picked, setPicked] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const all: any[] = data?.signals ?? [];
  const opts = useMemo(() => {
    const uniq = (fn: (s: any) => string | null | undefined) => [...new Set(all.map(fn).filter(Boolean) as string[])].sort();
    return { types: uniq((s) => s.signalType), sources: uniq((s) => String(s.source).split(":")[0]), roles: uniq((s) => s.role.canonical), locs: uniq((s) => s.metadata.locationKind), warms: uniq((s) => s.metadata.warm?.status) };
  }, [all]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((x) => [x, all.filter((s) => s.status === x).length])), [all]);
  const signals = useMemo(() => applyFilters(all, f).sort(SORTS[sort].cmp), [all, f, sort]);

  const shownIds = signals.map((s) => s.id);
  const pickedShown = picked.filter((id) => shownIds.includes(id));
  const allShownPicked = shownIds.length > 0 && pickedShown.length === shownIds.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const bulk = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBulkBusy(true);
    try { await api("status", { ids: pickedShown, ...body }); setPicked([]); await refresh(); } catch (e) { window.alert(e instanceof Error ? e.message : "failed"); } finally { setBulkBusy(false); }
  };

  if (!data) {
    return (
      <Card className="p-6 text-sm text-muted">
        No results yet. <button className="text-brand underline" onClick={() => goto("run")}>Run a scan</button> — a first dry run takes about a minute.
      </Card>
    );
  }
  const d = data.digest;
  const sel = "rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-foreground";
  const isDefault = JSON.stringify(f) === JSON.stringify(DEFAULT_FILTERS);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span>Updated {new Date(data.generatedAt).toLocaleString()}</span>
        <span>{d.newDirectHiringSignals} new direct hiring</span>
        <span>{d.newRelevantJobs} new jobs</span>
        <span>{d.warmOpportunities} warm intros</span>
      </div>
      <ScanSummary scan={data.scan} signals={data.signals} />

      <Card className="space-y-3 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-muted">Status</span>
          {STATUSES.map((x) => {
            const on = f.statuses.includes(x);
            return (
              <button key={x} onClick={() => update({ statuses: on ? f.statuses.filter((y) => y !== x) : [...f.statuses, x] })}
                className={cn("rounded-full border px-2.5 py-1", on ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted hover:text-foreground")}>
                {x.toLowerCase()} <span className="text-faint">{counts[x] ?? 0}</span>
              </button>
            );
          })}
          <button className="ml-1 text-brand underline" onClick={() => update({ statuses: [...STATUSES] })}>all</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <label className="flex flex-col gap-1">Search<input className={sel} placeholder="company, role, person, text" value={f.q} onChange={(e) => update({ q: e.target.value })} /></label>
          <label className="flex flex-col gap-1">Sort
            <select className={sel} value={sort} onChange={(e) => changeSort(e.target.value as SortKey)}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label className="flex flex-col gap-1">Signal type
            <select className={sel} value={f.type} onChange={(e) => update({ type: e.target.value })}><option value="">All types</option>{opts.types.map((x) => <option key={x} value={x}>{labelType(x)}</option>)}</select></label>
          <label className="flex flex-col gap-1">Source
            <select className={sel} value={f.source} onChange={(e) => update({ source: e.target.value })}><option value="">All sources</option>{opts.sources.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="flex flex-col gap-1">Connection
            <select className={sel} value={f.warm} onChange={(e) => update({ warm: e.target.value })}><option value="">Any</option>{opts.warms.map((x) => <option key={x} value={x}>{WARM_LABEL[x] ?? x}</option>)}</select></label>
          <label className="flex flex-col gap-1">Hiring person
            <select className={sel} value={f.person} onChange={(e) => update({ person: e.target.value })}><option value="">Any</option><option value="known">Identified</option><option value="none">Not identified</option></select></label>
          <label className="flex flex-col gap-1">Location
            <select className={sel} value={f.loc} onChange={(e) => update({ loc: e.target.value })}><option value="">Anywhere</option>{opts.locs.map((x) => <option key={x} value={x}>{LOC_LABEL[x] ?? x}</option>)}</select></label>
          <label className="flex flex-col gap-1">Role
            <select className={sel} value={f.role} onChange={(e) => update({ role: e.target.value })}><option value="">All roles</option>{opts.roles.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="flex flex-col gap-1">Signal age
            <select className={sel} value={f.age} onChange={(e) => update({ age: e.target.value })}>{AGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="flex flex-col gap-1">Min score: {f.minScore}
            <input type="range" min={0} max={100} step={5} value={f.minScore} onChange={(e) => update({ minScore: Number(e.target.value) })} /></label>
        </div>
        <div className="flex items-center gap-3 text-muted">
          <span>Showing <span className="font-medium text-foreground">{signals.length}</span> of {all.length}</span>
          {!isDefault && <button className="text-brand underline" onClick={() => update({ ...DEFAULT_FILTERS })}>Reset filters</button>}
          {signals.some((x) => x.status === "NEW") && (
            <button disabled={bulkBusy} className="text-brand underline" onClick={async () => { setBulkBusy(true); try { await api("status", { ids: signals.filter((x) => x.status === "NEW").map((x) => x.id), status: "SEEN" }); await refresh(); } finally { setBulkBusy(false); } }}>
              mark all shown as seen
            </button>
          )}
          <label className="ml-auto flex items-center gap-1.5"><input type="checkbox" checked={allShownPicked} onChange={(e) => setPicked(e.target.checked ? shownIds : picked.filter((id) => !shownIds.includes(id)))} /> select all shown</label>
        </div>
        {pickedShown.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-brand/10 px-3 py-2">
            <span className="font-medium text-foreground">{pickedShown.length} selected</span>
            <select disabled={bulkBusy} className={sel} value="" onChange={(e) => e.target.value && bulk({ status: e.target.value })}>
              <option value="">Mark as…</option>{STATUSES.map((x) => <option key={x} value={x}>{x.toLowerCase()}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulk({ status: "DISMISSED" })}>Dismiss</Button>
            <Button size="sm" variant="outline" disabled={bulkBusy} className="text-red-600" onClick={() => bulk({ delete: true }, `Permanently delete ${pickedShown.length} result${pickedShown.length === 1 ? "" : "s"}? They will not come back on later scans.`)}>Delete</Button>
            <button className="ml-auto text-muted underline" onClick={() => setPicked([])}>clear selection</button>
          </div>
        )}
      </Card>

      {data.dryRun && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">These results are from a dry run — nothing was saved to history.</p>}
      {signals.length === 0 && <Card className="p-6 text-sm text-muted">Nothing matches these filters. {!isDefault && <button className="text-brand underline" onClick={() => update({ ...DEFAULT_FILTERS })}>Reset filters</button>}</Card>}
      {signals.map((s) => <SignalCard key={s.id} s={s} refresh={refresh} selected={picked.includes(s.id)} onToggle={() => toggle(s.id)} />)}
    </div>
  );
}

function ScanSummary({ scan, signals }: { scan: any; signals: any[] }) {
  if (!scan) return null;
  const bySource: Record<string, number> = {};
  for (const s of signals) { const k = String(s.source).split(":")[0]; bySource[k] = (bySource[k] ?? 0) + 1; }
  const filtered = Object.entries(scan.filtered ?? {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k.replace(/-/g, " ")} ${v}`).join(" · ");
  return (
    <Card className="space-y-1 p-3 text-xs text-muted">
      <p>
        <span className="font-medium text-foreground">Last scan:</span>{" "}
        {(scan.sourcesAttempted ?? []).map((s: string) => {
          const failed = (scan.sourcesFailed ?? []).some((f: any) => f.source === s);
          return <span key={s} className={failed ? "mr-2 text-red-600" : "mr-2 text-emerald-600"}>{failed ? "✗" : "✓"} {s}</span>;
        })}
        {(scan.sourcesSkipped ?? []).map((f: any) => <span key={f.source} className="mr-2 text-amber-600" title={f.reason}>– {f.source} skipped</span>)}
      </p>
      <p>{scan.discovered?.toLocaleString?.() ?? scan.discovered} checked · {scan.deduplicated} already seen · <span className="text-foreground">{scan.retained} new kept</span>{filtered && <> · dropped: {filtered}</>}</p>
      <p>Showing now: {Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(" · ") || "nothing"} <span className="text-faint">(by source)</span></p>
      {(scan.sourcesFailed ?? []).map((f: any) => <p key={f.source} className="text-red-600">{f.source} failed: {f.error}</p>)}
    </Card>
  );
}

function SignalCard({ s, refresh, selected, onToggle }: { s: any; refresh: () => void; selected: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = s.scores.components;
  const warm = s.metadata.warm;
  // Opening a NEW result marks it SEEN (also on middle-click / open-in-new-tab).
  const markSeen = () => {
    if (s.status !== "NEW") return;
    fetch("/api/hiring-radar/status", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id, status: "SEEN" }) })
      .then(() => refresh()).catch(() => { /* best-effort; the status dropdown still works */ });
  };
  const setStatus = async (status: string) => {
    setBusy(true);
    try { await api("status", { id: s.id, status }); await refresh(); } finally { setBusy(false); }
  };
  return (
    <Card className={cn("p-4", selected && "ring-2 ring-brand/60")}>
      <div className="flex items-start gap-3">
        <input type="checkbox" aria-label="Select result" className="mt-1.5" checked={selected} onChange={onToggle} />
        <Badge tone={scoreTone(s.scores.overall)} className="mt-0.5 text-sm">{s.scores.overall}</Badge>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{s.role.canonical || s.role.raw || "Engineering role"} — {s.company.name || "Unknown company"}</h3>
            {s.status === "NEW" && <Badge tone="info">new</Badge>}
            {warm?.status === "WARM_INTRO_AVAILABLE" && <Badge tone="good"><Flame className="mr-0.5 inline size-3" />warm intro</Badge>}
            {warm?.status === "COMPANY_CONNECTION" && <Badge tone="muted">knows someone there</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {labelType(s.signalType)} · {ageText(s.metadata.ageHours, s.metadata.dateKnown)} · {s.location || "location not stated"} · via {s.source}
          </p>
          <p className="mt-1.5 text-xs">
            <span className="text-muted">Hiring person: </span>
            {s.person ? <><span className="text-foreground">{s.person.name}{s.person.title ? `, ${s.person.title}` : ""}</span> <span className="text-faint">({s.person.confidence.toLowerCase()} confidence)</span>{s.person.url && <> · <a className="text-brand underline" href={s.person.url} target="_blank" rel="noreferrer">profile</a></>}</> : <span className="text-faint">not identified (not guessed)</span>}
          </p>
          {warm?.connections?.length > 0 && <p className="mt-0.5 text-xs text-muted">Connection: {warm.connections.map((x: any) => `${x.name}${x.title ? ` — ${x.title}` : ""}`).join("; ")}</p>}
          <p className="mt-1.5 line-clamp-2 text-xs text-muted">“{s.text.replace(/\s+/g, " ").slice(0, 260)}”</p>
          <p className="mt-1.5 text-xs"><span className="text-muted">Next: </span><span className="font-medium text-foreground">{s.metadata.suggestedAction}</span></p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <a href={s.sourceUrl} target="_blank" rel="noreferrer" onClick={markSeen} onAuxClick={markSeen} className="inline-flex items-center gap-1 text-xs text-brand hover:underline">Open <ExternalLink className="size-3" /></a>
          {s.metadata.secondDegreeUrl && <a href={s.metadata.secondDegreeUrl} target="_blank" rel="noreferrer" title="Opens LinkedIn people search filtered to 2nd-degree connections who mention this company — in your own session" className="text-xs text-muted hover:text-foreground hover:underline">Friends of friends ↗</a>}
          <select disabled={busy} value={s.status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs">
            {STATUSES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
      </div>
      <button className="mt-2 text-xs text-muted underline" onClick={() => setOpen(!open)}>{open ? "Hide" : "Why this score?"}</button>
      {open && (
        <div className="mt-2 grid gap-3 border-t border-border pt-3 text-xs sm:grid-cols-2">
          <div>
            <p className="mb-1 font-medium text-foreground">Components (weight × score)</p>
            {Object.entries(c).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 py-0.5">
                <span className="w-28 text-muted">{k.replace("_", " ")}</span>
                <div className="h-1.5 flex-1 rounded bg-surface-hover"><div className="h-1.5 rounded bg-brand" style={{ width: `${v}%` }} /></div>
                <span className="w-16 text-right tabular-nums text-muted">{String(v)} × {s.scores.weights[k]}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1 font-medium text-foreground">Technical match</p>
            <p className="text-muted">{s.scores.technicalBreakdown.map((b: any) => `${b.label} ${b.points >= 0 ? "+" : ""}${b.points}`).join(" · ")}</p>
            <p className="mb-1 mt-3 font-medium text-foreground">Draft outreach angle (nothing is sent)</p>
            <p className="text-muted">{s.metadata.outreachAngle}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

const TYPE: Record<string, string> = { DIRECT_HIRING_POST: "Direct hiring post", HIRING_ANNOUNCEMENT: "Hiring announcement", JOB_POSTING: "Job posting", COMPANY_HIRING_SPIKE: "Recent hiring activity increased", NEW_ROLE_CLUSTER: "Several matching roles open", RECRUITER_ACTIVITY: "Recruiter activity", TEAM_EXPANSION: "Team expansion", HIRING_MANAGER_ASSOCIATION: "Hiring manager association" };
const labelType = (t: string) => TYPE[t] ?? t;
function ageText(h: number | null, known: boolean) {
  if (h == null || !known) return "date not published";
  return h < 1 ? "under 1h ago" : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
}

/* ---------- run ---------- */
function Run({ state, refresh }: { state: State; refresh: () => void }) {
  const [days, setDays] = useState(7);
  const [minScore, setMinScore] = useState("");
  const [source, setSource] = useState("all");
  const [dryRun, setDryRun] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = state.run;
  const running = run?.status === "running";
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [run?.log]);

  const start = async () => {
    setMsg(null);
    try { await api("run", { days, source, dryRun, minScore: minScore === "" ? undefined : Number(minScore) }); await refresh(); } catch (e) { setMsg(e instanceof Error ? e.message : "failed"); }
  };
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label className={labelCls}>Look back (days, 1–30)</label><input className={inputCls} type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} /></div>
          <div><label className={labelCls}>Minimum score (blank = default)</label><input className={inputCls} type="number" min={0} max={100} placeholder="55" value={minScore} onChange={(e) => setMinScore(e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Sources</label>
            <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Button onClick={start} disabled={running || !state.installed}>{running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} {running ? "Scanning…" : "Run now"}</Button>
          <label className="flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run (don’t save history)</label>
          <span className="text-xs text-faint">Takes 1–3 minutes. Read-only: nothing is sent or applied to.</span>
        </div>
        {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
      </Card>
      {run && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <Badge tone={run.status === "ok" ? "good" : run.status === "failed" ? "bad" : "info"}>{run.status}</Badge>
            <span className="text-muted">{run.args.source} · {run.args.days}d{run.args.dryRun ? " · dry run" : ""}</span>
            {run.status !== "running" && <button className="ml-auto text-brand underline" onClick={refresh}>Reload results</button>}
          </div>
          <pre ref={logRef} className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-surface-hover p-3 text-[11px] leading-relaxed text-muted">{run.log || "Starting…"}</pre>
        </Card>
      )}
    </div>
  );
}

/* ---------- keys & data ---------- */
function Field({ k, label, state, placeholder, secret, form, setForm, help }: any) {
  const st = state.env[k];
  return (
    <div>
      <label className={labelCls}>{label} {st.set && <span className="ml-1 text-emerald-600">● set</span>}{help && <span className="ml-1 font-normal text-faint">— {help}</span>}</label>
      <div className="flex gap-2">
        <input className={inputCls} type="text" name={`hr-${k}`} autoComplete="off" data-lpignore="true" data-1p-ignore="true" style={secret ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties) : undefined} placeholder={st.set ? (secret ? "•••••• (leave blank to keep)" : st.value) : placeholder}
          value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
        {st.set && <Button variant="outline" size="sm" type="button" onClick={() => setForm({ ...form, [k]: null })} title="Remove">Clear</Button>}
      </div>
      {form[k] === null && <p className="mt-0.5 text-xs text-amber-600">Will be removed on save.</p>}
    </div>
  );
}

function Settings({ state, refresh }: { state: State; refresh: () => void }) {
  const [form, setForm] = useState<Record<string, string | null>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const save = async () => {
    try { await api("settings", { env: form }); setForm({}); setMsg("Saved to agents/hiring-radar/.env (private, gitignored)."); await refresh(); } catch (e) { setMsg(e instanceof Error ? e.message : "failed"); }
  };
  const upload = async (file: File) => {
    try { const csv = await file.text(); const r = await api("connections", { csv }); setCsvMsg(`Loaded ~${r.rows} connections.`); await refresh(); } catch (e) { setCsvMsg(e instanceof Error ? e.message : "failed"); }
  };
  const p = { state, form, setForm };
  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Search backend <span className="font-normal text-muted">— finds LinkedIn / X hiring posts (pick one)</span></h2>
        <Field k="SEARXNG_URL" label="SearXNG URL" placeholder="http://localhost:8888" help="self-hosted; also enables hiring-person lookup" {...p} />
        <Field k="BRAVE_SEARCH_API_KEY" label="Brave Search API key" secret placeholder="BSA…" {...p} />
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Model provider <span className="font-normal text-muted">— optional; off unless a provider is chosen</span></h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Provider {state.env.MODEL_PROVIDER.set && <span className="text-emerald-600">● {state.env.MODEL_PROVIDER.value}</span>}</label>
            <select className={inputCls} value={form.MODEL_PROVIDER ?? state.env.MODEL_PROVIDER.value ?? ""} onChange={(e) => setForm({ ...form, MODEL_PROVIDER: e.target.value === "" ? null : e.target.value })}>
              <option value="">Off</option>{["openai", "anthropic", "gemini", "openrouter", "omniroute", "ollama"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <Field k="MODEL_NAME" label="Model name" placeholder="(default per provider)" {...p} />
          <Field k="MODEL_BASE_URL" label="Base URL" placeholder="OmniRoute / Ollama / proxy" {...p} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field k="OPENAI_API_KEY" label="OpenAI key" secret placeholder="sk-…" {...p} />
          <Field k="ANTHROPIC_API_KEY" label="Anthropic key" secret placeholder="sk-ant-…" {...p} />
          <Field k="GEMINI_API_KEY" label="Gemini key" secret placeholder="AIza…" {...p} />
          <Field k="OPENROUTER_API_KEY" label="OpenRouter key" secret placeholder="sk-or-…" {...p} />
          <Field k="OMNIROUTE_API_KEY" label="OmniRoute key" secret placeholder="" {...p} />
        </div>
        <p className="text-xs text-faint">OmniRoute (one local endpoint with provider fallback): run <code>docker compose -f deploy/omniroute/docker-compose.yml up -d</code>, add one provider key in its dashboard at localhost:20128, then choose <code>omniroute</code>, base URL <code>http://localhost:20128/v1</code>, model <code>auto</code>.</p>
        <p className="text-xs text-faint">Only post snippets and a skills/roles summary are sent — never your email, phone or resume. If every provider fails, the scan still completes without a model.</p>
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Notification <span className="font-normal text-muted">— optional webhook (Slack/Discord/Teams-compatible)</span></h2>
        <Field k="HIRING_RADAR_WEBHOOK_URL" label="Webhook URL" secret placeholder="https://hooks.slack.com/…" {...p} />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={(form.HIRING_RADAR_NOTIFY ?? state.env.HIRING_RADAR_NOTIFY.value) === "true"} onChange={(e) => setForm({ ...form, HIRING_RADAR_NOTIFY: e.target.checked ? "true" : "false" })} /> Send a summary after each scan
        </label>
      </Card>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={Object.keys(form).length === 0}>Save keys</Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
      <Card className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">LinkedIn connections <span className="font-normal text-muted">— for warm-intro matching</span></h2>
        <p className="text-xs text-muted">LinkedIn → Settings → Data privacy → Get a copy of your data → Connections. Upload the CSV; it stays on this machine (gitignored) and is never shown here.</p>
        <p className="text-xs">{state.connections.present ? <span className="text-emerald-600">● Loaded (~{state.connections.rows} rows)</span> : <span className="text-muted">Not loaded</span>}</p>
        <div className="flex items-center gap-3">
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} className="text-xs" />
          {state.connections.present && <Button variant="outline" size="sm" onClick={async () => { await api("connections", { remove: true }); setCsvMsg("Removed."); refresh(); }}>Remove</Button>}
        </div>
        {csvMsg && <p className="text-xs text-muted">{csvMsg}</p>}
      </Card>
    </div>
  );
}

/* ---------- schedule ---------- */
function Schedule({ state, refresh }: { state: State; refresh: () => void }) {
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(30);
  const [days, setDays] = useState("*");
  const [scanDays, setScanDays] = useState(7);
  const [source, setSource] = useState("all");
  const [minScore, setMinScore] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const sch = state.schedule;
  const apply = async (enabled: boolean) => {
    try { await api("schedule", { enabled, hour, minute, days, scanDays, source, minScore: minScore === "" ? undefined : Number(minScore) }); setMsg(enabled ? "Schedule installed." : "Schedule removed."); await refresh(); } catch (e) { setMsg(e instanceof Error ? e.message : "failed"); }
  };
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Run automatically on this machine</h2>
        <p className="text-xs text-muted">Installs one marked entry in your user crontab (other entries are never touched). Times are this machine’s local time ({state.timezone}). The machine must be on; for always-on runs use the GitHub Action or the GCP VM.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label className={labelCls}>Hour (0–23)</label><input className={inputCls} type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} /></div>
          <div><label className={labelCls}>Minute</label><input className={inputCls} type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Days</label><select className={inputCls} value={days} onChange={(e) => setDays(e.target.value)}>{WEEKDAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className={labelCls}>Look back (days)</label><input className={inputCls} type="number" min={1} max={30} value={scanDays} onChange={(e) => setScanDays(Number(e.target.value))} /></div>
          <div><label className={labelCls}>Min score</label><input className={inputCls} type="number" min={0} max={100} placeholder="default" value={minScore} onChange={(e) => setMinScore(e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Sources</label><select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => apply(true)} disabled={!sch.available}>{sch.installed ? "Update schedule" : "Install schedule"}</Button>
          {sch.installed && <Button variant="outline" onClick={() => apply(false)}>Remove schedule</Button>}
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
        {!sch.available && <p className="text-xs text-red-600">{sch.error}</p>}
        {sch.installed && <div><p className={labelCls}>Installed cron entry</p><pre className="overflow-x-auto rounded-md bg-surface-hover p-2 text-[11px] text-muted">{sch.line}</pre><p className="mt-1 text-xs text-faint">Log: {state.paths.dataDir}/hiring-radar-cron.log</p></div>}
      </Card>
      <Card className="p-4 text-xs text-muted">
        <p className="font-medium text-foreground">GitHub Actions</p>
        <p className="mt-1">The repo’s workflow runs daily at 07:30 New York time (see <code>.github/workflows/hiring-radar.yml</code>); its schedule and secrets are managed in GitHub, not here.</p>
      </Card>
    </div>
  );
}

/* ---------- config ---------- */
function Config({ state, refresh }: { state: State; refresh: () => void }) {
  const [text, setText] = useState<string>(state.configLocal);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const defaults = useMemo(() => { try { return (yaml.load(state.configExample) ?? {}) as any; } catch { return {}; } }, [state.configExample]);
  const local = useMemo(() => { if (!text.trim()) return {} as any; try { return (yaml.load(text) ?? {}) as any; } catch { return null; } }, [text]);
  const eff = (path: string[], fallback: any) => { let a: any = local, b: any = defaults; for (const k of path) { a = a?.[k]; b = b?.[k]; } return a ?? b ?? fallback; };
  const setPath = (path: string[], v: any) => {
    const doc = (local ?? {}) as any;
    let o = doc;
    path.slice(0, -1).forEach((k) => { o[k] = o[k] ?? {}; o = o[k]; });
    o[path[path.length - 1]] = v;
    setText(yaml.dump(doc, { lineWidth: 120 }));
  };
  const save = async () => {
    try { await api("config", { yaml: text }); setMsg({ ok: true, text: text.trim() ? "Saved — the next run uses it." : "Reset to defaults." }); await refresh(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "failed" }); }
  };
  const w: Record<string, number> = { ...(defaults?.scoring?.weights ?? {}), ...(local?.scoring?.weights ?? {}) };
  const wsum = Object.values(w).reduce((a: number, b: any) => a + Number(b || 0), 0);
  const num = (path: string[], label: string, step = 1) => (
    <div><label className={labelCls}>{label}</label><input className={inputCls} type="number" step={step} value={eff(path, "")} onChange={(e) => setPath(path, Number(e.target.value))} disabled={local === null} /></div>
  );
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Quick settings</h2>
        {local === null && <p className="text-xs text-red-600">The YAML below has a syntax error; fix it to use these controls.</p>}
        <div className="grid gap-3 sm:grid-cols-4">
          {num(["recency", "default_days"], "Default look-back (days)")}
          {num(["scoring", "min_score"], "Report minimum score")}
          {num(["output", "max_per_company"], "Max items per company")}
          {num(["sources", "jobs", "max_companies"], "Job boards per run")}
          {num(["sources", "web_search", "max_queries"], "Search queries per run")}
          {num(["output", "digest", "primary"], "Top opportunities")}
          {num(["output", "high_signal_min"], "“High signal” threshold")}
          {num(["recency", "unknown_age_score"], "Score for undated jobs")}
        </div>
        <div>
          <p className={labelCls}>Overall-score weights <span className={Math.abs(wsum - 1) < 0.001 ? "text-emerald-600" : "text-red-600"}>(sum {wsum.toFixed(2)} — must be 1.00)</span></p>
          <div className="grid gap-3 sm:grid-cols-6">
            {["technical", "activity", "direct_language", "person", "location", "company"].map((k) => (
              <div key={k}><label className={labelCls}>{k.replace("_", " ")}</label><input className={inputCls} type="number" step={0.05} min={0} max={1} value={w[k] ?? 0} onChange={(e) => setPath(["scoring", "weights"], { ...w, [k]: Number(e.target.value) })} disabled={local === null} /></div>
            ))}
          </div>
        </div>
      </Card>
      <Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Overrides (YAML)</h2>
          <span className="text-xs text-muted">Only what you change — everything else uses the defaults. Roles, skills, phrases, recency bands and locations are edited here.</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setText(state.configExample)}>Load full defaults</Button>
        </div>
        <textarea className={cn(inputCls, "h-80 font-mono text-xs")} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder="# empty = use config.example.yml defaults" />
        <div className="flex items-center gap-3">
          <Button onClick={save}>{text.trim() ? "Validate & save" : "Reset to defaults"}</Button>
          <Button variant="ghost" onClick={() => setText(state.configLocal)}>Revert</Button>
        </div>
        {msg && <pre className={cn("whitespace-pre-wrap text-xs", msg.ok ? "text-emerald-600" : "text-red-600")}>{msg.text}</pre>}
      </Card>
    </div>
  );
}
