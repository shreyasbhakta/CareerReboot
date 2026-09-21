"use client";

import { useEffect, useState } from "react";
import { Clock, HelpCircle } from "lucide-react";

type Stats = {
  available: boolean;
  runs?: { totalRuns: number; failedRuns: number; lastRunDate: string | null; avgFoundPerRun: number; avgNewPerRun: number } | null;
  portals?: { configuredCompanies: number; producingCompanies: number; producingPct: number; persistentlyDead: number } | null;
};

// Real scan-run history (data/scan-runs.tsv, via stats.mjs) — never a fake
// "healthy" summary. "Next run" is reported as "Not scheduled" rather than
// invented: this app has no built-in scheduler (scans run via the CLI, an
// agent, or whatever external cron the user set up, none of which this app
// tracks — see /api/portals/stats).
export function ScraperTransparencyPanel() {
  const [data, setData] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/portals/stats")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ available: false }));
  }, []);

  if (!data) return <div className="text-sm text-muted">Loading scan history…</div>;
  if (!data.available || !data.runs) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4 text-sm text-muted">
        No scan history yet — <code className="text-foreground">data/scan-runs.tsv</code> is created by the first scan.
      </div>
    );
  }

  const { runs, portals } = data;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Last scan" value={runs.lastRunDate ?? "Unknown"} icon={<Clock className="size-3.5" />} />
      <Tile label="Next scan" value="Not scheduled" hint="career-ops has no built-in scheduler — set up a cron/loop to automate this." icon={<HelpCircle className="size-3.5" />} />
      <Tile label="Avg jobs found / run" value={runs.avgFoundPerRun.toLocaleString()} />
      <Tile label="Avg new / run" value={runs.avgNewPerRun.toLocaleString()} />
      {portals && (
        <>
          <Tile label="Companies tracked" value={String(portals.configuredCompanies)} />
          <Tile label="Actually producing" value={`${portals.producingCompanies} (${portals.producingPct}%)`} />
          <Tile label="Persistently dead" value={String(portals.persistentlyDead)} tone={portals.persistentlyDead > 0 ? "warn" : undefined} />
          <Tile label="Failed runs" value={String(runs.failedRuns)} tone={runs.failedRuns > 0 ? "warn" : undefined} />
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint, icon, tone }: { label: string; value: string; hint?: string; icon?: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-3">
      <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-faint">
        {icon}
        {label}
      </p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-faint">{hint}</p>}
    </div>
  );
}
