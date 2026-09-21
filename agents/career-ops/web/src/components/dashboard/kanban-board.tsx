"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { AlertTriangle } from "lucide-react";
import type { Application, InboxJob } from "@/lib/career-ops";
import { useJobs } from "@/components/jobs/job-store";
import { buildKanbanColumns, KANBAN_COLUMNS, KANBAN_COLUMN_LABEL, type KanbanCard as KanbanCardType, type KanbanColumnId } from "@/lib/kanban";
import { KanbanCard } from "./kanban-card";
import { JobCardPopup } from "./job-card-popup";

// A drop onto a column writes ONE specific canonical status (templates/states.yml).
// "followup" and "outcome_neg" are folded-together READ columns (they also show
// existing Responded/Interview and Rejected rows respectively), but a drop is a
// WRITE, so it must pick one concrete status — "Follow-up" and "Rejected" are the
// sensible defaults; the popup that opens right after a drop into Rejected/Ghosted
// lets the user switch to Ghosted in one click if that's what actually happened.
const COLUMN_DROP_STATUS: Partial<Record<KanbanColumnId, string>> = {
  ready: "Evaluated",
  applied: "Applied",
  followup: "Follow-up",
  outcome_neg: "Rejected",
  success: "Hired",
};

export function KanbanBoard({
  applications,
  inbox,
  pdfReadyMap,
  reportUrlMap,
}: {
  applications: Application[];
  inbox: InboxJob[];
  pdfReadyMap: Record<string, boolean>;
  reportUrlMap: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const { jobs, startJob } = useJobs();
  const [optimistic, setOptimistic] = useState<Record<string, KanbanColumnId>>({});
  const [dragError, setDragError] = useState("");
  const [selected, setSelected] = useState<KanbanCardType | null>(null);

  const evaluatingUrls = useMemo(() => {
    const s = new Set<string>();
    for (const j of jobs) if (j.kind === "evaluate" && j.status === "running" && j.input) s.add(j.input);
    return s;
  }, [jobs]);

  const columns = useMemo(() => {
    const base = buildKanbanColumns(applications, inbox, evaluatingUrls, pdfReadyMap, reportUrlMap);
    // Apply any optimistic (not-yet-confirmed) moves on top of the real snapshot.
    if (Object.keys(optimistic).length === 0) return base;
    const next: Record<KanbanColumnId, KanbanCardType[]> = { evaluate: [], ready: [], applied: [], followup: [], outcome_neg: [], success: [] };
    for (const col of KANBAN_COLUMNS) {
      for (const card of base[col]) {
        const moveTo = optimistic[card.id];
        next[moveTo ?? col].push(moveTo ? { ...card, column: moveTo } : card);
      }
    }
    return next;
  }, [applications, inbox, evaluatingUrls, optimistic, pdfReadyMap, reportUrlMap]);

  // A running/finished evaluate job changes real tracker/pipeline state server-side
  // (a new applications.md row, or nothing if it failed) — re-fetch so the card
  // reflects that instead of staying stuck showing "Evaluating…" forever.
  useEffect(() => {
    const onDone = () => router.refresh();
    window.addEventListener("co-job-done", onDone);
    return () => window.removeEventListener("co-job-done", onDone);
  }, [router]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const moveBackToEvaluate = useCallback(
    async (card: KanbanCardType) => {
      if (!card.n) return;
      setDragError("");
      setOptimistic((o) => ({ ...o, [card.id]: "evaluate" }));
      try {
        const r = await fetch("/api/pipeline/move-back-to-evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ n: card.n, url: card.reportUrl, company: card.company, role: card.role }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) throw new Error(d.error || "Move failed");
        setOptimistic((o) => {
          const next = { ...o };
          delete next[card.id];
          return next;
        });
        router.refresh();
      } catch (err) {
        setOptimistic((o) => {
          const next = { ...o };
          delete next[card.id];
          return next;
        });
        setDragError(err instanceof Error ? err.message : "Move failed — try again.");
      }
    },
    [router],
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const card = e.active.data.current?.card as KanbanCardType | undefined;
      const targetColumn = e.over?.id as KanbanColumnId | undefined;
      if (!card || !targetColumn || targetColumn === card.column) return;

      // A card in Evaluate has no tracker row yet — dragging it anywhere is a
      // real decision (evaluate for real, or proceed without one), not a plain
      // move, so it opens the same popup a click would rather than silently
      // picking one for the user. The popup's own EvaluateActions already
      // offers both "Start evaluation" and "Proceed without evaluation".
      if (card.column === "evaluate") {
        setSelected(card);
        return;
      }
      // Ready to Apply -> Evaluate is the undo for exactly that: put it back
      // in the queue. Scoped to this one pair on purpose — Applied/Follow-up/
      // Success represent real progress (an application was sent, a reply
      // came in), and "Remove from board" already exists for backing OUT of
      // those without conflating it with "re-queue for evaluation".
      if (card.column === "ready" && targetColumn === "evaluate") {
        void moveBackToEvaluate(card);
        return;
      }
      if (!card.n) return; // no other drop makes sense without a real tracker row
      const status = COLUMN_DROP_STATUS[targetColumn];
      if (!status) return;

      setDragError("");
      setOptimistic((o) => ({ ...o, [card.id]: targetColumn }));
      (async () => {
        try {
          const r = await fetch("/api/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ n: card.n, status }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || `Move failed (${r.status})`);
          }
          // Real state now agrees with the optimistic move — clear it and let
          // the next server-refreshed `applications` prop be the source of truth.
          setOptimistic((o) => {
            const next = { ...o };
            delete next[card.id];
            return next;
          });
          router.refresh();
          // Outcome columns are ambiguous on drop (Rejected vs Ghosted) — open
          // the popup immediately so the user can correct it in one click
          // instead of silently defaulting.
          if (targetColumn === "outcome_neg") setSelected({ ...card, column: targetColumn, status });
        } catch (err) {
          setOptimistic((o) => {
            const next = { ...o };
            delete next[card.id];
            return next;
          });
          setDragError(err instanceof Error ? err.message : "Move failed — try again.");
        }
      })();
    },
    [router, moveBackToEvaluate],
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Jobs you&apos;ve saved, in one workflow — drag a card to move it, click to see details.</p>
        </div>
      </div>

      {dragError && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="size-4 shrink-0" /> {dragError}
        </div>
      )}

      {/* A stable id is dnd-kit's own documented fix for exactly this SSR
          hydration mismatch: without one, its auto-generated a11y ids
          (aria-describedby="DndDescribedBy-N") are numbered by RENDER ORDER,
          which the server pass and the client's first mount don't always
          agree on (e.g. this changed the moment Evaluate-column cards became
          draggable too — one more useDraggable instance in the count shifts
          every id after it). A fixed id removes the render-order dependency
          entirely instead of trying to keep both passes in lockstep. */}
      <DndContext id="dashboard-kanban" sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {KANBAN_COLUMNS.map((col) => (
            <Column key={col} id={col} cards={columns[col]} onOpen={setSelected} />
          ))}
        </div>
      </DndContext>

      {selected && (
        <JobCardPopup
          card={selected}
          onClose={() => setSelected(null)}
          onStartEvaluate={(url, company, role) => {
            startJob({ title: `Evaluate · ${company}`, subtitle: role, kind: "evaluate", input: url, page: "/" });
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function Column({ id, cards, onOpen }: { id: KanbanColumnId; cards: KanbanCardType[]; onOpen: (c: KanbanCardType) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] flex-col gap-2 rounded-xl border p-2.5 transition-colors ${isOver ? "border-brand/50 bg-brand-soft/30" : "border-border bg-surface/30"}`}
    >
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{KANBAN_COLUMN_LABEL[id]}</h2>
        <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-faint">{cards.length}</span>
      </div>
      {cards.length === 0 ? (
        <p className="px-0.5 py-4 text-center text-[11px] text-faint">Nothing here</p>
      ) : (
        cards.map((c) => <KanbanCard key={c.id} card={c} onOpen={() => onOpen(c)} />)
      )}
    </div>
  );
}
