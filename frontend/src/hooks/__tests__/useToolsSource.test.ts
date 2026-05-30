import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const useToolsSource = readFileSync(
  new URL("../useTools.ts", import.meta.url),
  "utf8",
);

test("does not fetch tools before an agent-specific refresh is requested", () => {
  assert.doesNotMatch(
    useToolsSource,
    /\/\/ 初始加载\s*useEffect\(\(\) => \{\s*fetchTools\(\);\s*\}, \[fetchTools\]\);/,
  );
  assert.match(useToolsSource, /refreshToolsForAgent = useCallback/);
});
