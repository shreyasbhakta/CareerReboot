"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

// A direct "clear the whole inbox" action (as opposed to triaging rows one by
// one) — POST /api/pipeline/clear wipes data/pipeline.md back to empty,
// backing it up first (see resetPipeline in lib/core/pipeline.ts). Same
// confirm-before-destructive-action shape as DeleteFromTracker, since this is
// the same class of action: blunt, all-or-nothing, recoverable only via the
// backup file, not an in-app undo.
export function ClearPipeline({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (count === 0) return null;

  async function confirmClear() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/pipeline/clear", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Clear failed.");
        setBusy(false);
        return;
      }
      setOpen(false);
      setBusy(false);
      router.refresh();
    } catch {
      setErr("Clear failed.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:border-red-400/50 hover:text-red-500"
      >
        <Trash2 className="size-3.5" /> Clear pipeline
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-400/30 bg-red-500/[0.06] p-3 text-xs">
      <p className="font-medium text-foreground">
        Clear all {count} pending job{count === 1 ? "" : "s"} from the inbox?
      </p>
      <p className="mt-1 text-muted">
        The current file is backed up to <code>.career-ops-backups/</code> first. Your tracker (applications, reports, scores) is untouched.
      </p>
      {err && <p className="mt-1.5 text-red-500">{err}</p>}
      <div className="mt-2.5 flex gap-2">
        <button
          disabled={busy}
          onClick={confirmClear}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1 font-medium max-sm:min-h-[44px] text-white transition-colors hover:bg-red-600 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Clear
        </button>
        <button
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-2.5 py-1 text-muted max-sm:min-h-[44px] transition-colors hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
