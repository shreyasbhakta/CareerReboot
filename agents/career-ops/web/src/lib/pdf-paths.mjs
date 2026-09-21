/**
 * pdf-paths.mjs — deterministic scratch + final paths for a web "pdf" run (#2172).
 *
 * Plain .mjs (same pattern as clean-chips.mjs / tracker-table.mjs) so this can
 * be unit-tested with `node --test`, no TypeScript build step. `careerOpsRoot`
 * and `findReportFile` are passed in rather than imported from career-ops.ts,
 * keeping this module free of TypeScript dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

/**
 * Lowercase, non-alphanumeric runs -> single hyphen, trimmed.
 * @param {string} s
 * @returns {string}
 */
export function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * @typedef {Object} PdfPaths
 * @property {string} html - Where the backend writes the tailored HTML it parsed out of the agent's envelope (#2185).
 * @property {string} finalPdf - Where the backend renders the final PDF (output/cv-{candidate}-{company}-{date}.pdf).
 */

/**
 * Shared by resolvePdfPaths and resolveLatexPdfPaths: the report number ->
 * {companySlug, candidateSlug} lookup neither format-specific path needs to
 * duplicate. Validates `input` itself (both callers path.join it) so neither
 * forgets the "../" guard resolvePdfPaths already carried.
 * @param {string} input
 * @param {string} root
 * @param {(input: string) => string | null} findReportFile
 * @returns {{ok: true, companySlug: string, candidateSlug: string} | {ok: false, error: string}}
 */
function resolveCvSlugs(input, root, findReportFile) {
  if (!/^\d+$/.test(input)) {
    return { ok: false, error: `Invalid report selector: "${input}"` };
  }
  const reportFile = findReportFile(input);
  if (!reportFile) {
    return { ok: false, error: `No report #${input} found — evaluate this posting first.` };
  }
  const companyMatch = path.basename(reportFile).match(/^\d+-(.+)-\d{4}-\d{2}-\d{2}\.md$/);
  const companySlug = companyMatch ? companyMatch[1] : "company";
  let candidateSlug = "candidate";
  try {
    // js-yaml v4's load() uses the safe default schema (no arbitrary type
    // construction, unlike Python's PyYAML) — same pattern already used in
    // web/src/app/api/profile/route.ts and portals/route.ts.
    const profile = yaml.load(fs.readFileSync(path.join(root, "config", "profile.yml"), "utf8"));
    if (profile?.candidate?.full_name) candidateSlug = slugify(profile.candidate.full_name);
  } catch (err) {
    // A missing profile.yml is expected (not every checkout has one yet) and
    // falls back silently. Anything else — a real YAML syntax error in the
    // user's own file — should not fail silently forever; it would otherwise
    // produce a wrong-but-plausible-looking filename with zero signal.
    if (err?.code !== "ENOENT") {
      console.warn(`resolveCvSlugs: could not read/parse config/profile.yml, defaulting candidate slug: ${err.message}`);
    }
  }
  return { ok: true, companySlug, candidateSlug };
}

/**
 * Precompute the scratch HTML and final PDF paths for a "pdf" run, so the
 * agent never chooses its own filenames — the backend owns naming, writing
 * (#2185) and rendering. Framework-agnostic: returns a result instead of
 * constructing a Response, so the caller (a Next.js route today) decides how
 * to surface `ok: false`. Side effect: creates `.career-ops-web/pdf-tmp/`
 * under `root` if it doesn't exist yet — this is NOT a pure path computation,
 * despite the name.
 * @param {string} input - The report number (e.g. "018").
 * @param {string} today - YYYY-MM-DD.
 * @param {string} root - careerOpsRoot().
 * @param {(input: string) => string | null} findReportFile - career-ops.ts's findReportFile.
 * @returns {{ok: true, paths: PdfPaths} | {ok: false, error: string}}
 */
export function resolvePdfPaths(input, today, root, findReportFile) {
  const slugs = resolveCvSlugs(input, root, findReportFile);
  if (!slugs.ok) return slugs;
  const scratchDir = path.join(root, ".career-ops-web", "pdf-tmp");
  fs.mkdirSync(scratchDir, { recursive: true });
  return {
    ok: true,
    paths: {
      html: path.join(scratchDir, `cv-web-${input}.html`),
      finalPdf: path.join(root, "output", `cv-${slugs.candidateSlug}-${slugs.companySlug}-${today}.pdf`),
    },
  };
}

/**
 * Is this checkout configured for the LaTeX pdf path (config/profile.yml's
 * `cv.output_format: latex`), and does its source .tex file actually exist?
 * Mirrors modes/latex-tex.md's own resolution order: `latex.source` if set,
 * else resume.tex, else cv.tex, all relative to `root`.
 *
 * Returns the resolved absolute path only when BOTH the mode is opted into
 * AND the file is actually there — a missing file falls back to the HTML
 * path rather than erroring, since "not configured" and "misconfigured"
 * should not surface as the same failure this deep in a pdf run.
 * @param {string} root
 * @returns {string | null}
 */
export function resolveLatexSource(root) {
  let profile;
  try {
    profile = yaml.load(fs.readFileSync(path.join(root, "config", "profile.yml"), "utf8"));
  } catch {
    return null;
  }
  if (profile?.cv?.output_format !== "latex") return null;
  const candidates = [profile?.latex?.source, "resume.tex", "cv.tex"].filter(Boolean);
  for (const rel of candidates) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/**
 * @typedef {Object} LatexPdfPaths
 * @property {string} tex - Where the backend writes the tailored .tex it parsed out of the agent's envelope.
 * @property {string} finalTex - Where the backend copies the tailored .tex once compiled (output/cv-{candidate}-{company}-{date}.tex) — kept alongside the PDF so the user can hand-edit and recompile.
 * @property {string} finalPdf - Where generate-latex.mjs writes the compiled PDF.
 */

/**
 * LaTeX counterpart to resolvePdfPaths — same naming convention, same slug
 * lookup, different scratch extension and an extra finalTex (the HTML path
 * has no analogous "final source" artifact worth keeping; a compiled .tex is
 * worth handing back since the user may want to tweak and recompile it
 * themselves, same reason modes/latex-tex.md's own pipeline keeps one).
 * @param {string} input
 * @param {string} today
 * @param {string} root
 * @param {(input: string) => string | null} findReportFile
 * @returns {{ok: true, paths: LatexPdfPaths} | {ok: false, error: string}}
 */
export function resolveLatexPdfPaths(input, today, root, findReportFile) {
  const slugs = resolveCvSlugs(input, root, findReportFile);
  if (!slugs.ok) return slugs;
  const scratchDir = path.join(root, ".career-ops-web", "pdf-tmp");
  fs.mkdirSync(scratchDir, { recursive: true });
  const base = `cv-${slugs.candidateSlug}-${slugs.companySlug}-${today}`;
  return {
    ok: true,
    paths: {
      tex: path.join(scratchDir, `cv-web-${input}.tex`),
      finalTex: path.join(root, "output", `${base}.tex`),
      finalPdf: path.join(root, "output", `${base}.pdf`),
    },
  };
}
