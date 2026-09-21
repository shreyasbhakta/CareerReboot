"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Search, Loader2, PartyPopper, ExternalLink, Play } from "lucide-react";
import { GeneratePdfButton } from "@/components/generate-pdf-button";
import { ApplyButton } from "@/components/apply-button";
import { ApplyWithDefaultButton } from "@/components/apply-with-default-button";
import type { KanbanCard } from "@/lib/kanban";

// Reuses the established modal pattern (role="dialog" + backdrop + Escape),
// the same shape as followups/next-date-dialog.tsx and log-dialog.tsx — no
// dialog library, this app already has one hand-rolled pattern used everywhere.
export function JobCardPopup({
  card,
  onClose,
  onStartEvaluate,
}: {
  card: KanbanCard;
  onClose: () => void;
  onStartEvaluate: (url: string, company: string, role: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={`${card.company} — ${card.role}`} className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{card.company}</h2>
            <p className="truncate text-sm text-muted">{card.role}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md p-1 text-faint hover:bg-surface-hover hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {card.location && <p className="mt-2 text-xs text-faint">{card.location}</p>}

        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {card.column === "evaluate" && <EvaluateActions card={card} onStartEvaluate={onStartEvaluate} onClose={onClose} />}
          {card.column === "ready" && <ReadyToApplyActions card={card} />}
          {card.column === "applied" && <AppliedActions card={card} onClose={onClose} />}
          {card.column === "followup" && <FollowUpActions card={card} onClose={onClose} />}
          {card.column === "outcome_neg" && <OutcomeActions card={card} onClose={onClose} />}
          {card.column === "success" && <SuccessActions card={card} />}
        </div>

        {card.n && (
          <Link href={`/pipeline/${card.n}`} className="mt-4 block text-center text-xs text-muted hover:text-brand hover:underline">
            View full report
          </Link>
        )}

        <RemoveFromBoard card={card} onClose={onClose} />
      </div>
    </div>
  );
}

function EvaluateActions({ card, onStartEvaluate, onClose }: { card: KanbanCard; onStartEvaluate: (url: string, company: string, role: string) => void; onClose: () => void }) {
  if (!card.url) return <p className="text-sm text-muted">No posting URL on this saved job.</p>;
  if (card.evaluating) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand">
        <Loader2 className="size-4 animate-spin" /> Evaluating…
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <button
        onClick={() => onStartEvaluate(card.url!, card.company, card.role)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:brightness-110"
      >
        <Play className="size-4" /> Start evaluation
      </button>
      <a href={card.url} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-1 text-xs text-muted hover:text-brand">
        <ExternalLink className="size-3" /> Open posting
      </a>
      <SkipEvaluationButton card={card} onClose={onClose} />
    </div>
  );
}

// A real, honest bypass — not a fake evaluation. Writes an actual tracker row
// (POST /api/pipeline/skip-evaluation, same reserve-number -> TSV ->
// merge-tracker.mjs path a real evaluation uses) with the tracker's own
// documented "no evaluation ran" sentinel in the score/report cells, never an
// invented score. Once that row exists the card moves itself to Ready to
// Apply — no separate move step.
function SkipEvaluationButton({ card, onClose }: { card: KanbanCard; onClose: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const proceed = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/pipeline/skip-evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: card.url, company: card.company, role: card.role, location: card.location }),
      });
      const d = await r.json();
      if (!d.ok) {
        setError(d.error || "Could not skip evaluation.");
        setBusy(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex w-full items-center justify-center text-xs text-faint hover:text-foreground"
      >
        Proceed without evaluation
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-500/[0.06] p-2.5 text-xs">
      <p className="text-foreground">Move to Ready to Apply with no score, no report — you&apos;ll be applying blind.</p>
      {error && <p className="mt-1 text-red-500">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button disabled={busy} onClick={proceed} className="rounded-md bg-amber-500 px-2.5 py-1 font-medium text-white hover:bg-amber-600 disabled:opacity-50">
          {busy ? "Moving…" : "Proceed anyway"}
        </button>
        <button disabled={busy} onClick={() => setConfirming(false)} className="rounded-md border border-border px-2.5 py-1 text-muted hover:text-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReadyToApplyActions({ card }: { card: KanbanCard }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted">Resume:</span>
        <GeneratePdfButton n={card.n!} company={card.company} pdfReady={!!card.pdfReady} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted">Apply:</span>
        <ApplyButton n={card.n!} url={card.reportUrl} company={card.company} pdfReady={!!card.pdfReady} />
      </div>
      <ApplyWithDefaultButton n={card.n!} url={card.reportUrl} company={card.company} />
    </div>
  );
}

function AppliedActions({ card, onClose }: { card: KanbanCard; onClose: () => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Application sent. Move it forward once something changes:</p>
      <MoveButtons n={card.n!} options={[["Follow-up", "Follow-up"], ["Rejected", "Rejected / Ghosted"], ["Hired", "Success"]]} onClose={onClose} />
    </div>
  );
}

function FollowUpActions({ card, onClose }: { card: KanbanCard; onClose: () => void }) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted">Status: {card.status}</p>
      <FindHiringManagerButton company={card.company} role={card.role} />
      <MoveButtons n={card.n!} options={[["Rejected", "Rejected / Ghosted"], ["Hired", "Success"]]} onClose={onClose} />
    </div>
  );
}

type HmCandidate = { name: string; title: string; url: string; score: number };

// Real candidates via a self-hosted SearXNG search (deploy/searxng/) — not a
// guess dressed up as a working feature. Every result stays labeled
// unverified: this is web-search hits, never an asserted org chart.
function FindHiringManagerButton({ company, role }: { company: string; role: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [candidates, setCandidates] = useState<HmCandidate[]>([]);
  const [error, setError] = useState("");

  const search = async () => {
    setState("loading");
    setError("");
    try {
      const r = await fetch("/api/hiring-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, role }),
      });
      const d = await r.json();
      if (!d.ok) {
        setError(d.error || "Search failed.");
        setState("error");
        return;
      }
      setCandidates(d.candidates ?? []);
      setState("done");
    } catch {
      setError("Could not reach the server.");
      setState("error");
    }
  };

  if (state === "idle" || state === "loading") {
    return (
      <button
        type="button"
        onClick={search}
        disabled={state === "loading"}
        title="Searches a self-hosted SearXNG instance for candidate hiring-manager profiles — results are unverified web search hits, not a confirmed org chart."
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-brand/40 hover:text-brand disabled:opacity-50"
      >
        {state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
        {state === "loading" ? "Searching…" : "Find hiring manager"}
      </button>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/[0.06] p-2.5 text-xs">
        <p className="text-amber-700 dark:text-amber-400">{error}</p>
        <button type="button" onClick={search} className="mt-1.5 text-muted hover:text-foreground">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface/30 p-2.5">
      <p className="mb-1.5 text-[11px] text-faint">Unverified web-search hits — confirm identity before reaching out.</p>
      {candidates.length === 0 ? (
        <p className="text-xs text-muted">No LinkedIn candidates found for {company}.</p>
      ) : (
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li key={c.url} className="text-xs">
              <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:text-brand hover:underline">
                {c.name}
              </a>
              {c.title && <span className="text-faint"> — {c.title}</span>}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={search} className="mt-2 text-[11px] text-muted hover:text-foreground">
        Search again
      </button>
    </div>
  );
}

function OutcomeActions({ card, onClose }: { card: KanbanCard; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const isGhosted = card.status === "Ghosted";
  const setOutcome = async (status: "Rejected" | "Ghosted") => {
    setBusy(true);
    await fetch("/api/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n: card.n, status }) }).catch(() => {});
    setBusy(false);
    router.refresh();
    onClose();
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Which happened?</p>
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => setOutcome("Rejected")}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${!isGhosted ? "border-red-400/50 bg-red-500/10 text-red-600 dark:text-red-400" : "border-border text-muted hover:text-foreground"}`}
        >
          Rejected
        </button>
        <button
          disabled={busy}
          onClick={() => setOutcome("Ghosted")}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${isGhosted ? "border-zinc-400/50 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400" : "border-border text-muted hover:text-foreground"}`}
        >
          Ghosted
        </button>
      </div>
    </div>
  );
}

function SuccessActions({ card }: { card: KanbanCard }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
      <PartyPopper className="size-4" /> {card.company} — landed it! 🎉
    </div>
  );
}

function MoveButtons({ n, options, onClose }: { n: string; options: [string, string][]; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const move = async (status: string) => {
    setBusy(true);
    await fetch("/api/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n, status }) }).catch(() => {});
    setBusy(false);
    router.refresh();
    onClose();
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([status, label]) => (
        <button key={status} disabled={busy} onClick={() => move(status)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-brand/40 hover:text-brand disabled:opacity-50">
          → {label}
        </button>
      ))}
    </div>
  );
}

function RemoveFromBoard({ card, onClose }: { card: KanbanCard; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const remove = async () => {
    setBusy(true);
    try {
      if (card.url && !card.n) {
        // Pre-tracker: discard the raw inbox row, same mechanism the Inbox's own ✕ uses.
        await fetch("/api/pipeline/discard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: card.url, company: card.company, title: card.role, location: card.location }),
        });
      } else if (card.n) {
        // Has a real tracker row — "remove from board" means Discarded, not a file delete.
        await fetch("/api/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n: card.n, status: "Discarded" }) });
      }
    } catch {
      /* best-effort; the popup closing + refresh still reflects reality */
    }
    setBusy(false);
    router.refresh();
    onClose();
  };

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="mt-3 flex w-full items-center justify-center text-xs text-faint hover:text-red-500">
        Remove from board
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/[0.06] p-2.5 text-xs">
      <p className="text-foreground">Remove {card.company} from the board?</p>
      <div className="mt-2 flex gap-2">
        <button disabled={busy} onClick={remove} className="rounded-md bg-red-500 px-2.5 py-1 font-medium text-white hover:bg-red-600 disabled:opacity-50">
          {busy ? "Removing…" : "Remove"}
        </button>
        <button disabled={busy} onClick={() => setConfirming(false)} className="rounded-md border border-border px-2.5 py-1 text-muted hover:text-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}
