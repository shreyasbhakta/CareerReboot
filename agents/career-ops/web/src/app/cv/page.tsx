import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { CvEditor } from "@/components/cv-editor";
import { readApplications, pdfReadyForReport, readReport, careerOpsRoot, extractUrlFromNotes } from "@/lib/career-ops";
import { parseReport, canonStatus } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CvPage() {
  const applications = readApplications().filter((a) => canonStatus(a.status).includes("EVALUATED"));

  const readyToApply = await Promise.all(
    applications.map(async (a) => {
      const report = readReport(a.n);
      // A "Proceed without evaluation" row has no report at all — its posting
      // URL, if it has one, only survives in `notes` (see extractUrlFromNotes).
      const url = report ? parseReport(report.content).fields.find((f) => f.label === "URL")?.value : extractUrlFromNotes(a.notes);
      return {
        n: a.n,
        company: a.company,
        role: a.role,
        pdfReady: await pdfReadyForReport(a.n),
        reportUrl: url && url.startsWith("http") ? url : undefined,
      };
    }),
  );

  // The LaTeX editor tab only appears when the user has actually opted into
  // config/profile.yml's `cv.output_format: latex` — same config the
  // tailored-CV and default-resume pipelines already branch on (pdf-paths.mjs's
  // resolveLatexSource), but checked WITHOUT requiring the file to exist yet:
  // a latex-mode user with no resume.tex written yet should still see the tab
  // to create one, not have it silently withheld.
  let latexSourceName: string | null = null;
  try {
    const root = careerOpsRoot();
    const profile = yaml.load(fs.readFileSync(path.join(root, "config", "profile.yml"), "utf8")) as
      | { cv?: { output_format?: string }; latex?: { source?: string } }
      | undefined;
    if (profile?.cv?.output_format === "latex") latexSourceName = profile?.latex?.source || "resume.tex";
  } catch {
    /* no profile.yml yet — LaTeX tab stays hidden, matching resolveLatexSource's own fallback */
  }

  return <CvEditor readyToApply={readyToApply} latexSourceName={latexSourceName} />;
}
