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
function scoreTone(n: number): "good" | "warn" | "muted" { return n >= 80 ? "good" : n >= 65 ? "warn" : "muted"; }

function Results({ state, refresh, goto }: { state: State; refresh: () => void; goto: (t: Tab) => void }) {
  const data = state.results;
  const [showHidden, setShowHidden] = useState(false);
  const signals: any[] = useMemo(() => (data?.signals ?? []).filter((s: any) => showHidden || !["DISMISSED", "CONVERTED"].includes(s.status)), [data, showHidden]);
  if (!data) {
    return (
      <Card className="p-6 text-sm text-muted">
        No results yet. <button className="text-brand underline" onClick={() => goto("run")}>Run a scan</button> — a first dry run takes about a minute.
      </Card>
    );
  }
  const d = data.digest;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span>Updated {new Date(data.generatedAt).toLocaleString()}</span>
        <span>{d.newDirectHiringSignals} new direct hiring</span>
        <span>{d.newRelevantJobs} new jobs</span>
        <span>{d.warmOpportunities} warm intros</span>
        <label className="ml-auto flex items-center gap-1.5"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> show dismissed</label>
      </div>
      {data.dryRun && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">These results are from a dry run — nothing was saved to history.</p>}
      {signals.length === 0 && <Card className="p-6 text-sm text-muted">Nothing cleared the bar. Try a longer window or a lower minimum score on the Run tab.</Card>}
      {signals.map((s) => <SignalCard key={s.id} s={s} refresh={refresh} />)}
    </div>
  );
}

function SignalCard({ s, refresh }: { s: any; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = s.scores.components;
  const warm = s.metadata.warm;
  const setStatus = async (status: string) => {
    setBusy(true);
    try { await api("status", { id: s.id, status }); await refresh(); } finally { setBusy(false); }
  };
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
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
          <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">Open <ExternalLink className="size-3" /></a>
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
