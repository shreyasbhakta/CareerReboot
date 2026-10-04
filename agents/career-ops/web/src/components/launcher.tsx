"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Crosshair, FileText, LayoutDashboard } from "lucide-react";
import { CoMark } from "@/components/co-mark";
import { HeroGlow } from "@/components/hero-glow";
import { instrumentSerif } from "@/lib/fonts";
import { MODES, setMode, type Mode } from "@/lib/mode";

const CARDS: { mode: Mode; icon: typeof FileText; points: string[] }[] = [
  { mode: "complete", icon: LayoutDashboard, points: ["Application pipeline", "Explore & research", "Follow-ups & analytics", "Hiring Radar & CV builder"] },
  { mode: "fast", icon: Crosshair, points: ["Hiring Radar", "CV builder"] },
  { mode: "cv", icon: FileText, points: ["CV builder"] },
];

export function Launcher() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const open = (mode: Mode) => { setMode(mode); router.push(MODES[mode].home); };
  const rise = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: 0.1 + i * 0.1, ease: [0.22, 1, 0.36, 1] as const } });

  return (
    <main className="dot-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
      <HeroGlow />
      <motion.div className="relative z-10 flex flex-col items-center text-center" {...(reduce ? {} : { initial: { opacity: 0, y: -12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5 } })}>
        <CoMark size={44} />
        <h1 className={`${instrumentSerif.className} mt-4 text-5xl tracking-tight text-landing md:text-6xl`}>CareerReboot</h1>
        <p className="mt-3 max-w-md text-[15px] text-muted">Choose how you want to work today.</p>
      </motion.div>

      <div className="relative z-10 mt-10 grid w-full max-w-4xl gap-4 md:grid-cols-3">
        {CARDS.map(({ mode, icon: Icon, points }, i) => (
          <motion.button
            key={mode}
            type="button"
            onClick={() => open(mode)}
            {...rise(i)}
            whileHover={reduce ? undefined : { y: -6 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            className="group flex flex-col rounded-2xl border border-border bg-surface/70 p-6 text-left shadow-sm backdrop-blur transition-colors hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-text"><Icon className="size-5" /></span>
            <span className={`${instrumentSerif.className} mt-4 text-2xl text-landing`}>{MODES[mode].label}</span>
            <span className="mt-1 text-sm text-muted">{MODES[mode].tagline}</span>
            <ul className="mt-4 space-y-1 text-xs text-faint">{points.map((p) => <li key={p}>· {p}</li>)}</ul>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-text">
              Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </motion.button>
        ))}
      </div>

      <footer className="relative z-10 mt-12 text-xs text-faint">
        Local-first · your data stays on your machine · <Link href="/legal" className="underline-offset-2 hover:text-muted hover:underline">Legal &amp; attributions</Link>
      </footer>
    </main>
  );
}
