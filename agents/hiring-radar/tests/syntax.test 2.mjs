import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    if (f === 'node_modules') return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mjs') ? [p] : [];
  });
}
test('every hiring-radar .mjs file passes node --check', () => {
  const files = walk(root);
  assert.ok(files.length > 20);
  for (const f of files) assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }), f);
});
