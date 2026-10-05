"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CoMark } from "@/components/co-mark";
import { AssistantConsole } from "@/components/assistant-console";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { BackToTop } from "@/components/back-to-top";
import { JobsProvider } from "@/components/jobs/job-store";
import { PipelineProvider } from "@/components/pipeline/pipeline-provider";
import { ApplyProvider } from "@/components/apply/apply-provider";
import { ExploreProvider } from "@/components/explore/explore-provider";
import { FirstScoreView } from "@/components/explore/first-score-view";
import { WorkerPills } from "@/components/jobs/worker-pills";
import { UsageMeter } from "@/components/usage-meter";
import { SettingsButton } from "@/components/settings/settings-dialog";
// BetaBanner (upstream career-ops-hq/career-ops issue reporter) intentionally
// not imported here — it files bugs against the upstream repo, which isn't
// meaningful for this personal instance.
import { instrumentSerif } from "@/lib/fonts";
import { isActivePath } from "@/lib/nav-items";
import { MODES, navFor, useMode } from "@/lib/mode";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mode = useMode();
  // The launcher and legal pages render standalone: no sidebar and no providers that fire API calls.
  if (pathname === "/" || pathname === "/legal") return <>{children}</>;
  return (
    <JobsProvider>
      <PipelineProvider>
      <ApplyProvider>
      <ExploreProvider>
      <MobileNav />
      <div className="flex min-h-screen">
        <aside className="glass sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto rounded-none border-y-0 border-l-0 p-4 md:flex">
          <Link href="/" className="mb-8 flex items-center gap-2.5 px-1">
            <CoMark size={32} />
            <span className={`${instrumentSerif.className} relative -top-px text-2xl font-normal tracking-tight text-landing`}>
              CareerReboot
            </span>
          </Link>
          <nav className="flex flex-col gap-1">
            {navFor(mode).map(({ href, label, icon: Icon, chip }) => {
              const active = isActivePath(href, pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-brand-soft text-brand-text"
                      : "text-muted hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                  {chip && (
                    <span className="ml-auto rounded-full border border-brand/30 bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-text">
                      {chip}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <Link href="/" className="mt-3 rounded-md px-3 py-1.5 text-xs text-faint transition-colors hover:bg-surface-hover hover:text-foreground">
            {MODES[mode].label} mode · switch
          </Link>

          <WorkerPills />

          <div className="mt-auto space-y-3 pt-4">
            <UsageMeter />
            <SettingsButton variant="sidebar" />
            <div className="flex items-center justify-between px-1">
              <Link href="/legal" className={`${instrumentSerif.className} text-sm text-faint hover:text-muted`}>v2 · legal</Link>
              <ThemeToggle />
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-x-hidden">{children}</main>
        <AssistantConsole />
        <BackToTop />
        <FirstScoreView />
      </div>
      </ExploreProvider>
      </ApplyProvider>
      </PipelineProvider>
    </JobsProvider>
  );
}
