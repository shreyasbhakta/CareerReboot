"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Loader2, Search, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type Evidence = { types: string[]; labels: string[]; source: string; url: string; quote: string };
type Candidate = {
  id: string; name: string; title: string; profileUrl: string | null; email: string | null; role: string; score: number; ruleScore: number;
  confidence: "high" | "medium" | "low"; evidence: Evidence[]; sourceCount: number; model?: { likelihood: number; role: string | null; reason: string };
};
type Result = {
  ok: true; searchedAt: string; candidates: Candidate[]; digDeeper: { label: string; url: string }[]; model: string | null;
  job: { url: string; ats: string; title: string; company: string; team: string; location: string; reportsTo: string; datePosted: string; emails: string[]; sources: string[]; excerpt: string; textChars: number };
  providers: { used: string[]; failed: string[]; missing: string[]; exhausted?: string[] }; queries: number; requests: number; runtimeSeconds: number; warnings: string[]; note: string;
};
type Status = { installed: boolean; history: Result[]; providers: Record<string, boolean> };

const ROLE_LABEL: Record<string, string> = { hiring_manager: "Likely hiring manager", recruiter: "Recruiter / talent", poster: "Posted the job", team: "On the team", unlikely: "Unlikely" };
const CONF_TONE = { high: "good", medium: "warn", low: "muted" } as const;
const PROVIDERS: [string, string, string][] = [
  ["BRAVE_SEARCH_API_KEY", "Brave Search", "free tier, web results"],
  ["SEARXNG_URL", "SearXNG", "self-hosted, free"],
  ["SERPER_API_KEY", "Serper", "Google results, 2,500 free queries"],
  ["SERPAPI_API_KEY", "SerpApi", "Google results, small free plan"],
  ["EXA_API_KEY", "Exa", "people-aware search, best for profiles"],
  ["HUNTER_API_KEY", "Hunter", "company staff directory + emails"],
  ["MODEL_PROVIDER", "Model re-ranking", "a model re-reads the evidence"],
];
const inputCls = "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand/50";
const labelCls = "block text-xs font-medium text-muted mb-1";

export function SearchHmView() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState({ url: params.get("url") ?? "", company: params.get("company") ?? "", title: params.get("title") ?? "", location: "", team: "", jdText: "" });
  const [showMore, setShowMore] = useState(Boolean(params.get("company") || params.get("title")));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    try {
      const s: Status = await (await fetch("/api/search-hm")).json();
      setStatus(s);
      setResult((r) => r ?? s.history[0] ?? null);
    } catch { setErr("Could not load Search HM."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const isLinkedIn = /linkedin\.com/i.test(form.url);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/search-hm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (!busy) run(); }}>
          <input className={inputCls} type="url" required placeholder="Paste a job URL (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, company careers page, LinkedIn…)" value={form.url} onChange={set("url")} />
          <Button type="submit" disabled={busy || !form.url.trim()} className="shrink-0">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}{busy ? "Searching…" : "Find hiring manager"}
          </Button>
        </form>
        {busy && <p className="text-xs text-muted">Reading the posting, then running targeted searches on every provider you have set up. This usually takes 20–60 seconds.</p>}
        {isLinkedIn && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">LinkedIn pages are never fetched. Open the posting yourself, check its “Meet the hiring team” box, and paste the description below for better results.</p>}
        <button type="button" className="text-xs text-brand underline" onClick={() => setShowMore(!showMore)}>{showMore ? "Hide" : "Correct details or paste the description"}</button>
        {(showMore || isLinkedIn) && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div><label className={labelCls}>Company</label><input className={inputCls} value={form.company} onChange={set("company")} placeholder="from the page" /></div>
              <div><label className={labelCls}>Title</label><input className={inputCls} value={form.title} onChange={set("title")} placeholder="from the page" /></div>
              <div><label className={labelCls}>Team</label><input className={inputCls} value={form.team} onChange={set("team")} placeholder="e.g. Payments" /></div>
              <div><label className={labelCls}>Location</label><input className={inputCls} value={form.location} onChange={set("location")} placeholder="from the page" /></div>
            </div>
            <div><label className={labelCls}>Job description (optional)</label><textarea className={cn(inputCls, "h-28")} value={form.jdText} onChange={set("jdText")} placeholder="Paste the description when the page can't be read" /></div>
          </div>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </Card>

      {status && <Providers status={status} />}
      {result && <ResultView r={result} />}
      {status && status.history.length > 1 && (
        <Card className="p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Recent searches</p>
          <ul className="space-y-1 text-sm">
            {status.history.map((h) => (
              <li key={h.job.url + h.searchedAt}>
                <button className={cn("text-left hover:underline", result?.job.url === h.job.url ? "text-foreground" : "text-brand")} onClick={() => setResult(h)}>
                  {h.job.title || "Untitled"} — {h.job.company || "?"}
                </button>
                <span className="ml-2 text-xs text-faint">{h.candidates.length} leads · {new Date(h.searchedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Providers({ status }: { status: Status }) {
  const on = PROVIDERS.filter(([k]) => status.providers[k]).length;
  return (
    <details className="rounded-lg border border-border bg-surface px-4 py-3 text-sm" open={on <= 1}>
      <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-faint">Sources ({on} of {PROVIDERS.length} set up)</summary>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {PROVIDERS.map(([k, name, hint]) => (
          <li key={k} className="flex items-start gap-2">
            {status.providers[k] ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 size-4 shrink-0 text-faint" />}
            <span>{name} <span className="text-xs text-muted">— {hint}</span></span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Every source you add is searched on each run and adds its own evidence. Add keys under <a className="text-brand underline" href="/hiring-radar">Hiring Radar → Keys &amp; data</a>.</p>
    </details>
  );
}

function ResultView({ r }: { r: Result }) {
  const j = r.job;
  return (
    <div className="space-y-4">
      <Card className="space-y-1.5 p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-base font-semibold text-foreground">{j.title || "Unknown title"} — {j.company || "Unknown company"}</h2>
          <a href={j.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">posting <ExternalLink className="size-3" /></a>
        </div>
        <p className="text-xs text-muted">
          {[j.location, j.team && `team: ${j.team}`, j.reportsTo && `reports to: ${j.reportsTo}`, j.ats && `via ${j.ats}`, j.datePosted && `posted ${j.datePosted.slice(0, 10)}`].filter(Boolean).join(" · ") || "No extra details on the page"}
        </p>
        {j.emails.length > 0 && <p className="text-xs"><span className="text-muted">Emails in the posting: </span>{j.emails.join(", ")}</p>}
        <p className="text-xs text-faint">
          Searched {new Date(r.searchedAt).toLocaleString()} · {r.queries} queries via {r.providers.used.join(", ") || "no provider"} · {r.runtimeSeconds}s{r.model ? ` · re-ranked by ${r.model}` : ""}{r.providers.exhausted?.length ? ` · out of quota: ${r.providers.exhausted.join(", ")}` : ""}
        </p>
      </Card>

      {r.warnings.length > 0 && (
        <ul className="space-y-1 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {r.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Possible hiring managers and posters <span className="font-normal text-muted">({r.candidates.length})</span></h3>
        {r.candidates.length === 0 && <Card className="p-4 text-sm text-muted">Nobody turned up with enough evidence. Try the searches below, add another source, or name the team above and search again.</Card>}
        {r.candidates.map((c, i) => <CandidateCard key={c.id} c={c} rank={i + 1} />)}
      </div>

      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Dig deeper yourself</p>
        <p className="mb-2 text-xs text-muted">The same searches, ready to open in your own browser.</p>
        <ul className="space-y-1">
          {r.digDeeper.map((l) => (
            <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-brand hover:underline">{l.label} <ExternalLink className="size-3 shrink-0" /></a></li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-faint">{r.note}</p>
    </div>
  );
}

function CandidateCard({ c, rank }: { c: Candidate; rank: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-5 text-right text-sm text-faint tabular-nums">{rank}</span>
        <Badge tone={CONF_TONE[c.confidence]} className="mt-0.5 text-sm" title={`Rules ${c.ruleScore}${c.model ? ` · model ${c.model.likelihood}` : ""}`}>{c.score}</Badge>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{c.name}</span>
            <Badge tone={c.role === "hiring_manager" ? "info" : "muted"}>{ROLE_LABEL[c.model?.role ?? c.role] ?? c.role}</Badge>
            <span className="text-xs text-faint">{c.confidence} confidence · {c.sourceCount} source{c.sourceCount === 1 ? "" : "s"}</span>
          </div>
          {c.title && <p className="mt-0.5 text-xs text-muted">{c.title}</p>}
          {c.model?.reason && <p className="mt-1 text-xs text-foreground">{c.model.reason}</p>}
          <ul className="mt-2 space-y-1">
            {c.evidence.slice(0, 5).map((e, i) => (
              <li key={i} className="text-xs">
                <span className="text-foreground">{e.labels.join(" · ")}</span>
                <span className="text-faint"> · {e.source} · </span>
                <a href={e.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">source</a>
                {e.quote && <span className="block truncate text-faint">“{e.quote}”</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs">
          {c.profileUrl && <a href={c.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">Profile <ExternalLink className="size-3" /></a>}
          {c.email && <a href={`mailto:${c.email}`} className="text-muted hover:underline">{c.email}</a>}
        </div>
      </div>
    </Card>
  );
}
