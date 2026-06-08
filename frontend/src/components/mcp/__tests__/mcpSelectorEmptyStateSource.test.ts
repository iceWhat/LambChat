import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readSource(relativePath: string): string {
  const url = new URL(relativePath, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const componentSource = readSource("../McpSelectorEmptyState.tsx");
const consumers = ["../EnvKeysSelector.tsx", "../RoleSelector.tsx"];

test("mcp selector dropdown empty states share one presentation component", () => {
  assert.match(componentSource, /export function McpSelectorEmptyState\(/);
  assert.match(
    componentSource,
    /className="py-3 text-center text-xs text-stone-400 dark:text-stone-500"/,
  );

  for (const relativePath of consumers) {
    const source = readSource(relativePath);
    assert.match(
      source,
      /import \{ McpSelectorEmptyState \} from "\.\/McpSelectorEmptyState"/,
    );
    assert.match(source, /<McpSelectorEmptyState>/);
    assert.doesNotMatch(
      source,
      /py-3 text-center text-xs text-stone-400 dark:text-stone-500/,
    );
  }
});
