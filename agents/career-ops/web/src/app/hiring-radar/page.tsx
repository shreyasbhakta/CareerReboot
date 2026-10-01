import { Crosshair } from "lucide-react";
import { HiringRadarView } from "@/components/hiring-radar/hiring-radar-view";

export const dynamic = "force-dynamic";

export default function HiringRadarPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center gap-3">
        <Crosshair className="size-6 text-brand" />
        <h1 className="font-display text-2xl tracking-tight text-landing">Hiring Radar</h1>
      </div>
      <p className="mt-1.5 max-w-2xl text-sm text-muted">
        Who is actively hiring for roles that match you <em>right now</em> — recent hiring posts, fresh job postings, the
        people behind them, and warm connections. Discovery only: nothing is ever sent, applied to or submitted.
      </p>
      <div className="mt-6">
        <HiringRadarView />
      </div>
    </div>
  );
}
