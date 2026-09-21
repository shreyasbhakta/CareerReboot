"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { KanbanCard as KanbanCardType } from "@/lib/kanban";

// Deliberately compact per the spec ("do not overload cards with large
// descriptions") — company, role, location/source, a status/score chip, and
// nothing else. Every field here is real, persisted data (a `KanbanCard` is
// built from applications.md / pipeline.md, never invented for display).
export function KanbanCard({ card, onOpen }: { card: KanbanCardType; onOpen: () => void }) {
  // A card mid-evaluation has a real job running against it — dragging it away
  // makes no sense while that's in flight. Otherwise every column (including
  // Evaluate) is draggable: dragging an Evaluate card out is "proceed without
  // evaluation" (kanban-board.tsx's handleDragEnd), the same action as the
  // popup's own button.
  const draggable = !card.evaluating;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card },
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={onOpen}
      className={cn(
        "cursor-pointer rounded-lg border border-border bg-surface p-2.5 text-left shadow-sm transition-shadow hover:shadow-md",
        isDragging && "opacity-50",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <p className="truncate text-[13px] font-medium text-foreground">{card.company}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{card.role}</p>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-faint">
        {card.evaluating && (
          <span className="inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 py-0.5 font-medium text-brand">
            <Loader2 className="size-3 animate-spin" /> Evaluating…
          </span>
        )}
        {card.score && <span className="rounded bg-surface-hover px-1.5 py-0.5 font-medium tabular-nums">{card.score}</span>}
        {card.location && <span className="truncate">{card.location}</span>}
        {card.status && card.column === "outcome_neg" && <span className="truncate">{card.status}</span>}
      </div>
    </div>
  );
}
