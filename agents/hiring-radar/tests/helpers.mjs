import { loadConfig } from '../lib/config.mjs';
import { createRoleMatcher } from '../extractors/role.mjs';

export const NOW = new Date('2026-10-01T12:00:00Z');
let cached;
export function cfg() {
  // Hermetic: ignore the developer's local config.yml and profile.yml.
  cached ??= loadConfig({ env: {}, localPath: '/nonexistent', profilePath: '/nonexistent' });
  return structuredClone(cached);
}
export function ctx(overrides = {}) {
  const c = overrides.cfg || cfg();
  return { cfg: c, matcher: createRoleMatcher(c), now: NOW, days: 7, trackedKeys: new Set(), ...overrides };
}
export const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };
