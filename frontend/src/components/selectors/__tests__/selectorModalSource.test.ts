import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readSource(relativePath: string): string {
  const url = new URL(relativePath, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const modalSource = readSource("../SelectorModal.tsx");
const consumers = [
  "../AgentModeSelector.tsx",
  "../SkillSelector.tsx",
  "../ToolSelector.tsx",
];

test("selector modals share the portal overlay and viewport wrapper", () => {
  assert.match(modalSource, /export function SelectorModalPortal\(/);
  assert.match(
    modalSource,
    /className="fixed inset-0 z-\[300\] bg-black\/50 animate-fade-in"/,
  );
  assert.match(
    modalSource,
    /className="safe-area-viewport-padding fixed z-\[301\] sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 inset-x-0 bottom-0 animate-slide-up sm:animate-scale-in"/,
  );

  for (const relativePath of consumers) {
    const source = readSource(relativePath);

    assert.match(
      source,
      /import \{ SelectorModalPortal \} from "\.\/SelectorModal"/,
      `${relativePath} should import SelectorModalPortal`,
    );
    assert.match(
      source,
      /<SelectorModalPortal/,
      `${relativePath} should render selector modals through the shared portal`,
    );
    assert.doesNotMatch(
      source,
      /fixed inset-0 z-\[300\] bg-black\/50 animate-fade-in/,
      `${relativePath} should not duplicate the modal overlay classes`,
    );
    assert.doesNotMatch(
      source,
      /safe-area-viewport-padding fixed z-\[301\] sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 inset-x-0 bottom-0 animate-slide-up sm:animate-scale-in/,
      `${relativePath} should not duplicate the modal viewport wrapper classes`,
    );
  }
});
