import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import type { DiscoveredOffer } from "./scan";

const PIPELINE_REL = path.join("data", "pipeline.md");

/**
 * "Add to pipeline" — appends user-selected discovered offers to data/pipeline.md
 * AND records them in data/scan-history.tsv (so future scans dedup them). We reuse
 * the CANONICAL writers exported by the core's scan.mjs (`appendToPipeline`,
 * `appendToScanHistory`) instead of re-implementing the line format / section
 * markers — single source of truth, per the web↔core contract. We invoke them in
 * a short-lived node process (cwd = the user's career-ops root) so the core's own
 * code does the writing; the web never owns a parallel copy of that logic.
 *
 * Discovered-but-not-added offers stay "new" (a dry-run scan writes nothing);
 * only an explicit add records them as seen. No tokens are spent here.
 */
export type AddResult = { added: number; error?: string };

export function addOffersToPipeline(offers: DiscoveredOffer[]): Promise<AddResult> {
  const clean = offers
    .filter((o) => o && typeof o.url === "string" && /^https?:\/\//i.test(o.url))
    .map((o) => ({
      url: o.url,
      company: o.company || "",
      title: o.title || "",
      location: o.location || "",
      source: o.source || o.ats || "explorer",
      // Preserve the optional per-offer signal so it survives to pipeline.md.
      // The core writer treats an empty note as absent (byte-identical output).
      note: o.note || "",
      // This IS the user's explicit "Save"/"Add to pipeline" action — the one
      // and only web call site that should ever set this (see the Kanban
      // board's Evaluate-column filter, and formatPipelineOffer's own doc).
      saved: true,
    }));
  if (clean.length === 0) return Promise.resolve({ added: 0 });

  // Data-only / pre-scan-ats checkout has no scan.mjs writers → fail with an
  // actionable message instead of a silent added:0.
  if (!fs.existsSync(rootScript("scan"))) {
    return Promise.resolve({ added: 0, error: "This checkout is data-only — the pipeline writer (scan.mjs) isn't available." });
  }

  const scanUrl = pathToFileURL(rootScript("scan")).href;
  const localTodayUrl = pathToFileURL(path.join(careerOpsRoot(), "lib", "local-today.mjs")).href;
  const code = `
import { appendToPipeline, appendToScanHistory } from ${JSON.stringify(scanUrl)};
import { localToday } from ${JSON.stringify(localTodayUrl)};
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { input += d; });
process.stdin.on("end", async () => {
  try {
    const offers = JSON.parse(input);
    // LOCAL calendar day, not the UTC one — west of Greenwich, an evening
    // add would otherwise stamp scan-history.tsv's first_seen a day ahead,
    // opening scan.mjs's recheck/cooldown gate a day late for this row (#3070).
    const date = localToday();
    await appendToPipeline(offers);
    await appendToScanHistory(offers, date, "added");
    process.stdout.write(JSON.stringify({ added: offers.length }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ added: 0, error: String((e && e.message) || e) }));
  }
});
`;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      cwd: careerOpsRoot(),
      env: process.env,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => resolve({ added: 0, error: e instanceof Error ? e.message : "spawn failed" }));
    child.on("close", () => {
      try {
        const parsed = JSON.parse(out.trim() || "{}") as AddResult;
        resolve({ added: parsed.added ?? 0, error: parsed.error });
      } catch {
        resolve({ added: 0, error: err.trim().slice(0, 200) || "writer returned no result" });
      }
    });
    child.stdin.write(JSON.stringify(clean));
    child.stdin.end();
  });
}

/**
 * "Clear pipeline" button — wipes every row from data/pipeline.md (Pending
 * AND Processed) back to the canonical empty skeleton. Delegates the actual
 * reset to the core's `clearPipeline` (scan.mjs) the same way addOffersToPipeline
 * delegates its write, so there's one lock (pipeline-lock.mjs) and one skeleton
 * definition instead of a second copy drifting in the web layer.
 *
 * The backup is this function's own concern, not the core primitive's: a
 * plain filesystem copy taken right before the reset, so a wrong click is
 * recoverable even though the button itself has no undo. Best-effort — a
 * failed copy (e.g. a full disk) still lets the user's explicit "clear" go
 * through rather than silently blocking on a courtesy step.
 */
export type ClearResult = { cleared: number; backupPath?: string; error?: string };

export function resetPipeline(): Promise<ClearResult> {
  if (!fs.existsSync(rootScript("scan"))) {
    return Promise.resolve({ cleared: 0, error: "This checkout is data-only — the pipeline writer (scan.mjs) isn't available." });
  }

  const pipelinePath = path.join(careerOpsRoot(), PIPELINE_REL);
  let backupPath: string | undefined;
  try {
    if (fs.existsSync(pipelinePath)) {
      const backupDir = path.join(careerOpsRoot(), ".career-ops-backups");
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupPath = path.join(backupDir, `pipeline-${stamp}.md`);
      fs.copyFileSync(pipelinePath, backupPath);
    }
  } catch {
    backupPath = undefined;
  }

  const scanUrl = pathToFileURL(rootScript("scan")).href;
  const code = `
import { clearPipeline } from ${JSON.stringify(scanUrl)};
clearPipeline().then((r) => {
  process.stdout.write(JSON.stringify(r));
}).catch((e) => {
  process.stdout.write(JSON.stringify({ cleared: 0, error: String((e && e.message) || e) }));
});
`;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      cwd: careerOpsRoot(),
      env: process.env,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => resolve({ cleared: 0, error: e instanceof Error ? e.message : "spawn failed", backupPath }));
    child.on("close", () => {
      try {
        const parsed = JSON.parse(out.trim() || "{}") as { cleared?: number; error?: string };
        resolve({ cleared: parsed.cleared ?? 0, error: parsed.error, backupPath });
      } catch {
        resolve({ cleared: 0, error: err.trim().slice(0, 200) || "writer returned no result", backupPath });
      }
    });
  });
}

/**
 * Inbox "discard" (the ✕ button) — the bug it fixes: discarding used to be
 * client-side only (a localStorage hide), so the posting stayed in
 * data/pipeline.md on disk and could resurface in a fresh scan or on a
 * different browser. This makes it durable in the two places that actually
 * need it: removes the row from pipeline.md via the core's removeFromPipeline
 * (same lock as every other pipeline writer), and records it in
 * scan-history.tsv with status 'discarded' — any status other than the
 * literal 'added' is deduped PERMANENTLY by shouldDedupScanHistoryRow, with
 * no recheck_after_days reopening, which is what "should not come in a new
 * run" actually requires (removing the row alone isn't enough: pipeline.md's
 * own content is one of loadSeenUrls' three sources, so deleting it without
 * also recording scan-history.tsv would make the URL look UNSEEN again).
 */
export type DiscardResult = { removed: number; error?: string };

export function discardPipelineOffer(offer: { url: string; company?: string; title?: string; location?: string; source?: string }): Promise<DiscardResult> {
  if (!offer?.url || !/^https?:\/\//i.test(offer.url)) return Promise.resolve({ removed: 0, error: "invalid url" });
  if (!fs.existsSync(rootScript("scan"))) {
    return Promise.resolve({ removed: 0, error: "This checkout is data-only — the pipeline writer (scan.mjs) isn't available." });
  }

  const scanUrl = pathToFileURL(rootScript("scan")).href;
  const localTodayUrl = pathToFileURL(path.join(careerOpsRoot(), "lib", "local-today.mjs")).href;
  const code = `
import { removeFromPipeline, appendToScanHistory } from ${JSON.stringify(scanUrl)};
import { localToday } from ${JSON.stringify(localTodayUrl)};
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { input += d; });
process.stdin.on("end", async () => {
  try {
    const offer = JSON.parse(input);
    const { removed } = await removeFromPipeline([offer.url]);
    await appendToScanHistory([offer], localToday(), "discarded");
    process.stdout.write(JSON.stringify({ removed }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ removed: 0, error: String((e && e.message) || e) }));
  }
});
`;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      cwd: careerOpsRoot(),
      env: process.env,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => resolve({ removed: 0, error: e instanceof Error ? e.message : "spawn failed" }));
    child.on("close", () => {
      try {
        const parsed = JSON.parse(out.trim() || "{}") as DiscardResult;
        resolve({ removed: parsed.removed ?? 0, error: parsed.error });
      } catch {
        resolve({ removed: 0, error: err.trim().slice(0, 200) || "writer returned no result" });
      }
    });
    child.stdin.write(JSON.stringify({ url: offer.url, company: offer.company || "", title: offer.title || "", location: offer.location || "", source: offer.source || "inbox" }));
    child.stdin.end();
  });
}
