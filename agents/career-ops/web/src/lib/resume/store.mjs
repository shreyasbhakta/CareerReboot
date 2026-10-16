import fs from "node:fs";
import path from "node:path";

// One folder per generation under output/ (gitignored): meta.json, resume.tex, resume.pdf.
const ID = /^\d{8}-\d{6}-[a-z0-9-]{1,60}$/;

export function storeDir(root) {
  return path.join(root, "output", "resume-tailor");
}

/** "Acme Corp, Inc." -> "Acme_Corp_Inc"; "" when nothing usable is left. */
export function fileWord(s) {
  return (String(s ?? "").match(/[A-Za-z0-9]+/g) ?? []).join("_").slice(0, 60);
}

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

/**
 * The download name: <prefix>_<Company>.pdf, or <prefix>_<timestamp>.pdf without a company.
 * @param {string} prefix
 * @param {string} company
 * @param {Date} date
 */
export function pdfFileName(prefix, company, date) {
  return `${prefix}_${fileWord(company) || stamp(date)}.pdf`;
}

/**
 * Save one generation. Files are owner-only: they hold the JD and the resume.
 * @param {string} root
 * @param {{jdText: string, company: string, roleTitle: string, variant: string, tex: string, pdf: Buffer, report: object, fileName: string, date: Date}} g
 * @returns {string} The generation id.
 */
export function saveGeneration(root, { jdText, company, roleTitle, variant, tex, pdf, report, fileName, date }) {
  const slug = (company.toLowerCase().match(/[a-z0-9]+/g) ?? ["resume"]).join("-").slice(0, 60);
  const id = `${stamp(date)}-${slug}`;
  const dir = path.join(storeDir(root), id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const meta = { id, created_at: date.toISOString(), company, role_title: roleTitle, base_variant: variant, file_name: fileName, ...report, jd_text: jdText };
  fs.writeFileSync(path.join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, "resume.tex"), tex, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, "resume.pdf"), pdf, { mode: 0o600 });
  return id;
}

/**
 * Past generations, newest first, without the JD text (fetch one to read it).
 * @param {string} root
 */
export function listGenerations(root) {
  let ids;
  try {
    ids = fs.readdirSync(storeDir(root)).filter((n) => ID.test(n));
  } catch {
    return [];
  }
  return ids
    .sort()
    .reverse()
    .map((id) => readMeta(root, id))
    .filter(Boolean)
    .map(({ jd_text: _jd, ...rest }) => rest);
}

/** @returns {{file_name: string, [key: string]: unknown} | null} */
export function readMeta(root, id) {
  if (!ID.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(storeDir(root), id, "meta.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Path to a saved file of one generation, or null for an unknown id.
 * @param {string} root
 * @param {string} id
 * @param {"pdf" | "tex"} kind
 */
export function generationFile(root, id, kind) {
  if (!ID.test(id)) return null;
  const file = path.join(storeDir(root), id, kind === "tex" ? "resume.tex" : "resume.pdf");
  return fs.existsSync(file) ? file : null;
}
