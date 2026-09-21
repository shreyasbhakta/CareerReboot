"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, FileText, Compass, ShieldCheck, Coins } from "lucide-react";
import { cn } from "@/lib/cn";
import { instrumentSerif } from "@/lib/fonts";
import { parseReport, scoreTone, legitimacyTone } from "@/lib/format";
import { useJobs, type Job } from "@/components/jobs/job-store";

const SEEN_KEY = "career-ops:first-score-seen";

// THE AHA — fires once, the first time an evaluation completes. The maintainer's
// north star: the WHY is the hero (a sentence that clearly read THIS CV and reasoned
// about THIS job), the grade is large-but-secondary. A celebration, not a report.
//
// Deliberately NOT a full-viewport, focus-trapping modal (it used to be, and it
// blocked the whole app — including the nav sidebar — until dismissed). The
// "show once ever" gate lives entirely in one localStorage write (`close()`
// below); if that write silently fails (private browsing, storage disabled/
// blocked by an extension, a sandboxed embed) `seen` never becomes true and
// this reappeared on EVERY future evaluate completion, each time re-blocking
// the screen — a celebration is a nice-to-have, and a nice-to-have must never
// be able to make the rest of the app unusable. A corner toast can misfire the
// same way without costing anything: it never intercepts clicks elsewhere and
// has nothing to get "stuck" open in front of.
const STYLE = `
.co-aha{position:fixed;right:1rem;bottom:1rem;z-index:60;width:min(23rem,calc(100vw - 2rem));animation:co-aha-in .35s ease both}
.co-aha__card{position:relative;border-radius:1.1rem;border:1px solid var(--border,hsl(0 0% 50% /.2));background:var(--bg);box-shadow:0 20px 50px -18px rgba(0,0,0,.45);overflow:hidden}
.co-aha__glow{position:absolute;inset:0;background:radial-gradient(80% 60% at 50% -10%, hsl(26 82% 55% /.18), transparent 70%);pointer-events:none}
.co-aha__grade{font-variant-numeric:tabular-nums;line-height:1}
@keyframes co-aha-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.co-aha{animation:none}}
`;

/** Pull the strongest "why this person" line out of the worker output. Prefer the
 *  VERDICT summary; else the first substantive sentence of the report body. */
function extractWhy(job: Job): string {
  const s = (job.result?.summary || "").trim();
  if (s.length > 30) return s.replace(/\.$/, "") + ".";
  const body = parseReport(job.text || "").body;
  const para = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/[#*>`-]/g, "").replace(/\s+/g, " ").trim())
    .find((p) => p.length > 60 && /\b(you|your|fit|match|strong|experience|background)\b/i.test(p));
  return para ? para.slice(0, 240) : "You're a strong match for this role — open the full report for the breakdown.";
}

export function FirstScoreView() {
  const router = useRouter();
  const { jobs } = useJobs();
  const [dismissed, setDismissed] = useState(false);
  const [seen, setSeen] = useState(true); // assume seen until we read localStorage (avoid flash)

  useEffect(() => {
    try {
      setSeen(localStorage.getItem(SEEN_KEY) === "1");
    } catch {
      setSeen(false);
    }
  }, []);

  const firstDone = useMemo(
    () => jobs.filter((j) => j.kind === "evaluate" && j.status === "done").sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))[0],
    [jobs],
  );

  // A non-modal toast needs none of a dialog's focus management — it never
  // steals focus, never traps Tab, and Escape-to-close is a courtesy, not a
  // requirement (nothing is "escaped FROM" since the rest of the page was
  // never blocked). See the STYLE comment above for why this stopped being a
  // trapping `role="dialog"` modal.
  const panelRef = useRef<HTMLDivElement>(null);
  const open = !seen && !dismissed && !!firstDone;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      try {
        localStorage.setItem(SEEN_KEY, "1"); // dismiss = seen (don't re-pop on reload)
      } catch {
        /* ignore */
      }
      setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const why = extractWhy(firstDone);
  const score = firstDone.result?.score ?? null;
  const meta = parseReport(firstDone.text || "");
  const legit = meta.legitimacy;
  const company = firstDone.title.replace(/^Evaluate\s*·\s*/, "");
  const role = firstDone.subtitle || "";
  const tone = score != null ? scoreTone(`${score}`) : "muted";

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="co-aha" role="status" aria-label="Your first score" onClick={close}>
      <style>{STYLE}</style>
      <div ref={panelRef} className="co-aha__card" onClick={(e) => e.stopPropagation()}>
        <div className="co-aha__glow" />
        <button onClick={close} aria-label="Close" className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-faint transition hover:text-foreground">
          <X className="size-4" />
        </button>

        <div className="relative px-7 pb-7 pt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">
            <span className="text-faint">//</span> the job we found you — scored
          </p>

          <div className="mt-4 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className={`${instrumentSerif.className} truncate text-2xl leading-tight text-foreground`}>{role || company}</h2>
              {role && <p className="truncate text-sm text-muted">{company}</p>}
            </div>
            {score != null && (
              <div className="shrink-0 text-right">
                <div
                  className={cn(
                    "co-aha__grade text-5xl font-semibold",
                    tone === "good" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : tone === "bad" ? "text-red-400" : "text-muted",
                  )}
                >
                  {score}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-faint">/ 5 fit</div>
              </div>
            )}
          </div>

          {/* THE WHY — the hero. A sentence that read THIS CV against THIS job. */}
          <blockquote className={`${instrumentSerif.className} mt-5 border-l-2 border-brand/40 pl-4 text-[19px] leading-snug text-foreground`}>
            <Sparkles className="mb-1 inline size-4 text-brand" /> {why}
          </blockquote>

          {legit && (
            <div
              className={cn(
                "mt-4 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                legitimacyTone(legit) === "good" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
              )}
            >
              <ShieldCheck className="size-3" /> Legitimacy: {legit}
            </div>
          )}

          <p className="mt-5 flex items-center gap-1.5 text-[12px] text-faint">
            <Coins className="size-3.5" /> That ran on your own AI. Everything before it — finding this job — was free.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => {
                close();
                router.push("/pipeline?tab=EVALUATED");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:brightness-110"
            >
              <FileText className="size-4" /> See the full report
            </button>
            <button
              onClick={() => {
                close();
                router.push("/explore");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface/50 px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-brand/40 hover:text-brand"
            >
              <Compass className="size-4" /> Find more like this
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
