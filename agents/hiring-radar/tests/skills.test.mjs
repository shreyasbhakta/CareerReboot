// Agent Skills format check (agentskills.io): SKILL.md with name + description
// frontmatter, name matches the directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import * as yaml from 'js-yaml';

const root = resolve(import.meta.dirname, '..');
const dirs = [root, ...readdirSync(join(root, 'skills')).map((d) => join(root, 'skills', d))];

test('every skill has valid Agent Skills frontmatter and its name matches the directory', () => {
  assert.ok(dirs.length >= 5);
  for (const d of dirs) {
    const file = join(d, 'SKILL.md');
    assert.ok(existsSync(file), file);
    const m = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(m, `${file} needs frontmatter`);
    const fm = yaml.load(m[1]);
    assert.match(fm.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(fm.name.length <= 64);
    assert.equal(fm.name, basename(d), `${file}: name must equal directory name`);
    assert.ok(fm.description && fm.description.length <= 1024, `${file} description`);
  }
});
