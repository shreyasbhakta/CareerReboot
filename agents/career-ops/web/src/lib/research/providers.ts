// Loads the REAL career-ops provider modules (agents/career-ops/providers/*.mjs)
// dynamically, the same way lib/core/text-key.ts loads tracker-parse.mjs — these
// files live outside the Next build root and can move (CAREER_OPS_ROOT), so they
// can't be a static import. Never reimplement an ATS adapter here; see
// job-finding-research/README.md for why.
//
// Uses the FULL provider registry (~70 adapters: Greenhouse, Ashby, Lever,
// SmartRecruiters, Workday, iCIMS, Eightfold, BambooHR, Comeet, ...) via the
// same _registry.mjs / resolveProvider() that scan.mjs itself uses — not a
// hand-picked subset. `local-parser` is excluded: it execs a user-configured
// local command, which is scan.mjs's own CLI trust boundary, not a web
// request's.
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";
import { listTrackedCompanies } from "@/lib/portals-companies.mjs";
import type { CandidateProfile } from "./scoring";

export type PortalEntry = {
  name: string;
  careers_url?: string;
  api?: string;
  provider?: string;
  enabled?: boolean;
  [key: string]: unknown;
};

export type ProviderModule = {
  id: string;
  detect: (entry: PortalEntry) => unknown;
  fetch: (entry: PortalEntry, ctx: unknown) => Promise<unknown[]>;
};

/** job-finding-research/ sits two levels above agents/career-ops/ (repo root). */
export function researchRoot(): string {
  const env = process.env.JOB_RESEARCH_ROOT?.trim();
  if (env) return env;
  return path.resolve(careerOpsRoot(), "..", "..", "job-finding-research");
}

// No caching: this file is meant to be edited by hand between scans (see its
// own header), and it's a few KB of YAML — re-reading it every scan is free
// compared to the network calls that follow. A cached copy would mean edits
// don't take effect until the whole web server restarts, silently.
export function loadCandidateProfile(): CandidateProfile {
  const file = path.join(researchRoot(), "candidate-profile.yml");
  const raw = fs.readFileSync(/* turbopackIgnore: true */ file, "utf8");
  return yaml.load(raw) as CandidateProfile;
}

type RegistryModule = {
  loadProviders: (dir: string) => Promise<Map<string, ProviderModule>>;
  resolveProvider: (entry: PortalEntry, providers: Map<string, ProviderModule>, opts?: { skipIds?: string[] }) => { provider: ProviderModule } | { error: string } | null;
};

let cachedProviders: Map<string, ProviderModule> | null = null;
let cachedResolve: RegistryModule["resolveProvider"] | null = null;

async function loadRegistry(): Promise<{ providers: Map<string, ProviderModule>; resolveProvider: RegistryModule["resolveProvider"] }> {
  if (cachedProviders && cachedResolve) return { providers: cachedProviders, resolveProvider: cachedResolve };
  const file = path.join(careerOpsRoot(), "providers", "_registry.mjs");
  const mod = (await import(/* webpackIgnore: true */ pathToFileURL(file).href)) as RegistryModule;
  const providersDir = path.join(careerOpsRoot(), "providers");
  const providers = await mod.loadProviders(providersDir);
  cachedProviders = providers;
  cachedResolve = mod.resolveProvider;
  return { providers, resolveProvider: mod.resolveProvider };
}

async function loadHttpCtx(): Promise<Record<string, unknown>> {
  const file = path.join(careerOpsRoot(), "providers", "_http.mjs");
  const mod = await import(/* webpackIgnore: true */ pathToFileURL(file).href);
  return mod.makeHttpCtx();
}

export type ScanTarget = { entry: PortalEntry; provider: ProviderModule };
export type SkippedEntry = { name: string; reason: string };

/** The user's own tracked_companies, resolved through the SAME provider
 *  registry scan.mjs uses (minus local-parser). `local-parser` entries and
 *  anything with no matching provider are reported in `skipped` with a
 *  reason, never silently dropped. */
export async function resolveScanTargets(limit: number): Promise<{ targets: ScanTarget[]; skipped: SkippedEntry[]; totalTracked: number }> {
  const portalsFile = path.join(careerOpsRoot(), "portals.yml");
  const companies = listTrackedCompanies(portalsFile) as PortalEntry[];
  const enabled = companies.filter((c) => c.enabled !== false && c.name);
  const { providers, resolveProvider } = await loadRegistry();

  const targets: ScanTarget[] = [];
  const skipped: SkippedEntry[] = [];
  for (const entry of enabled) {
    if (targets.length >= limit) {
      skipped.push({ name: entry.name, reason: "over scan limit for this run" });
      continue;
    }
    let resolved: ReturnType<RegistryModule["resolveProvider"]>;
    try {
      resolved = resolveProvider(entry, providers, { skipIds: ["local-parser"] });
    } catch (e) {
      skipped.push({ name: entry.name, reason: e instanceof Error ? e.message : "resolve failed" });
      continue;
    }
    if (!resolved) {
      skipped.push({ name: entry.name, reason: "no provider can reach this board (or it's local-parser-only)" });
      continue;
    }
    if ("error" in resolved) {
      skipped.push({ name: entry.name, reason: resolved.error });
      continue;
    }
    targets.push({ entry, provider: resolved.provider });
  }
  return { targets, skipped, totalTracked: companies.length };
}

export async function fetchJobsFor(target: ScanTarget, ctx: Record<string, unknown>): Promise<unknown[]> {
  return target.provider.fetch(target.entry, ctx);
}

export { loadHttpCtx };
