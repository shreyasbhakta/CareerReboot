"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { Loader2, RefreshCw, ChevronDown } from "lucide-react";

type Diagnostic = { source: string; companies: number; jobs: number; errors: { company: string; message: string }[]; health: "HEALTHY" | "DEGRADED" | "ERROR" };
type Tier = "APPLY_TODAY" | "RECRUITER_OUTREACH" | "WATCH" | "STRETCH" | "SKIP";
type ScoredJob = {
  source: string;
  company: string;
  title: string;
  location: string;
  url: string;
  fitScore: number;
  tier: Tier;
  roleFamily: string[];
  excluded?: string;
  locationFlag?: string;
};
type ScanResponse = {
  generatedAt: string;
  sinceDays: number | null;
  companies: { scanned: number; skipped: { name: string; reason: string }[]; totalTracked: number };
  diagnostics: Diagnostic[];
  summary: { scanned: number; unique: number; filteredByWindow: number; apply_today: number; recruiter_outreach: number; watch: number; stretch: number; skip: number };
  results: ScoredJob[];
  error?: string;
};

const TIER_LABEL: Record<Tier, string> = {
  APPLY_TODAY: "Apply Today",
  RECRUITER_OUTREACH: "Recruiter Outreach",
  WATCH: "Watch",
  STRETCH: "Stretch",
  SKIP: "Skip",
};
const TIER_TONE: Record<Tier, "good" | "info" | "warn" | "bad" | "muted"> = {
  APPLY_TODAY: "good",
  RECRUITER_OUTREACH: "info",
  WATCH: "warn",
  STRETCH: "bad",
  SKIP: "muted",
};
const HEALTH_TONE: Record<Diagnostic["health"], string> = {
  HEALTHY: "text-green-600",
  DEGRADED: "text-amber-600",
  ERROR: "text-red-600",
};

const WINDOW_OPTIONS = [
  { label: "Any time", value: 0 },
  { label: "Last 24 hours", value: 1 },
  { label: "Last 3 days", value: 3 },
  { label: "Last 7 days", value: 7 },
  { label: "Last 14 days", value: 14 },
  { label: "Last 30 days", value: 30 },
];
const DEPTH_OPTIONS = [
  { label: "Quick (150 companies)", value: 150 },
  { label: "Deep (400 companies)", value: 400 },
];

type CompanyGroup = { company: string; jobs: ScoredJob[]; bestScore: number; bestTier: Tier };

function groupByCompany(jobs: ScoredJob[]): CompanyGroup[] {
  const byCompany = new Map<string, ScoredJob[]>();
  for (const j of jobs) {
    if (j.tier === "SKIP") continue;
    const list = byCompany.get(j.company) ?? [];
    list.push(j);
    byCompany.set(j.company, list);
  }
  const groups: CompanyGroup[] = [...byCompany.entries()].map(([company, list]) => {
    const sorted = [...list].sort((a, b) => b.fitScore - a.fitScore);
    return { company, jobs: sorted, bestScore: sorted[0].fitScore, bestTier: sorted[0].tier };
  });
  return groups.sort((a, b) => b.bestScore - a.bestScore);
}

export function ResearchView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [sinceDays, setSinceDays] = useState(0);
  const [limit, setLimit] = useState(150);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/research/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, sinceDays: sinceDays || undefined }),
      });
      const json = (await res.json()) as ScanResponse;
      if (!res.ok || json.error) throw new Error(json.error || `scan failed (${res.status})`);
      setData(json);
      setExpanded(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "scan failed");
    } finally {
      setLoading(false);
    }
  }

  const groups = useMemo(() => (data ? groupByCompany(data.results) : []), [data]);

  function toggle(company: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-faint">
          Posting window
          <select
            value={sinceDays}
            onChange={(e) => setSinceDays(Number(e.target.value))}
            className="mt-1 block rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          >
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-faint">
          Depth
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="mt-1 block rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          >
            {DEPTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={runScan} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {loading ? "Scanning…" : data ? "Re-run scan" : "Run scan"}
        </Button>
        {data && <span className="text-xs text-faint">generated {new Date(data.generatedAt).toLocaleTimeString()}</span>}
      </div>

      {error && <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Companies scanned", value: data.companies.scanned },
              { label: "Postings found", value: data.summary.scanned },
              { label: "Apply Today", value: data.summary.apply_today },
              { label: "Recruiter Outreach", value: data.summary.recruiter_outreach },
              { label: "Watch", value: data.summary.watch },
            ].map((s) => (
              <div key={s.label} className="rounded-md border border-border bg-surface p-3">
                <div className="text-2xl font-semibold text-landing">{s.value}</div>
                <div className="text-xs text-faint">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-faint">
            <span>
              {data.companies.skipped.length} of {data.companies.totalTracked} tracked companies had no reachable board this run
            </span>
            {data.summary.filteredByWindow > 0 && <span>{data.summary.filteredByWindow} postings outside the selected window</span>}
            {data.diagnostics.map((d) => (
              <span key={d.source} className={HEALTH_TONE[d.health]}>
                {d.source}: {d.health} ({d.companies} companies, {d.jobs} jobs{d.errors.length ? `, ${d.errors.length} errors` : ""})
              </span>
            ))}
          </div>

          <div className="mt-8 space-y-2">
            {groups.map((g) => {
              const isOpen = expanded.has(g.company);
              return (
                <div key={g.company} className="rounded-md border border-border bg-surface">
                  <button
                    onClick={() => toggle(g.company)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-hover"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronDown className={cn("size-4 shrink-0 text-faint transition-transform", isOpen && "rotate-180")} />
                      <div>
                        <div className="text-sm font-medium text-foreground">{g.company}</div>
                        <div className="text-xs text-faint">
                          {g.jobs.length} matching position{g.jobs.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={TIER_TONE[g.bestTier]}>{TIER_LABEL[g.bestTier]}</Badge>
                      <span className="text-lg font-semibold tabular-nums">{g.bestScore}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 border-t border-border p-3">
                      {g.jobs.map((j) => (
                        <a
                          key={j.url}
                          href={j.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-start justify-between gap-4 rounded-md border border-border p-3 transition-colors hover:bg-surface-hover"
                        >
                          <div>
                            <div className="text-sm font-medium text-foreground">{j.title}</div>
                            <div className="mt-0.5 text-xs text-faint">
                              {j.location || "location unknown"} · via {j.source}
                              {j.locationFlag ? ` · ${j.locationFlag}` : ""}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge tone={TIER_TONE[j.tier]}>{TIER_LABEL[j.tier]}</Badge>
                              {j.roleFamily.map((rf) => (
                                <Badge key={rf} tone="info">
                                  {rf}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="shrink-0 text-sm font-semibold tabular-nums">{j.fitScore}</div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {!groups.length && <p className="text-sm text-faint">No postings matched — try widening the posting window or `candidate-profile.yml`&apos;s keyword lists.</p>}
          </div>
        </>
      )}
    </div>
  );
}
