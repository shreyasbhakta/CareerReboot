// Config loading + validation. The committed config.example.yml is the single
// source of defaults (no search terms or weights are hardcoded in JS).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CAREER_OPS_DIR = resolve(ROOT, '..', 'career-ops');

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge: objects merge, everything else (incl. arrays) replaces. */
export function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in base ? deepMerge(base[k], v) : v;
  return out;
}

function readYaml(path) {
  try {
    return yaml.load(readFileSync(path, 'utf8')) ?? {};
  } catch (e) {
    throw new Error(`Cannot parse YAML ${path}: ${e.message}`);
  }
}

/** Pull canonical values out of career-ops' profile.yml without copying them into this module. */
function profileOverlay(profilePath) {
  if (!existsSync(profilePath)) return {};
  let p;
  try { p = readYaml(profilePath); } catch { return {}; }
  const overlay = { profile: {} };
  if (p?.candidate?.full_name) overlay.profile.name = p.candidate.full_name;
  const roles = p?.target_roles?.primary;
  if (Array.isArray(roles) && roles.length) overlay.profile.target_roles = roles;
  const pp = p?.narrative?.proof_points;
  if (Array.isArray(pp)) overlay.profile.proof_points = pp.filter((x) => x?.name && x?.hero_metric).map((x) => ({ name: x.name, hero_metric: x.hero_metric }));
  const fx = String(p?.compensation?.location_flexibility || '');
  if (fx) overlay.profile.open_to_relocation = /relocat/i.test(fx);
  return overlay;
}

export function loadConfig({
  env = process.env,
  cliOverrides = {},
  examplePath = join(ROOT, 'config.example.yml'),
  localPath = join(ROOT, 'config.yml'),
  profilePath = join(CAREER_OPS_DIR, 'config', 'profile.yml'),
} = {}) {
  let cfg = readYaml(examplePath);
  const layers = [examplePath];
  if (existsSync(localPath)) { cfg = deepMerge(cfg, readYaml(localPath)); layers.push(localPath); }
  if (env.HIRING_RADAR_CONFIG) {
    const p = resolve(env.HIRING_RADAR_CONFIG);
    if (!existsSync(p)) throw new Error(`HIRING_RADAR_CONFIG points to a missing file: ${p}`);
    cfg = deepMerge(cfg, readYaml(p));
    layers.push(p);
  }
  cfg = deepMerge(cfg, profileOverlay(profilePath));
  cfg = deepMerge(cfg, cliOverrides);
  if (env.HIRING_RADAR_NOTIFY !== undefined) cfg.notify = { ...cfg.notify, enabled: /^(1|true|yes)$/i.test(env.HIRING_RADAR_NOTIFY) };
  cfg._layers = layers;
  const errors = validateConfig(cfg);
  if (errors.length) {
    throw new Error(`Invalid Hiring Radar configuration:\n  - ${errors.join('\n  - ')}\nFix ${layers[layers.length - 1]} (see config.example.yml).`);
  }
  return cfg;
}

/** @returns {string[]} human-readable problems; empty when valid. */
export function validateConfig(c) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };

  need(Array.isArray(c.role_families) && c.role_families.length > 0, 'role_families must be a non-empty list');
  const ids = new Set();
  for (const f of c.role_families || []) {
    need(f?.id && f?.label, `role_families entry needs id and label: ${JSON.stringify(f)}`);
    need(['target', 'adjacent'].includes(f?.tier), `role_families[${f?.id}].tier must be "target" or "adjacent"`);
    need(Array.isArray(f?.aliases) && f.aliases.length > 0, `role_families[${f?.id}].aliases must be a non-empty list`);
    need(!ids.has(f?.id), `duplicate role family id: ${f?.id}`);
    ids.add(f?.id);
  }

  const w = c.scoring?.weights;
  need(isObj(w), 'scoring.weights is required');
  if (isObj(w)) {
    for (const k of ['technical', 'activity', 'direct_language', 'person', 'location', 'company']) {
      need(typeof w[k] === 'number' && w[k] >= 0, `scoring.weights.${k} must be a number >= 0`);
    }
    const sum = Object.values(w).reduce((a, b) => a + (Number(b) || 0), 0);
    need(Math.abs(sum - 1) < 0.001, `scoring.weights must sum to 1.0 (got ${sum.toFixed(3)})`);
  }
  need(typeof c.scoring?.min_score === 'number' && c.scoring.min_score >= 0 && c.scoring.min_score <= 100, 'scoring.min_score must be 0-100');

  const r = c.recency;
  need(Array.isArray(r?.bands) && r.bands.length > 0, 'recency.bands must be a non-empty list');
  let prev = 0;
  for (const b of r?.bands || []) {
    need(b.max_hours > prev, `recency.bands must have strictly increasing max_hours (got ${b.max_hours} after ${prev})`);
    need(b.score >= 0 && b.score <= 100, 'recency band score must be 0-100');
    prev = b.max_hours;
  }
  need(r?.default_days >= 1 && r?.max_days >= r?.default_days && r?.max_days <= 30, 'recency: need 1 <= default_days <= max_days <= 30');

  const skills = c.technical?.skills;
  need(isObj(skills), 'technical.skills must be a map of groups');
  for (const [g, list] of Object.entries(skills || {})) {
    need(Array.isArray(list), `technical.skills.${g} must be a list`);
    for (const s of list || []) need(s?.name && Array.isArray(s.terms) && s.terms.length && s.points >= 0, `technical.skills.${g}: entry needs name, terms[], points: ${JSON.stringify(s)}`);
  }
  for (const k of ['strong_first_person', 'strong_team', 'negative']) {
    need(Array.isArray(c.signals?.[k]) && c.signals[k].length > 0, `signals.${k} must be a non-empty list`);
  }
  for (const k of ['strong_first_person', 'strong_team', 'team_expansion', 'weak', 'broad_scope', 'negative']) {
    for (const p of c.signals?.[k] || []) {
      try { new RegExp(p, 'i'); } catch (e) { errs.push(`signals.${k}: invalid pattern "${p}" (${e.message})`); }
    }
  }
  need(c.sources && ['hn', 'jobs', 'web_search'].every((s) => isObj(c.sources[s])), 'sources.hn, sources.jobs, sources.web_search are required');
  need(isObj(c.output?.digest), 'output.digest is required');
  need(['new', 'all'].includes(c.notify?.scope), 'notify.scope must be "new" or "all"');
  need(c.notify?.min_score == null || (c.notify.min_score >= 0 && c.notify.min_score <= 100), 'notify.min_score must be null or 0-100');
  need(Number.isInteger(c.notify?.max_items) && c.notify.max_items >= 1, 'notify.max_items must be a positive integer');
  return errs;
}

export function loadDotEnv(paths) {
  for (const p of paths) {
    if (existsSync(p) && typeof process.loadEnvFile === 'function') {
      try { process.loadEnvFile(p); } catch { /* malformed .env is the user's to fix; env vars still work */ }
    }
  }
}
