import { resetPipeline } from "@/lib/core/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Backs the Pipeline page's "Clear pipeline" button — wipes data/pipeline.md
// (Pending + Processed) back to empty. A plain POST with no body: this is a
// blunt, all-or-nothing reset, not a filtered delete, so there is nothing for
// a request body to parameterize.
export async function POST() {
  const result = await resetPipeline();
  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  return Response.json(result);
}
