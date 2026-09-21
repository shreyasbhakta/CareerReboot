import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot, rootScript, readApplications } from "@/lib/career-ops";
import { companySlug } from "@/lib/company-slug.mjs";

const run = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Proceed without evaluation" — the Kanban's Evaluate column has no way to
// move a card onward without a real AI evaluation. This is that escape hatch,
// but it stays honest about what it is: it writes a REAL tracker row (through
// the same reserve-number → TSV → merge-tracker.mjs path a real evaluation
// uses — never a hand-edit of applications.md, per the data contract), with
// the score column holding the documented "no evaluation" sentinel (N/A) and
// no report link, rather than inventing a score or a report that was never
// produced. Once this row exists, the Kanban's own fuzzy company+role match
// (findEvaluatedApplication) picks it up automatically and the card moves
// itself out of Evaluate — no separate "remove from pipeline" step needed.
export async function POST(req: Request) {
  let body: { url?: string; company?: string; role?: string; location?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!url || !company || !role) {
    return Response.json({ error: "url, company, and role are required" }, { status: 400 });
  }

  const root = careerOpsRoot();
  const reserveScript = rootScript("reserve-report-num");
  const mergeScript = rootScript("merge-tracker");
  if (!fs.existsSync(reserveScript) || !fs.existsSync(mergeScript)) {
    return Response.json({ error: "this checkout has data only, not the career-ops scripts" }, { status: 503 });
  }

  let n = "";
  try {
    const { stdout } = await run(process.execPath, [reserveScript], { cwd: root, timeout: 15_000 });
    n = stdout.trim();
    if (!/^\d+$/.test(n)) throw new Error(`unexpected reservation output: ${n.slice(0, 100)}`);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 200) : "could not reserve a tracker number" }, { status: 500 });
  }

  const release = () => run(process.execPath, [reserveScript, "--release", n], { cwd: root, timeout: 15_000 }).catch(() => {});

  try {
    const slug = companySlug(company)?.slug || "company";
    const today = new Date().toISOString().slice(0, 10);
    // applications.md has NO url column (see reportUrlMap's own comment in
    // page.tsx) — the `url` TSV field below is used only for merge-tracker's
    // dedup pass and then gone; nothing else ever reads it back from the
    // tracker. Without a report file to pull "**URL:**" from either (there is
    // none — no evaluation ran), this row's posting URL would be unrecoverable
    // the moment this request finishes, breaking anything that needs it later
    // (Apply, and "move back to Evaluate" needs it to re-add the pipeline
    // row). Embedding it in `notes` with a parseable marker (extractUrlFromNotes,
    // career-ops.ts) is the one durable place left to put it.
    const notes = `Skipped evaluation — added manually from the Dashboard. [url: ${url}]`;
    // Same 10-field header+row contract AGENTS.md documents for every tracker
    // addition (num/date/company/role/status/score/pdf/report/notes/url) —
    // N/A score is the documented backfill sentinel for "no evaluation ran"
    // (#1799), and the report cell is a plain non-link value (merge-tracker's
    // normalizeReportLink only rewrites `](reports/...)` patterns and leaves
    // any other string untouched, so this doesn't need to look like a link).
    const tsv = [
      "num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl",
      `${n}\t${today}\t${company}\t${role}\t${"Evaluated"}\tN/A\t❌\tN/A\t${notes}\t${url}`,
    ].join("\n") + "\n";

    const additionsDir = path.join(root, "batch", "tracker-additions");
    fs.mkdirSync(additionsDir, { recursive: true });
    fs.writeFileSync(path.join(additionsDir, `${n}-${slug}.tsv`), tsv, "utf8");

    await run(process.execPath, [mergeScript], { cwd: root, timeout: 30_000 });

    // Verify rather than trust the exit code — merge-tracker can reject a row
    // (a bad header, a duplicate) without a non-zero exit, and this is the
    // one caller that has to tell "merged" apart from "silently skipped".
    // reserve-report-num.mjs's stdout is zero-padded ("006"); merge-tracker
    // writes the tracker's own # column WITHOUT padding ("6") — compare
    // numerically so this isn't a false negative on every single row.
    const merged = readApplications().find((a) => Number(a.n) === Number(n));
    if (!merged) {
      await release();
      return Response.json({ error: "merge-tracker did not add the row — check server logs for why it was skipped" }, { status: 500 });
    }
    return Response.json({ ok: true, n: merged.n });
  } catch (e) {
    await release();
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 200) : "could not create the tracker row" }, { status: 500 });
  }
}
