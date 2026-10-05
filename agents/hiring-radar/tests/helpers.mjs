import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { createRoleMatcher } from '../extractors/role.mjs';

export const PERSONA = fileURLToPath(new URL('./fixtures/config.persona.yml', import.meta.url));

export const NOW = new Date('2026-10-01T12:00:00Z');
let cached;
export function cfg() {
  // Hermetic: a fixed test persona instead of the developer's config.yml and profile.yml.
  cached ??= loadConfig({ env: {}, localPath: PERSONA, profilePath: '/nonexistent' });
  return structuredClone(cached);
}
export function ctx(overrides = {}) {
  const c = overrides.cfg || cfg();
  return { cfg: c, matcher: createRoleMatcher(c), now: NOW, days: 7, trackedKeys: new Set(), ...overrides };
}
export const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };
