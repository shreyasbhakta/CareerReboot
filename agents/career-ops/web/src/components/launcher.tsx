"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Crosshair, FileText, LayoutDashboard, Sparkles } from "lucide-react";
import { CoMark } from "@/components/co-mark";
import { SettingsButton } from "@/components/settings/settings-dialog";
import { instrumentSerif } from "@/lib/fonts";
import { MODES, setMode, type Mode } from "@/lib/mode";

const CARDS: { mode: Mode; icon: typeof FileText; points: string[] }[] = [
  { mode: "complete", icon: LayoutDashboard, points: ["Application pipeline", "Explore & research", "Follow-ups & analytics", "Hiring Radar & CV builder"] },
  { mode: "fast", icon: Crosshair, points: ["Hiring Radar", "CV builder"] },
  { mode: "cv", icon: FileText, points: ["CV builder"] },
];

const EASE = [0.22, 1, 0.36, 1] as const;

// The spotlight gradient follows the pointer through CSS vars, no re-render.
const trackPointer = (e: React.PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

export function Launcher() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const open = (mode: Mode) => { setMode(mode); router.push(MODES[mode].home); };
  const enter = (delay: number, y = 24) => (reduce ? {} : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: EASE } });

  return (
    <main className="relative flex min-h-screen flex-col items-center px-6 pb-8 pt-20 md:pt-28">
      <motion.div className="flex flex-col items-center text-center" {...enter(0, -12)}>
        <div className="flex items-center gap-3">
          <CoMark size={44} />
          <h1 className={`${instrumentSerif.className} text-gradient text-5xl font-semibold tracking-tight md:text-7xl`}>CareerReboot</h1>
        </div>
        <p className="mt-4 max-w-lg text-[15px] text-muted md:text-base">Your job search, on your machine. Pick how you want to work today.</p>
      </motion.div>

      <div className="mt-12 grid w-full max-w-5xl gap-5 md:grid-cols-3">
        {CARDS.map(({ mode, icon: Icon, points }, i) => (
          <motion.button
            key={mode}
            type="button"
            onClick={() => open(mode)}
            onPointerMove={trackPointer}
            {...enter(0.15 + i * 0.1)}
            whileHover={reduce ? undefined : { y: -6 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            className="glass spotlight group flex cursor-pointer flex-col rounded-3xl p-6 text-left transition-[border-color,box-shadow] duration-300 hover:border-brand/50 hover:shadow-[0_24px_60px_-20px_var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <span className="flex items-start justify-between">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/30 to-brand-secondary/20 text-brand-text ring-1 ring-inset ring-brand/30">
                <Icon className="size-5" />
              </span>
              {mode === "complete" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-text">
                  <Sparkles className="size-3" /> Everything
                </span>
              )}
            </span>
            <span className={`${instrumentSerif.className} mt-5 text-2xl font-medium text-foreground`}>{MODES[mode].label}</span>
            <span className="mt-1 text-sm text-muted">{MODES[mode].tagline}</span>
            <ul className="mt-5 flex flex-wrap gap-1.5">
              {points.map((p) => <li key={p} className="rounded-full border border-border/80 bg-surface/40 px-2.5 py-0.5 text-[11px] text-muted">{p}</li>)}
            </ul>
            <span className="btn-shine mt-6 inline-flex items-center gap-1.5 self-start rounded-full px-4 py-1.5 text-sm font-medium text-foreground">
              Open <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </span>
          </motion.button>
        ))}
      </div>

      <motion.div className="mt-auto flex flex-col items-center gap-4 pt-14" {...enter(0.5, 12)}>
        <SettingsButton variant="dock" />
        <footer className="text-xs text-faint">
          Your data stays on this machine · <Link href="/legal" className="underline-offset-2 hover:text-muted hover:underline">Legal &amp; attributions</Link>
        </footer>
      </motion.div>
    </main>
  );
}
