import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as yaml from "js-yaml";

// Same atomic-write-with-backup contract as core/safe-write.ts (unique temp
// file + rename, timestamped .bak snapshot first) — reimplemented here rather
// than imported across the .mjs/.ts boundary, which has no precedent
// elsewhere in this tree's plain .mjs lib modules.
function atomicWriteWithBackup(file, content) {
  try {
    const cur = fs.readFileSync(file, "utf8");
    if (cur.trim()) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      fs.writeFileSync(`${file}.bak-${ts}`, cur, "utf8");
    }
  } catch {
    /* no prior file to back up */
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, file);
}

// Surgical (line-range) CRUD for the `tracked_companies:` list in portals.yml,
// deliberately NOT a full yaml.load()->mutate->yaml.dump() of the whole
// document. portals.yml is a large, richly hand-commented user file (section
// headers like "# -- AI Labs --" between entries) — js-yaml's dumper drops
// every comment, so a full-document round trip on every add/edit/toggle would
// silently destroy the user's own annotations. Instead: find the exact line
// range of ONE entry (or the insertion point for a new one), and only that
// range is touched — everything else in the file, including every comment,
// passes through untouched as plain text.

export class PortalsCompaniesError extends Error {
  /** @param {string} message @param {"not-found" | "duplicate" | "no-section" | "invalid"} kind */
  constructor(message, kind) {
    super(message);
    this.name = "PortalsCompaniesError";
    this.kind = kind;
  }
}

const ANCHOR = /^tracked_companies:\s*$/;
// Sample shape confirmed against the real file: 2-space-indented "- name: X"
// list items, 4-space-indented field continuation lines, no multi-line scalars.
const ENTRY_START = /^ {2}- name:\s*(.+?)\s*$/;
const FIELD_LINE = /^ {4}\S/;
const TOP_LEVEL_KEY = /^[^\s#]/;

function findSection(lines) {
  const anchorIdx = lines.findIndex((l) => ANCHOR.test(l));
  if (anchorIdx === -1) return null;
  let end = lines.length;
  for (let i = anchorIdx + 1; i < lines.length; i++) {
    if (TOP_LEVEL_KEY.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { anchorIdx, end };
}

function findEntries(lines, start, end) {
  const entries = [];
  for (let i = start; i < end; i++) {
    const m = ENTRY_START.exec(lines[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < end && FIELD_LINE.test(lines[j])) j++;
    entries.push({ name: m[1], startIdx: i, endIdx: j });
  }
  return entries;
}

function parseEntryObject(lines, entry) {
  const raw = lines.slice(entry.startIdx, entry.endIdx).join("\n");
  const parsed = yaml.load(raw);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

/** Re-indents a freshly dumped single-item YAML sequence to match the file's
 *  2/4-space list style, as an array of lines (no trailing newline). */
function dumpEntryLines(obj) {
  const dumped = yaml.dump([obj], { lineWidth: 100, noRefs: true }).trimEnd();
  return dumped.split("\n").map((l) => `  ${l}`);
}

function validateEntry(data) {
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  if (!name) throw new PortalsCompaniesError("name is required", "invalid");
  const hasSource = typeof data.careers_url === "string" && data.careers_url.trim();
  const hasApi = typeof data.api === "string" && data.api.trim();
  if (!hasSource && !hasApi) {
    throw new PortalsCompaniesError("careers_url or api is required", "invalid");
  }
  return { ...data, name };
}

/** List every tracked_companies entry as parsed objects (for the management UI). */
export function listTrackedCompanies(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const section = findSection(lines);
  if (!section) return [];
  return findEntries(lines, section.anchorIdx + 1, section.end).map((e) => parseEntryObject(lines, e));
}

/** Adds a new entry at the end of the tracked_companies list. Throws on a duplicate name (case-insensitive). */
export function addTrackedCompany(file, data) {
  const entry = validateEntry(data);
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const section = findSection(lines);
  if (!section) throw new PortalsCompaniesError("no tracked_companies: section found in portals.yml", "no-section");
  const entries = findEntries(lines, section.anchorIdx + 1, section.end);
  if (entries.some((e) => e.name.toLowerCase() === entry.name.toLowerCase())) {
    throw new PortalsCompaniesError(`a company named "${entry.name}" already exists`, "duplicate");
  }
  const insertAt = entries.length ? entries[entries.length - 1].endIdx : section.anchorIdx + 1;
  const newLines = dumpEntryLines(entry);
  lines.splice(insertAt, 0, ...newLines, "");
  atomicWriteWithBackup(file, lines.join("\n"));
  return entry;
}

/** Merges `patch` into the named entry's existing fields (so an unspecified field is preserved) and rewrites only its lines. */
export function updateTrackedCompany(file, name, patch) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const section = findSection(lines);
  if (!section) throw new PortalsCompaniesError("no tracked_companies: section found in portals.yml", "no-section");
  const entries = findEntries(lines, section.anchorIdx + 1, section.end);
  const idx = entries.findIndex((e) => e.name.toLowerCase() === name.toLowerCase());
  if (idx === -1) throw new PortalsCompaniesError(`no company named "${name}" found`, "not-found");
  const entry = entries[idx];
  const current = parseEntryObject(lines, entry);
  const merged = validateEntry({ ...current, ...patch });
  if (merged.name.toLowerCase() !== name.toLowerCase() && entries.some((e, i) => i !== idx && e.name.toLowerCase() === merged.name.toLowerCase())) {
    throw new PortalsCompaniesError(`a company named "${merged.name}" already exists`, "duplicate");
  }
  const newLines = dumpEntryLines(merged);
  lines.splice(entry.startIdx, entry.endIdx - entry.startIdx, ...newLines);
  atomicWriteWithBackup(file, lines.join("\n"));
  return merged;
}

/** Removes the named entry's lines entirely. */
export function deleteTrackedCompany(file, name) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  const section = findSection(lines);
  if (!section) throw new PortalsCompaniesError("no tracked_companies: section found in portals.yml", "no-section");
  const entries = findEntries(lines, section.anchorIdx + 1, section.end);
  const entry = entries.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (!entry) throw new PortalsCompaniesError(`no company named "${name}" found`, "not-found");
  lines.splice(entry.startIdx, entry.endIdx - entry.startIdx);
  // Collapse a double-blank-line seam left where the deleted entry used to sit
  // between two existing blank lines (e.g. undoing an add — see addTrackedCompany's
  // trailing blank line — should reproduce the original file byte-for-byte).
  if (lines[entry.startIdx] === "" && lines[entry.startIdx - 1] === "") {
    lines.splice(entry.startIdx, 1);
  }
  atomicWriteWithBackup(file, lines.join("\n"));
}
