import fs from "node:fs";
import { NextRequest } from "next/server";
import { careerOpsRoot } from "@/lib/career-ops";
import { generationFile, readMeta } from "@/lib/resume/store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One saved generation: the PDF by default, ?format=tex for its source, ?format=json for
// its metadata including the JD.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const root = careerOpsRoot();
  const meta = readMeta(root, id);
  if (!meta) return Response.json({ error: "No such generation." }, { status: 404 });
  const format = req.nextUrl.searchParams.get("format");
  if (format === "json") return Response.json(meta);

  const kind = format === "tex" ? "tex" : "pdf";
  const file = generationFile(root, id, kind);
  if (!file) return Response.json({ error: "That generation's file is missing." }, { status: 404 });
  const name = kind === "tex" ? meta.file_name.replace(/\.pdf$/, ".tex") : meta.file_name;
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "Content-Type": kind === "tex" ? "application/x-tex; charset=utf-8" : "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers": "Content-Disposition",
    },
  });
}
