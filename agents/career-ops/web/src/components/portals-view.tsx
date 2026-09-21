"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Radar, Wrench } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { useJobs, type Job } from "@/components/jobs/job-store";
import { cn } from "@/lib/cn";

type Company = { name: string; status: string; detail: string };
type Result = { available: boolean; configured: boolean; companies: Company[] };

const TONE: Record<string, { dot: string; label: string; chip: string }> = {
  live: { dot: "bg-emerald-500", label: "live", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  empty: { dot: "bg-amber-500", label: "live · empty", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  broken: { dot: "bg-red-500", label: "broken", chip: "bg-red-500/15 text-red-700 dark:text-red-400" },
  skipped: { dot: "bg-zinc-400", label: "no ATS", chip: "bg-surface-hover text-muted" },
};
const ORDER: Record<string, number> = { broken: 0, empty: 1, live: 2, skipped: 3 };

// Persisted across reloads/closed tabs (#background-jobs) — the health check
// keeps running server-side even if the Portals tab closes mid-sweep (it's a
// real background job now, not one execFile() call tied to this response), so
// a reopened tab should resume watching it instead of showing a blank "Check
// portal health" as if nothing had ever started.
const RUNNING_KEY = "career-ops:portals-verify-running";

export function PortalsView() {
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const companiesRef = useRef<Company[]>([]);
  const { jobs, startJob } = useJobs();

  const consume = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev: { type: string; id?: string; name?: string; status?: string; detail?: string; message?: string };
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.type === "jobId" && ev.id) {
          try { localStorage.setItem(RUNNING_KEY, ev.id); } catch { /* best-effort */ }
        } else if (ev.type === "company" && ev.name) {
          companiesRef.current = [...companiesRef.current, { name: ev.name, status: ev.status || "unknown", detail: ev.detail || "" }];
          setRes({ available: true, configured: true, companies: companiesRef.current });
        } else if (ev.type === "done" || ev.type === "error") {
          try { localStorage.removeItem(RUNNING_KEY); } catch { /* best-effort */ }
        }
      }
    }
  };

  // Reconnect on mount if a check was still running when the tab last closed/reloaded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let jobId: string | null = null;
      try {
        jobId = localStorage.getItem(RUNNING_KEY);
      } catch {
        jobId = null;
      }
      if (!jobId) return;
      setLoading(true);
      companiesRef.current = [];
      setRes({ available: true, configured: true, companies: [] });
      try {
        const r = await fetch(`/api/portals/verify/stream?id=${encodeURIComponent(jobId)}`);
        if (!r.ok || !r.body) {
          try { localStorage.removeItem(RUNNING_KEY); } catch { /* best-effort */ }
          if (!cancelled) setLoading(false);
          return;
        }
        await consume(r.body.getReader());
      } catch {
        try { localStorage.removeItem(RUNNING_KEY); } catch { /* best-effort */ }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // map the agentic "fix-portal" workers to the company they're repairing
  const fixByCompany = useMemo(() => {
    const m = new Map<string, (typeof jobs)[number]>();
    for (const j of jobs) {
      if (j.kind !== "fix-portal" || !j.input) continue;
      const ex = m.get(j.input);
      if (!ex || j.startedAt > ex.startedAt) m.set(j.input, j);
    }
    return m;
  }, [jobs]);

  async function check() {
    setLoading(true);
    companiesRef.current = [];
    setRes(null);
    try {
      const r = await fetch("/api/portals/verify");
      // The two early-return cases (no verify-portals.mjs / no portals.yml) are
      // a plain JSON object; a real check is an NDJSON stream — tell them apart
      // by content-type rather than trying to parse one shape as the other.
      if ((r.headers.get("content-type") || "").includes("application/json")) {
        setRes(await r.json());
        return;
      }
      if (!r.body) {
        setRes({ available: false, configured: false, companies: [] });
        return;
      }
      setRes({ available: true, configured: true, companies: [] });
      await consume(r.body.getReader());
    } catch {
      setRes({ available: false, configured: false, companies: [] });
      try { localStorage.removeItem(RUNNING_KEY); } catch { /* best-effort */ }
    } finally {
      setLoading(false);
    }
  }

  const companies = res?.companies ?? [];
  const broken = companies.filter((c) => c.status === "broken");
  const liveN = companies.filter((c) => c.status === "live" || c.status === "empty").length;
  const sorted = [...companies].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={check}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 disabled:opacity-50 max-sm:min-h-[44px]"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
          Check portal health
        </button>
        {loading && (
          <span className="text-xs text-faint">
            {companies.length > 0 ? `Checked ${companies.length} so far…` : "Probing each company’s ATS…"} Runs in the background — safe to leave this page.
          </span>
        )}
      </div>

      {res && !res.available && (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-surface/30 p-4 text-sm text-muted">
          <code className="text-foreground">verify-portals.mjs</code> not found — this needs a complete career-ops
          checkout (the web orchestrates the core&apos;s validator).
        </p>
      )}
      {res && res.available && !res.configured && (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-surface/30 p-4 text-sm text-muted">
          No <code className="text-foreground">portals.yml</code> yet — ask the assistant to set up the companies to scan.
        </p>
      )}

      {res && res.configured && (
        <div className="mt-5">
          <p className="text-sm text-muted">
            <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{liveN}</span> live ·{" "}
            <span className="tabular-nums text-red-600 dark:text-red-400">{broken.length}</span> broken ·{" "}
            <span className="tabular-nums">{companies.length}</span> tracked
          </p>
          {broken.length > 0 && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
              <span className="font-medium text-red-700 dark:text-red-400">
                {broken.length} {broken.length === 1 ? "company silently drops" : "companies silently drop"} from every
                scan
              </span>{" "}
              <span className="text-muted">
                — their careers link is broken. Fix the <code>careers_url</code> in <code>portals.yml</code> (or ask the
                assistant to repair them).
              </span>
            </div>
          )}
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
            {sorted.map((c) => {
              const t = TONE[c.status] ?? TONE.skipped;
              return (
                <li key={c.name} className="flex items-center gap-3 px-4 py-2.5">
                  <CompanyLogo name={c.name} size={20} />
                  <span className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />
                  <span className="shrink-0 text-sm font-medium">{c.name}</span>
                  <span className="truncate font-mono text-xs text-faint">{c.detail}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {c.status === "broken" && <FixAffordance company={c.name} job={fixByCompany.get(c.name)} onFix={() => startJob({ title: `Fix · ${c.name}`, subtitle: "repair portal slug", kind: "fix-portal", input: c.name, page: "/portals" })} />}
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", t.chip)}>{t.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function FixAffordance({ company, job, onFix }: { company: string; job?: Job; onFix: () => void }) {
  if (job?.status === "running")
    return (
      <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand">
        <Loader2 className="size-3 animate-spin" /> Fixing…
      </Link>
    );
  if (job?.status === "done")
    return (
      <Link href={`/jobs/${job.id}`} className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
        repaired · re-check
      </Link>
    );
  return (
    <button
      onClick={onFix}
      title={`Have the agent repair ${company}'s portal slug`}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-brand/40 hover:text-brand"
    >
      <Wrench className="size-3" /> Fix
    </button>
  );
}
