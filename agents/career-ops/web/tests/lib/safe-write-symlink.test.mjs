// The Docker stable runtime links user files (portals.yml, cv.md, ...) to the host checkout;
// a dashboard write must land in the host file, not replace the link with a container copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteWithBackup } from "../../src/lib/core/safe-write.ts";

test("atomic write through a symlink updates the target and keeps the link", () => {
  const dir = mkdtempSync(join(tmpdir(), "safe-write-"));
  const target = join(dir, "host-portals.yml");
  const link = join(dir, "portals.yml");
  writeFileSync(target, "old\n");
  symlinkSync(target, link);

  atomicWriteWithBackup(link, "new\n");

  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(readFileSync(target, "utf8"), "new\n");
  assert.ok(readdirSync(dir).some((f) => f.startsWith("host-portals.yml.bak-")));
});
