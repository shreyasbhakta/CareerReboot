import { discardPipelineOffer } from "@/lib/core/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Backs the Inbox's discard ("✕") button — see discardPipelineOffer's own doc
// for why this needs two writes (remove from pipeline.md AND record a
// permanent scan-history.tsv entry), not just one.
export async function POST(req: Request) {
  let body: { url?: string; company?: string; title?: string; location?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.url) return Response.json({ error: "url required" }, { status: 400 });

  const result = await discardPipelineOffer({ url: body.url, company: body.company, title: body.title, location: body.location, source: body.source });
  if (result.error) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  return Response.json(result);
}
