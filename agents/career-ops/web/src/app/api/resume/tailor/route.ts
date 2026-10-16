import { careerOpsRoot } from "@/lib/career-ops";
import { resolveCli } from "@/lib/clis";
import { compileTex } from "@/lib/resume/compile.mjs";
import { runClaude } from "@/lib/resume/model.mjs";
import { pdfFileName, saveGeneration } from "@/lib/resume/store.mjs";
import { tailorResume } from "@/lib/resume/tailor.mjs";
import { loadVariant, readTailorConfig } from "@/lib/resume/variants.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // up to two Claude calls and two pdflatex runs

const MAX_JD_BYTES = 50_000;

// POST { jd_text, base_variant, company_name? } -> the tailored one-page PDF. The keyword
// analysis rides in the X-Tailor-Report header (base64 JSON) so the body stays a plain PDF.
export async function POST(req: Request) {
  let body: { jd_text?: unknown; base_variant?: unknown; company_name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const jdText = typeof body.jd_text === "string" ? body.jd_text.trim() : "";
  const companyName = typeof body.company_name === "string" ? body.company_name.trim().slice(0, 120) : "";
  if (jdText.length < 50) return Response.json({ error: "Paste the job description first (at least a few sentences)." }, { status: 400 });
  if (Buffer.byteLength(jdText, "utf8") > MAX_JD_BYTES) return Response.json({ error: "That job description is over 50 KB. Trim it to the posting itself." }, { status: 413 });

  const root = careerOpsRoot();
  const cfg = readTailorConfig(root);
  const variantId = typeof body.base_variant === "string" ? body.base_variant : "";
  const variant = loadVariant(cfg.variantsDir, variantId);
  if (!variant.ok) return Response.json({ error: variant.error }, { status: variant.status });

  const claude = resolveCli("claude");
  if (!claude) return Response.json({ error: "Claude Code isn't installed on this machine, and the resume tailor runs on it." }, { status: 503 });

  const result = await tailorResume({
    jdText,
    companyName,
    profile: variant.profile,
    baseTex: variant.baseTex,
    runModel: (prompt: string) => runClaude({ binPath: claude.binPath, cwd: root, prompt }),
    compile: compileTex,
  });
  if (!result.ok) return Response.json({ error: result.error, report: result.report }, { status: result.status });

  const date = new Date();
  const company = companyName || result.report.company;
  const fileName = pdfFileName(cfg.filePrefix, company, date);
  let id: string;
  try {
    id = saveGeneration(root, {
      jdText,
      company,
      roleTitle: result.report.role_title,
      variant: variantId,
      tex: result.tex,
      pdf: result.pdf,
      report: result.report,
      fileName,
      date,
    });
  } catch (e) {
    // The PDF is still returned: losing the history entry must not lose the resume.
    console.error(`/api/resume/tailor: could not save the generation: ${e instanceof Error ? e.message : String(e)}`);
    result.report.warnings.push("The PDF was made but could not be saved to your history.");
    id = "";
  }

  const { company: _c, role_title: _r, ...analysis } = result.report;
  return new Response(new Uint8Array(result.pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Generation-Id": id,
      "X-Tailor-Report": Buffer.from(JSON.stringify(analysis)).toString("base64"),
      "Access-Control-Expose-Headers": "Content-Disposition, X-Generation-Id, X-Tailor-Report",
    },
  });
}
