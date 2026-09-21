// Pure bucketing logic for the Dashboard Kanban board — no React, no fs, so it
// stays trivially testable and is the SINGLE place the column mapping lives
// (the board component and any future consumer both call this, never
// re-derive the mapping inline).
//
// Column <-> real backend state (templates/states.yml is the source of truth
// for the status strings themselves; this only decides which UI column a
// given canonical status lands in):
//   evaluate   -> data/pipeline.md rows with no matching tracker row yet
//   ready      -> tracker status "Evaluated"
//   applied    -> tracker status "Applied"
//   followup   -> tracker status "Follow-up" | "Responded" | "Interview"
//                 (folded together per product decision — all three mean
//                 "actively in progress, needs attention")
//   outcome_neg-> tracker status "Rejected" | "Ghosted"
//   success    -> tracker status "Hired"
// Deliberately excluded from the board (still visible on /pipeline's full
// tracker table): "SKIP" and "Discarded" — those mean "decided not to
// pursue," and the Dashboard's job is "what am I currently working on."
import type { Application, InboxJob } from "@/lib/career-ops";
import { canonStatus } from "@/lib/format";
import { findEvaluatedApplication } from "@/lib/inbox";

export const KANBAN_COLUMNS = ["evaluate", "ready", "applied", "followup", "outcome_neg", "success"] as const;
export type KanbanColumnId = (typeof KANBAN_COLUMNS)[number];

export const KANBAN_COLUMN_LABEL: Record<KanbanColumnId, string> = {
  evaluate: "Evaluate",
  ready: "Ready to Apply",
  applied: "Applied",
  followup: "Follow-up",
  outcome_neg: "Rejected / Ghosted",
  success: "Success",
};

export type KanbanCard = {
  /** Stable DnD id: the tracker number for a tracked card, "inbox:{url}" otherwise. */
  id: string;
  column: KanbanColumnId;
  company: string;
  role: string;
  location?: string;
  source?: string;
  postedAt?: string;
  url?: string;
  /** Tracker row number — present once a real evaluation exists. */
  n?: string;
  score?: string;
  /** Raw tracker status text, for the popup (e.g. distinguishing Rejected from Ghosted). */
  status?: string;
  /** A live job-registry "evaluate" job is running for this card's URL right now. */
  evaluating?: boolean;
  /** Does report `n` already have a tailored PDF? (pdf-index.tsv, server-computed — see pdfReadyForReport.) */
  pdfReady?: boolean;
  /** The original posting URL, from the report's own "**URL:**" header — applications.md has no URL column. */
  reportUrl?: string;
};

function columnForStatus(status: string): KanbanColumnId | null {
  const c = canonStatus(status);
  if (c.includes("EVALUATED")) return "ready";
  if (c.includes("FOLLOW-UP") || c.includes("RESPONDED") || c.includes("INTERVIEW")) return "followup";
  if (c.includes("REJECTED") || c.includes("GHOSTED")) return "outcome_neg";
  if (c.includes("HIRED")) return "success";
  if (c.includes("APPLIED")) return "applied"; // checked after FOLLOW-UP/RESPONDED/etc. — "APPLIED" is not a substring of those, order is defensive, not load-bearing
  return null; // SKIP, Discarded, or anything unrecognized — not on the board
}

export function buildKanbanColumns(
  applications: Application[],
  inbox: InboxJob[],
  evaluatingUrls: Set<string> = new Set(),
  pdfReadyMap?: Record<string, boolean>,
  reportUrlMap?: Record<string, string | undefined>,
): Record<KanbanColumnId, KanbanCard[]> {
  const columns: Record<KanbanColumnId, KanbanCard[]> = { evaluate: [], ready: [], applied: [], followup: [], outcome_neg: [], success: [] };

  for (const a of applications) {
    const col = columnForStatus(a.status);
    if (!col) continue;
    columns[col].push({ id: a.n, column: col, company: a.company, role: a.role, score: a.score, status: a.status, n: a.n, pdfReady: pdfReadyMap?.[a.n], reportUrl: reportUrlMap?.[a.n] });
  }

  for (const job of inbox) {
    if (!job.saved) continue; // scanner-found, never explicitly saved — belongs to Explore/Inbox, not "what I'm working on"
    if (job.done) continue; // already checked off in the raw pipeline list
    if (findEvaluatedApplication(job, applications)) continue; // has a real tracker row already — represented above instead
    columns.evaluate.push({
      id: `inbox:${job.url}`,
      column: "evaluate",
      company: job.company,
      role: job.role,
      location: job.location,
      url: job.url,
      postedAt: job.postedAt,
      evaluating: evaluatingUrls.has(job.url),
    });
  }

  return columns;
}
