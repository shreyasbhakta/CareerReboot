// Tests for the resume tailor behind POST /api/resume/tailor. The route is a thin shell over
// tailorResume(), which takes the model and the compiler as parameters, so these cases run
// without Claude. The one real pdflatex case runs only where TeX Live is installed.
//
// Run:  node --test tests/lib/resume-tailor.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { tailorResume, parseTailorOutput } from "../../src/lib/resume/tailor.mjs";
import { hasEmDash, newlyClaimed, pauseDashes, unsafeTexReasons } from "../../src/lib/resume/tex-guard.mjs";
import { doNotClaimTerms, listVariants, loadVariant, readTailorConfig } from "../../src/lib/resume/variants.mjs";
import { listGenerations, pdfFileName, readMeta, saveGeneration } from "../../src/lib/resume/store.mjs";
import { compileTex } from "../../src/lib/resume/compile.mjs";

const EXAMPLE_DIR = join(import.meta.dirname, "..", "..", "..", "resume-variants.example");
const PROFILE = readFileSync(join(EXAMPLE_DIR, "PROFILE_SOURCE_OF_TRUTH.md"), "utf8");
const BASE = readFileSync(join(EXAMPLE_DIR, "backend.tex"), "utf8");
const PDF = Buffer.from("%PDF-1.4 fake");

const JD = "Senior Backend Engineer at Acme Pay. Java, Spring Boot, Kafka, PostgreSQL. Payments experience.";
const GO_JD = "Backend Engineer at Gopher Inc. Must have 3+ years of Go and Kubernetes operations at scale.";

/** A model answer: the base with one body edit, plus a report. */
function answer({ edit = (t) => t, report = {} } = {}) {
  const tex = edit(BASE);
  const json = JSON.stringify({ company: "Acme Pay", role_title: "Senior Backend Engineer", matched_keywords: ["Java", "Kafka"], missing_keywords: [], gaps: [], ...report });
  return { ok: true, text: `Tailored.\n<<cv-tex>>\n${tex}\n<</cv-tex>>\n<<tailor-report>>\n${json}\n<</tailor-report>>\n` };
}

function fakeModel(...answers) {
  const prompts = [];
  return { prompts, run: async (p) => (prompts.push(p), answers[Math.min(prompts.length - 1, answers.length - 1)]) };
}

const compileAs = (...pages) => {
  let i = 0;
  return async () => ({ ok: true, pdf: PDF, pages: pages[Math.min(i++, pages.length - 1)], text: "ALEX EXAMPLE Backend engineer" });
};

const tailor = (model, compile, jdText = JD) => tailorResume({ jdText, profile: PROFILE, baseTex: BASE, runModel: model.run, compile });

test("normal JD: returns the PDF and the keyword report", async () => {
  const model = fakeModel(answer({ edit: (t) => t.replace("Languages:} Java, Python", "Languages:} Java, Spring Boot, Python") }));
  const r = await tailor(model, compileAs(1));
  assert.equal(r.ok, true);
  assert.equal(r.pdf, PDF);
  assert.deepEqual(r.report.matched_keywords, ["Java", "Kafka"]);
  assert.equal(r.report.company, "Acme Pay");
  assert.deepEqual(r.report.warnings, []);
  assert.equal(model.prompts.length, 1);
  assert.match(model.prompts[0], /===== JOB DESCRIPTION START =====\nSenior Backend Engineer at Acme Pay/);
});

test("JD asking for a do-not-claim skill: left out and reported as a gap", async () => {
  const model = fakeModel(answer({ report: { company: "Gopher Inc", gaps: ["Go", "Kubernetes operations at scale"] } }));
  const r = await tailor(model, compileAs(1), GO_JD);
  assert.equal(r.ok, true);
  assert.deepEqual(r.report.gaps, ["Go", "Kubernetes operations at scale"]);
});

test("JD asking for a do-not-claim skill: a resume that claims it anyway is rejected", async () => {
  const model = fakeModel(answer({ edit: (t) => t.replace("Languages:} Java", "Languages:} Go, Java") }));
  let compiled = false;
  const r = await tailor(model, async () => ((compiled = true), { ok: true, pdf: PDF, pages: 1, text: "" }), GO_JD);
  assert.equal(r.ok, false);
  assert.equal(r.status, 422);
  assert.match(r.error, /Do not claim list: Go/);
  assert.equal(compiled, false, "never compiled");
});

test("over one page: one trim, then an error instead of a two-page PDF", async () => {
  const model = fakeModel(answer(), answer());
  const r = await tailor(model, compileAs(2, 2));
  assert.equal(r.ok, false);
  assert.equal(r.status, 422);
  assert.match(r.error, /Still 2 pages after one trim/);
  assert.equal(r.pdf, undefined);
  assert.equal(model.prompts.length, 2, "exactly one trim request");
  assert.match(model.prompts[1], /compiled to 2 pages\. Trim it to exactly ONE page/);
});

test("over one page: a trim that fits returns the PDF with a warning", async () => {
  const model = fakeModel(answer(), answer());
  const r = await tailor(model, compileAs(2, 1));
  assert.equal(r.ok, true);
  assert.match(r.report.warnings.join(), /trimmed once/);
});

test("an em dash in the PDF text fails loudly", async () => {
  const model = fakeModel(answer());
  const r = await tailor(model, async () => ({ ok: true, pdf: PDF, pages: 1, text: "fast \u2014 and safe" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /em dash/);
});

test("a tailored .tex that escapes to the shell or changes the preamble is never compiled", async () => {
  for (const edit of [
    (t) => t.replace("\\section*{Summary}", "\\immediate\\write18{touch /tmp/pwned}\\section*{Summary}"),
    (t) => t.replace("\\section*{Summary}", "\\input{/etc/passwd}\\section*{Summary}"),
    (t) => t.replace("\\begin{document}", "\\usepackage{shellesc}\n\\begin{document}"),
  ]) {
    let compiled = false;
    const r = await tailor(fakeModel(answer({ edit })), async () => ((compiled = true), { ok: true, pdf: PDF, pages: 1, text: "" }));
    assert.equal(r.ok, false);
    assert.match(r.error, /Refused to compile/);
    assert.equal(compiled, false);
  }
});

test("a model failure is passed through unchanged", async () => {
  const r = await tailor(fakeModel({ ok: false, status: 504, error: "timed out" }), compileAs(1));
  assert.deepEqual(r, { ok: false, status: 504, error: "timed out" });
});

test("parseTailorOutput: missing report still yields the .tex, with a warning", () => {
  const r = parseTailorOutput(`<<cv-tex>>\n${BASE}\n<</cv-tex>>`);
  assert.equal(r.ok, true);
  assert.deepEqual(r.report.gaps, []);
  assert.equal(r.report.warnings.length, 1);
});

test("tex-guard: dash rules", () => {
  assert.equal(hasEmDash("a \\textemdash b"), true);
  assert.equal(hasEmDash("a---b"), true);
  assert.equal(hasEmDash("Jan 2022 -- Present, 30--40\\%"), false);
  assert.deepEqual(pauseDashes("Built it - fast. 2021 -- 2023."), ["t - f"]);
  assert.deepEqual(unsafeTexReasons(BASE, BASE), []);
});

test("do-not-claim terms come from the profile and only new mentions count", () => {
  const terms = doNotClaimTerms(PROFILE);
  assert.ok(terms.includes("Go") && terms.includes("fine-tuning") && terms.includes("Rust"));
  assert.ok(!terms.some((t) => t.includes("(")), "qualifiers dropped");
  assert.deepEqual(newlyClaimed(terms, BASE.replace("Java,", "Java, Rust, Google,"), BASE), ["Rust"]);
});

test("variants are read from the folder and unknown ones refused", () => {
  assert.deepEqual(listVariants(EXAMPLE_DIR), ["backend"]);
  assert.equal(loadVariant(EXAMPLE_DIR, "backend").ok, true);
  assert.equal(loadVariant(EXAMPLE_DIR, "../config/profile").ok, false);
  assert.equal(loadVariant(EXAMPLE_DIR, "nope").status, 400);
});

test("config: PDF prefix is first and last name, generations round-trip", () => {
  const root = mkdtempSync(join(tmpdir(), "tailor-store-"));
  try {
    mkdirSync(join(root, "config"));
    writeFileSync(join(root, "config", "profile.yml"), 'candidate:\n  full_name: "Alex Q Example"\n');
    const cfg = readTailorConfig(root);
    assert.equal(cfg.filePrefix, "Alex_Example");
    const date = new Date("2026-10-16T18:30:05Z");
    assert.equal(pdfFileName(cfg.filePrefix, "Acme Pay, Inc.", date), "Alex_Example_Acme_Pay_Inc.pdf");
    assert.equal(pdfFileName(cfg.filePrefix, "", date), "Alex_Example_20261016-183005.pdf");
    const id = saveGeneration(root, { jdText: JD, company: "Acme Pay", roleTitle: "SBE", variant: "backend", tex: BASE, pdf: PDF, report: { gaps: [] }, fileName: "x.pdf", date });
    const list = listGenerations(root);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, id);
    assert.equal(list[0].jd_text, undefined, "list omits the JD");
    assert.equal(readMeta(root, id).jd_text, JD);
    assert.equal(readMeta(root, "../../etc"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

let hasTex = true;
try {
  execFileSync("pdflatex", ["--version"], { stdio: "ignore" });
  execFileSync("pdfinfo", ["-v"], { stdio: "ignore" });
} catch {
  hasTex = false;
}

test("compileTex: the example variant compiles to one page", { skip: !hasTex && "pdflatex/pdfinfo not installed" }, async () => {
  const r = await compileTex(BASE);
  assert.equal(r.ok, true);
  assert.equal(r.pages, 1);
  assert.match(r.text, /ALEX EXAMPLE/);
});

test("compileTex: TeX refuses absolute paths even without the guard", { skip: !hasTex && "pdflatex not installed" }, async () => {
  const r = await compileTex("\\documentclass{article}\\begin{document}\\makeatletter\\@@input /etc/hostname \\end{document}");
  assert.equal(r.ok, false);
  assert.equal(r.status, 422);
});
