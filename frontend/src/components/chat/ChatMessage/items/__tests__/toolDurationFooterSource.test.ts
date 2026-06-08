import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

const footerConsumers = [
  "../EditFileItem.tsx",
  "../ExecuteItem.tsx",
  "../GlobItem.tsx",
  "../GrepItem.tsx",
  "../LsItem.tsx",
  "../ReadFileItem.tsx",
  "../WriteFileItem.tsx",
  "../../ToolCallItem.tsx",
];

test("tool item duration footers share one component and formatter", () => {
  const footer = readSource("../ToolDurationFooter.tsx");
  const helper = readSource("../toolDuration.ts");

  assert.match(helper, /export function getToolDurationSeconds/);
  assert.match(helper, /export function formatToolDuration/);
  assert.match(footer, /export function ToolDurationFooter/);
  assert.match(
    footer,
    /import \{ formatToolDuration, getToolDurationSeconds \}/,
  );
  assert.doesNotMatch(footer, /export function formatToolDuration/);
  assert.doesNotMatch(footer, /export function getToolDurationSeconds/);
  assert.match(
    footer,
    /flex items-center gap-1\.5 px-4 py-2 text-xs text-stone-400 dark:text-stone-500 border-t border-stone-100 dark:border-stone-800/,
  );
  assert.match(footer, /<Clock size=\{11\} className="shrink-0" \/>/);
  assert.match(footer, /<span className="tabular-nums">/);

  for (const relativePath of footerConsumers) {
    const source = readSource(relativePath);

    assert.match(
      source,
      /import \{ ToolDurationFooter \} from "\.\/ToolDurationFooter"|import \{ ToolDurationFooter \} from "\.\/items\/ToolDurationFooter"/,
      `${relativePath} should import the shared footer`,
    );
    assert.match(
      source,
      /<ToolDurationFooter startedAt=\{startedAt\} completedAt=\{completedAt\} \/>/,
      `${relativePath} should render the shared footer`,
    );
    assert.doesNotMatch(source, /Math\.round\(ms \/ 1000\)/);
    assert.doesNotMatch(
      source,
      /border-t border-stone-100 dark:border-stone-800/,
    );
  }
});
