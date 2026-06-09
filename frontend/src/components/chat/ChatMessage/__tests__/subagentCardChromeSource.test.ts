import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../SubagentBlocks.tsx", import.meta.url),
  "utf8",
);

test("subagent card chrome uses status-aware border treatment", () => {
  assert.match(source, /ring-amber-300\/70 dark:ring-amber-700\/50/);
  assert.match(
    source,
    /ring-\[color-mix\(in_srgb,var\(--theme-primary\)_38%,transparent\)\]/,
  );
  assert.match(
    source,
    /dark:ring-\[color-mix\(in_srgb,var\(--theme-primary\)_42%,transparent\)\]/,
  );
  assert.match(
    source,
    /bg-\[color-mix\(in_srgb,var\(--theme-primary\)_7%,var\(--theme-bg-card\)\)\]/,
  );
  assert.match(
    source,
    /dark:bg-\[color-mix\(in_srgb,var\(--theme-primary\)_10%,var\(--theme-bg-card\)\)\]/,
  );
  assert.match(source, /ring-red-300\/70 dark:ring-red-900\/45/);
  assert.match(source, /bg-stone-50\/80 dark:bg-stone-800\/40/);
  assert.doesNotMatch(source, /ring-emerald-300\/60 dark:ring-emerald-800\/45/);
  assert.doesNotMatch(source, /bg-emerald-50\/60 dark:bg-emerald-950\/10/);
  assert.doesNotMatch(source, /ring-amber-200\/60/);
  assert.doesNotMatch(source, /ring-red-200\/60/);
  assert.doesNotMatch(source, /border-theme-border\/60/);
});

test("subagent status badge does not use theme-blue border chrome", () => {
  assert.match(source, /bg-theme-bg-card\/90 shadow-sm ring-1/);
  assert.doesNotMatch(source, /ring-theme-border\/70/);
  assert.doesNotMatch(source, /subagent-border-pulse/);
});

test("subagent sidebar timestamp is rendered in the panel footer", () => {
  assert.match(source, /function createSubagentPanelFooter/);
  assert.match(source, /footer: createSubagentPanelFooter\(subtitle\)/);
  assert.doesNotMatch(
    source,
    /subtitle,\s*\n\s*panelKey,\s*\n\s*children: <SubagentPanelContent/,
  );
});
