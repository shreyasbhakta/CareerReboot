// Checks on model-written LaTeX and on the text of the compiled PDF. The JD that shaped the
// .tex came from a web page, so the .tex is treated as untrusted before pdflatex sees it.

// Primitives that reach the shell, write files, read arbitrary files or rewrite the lexer.
const FORBIDDEN = [
  [/\\write/, "\\write"],
  [/\\immediate\b/, "\\immediate"],
  [/\\csname\b/, "\\csname"],
  [/\\(?:open|close)(?:in|out)\b/, "\\openin/\\openout"],
  [/\\read\b/, "\\read"],
  [/\\catcode\b/, "\\catcode"],
  [/\\(?:directlua|luaexec|latelua)\b/, "Lua"],
  [/\\(?:ShellEscape|shellesc|pdfshellescape)\b/i, "shell escape"],
  [/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^}]*\b(?:shellesc|minted|pythontex|bashful)\b/, "a shell-running package"],
  [/\^\^/, "^^ character escapes"],
  [/\\(?:input|include|InputIfFileExists|includegraphics|verbatiminput|lstinputlisting)\s*(?:\[[^\]]*\])?\{[^}]*[/\\.~][^}]*\}/, "a file path in \\input/\\include"],
];

/** The .tex with % comments removed (an escaped \% is kept). */
export function stripComments(tex) {
  return tex.replace(/(^|[^\\])%.*$/gm, "$1");
}

function preamble(tex) {
  const i = tex.indexOf("\\begin{document}");
  return (i === -1 ? tex : tex.slice(0, i)).replace(/\s+/g, " ").trim();
}

/**
 * Refuse a tailored .tex that could do more than typeset. The preamble must match the base
 * variant's exactly, so the model can change content but never add packages or macros.
 * @param {string} tex - Model output.
 * @param {string} baseTex - The base variant it was tailored from.
 * @returns {string[]} Reasons to refuse; empty means safe to compile.
 */
export function unsafeTexReasons(tex, baseTex) {
  const body = stripComments(tex);
  const reasons = FORBIDDEN.filter(([re]) => re.test(body)).map(([, name]) => `uses ${name}`);
  if (preamble(stripComments(tex)) !== preamble(stripComments(baseTex))) {
    reasons.push("changes the preamble of the base variant");
  }
  return reasons;
}

const EM_DASH = /—|\\textemdash\b|(?<!-)---(?!-)/;

/** True when the text holds an em dash in any spelling (Unicode, \textemdash, ---). */
export function hasEmDash(text) {
  return EM_DASH.test(text);
}

/**
 * Dashes used as a pause between words ("fast - and safe", "fast -- and safe"). Ranges such
 * as "2021 -- 2023" or "30--40\%" have a digit on a side, so they pass.
 * @param {string} text
 * @returns {string[]} The offending snippets.
 */
export function pauseDashes(text) {
  return [...text.matchAll(/[A-Za-z,)][ \t]+(?:-{1,2}|–)[ \t]+[A-Za-z(]/g)].map((m) => m[0]);
}

/**
 * Do-not-claim terms the tailored text mentions while the base variant did not, so a
 * term the base already uses (e.g. in a project heading) is never flagged.
 * @param {string[]} terms - From doNotClaimTerms().
 * @param {string} tailored - Tailored .tex.
 * @param {string} base - Base .tex.
 * @returns {string[]}
 */
export function newlyClaimed(terms, tailored, base) {
  const mentions = (text, term) =>
    new RegExp(`(?<![A-Za-z0-9+#.])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9+#])`).test(text);
  // "C\#" in LaTeX is "C#" on the page.
  const plain = (tex) => stripComments(tex).replace(/\\([#$%&_{}])/g, "$1");
  const t = plain(tailored);
  const b = plain(base);
  return terms.filter((term) => term.split(/\s+/).length <= 3 && mentions(t, term) && !mentions(b, term));
}
