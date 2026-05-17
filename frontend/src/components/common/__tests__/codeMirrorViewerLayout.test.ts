import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("CodeMirrorViewer fills the available parent height by default", () => {
  const source = readSource("../CodeMirrorViewer.tsx");

  assert.match(source, /"\.cm-editor":\s*\{\s*height:\s*"100%"/);
  assert.match(source, /"\.cm-scroller":\s*\{[\s\S]*height:\s*"100%"/);
  assert.match(source, /"\.cm-content":\s*\{\s*minHeight:\s*"100% !important"/);
  assert.match(
    source,
    /"\.cm-gutters, \.cm-gutter":\s*\{[\s\S]*minHeight:\s*"100% !important"/,
  );
  assert.match(source, /isDark \? "#282c34" : "#ffffff"/);
  assert.match(source, /isDark \? "#282c34" : "#fafafa"/);
  assert.match(source, /<CodeMirror[\s\S]*className="h-full"/);
  assert.match(source, /<CodeMirror[\s\S]*height="100%"/);
  assert.match(source, /copyable \? "group relative h-full"/);
});

test("document code preview relies on the shared viewer fill behavior", () => {
  const source = readSource("../../documents/previews/CodeRenderer.tsx");

  assert.doesNotMatch(source, /\[&_\.cm-editor\]:h-full/);
  assert.doesNotMatch(source, /\[&_\.cm-scroller\]:!overflow-auto/);
  assert.match(source, /dark:bg-\[#282c34\]/);
  assert.match(source, /className="h-full"/);
});
