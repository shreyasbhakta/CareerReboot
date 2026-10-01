// Warm-connection matching. Reuses career-ops' linkedin-join.mjs parsers and
// company matcher (exact/strong only) so name-matching logic lives in one place.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAREER_OPS_DIR } from '../lib/config.mjs';
import { normalizeText } from '../lib/text.mjs';

export const WARM = { DIRECT: 'WARM_INTRO_AVAILABLE', COMPANY: 'COMPANY_CONNECTION', NONE: 'NO_CONNECTION' };

export function connectionsPath(env = process.env) {
  if (env.LINKEDIN_CONNECTIONS_CSV) return env.LINKEDIN_CONNECTIONS_CSV;
  const root = env.CAREER_OPS_ROOT || env.CAREER_OPS_DATA_DIR || CAREER_OPS_DIR;
  return join(root, 'data', 'Connections.csv');
}

/**
 * Load connections from a LinkedIn export. Never throws: a missing/garbled file
 * yields { loaded:false } and every signal reports NO_CONNECTION with a note.
 */
export async function loadConnections(path) {
  if (!path || !existsSync(path)) return { loaded: false, connections: [], reason: 'no Connections.csv found' };
  try {
    const join_ = await import('../../career-ops/linkedin-join.mjs');
    const { connections, quality } = join_.parseConnections(readFileSync(path, 'utf8'));
    if (quality.noHeader) return { loaded: false, connections: [], reason: 'Connections.csv has no recognizable header' };
    return { loaded: true, connections, matchCompany: join_.matchCompany, companyTokens: join_.companyTokens };
  } catch (e) {
    return { loaded: false, connections: [], reason: `could not read connections: ${e.message}` };
  }
}

const RELEVANT = /\b(engineer|engineering|cto|vp|head|director|founder|recruit|talent|technical|product|ai|ml|data|staff|principal|lead|architect)\b/i;

/**
 * @returns {{status: string, connections: {name, title, company, linkedin, match}[], note?: string}}
 */
export function matchWarm(signal, conns) {
  if (!conns?.loaded) return { status: WARM.NONE, connections: [], note: conns?.reason || 'connections not loaded' };
  const personName = normalizeText(signal.person?.name || '');
  const found = [];

  if (personName) {
    for (const c of conns.connections) {
      if (normalizeText(c.name) === personName) {
        found.push({ name: c.name, title: c.title, company: c.company, linkedin: c.linkedin, match: 'direct' });
      }
    }
    if (found.length) return { status: WARM.DIRECT, connections: found.slice(0, 3) };
  }

  const co = signal.company?.name;
  if (!co) return { status: WARM.NONE, connections: [] };
  const target = conns.companyTokens(co);
  for (const c of conns.connections) {
    const m = conns.matchCompany(target, c.tokens);
    if (m === 'exact' || m === 'strong') found.push({ name: c.name, title: c.title, company: c.company, linkedin: c.linkedin, match: m });
  }
  if (!found.length) return { status: WARM.NONE, connections: [] };
  found.sort((a, b) => Number(RELEVANT.test(b.title)) - Number(RELEVANT.test(a.title)));
  const relevant = found.some((f) => RELEVANT.test(f.title));
  return { status: relevant ? WARM.DIRECT : WARM.COMPANY, connections: found.slice(0, 3) };
}
