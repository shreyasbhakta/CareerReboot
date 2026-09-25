import { Sparkles } from "lucide-react";
import { ResearchView } from "@/components/research/research-view";

export const dynamic = "force-dynamic";

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center gap-3">
        <Sparkles className="size-6 text-brand" />
        <h1 className="font-display text-2xl tracking-tight text-landing">Research</h1>
      </div>
      <p className="mt-1.5 max-w-xl text-sm text-muted">
        Experimental elite-recruiter-grade triage over your own tracked companies — fit-scored and tiered
        (Apply Today / Recruiter Outreach / Watch / Stretch), zero LLM cost. This is a separate side track from
        the main pipeline; see <code className="text-muted">job-finding-research/README.md</code> in the repo.
      </p>
      <p className="mt-1.5 text-xs text-faint">
        Runs the real Ashby / Greenhouse / Lever / SmartRecruiters providers against{" "}
        <code className="text-muted">portals.yml</code>&apos;s tracked companies, scores each posting against{" "}
        <code className="text-muted">job-finding-research/candidate-profile.yml</code>. For deeper reasoning
        (recruiter research, outreach drafts, real JD understanding), hand the results to Claude with{" "}
        <code className="text-muted">job-finding-research/SKILL.md</code>.
      </p>

      <div className="mt-8">
        <ResearchView />
      </div>
    </div>
  );
}
