import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWriteWithBackup, backup } from "@/lib/core/safe-write";
import { radarDir, validateConfigText } from "@/lib/hiring-radar";
import { researchRoot } from "@/lib/research/providers";

/**
 * The one registry of per-user config files the Settings popup edits. Each flow
 * keeps its own gitignored local file next to a committed example with
 * placeholders; adding a flow here is the only change the popup needs.
 */
type SettingsDoc = {
  id: string;
  label: string;
  description: string;
  /** "overlay": the local file only overrides the example. "copy": the local file replaces it. */
  kind: "overlay" | "copy";
  local: () => string;
  example: () => string;
  /** Flow-specific check on top of "parses as a YAML mapping". */
  validate?: (text: string) => Promise<{ ok: boolean; error?: string }>;
};

const DOCS: SettingsDoc[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Name, contact, target roles and narrative. Read by the pipeline, the CV builder and Hiring Radar (name, roles, proof points).",
    kind: "copy",
    local: () => path.join(careerOpsRoot(), "config", "profile.yml"),
    example: () => path.join(careerOpsRoot(), "config", "profile.example.yml"),
  },
  {
    id: "hiring-radar",
    label: "Hiring Radar",
    description: "Home locations, role families, skills and scoring for the daily hiring-signal scan. Only what you write here overrides the defaults.",
    kind: "overlay",
    local: () => path.join(radarDir(), "config.yml"),
    example: () => path.join(radarDir(), "config.example.yml"),
    validate: validateConfigText,
  },
  {
    id: "research",
    label: "Job research",
    description: "Locations, seniority, skill keywords and weights for the zero-cost research scorer.",
    kind: "copy",
    local: () => path.join(researchRoot(), "candidate-profile.yml"),
    example: () => path.join(researchRoot(), "candidate-profile.example.yml"),
  },
  {
    id: "portals",
    label: "Portals",
    description: "Companies and title/location filters the job scanner tracks. The Portals page edits the same file field by field.",
    kind: "copy",
    local: () => path.join(careerOpsRoot(), "portals.yml"),
    example: () => path.join(careerOpsRoot(), "templates", "portals.example.yml"),
  },
];

export const MAX_SETTINGS_BYTES = 200_000;

const read = (file: string) => { try { return fs.readFileSync(/* turbopackIgnore: true */ file, "utf8"); } catch { return null; } };
// Paths are shown relative to the repo when the data root lives inside it (the default layout).
const repoRelative = (file: string) => {
  const rel = path.relative(path.resolve(careerOpsRoot(), "..", ".."), file);
  return rel.startsWith("..") ? file : rel;
};

export type SettingsDocView = {
  id: string;
  label: string;
  description: string;
  kind: SettingsDoc["kind"];
  localPath: string;
  examplePath: string;
  localText: string | null;
  exampleText: string;
};

export function listSettings(): SettingsDocView[] {
  return DOCS.map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    kind: d.kind,
    localPath: repoRelative(d.local()),
    examplePath: repoRelative(d.example()),
    localText: read(d.local()),
    exampleText: read(d.example()) ?? "",
  }));
}

export const findSettingsDoc = (id: string) => DOCS.find((d) => d.id === id) ?? null;

export async function validateSettingsText(doc: SettingsDoc, text: string): Promise<string | null> {
  if (Buffer.byteLength(text, "utf8") > MAX_SETTINGS_BYTES) return "file too large";
  let parsed: unknown;
  try { parsed = yaml.load(text); } catch (e) { return e instanceof Error ? e.message : "invalid YAML"; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "the file must be a YAML mapping (key: value)";
  const v = await doc.validate?.(text);
  return v && !v.ok ? v.error ?? "invalid" : null;
}

/** Atomic write with a .bak snapshot of the previous version; owner-only permissions. */
export function writeSettings(doc: SettingsDoc, text: string): string | null {
  const file = doc.local();
  const bak = atomicWriteWithBackup(file, text.endsWith("\n") ? text : `${text}\n`);
  fs.chmodSync(file, 0o600);
  return bak && repoRelative(bak);
}

/** Removes the local file (the flow falls back to its example). The old content is kept as a .bak. */
export function removeSettings(doc: SettingsDoc): string | null {
  const file = doc.local();
  const bak = backup(file);
  fs.rmSync(file, { force: true });
  return bak && repoRelative(bak);
}
