// Regression guard for the prompt-injection defense the whole evaluation
// pipeline depends on. career-ops feeds a real, untrusted job posting (and
// company pages, application-form fields, recruiter emails) into an LLM
// agent's context on every evaluate/pdf/apply run. Nothing in this repo can
// unit-test whether the LLM ITSELF obeys an embedded "ignore previous
// instructions" — that's a live model call, not a deterministic property —
// but the defense is written down as system instructions the agent reads
// automatically (AGENTS.md is loaded by the CLI for every invocation in this
// project directory; modes/oferta.md is the file run-prompts.mjs's evaluate
// prompt explicitly tells the agent to "follow EXACTLY"). If either file's
// wording is silently weakened or deleted in a future edit — the CLI's
// system-prompt equivalent of a security control being commented out — this
// is what catches it, instead of the gap only surfacing the first time a
// posting actually tries to hijack an evaluation.
//
// Assertions target the SPECIFIC, load-bearing phrases (not full-sentence
// matches) so ordinary rewording doesn't make this brittle — only removing
// the actual guarantee should fail it.
//
// Run:  node --test tests/lib/prompt-injection-defense.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const AGENTS_MD = readFileSync(new URL("../../../AGENTS.md", import.meta.url), "utf8");
const OFERTA_MD = readFileSync(new URL("../../../modes/oferta.md", import.meta.url), "utf8");

test("AGENTS.md still declares untrusted content as data, never instructions", () => {
  assert.match(AGENTS_MD, /Untrusted External Content/i, "the critical section heading is gone");
  assert.match(
    AGENTS_MD,
    /data,\s*\*{0,2}never instructions\*{0,2}/i,
    "the core 'data, never instructions' guarantee is missing",
  );
});

test("AGENTS.md still lists postings/pages/emails as in-scope untrusted sources", () => {
  // Every source this repo actually feeds an agent from — narrowing this list
  // silently would leave a real input channel unprotected.
  for (const source of [/job postings/i, /company pages/i, /application-form fields/i, /recruiter.*emails/i]) {
    assert.match(AGENTS_MD, source, `expected untrusted-source coverage matching ${source}`);
  }
});

test("AGENTS.md still forbids the concrete injection payloads it names", () => {
  assert.match(AGENTS_MD, /CANNOT/, "the CANNOT list itself is gone");
  for (const forbidden of [/issue instructions/i, /change these rules/i, /submit or send anything/i, /reveal secrets/i]) {
    assert.match(AGENTS_MD, forbidden, `expected a CANNOT entry matching ${forbidden}`);
  }
  // The exact attack phrasings the policy calls out by name — these are the
  // canonical injection attempts (a fake "ignore previous instructions", a
  // fake system/reviewer line); losing the examples doesn't remove the rule,
  // but it's the clearest signal the section was rewritten and shrunk.
  assert.match(AGENTS_MD, /ignore previous instructions/i, "the canonical injection example is gone");
});

test("AGENTS.md still says an injection attempt gets quoted as an anomaly, not silently dropped or obeyed", () => {
  assert.match(
    AGENTS_MD,
    /quote it as an anomaly/i,
    "an injection attempt must be surfaced (Block G / reply-watch), not silently discarded or acted on",
  );
});

test("modes/oferta.md (the file the evaluate prompt tells the agent to follow) reasserts the same defense", () => {
  // run-prompts.mjs's evaluate prompt says: "Read ${evalModeFile} and follow
  // it EXACTLY" — this file, not AGENTS.md directly, is what actually governs
  // the evaluation the JD text flows into, so it needs its own explicit
  // restatement, not just an inherited one.
  assert.match(OFERTA_MD, /Untrusted input/i, "the mode file's own untrusted-input callout is gone");
  assert.match(OFERTA_MD, /data,\s*never instructions/i, "the mode file no longer restates the core guarantee");
  assert.match(
    OFERTA_MD,
    /not obeyed/i,
    "the mode file no longer says an instruction embedded in JD wording is refused",
  );
});
