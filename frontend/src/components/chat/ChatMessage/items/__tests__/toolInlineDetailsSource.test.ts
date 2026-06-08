import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

const inlineConsumers = [
  "../EditFileItem.tsx",
  "../GlobItem.tsx",
  "../GrepItem.tsx",
  "../LsItem.tsx",
  "../ReadFileItem.tsx",
  "../WriteFileItem.tsx",
];

test("tool inline preview details share the indented scroll container", () => {
  const source = readSource("../ToolInlineDetails.tsx");

  assert.match(source, /export function ToolInlineDetails/);
  assert.match(
    source,
    /mt-2 ml-4 pl-3 border-l-2 border-theme-border max-h-80 overflow-y-auto overflow-x-hidden min-w-0/,
  );

  for (const relativePath of inlineConsumers) {
    const consumer = readSource(relativePath);

    assert.match(
      consumer,
      /import \{ ToolInlineDetails \} from "\.\/ToolInlineDetails"/,
      `${relativePath} should import ToolInlineDetails`,
    );
    assert.match(
      consumer,
      /<ToolInlineDetails>/,
      `${relativePath} should use ToolInlineDetails`,
    );
    assert.doesNotMatch(
      consumer,
      /mt-2 ml-4 pl-3 border-l-2 border-theme-border max-h-80 overflow-y-auto overflow-x-hidden min-w-0/,
      `${relativePath} should not duplicate inline details classes`,
    );
  }
});
