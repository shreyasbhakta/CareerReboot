"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Lock } from "lucide-react";
import { useApply } from "@/components/apply/apply-provider";

// Distinct from ApplyButton (apply-button.tsx): this deliberately bypasses the
// tailored CV entirely, compiling (if needed) and attaching the user's own
// untailored resume.tex — for a job the user doesn't want to spend tailoring
// tokens on. Never falls back to a tailored CV even if one already exists
// (see /api/apply/fill's useDefaultCv contract). Shared by the Dashboard's
// Ready-to-Apply popup and the CV page's Ready-to-Apply workspace.
export function ApplyWithDefaultButton({ n, url, company }: { n: string; url?: string; company: string }) {
  const router = useRouter();
  const apply = useApply();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasUrl = !!url && /^https?:\/\//i.test(url);

  if (!hasUrl) {
    return (
      <button
        type="button"
        disabled
        title="No application URL on this report"
        className="inline-flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-faint"
      >
        <Lock className="size-3.5" /> Apply with default resume
      </button>
    );
  }

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const check = await fetch("/api/cv/default").then((r) => r.json());
      if (!check.ready) {
        const compiled = await fetch("/api/cv/default", { method: "POST" }).then((r) => r.json());
        if (compiled.error) {
          setError(compiled.error);
          setBusy(false);
          return;
        }
      }
      const { pathname, search, hash } = window.location;
      await apply.open(url!, { prefill: true, company, n, from: `${pathname}${search}${hash}`, useDefaultCv: true });
      router.push("/apply");
    } catch {
      setError("Couldn't prepare the default resume.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={go}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-brand/40 hover:text-brand disabled:opacity-50"
        title="Apply using your default (untailored) resume, no tailoring pass"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
        Apply with default resume
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
