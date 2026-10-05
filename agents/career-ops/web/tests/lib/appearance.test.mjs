import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_APPEARANCE, DIM_RANGE, normalizeAppearance, safeVideoUrl } from "../../src/lib/appearance.ts";

test("only https URLs and same-origin paths reach the video src", () => {
  assert.equal(safeVideoUrl("https://cdn.example.com/bg.mp4"), "https://cdn.example.com/bg.mp4");
  assert.equal(safeVideoUrl(" /background.mp4 "), "/background.mp4");
  for (const bad of ["http://cdn.example.com/bg.mp4", "javascript:alert(1)", "data:video/mp4;base64,AA", "//evil.example/bg.mp4", "not a url", 42, null]) {
    assert.equal(safeVideoUrl(bad), null, String(bad));
  }
});

test("stored appearance is normalized: bad fields fall back, dim is clamped", () => {
  assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance({ video: "yes", videoUrl: "http://x", dim: "abc" }), DEFAULT_APPEARANCE);
  assert.equal(normalizeAppearance({ dim: 5 }).dim, DIM_RANGE.max);
  assert.equal(normalizeAppearance({ dim: -1 }).dim, DIM_RANGE.min);
  assert.deepEqual(normalizeAppearance({ video: false, videoUrl: "/v.mp4", dim: 0.7 }), { video: false, videoUrl: "/v.mp4", dim: 0.7 });
});
