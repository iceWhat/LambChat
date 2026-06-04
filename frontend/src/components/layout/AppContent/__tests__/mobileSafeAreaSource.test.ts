import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("app shell reserves native mobile status bar safe area", () => {
  const shell = readSource("../AppShell.tsx");
  const tokens = readSource("../../../../styles/tokens.css");

  assert.match(
    tokens,
    /--app-safe-area-top:\s*env\(safe-area-inset-top, 0px\)/,
  );
  assert.match(tokens, /--app-fullscreen-safe-area-top:\s*0px/);
  assert.match(tokens, /--app-fullscreen-safe-area-bottom:\s*0px/);
  assert.match(
    tokens,
    /@media \(display-mode: standalone\), \(display-mode: fullscreen\)\s*\{[\s\S]*--app-fullscreen-safe-area-top:\s*12px/,
  );
  assert.match(
    tokens,
    /@media \(display-mode: standalone\), \(display-mode: fullscreen\)\s*\{[\s\S]*--app-fullscreen-safe-area-bottom:\s*12px/,
  );
  assert.match(shell, /boxSizing:\s*"content-box"/);
  assert.match(shell, /paddingTop:\s*appSafeAreaTop/);
  assert.match(shell, /paddingBottom:\s*appSafeAreaBottom/);
  assert.match(
    shell,
    /height:\s*`calc\(var\(--app-viewport-height, 100dvh\) - \$\{appSafeAreaTop\} - \$\{appSafeAreaBottom\}\)`/,
  );
});
