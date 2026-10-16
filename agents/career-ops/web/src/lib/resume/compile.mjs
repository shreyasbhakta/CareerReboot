import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const TIMEOUT_MS = 60_000;

// TeX's own file sandbox on top of -no-shell-escape: no reads or writes outside the temp dir.
const TEX_ENV = { openin_any: "p", openout_any: "p", shell_escape: "f" };

function missing(err, bin) {
  return err?.code === "ENOENT" ? `${bin} is not installed. Install TeX Live and poppler (see README, "Resume tailor").` : null;
}

/** The "! ..." lines of a pdflatex log, which say what actually failed. */
async function latexError(dir, fallback) {
  try {
    const log = await fs.readFile(path.join(dir, "resume.log"), "utf8");
    const lines = log.split("\n").filter((l) => l.startsWith("!"));
    if (lines.length > 0) return lines.join("\n").slice(0, 500);
  } catch {
    /* no log written */
  }
  return String(fallback).slice(0, 500);
}

/**
 * Compile a .tex with pdflatex in a fresh temp dir, then read its page count and text.
 * The dir is always removed, whatever happens.
 * @param {string} tex
 * @returns {Promise<{ok: true, pdf: Buffer, pages: number, text: string} | {ok: false, status: number, error: string}>}
 */
export async function compileTex(tex) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-tailor-"));
  const opts = { cwd: dir, timeout: TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...TEX_ENV, TEXMFOUTPUT: dir } };
  try {
    await fs.writeFile(path.join(dir, "resume.tex"), tex, "utf8");
    try {
      await run("pdflatex", ["-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", `-output-directory=${dir}`, "resume.tex"], opts);
    } catch (err) {
      const why = missing(err, "pdflatex");
      if (why) return { ok: false, status: 503, error: why };
      if (err.killed) return { ok: false, status: 504, error: `pdflatex took longer than ${TIMEOUT_MS / 1000}s and was stopped.` };
      return { ok: false, status: 422, error: `The tailored .tex did not compile: ${await latexError(dir, err.message)}` };
    }
    const pdfPath = path.join(dir, "resume.pdf");
    let info;
    let text;
    try {
      info = (await run("pdfinfo", [pdfPath], opts)).stdout;
      text = (await run("pdftotext", ["-enc", "UTF-8", pdfPath, "-"], opts)).stdout;
    } catch (err) {
      return { ok: false, status: 503, error: missing(err, "pdfinfo/pdftotext") ?? `Could not read the compiled PDF: ${err.message}` };
    }
    const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? NaN);
    if (!Number.isFinite(pages)) return { ok: false, status: 500, error: "pdfinfo did not report a page count." };
    return { ok: true, pdf: await fs.readFile(pdfPath), pages, text };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
