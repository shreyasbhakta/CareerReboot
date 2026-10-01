// Tiny TTL disk cache for search responses (JSON). Best-effort: any I/O error
// just means a cache miss. `readOnly` supports --dry-run (no writes).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sha1 } from './text.mjs';

export function createCache({ dir, ttlHours = 12, readOnly = false, now = () => Date.now() } = {}) {
  const file = (key) => join(dir, `hr-${sha1(key).slice(0, 24)}.json`);
  return {
    get(key) {
      if (!dir) return undefined;
      try {
        const f = file(key);
        if (!existsSync(f)) return undefined;
        const { at, value } = JSON.parse(readFileSync(f, 'utf8'));
        return now() - at <= ttlHours * 36e5 ? value : undefined;
      } catch { return undefined; }
    },
    set(key, value) {
      if (!dir || readOnly) return;
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file(key), JSON.stringify({ at: now(), value }), { mode: 0o600 });
      } catch { /* ignore */ }
    },
  };
}
