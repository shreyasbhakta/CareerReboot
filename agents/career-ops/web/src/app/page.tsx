import { pipelineSummary, doctorState, pdfReadyForReport, readReport, extractUrlFromNotes } from "@/lib/career-ops";
import { parseReport } from "@/lib/format";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { FirstRunHome } from "@/components/home/first-run-home";
import Link from "next/link";
import { Crosshair } from "lucide-react";
import { KanbanBoard } from "@/components/dashboard/kanban-board";

export const dynamic = "force-dynamic"; // always read fresh local files at request time (never at build — CI has no user data)

export default async function Home() {
  const { phase, onboardingNeeded } = doctorState();
  // First run (truly empty install): the CV-upload takeover IS the home — value
  // before commitment. The full dashboard returns once they have a CV or any data.
  if (phase === "first-run") return <FirstRunHome />;

  const { inbox, applications } = pipelineSummary();

  // Per-report lookups the Kanban popup needs (tailored-CV readiness + the
  // original posting URL, read from the report's own "**URL:**" header —
  // applications.md itself carries no URL column). Cheap: a handful of small
  // file reads for however many rows are actually tracked, same cost the
  // /pipeline/[id] report page already pays per row.
  const pdfReadyEntries = await Promise.all(applications.map(async (a) => [a.n, await pdfReadyForReport(a.n)] as const));
  const pdfReadyMap = Object.fromEntries(pdfReadyEntries);
  const reportUrlMap = Object.fromEntries(
    applications.map((a) => {
      const report = readReport(a.n);
      // A "Proceed without evaluation" row has no report at all — its posting
      // URL, if it has one, only survives in `notes` (see extractUrlFromNotes).
      const url = report ? parseReport(report.content).fields.find((f) => f.label === "URL")?.value : extractUrlFromNotes(a.notes);
      return [a.n, url && url.startsWith("http") ? url : undefined];
    }),
  );

  // Established / in-between: the Kanban workflow board. Show the setup
  // banner whenever ANY prereq is missing (mirrors the core doctor.mjs), so a
  // portals-missing user is nudged rather than told "all caught up".
  return (
    <>
      {onboardingNeeded && <OnboardingBanner />}
      <Link
        href="/hiring-radar"
        className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface/50 px-4 py-3 text-sm transition-colors hover:bg-surface-hover max-sm:mx-3"
      >
        <Crosshair className="size-5 text-brand" />
        <span className="font-medium text-foreground">Hiring Radar</span>
        <span className="text-muted">See who is hiring for your profile right now — run a scan, set the schedule, manage keys.</span>
        <span className="ml-auto text-brand">Open →</span>
      </Link>
      <KanbanBoard applications={applications} inbox={inbox} pdfReadyMap={pdfReadyMap} reportUrlMap={reportUrlMap} />
    </>
  );
}
