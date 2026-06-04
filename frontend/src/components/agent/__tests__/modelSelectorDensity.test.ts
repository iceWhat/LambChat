import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../ModelSelector.tsx", import.meta.url), {
  encoding: "utf8",
});

test("model selector dropdown keeps a compact visual density", () => {
  assert.match(source, /w-\[min\(calc\(100vw-0\.75rem\),24rem\)\]/);
  assert.match(source, /const dropdownWidth = Math\.min\(384,/);
  assert.match(source, /min-h-\[38px\]/);
  assert.match(source, /px-2\.5 py-1\.5/);
  assert.match(source, /px-3 py-2/);
  assert.doesNotMatch(source, /min-h-\[46px\]/);
  assert.doesNotMatch(source, /w-\[min\(calc\(100vw-1rem\),28rem\)\]/);
});
