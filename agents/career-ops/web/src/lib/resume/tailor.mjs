import { parseCvTexEnvelope } from "../cv-envelope.mjs";
import { extractJsonObject } from "../extract-json-object.mjs";
import { REPORT_CLOSE, REPORT_OPEN, tailorPrompt, trimPrompt } from "./prompt.mjs";
import { hasEmDash, newlyClaimed, pauseDashes, stripComments, unsafeTexReasons } from "./tex-guard.mjs";
import { doNotClaimTerms } from "./variants.mjs";

/**
 * @typedef {Object} TailorReport
 * @property {string} company
 * @property {string} role_title
 * @property {string[]} matched_keywords
 * @property {string[]} missing_keywords
 * @property {string[]} gaps
 * @property {string[]} warnings
 */

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.trim().slice(0, 120)).filter(Boolean).slice(0, 60) : []);
const text = (v) => (typeof v === "string" ? v.trim().slice(0, 120) : "");

/**
 * Read the model's answer: the .tex envelope and the JSON report after it.
 * @param {string} output
 * @returns {{ok: true, tex: string, report: TailorReport} | {ok: false, status: number, error: string}}
 */
export function parseTailorOutput(output) {
  const env = parseCvTexEnvelope(output);
  if (!env.ok) return { ok: false, status: 502, error: env.error };
  const start = output.lastIndexOf(REPORT_OPEN);
  const end = output.lastIndexOf(REPORT_CLOSE);
  const { obj } = start !== -1 && end > start ? extractJsonObject(output.slice(start + REPORT_OPEN.length, end)) : { obj: null };
  const warnings = obj ? [] : ["Claude returned no keyword report, so the keyword lists are empty."];
  return {
    ok: true,
    tex: env.tex,
    report: {
      company: text(obj?.company),
      role_title: text(obj?.role_title),
      matched_keywords: strings(obj?.matched_keywords),
      missing_keywords: strings(obj?.missing_keywords),
      gaps: strings(obj?.gaps),
      warnings,
    },
  };
}

/**
 * Tailor one base variant to a JD and compile it to a one-page PDF.
 *
 * The model and the compiler are injected so tests can run it without Claude or TeX.
 * One trim retry when the first PDF runs long; after that a long result is an error.
 *
 * @param {Object} args
 * @param {string} args.jdText - Untrusted page text; it only ever enters the prompt.
 * @param {string} [args.companyName]
 * @param {string} args.profile - PROFILE_SOURCE_OF_TRUTH.md.
 * @param {string} args.baseTex - The chosen base variant.
 * @param {(prompt: string) => Promise<{ok: true, text: string} | {ok: false, status: number, error: string}>} args.runModel
 * @param {(tex: string) => Promise<{ok: true, pdf: Buffer, pages: number, text: string} | {ok: false, status: number, error: string}>} args.compile
 * @returns {Promise<{ok: true, tex: string, pdf: Buffer, report: TailorReport} | {ok: false, status: number, error: string, report?: TailorReport}>}
 */
export async function tailorResume({ jdText, companyName, profile, baseTex, runModel, compile }) {
  const terms = doNotClaimTerms(profile);

  const attempt = async (prompt) => {
    const answer = await runModel(prompt);
    if (!answer.ok) return answer;
    const parsed = parseTailorOutput(answer.text);
    if (!parsed.ok) return parsed;
    const unsafe = unsafeTexReasons(parsed.tex, baseTex);
    if (unsafe.length > 0) {
      return { ok: false, status: 422, error: `Refused to compile the tailored .tex: it ${unsafe.join("; ")}.`, report: parsed.report };
    }
    const claimed = newlyClaimed(terms, parsed.tex, baseTex);
    if (claimed.length > 0) {
      return { ok: false, status: 422, error: `The tailored resume claims items on your Do not claim list: ${claimed.join(", ")}.`, report: parsed.report };
    }
    const pdf = await compile(parsed.tex);
    return pdf.ok ? { ...parsed, ...pdf } : { ...pdf, report: parsed.report };
  };

  let result = await attempt(tailorPrompt({ jdText, companyName, profile, baseTex }));
  if (!result.ok) return result;
  let trimmed = false;
  if (result.pages > 1) {
    result = await attempt(trimPrompt({ tex: result.tex, pages: result.pages, jdText, profile, baseTex }));
    if (!result.ok) return result;
    trimmed = true;
    if (result.pages > 1) {
      return { ok: false, status: 422, error: `Still ${result.pages} pages after one trim, so no PDF was made.`, report: result.report };
    }
  }

  if (hasEmDash(result.text) || hasEmDash(stripComments(result.tex))) {
    return { ok: false, status: 422, error: "The generated resume contains an em dash, so it was rejected.", report: result.report };
  }

  const warnings = [...result.report.warnings];
  if (trimmed) warnings.push("The first draft ran past one page and was trimmed once.");
  const pauses = pauseDashes(result.text);
  if (pauses.length > 0) warnings.push(`Dashes used as pauses: ${pauses.slice(0, 5).join(" | ")}`);
  return { ok: true, tex: result.tex, pdf: result.pdf, report: { ...result.report, warnings } };
}
