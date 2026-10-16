import { careerOpsRoot } from "@/lib/career-ops";
import { listGenerations } from "@/lib/resume/store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Past tailored resumes, newest first, so one can be downloaded again without regenerating.
export async function GET() {
  return Response.json({ generations: listGenerations(careerOpsRoot()) });
}
