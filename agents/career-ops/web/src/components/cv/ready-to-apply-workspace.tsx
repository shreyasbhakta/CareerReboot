"use client";

import Link from "next/link";
import { GeneratePdfButton } from "@/components/generate-pdf-button";
import { ApplyButton } from "@/components/apply-button";
import { ApplyWithDefaultButton } from "@/components/apply-with-default-button";

export type ReadyToApplyRow = {
  n: string;
  company: string;
  role: string;
  pdfReady: boolean;
  reportUrl?: string;
};

// Bridges the Dashboard's "Ready to Apply" column to the resume work itself:
// every tracker row currently sitting at Evaluated, with the same real
// actions the Kanban popup offers (Make/Regenerate CV, Apply, Apply with
// default resume) — so working the resume doesn't require bouncing back to
// the Dashboard for each one.
export function ReadyToApplyWorkspace({ rows }: { rows: ReadyToApplyRow[] }) {
  return (
    <div>
      <h2 className="font-display text-lg tracking-tight text-landing">Ready to apply</h2>
      <p className="mt-1 text-sm text-muted">Tracker rows waiting on a tailored resume or an apply — same actions as the Dashboard&apos;s Ready to Apply column.</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-faint">Nothing evaluated and waiting right now — save and evaluate a job from Explore or the Dashboard to see it here.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.n} className="rounded-2xl border border-border bg-surface/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{row.company}</p>
                  <p className="truncate text-xs text-muted">{row.role}</p>
                </div>
                <Link href={`/pipeline/${row.n}`} className="shrink-0 text-xs text-muted hover:text-brand hover:underline">
                  View report
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <GeneratePdfButton n={row.n} company={row.company} pdfReady={row.pdfReady} />
                <ApplyButton n={row.n} url={row.reportUrl} company={row.company} pdfReady={row.pdfReady} />
                <div className="w-full sm:w-auto sm:min-w-[220px]">
                  <ApplyWithDefaultButton n={row.n} url={row.reportUrl} company={row.company} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
