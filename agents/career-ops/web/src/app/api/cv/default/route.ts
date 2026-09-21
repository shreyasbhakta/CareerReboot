import { spawn } from "node:child_process";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { resolveLatexSource } from "@/lib/pdf-paths.mjs";
import { spawnGenerateLatex } from "@/lib/pdf-render.mjs";
import { resolveDefaultCv } from "@/lib/apply/cv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "Apply with Default Resume" — compiles the user's OWN resume.tex as-is, with
// NO agent tailoring pass (unlike kind:"pdf" in /api/run, which always spends
// tokens rewriting content for one specific job). Same compile step
// (generate-latex.mjs --compile-only) the tailored pipeline uses, just pointed
// straight at the source file instead of an agent-tailored copy — this is
// intentionally the fast, free, always-available fallback for a job the user
// doesn't want to spend tokens tailoring for.
export async function GET() {
  return Response.json({ ready: !!resolveDefaultCv() });
}

export async function POST() {
  const root = careerOpsRoot();
  const source = resolveLatexSource(root);
  if (!source) {
    return Response.json(
      { error: "No LaTeX resume configured (config/profile.yml cv.output_format must be 'latex' with a resume.tex present). HTML-mode default resumes aren't supported yet." },
      { status: 400 },
    );
  }
  const finalPdf = path.join(root, "output", "cv-default.pdf");
  const result = await spawnGenerateLatex({ spawnFn: spawn, execPath: process.execPath, root, tex: source, finalPdf });
  if (!result.ok) {
    return Response.json({ error: result.stderr.slice(0, 300) || "Compilation failed." }, { status: 500 });
  }
  return Response.json({ ready: true });
}
