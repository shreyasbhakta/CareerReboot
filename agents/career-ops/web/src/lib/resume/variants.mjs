import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

// Plain .mjs so tests/lib/resume-tailor.test.mjs can import it under Node.

export const PROFILE_FILE = "PROFILE_SOURCE_OF_TRUTH.md";
const DEFAULT_VARIANTS_DIR = "resume-variants";
// A variant id becomes a file name, so it may never carry a path separator or a dot.
const VARIANT_ID = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * The resume-tailor block of config/profile.yml, with defaults. Every field is optional.
 * @param {string} root - career-ops data root.
 * @returns {{variantsDir: string, defaultVariant: string | null, filePrefix: string}}
 */
export function readTailorConfig(root) {
  let profile;
  try {
    profile = yaml.load(fs.readFileSync(path.join(root, "config", "profile.yml"), "utf8"));
  } catch {
    profile = undefined;
  }
  const cfg = profile?.resume_tailor ?? {};
  return {
    variantsDir: path.resolve(root, typeof cfg.variants_dir === "string" ? cfg.variants_dir : DEFAULT_VARIANTS_DIR),
    defaultVariant: typeof cfg.default_variant === "string" ? cfg.default_variant : null,
    filePrefix: filePrefix(cfg.file_prefix, profile?.candidate?.full_name),
  };
}

/** "Shreyas Kumar Bhakta" -> "Shreyas_Bhakta": first and last name, ASCII only. */
function filePrefix(explicit, fullName) {
  const words = String(explicit || fullName || "").match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length === 0) return "Resume";
  if (explicit) return words.join("_");
  return words.length === 1 ? words[0] : `${words[0]}_${words[words.length - 1]}`;
}

/**
 * Every base .tex in the variants folder. The dropdown is built from this, so adding a
 * variant is dropping a file in, never a code change.
 * @param {string} variantsDir
 * @returns {string[]} Variant ids (file names without .tex), sorted.
 */
export function listVariants(variantsDir) {
  let names;
  try {
    names = fs.readdirSync(variantsDir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".tex"))
    .map((n) => n.slice(0, -4))
    .filter((id) => VARIANT_ID.test(id))
    .sort();
}

/**
 * Load the master profile and one base variant.
 * @param {string} variantsDir
 * @param {string} variant
 * @returns {{ok: true, profile: string, baseTex: string} | {ok: false, status: number, error: string}}
 */
export function loadVariant(variantsDir, variant) {
  if (typeof variant !== "string" || !VARIANT_ID.test(variant) || !listVariants(variantsDir).includes(variant)) {
    return { ok: false, status: 400, error: `Unknown base variant "${String(variant).slice(0, 80)}".` };
  }
  try {
    const profile = fs.readFileSync(path.join(variantsDir, PROFILE_FILE), "utf8");
    const baseTex = fs.readFileSync(path.join(variantsDir, `${variant}.tex`), "utf8");
    return { ok: true, profile, baseTex };
  } catch {
    return { ok: false, status: 500, error: `Add ${PROFILE_FILE} next to your base variants in ${variantsDir}.` };
  }
}

/**
 * The profile's "Do not claim" list, as plain terms. Qualifiers in parentheses are dropped
 * ("Hibernate (unless confirmed)" -> "Hibernate").
 * @param {string} profile - PROFILE_SOURCE_OF_TRUTH.md text.
 * @returns {string[]}
 */
export function doNotClaimTerms(profile) {
  const m = /\*\*Do not claim:?\*\*:?\s*([\s\S]*?)(?:\n\s*\n|$)/i.exec(profile);
  if (!m) return [];
  return m[1]
    .replace(/\([^)]*\)/g, "")
    .split(/[,\n]/)
    .map((t) => t.replace(/\.$/, "").trim())
    .filter(Boolean);
}
