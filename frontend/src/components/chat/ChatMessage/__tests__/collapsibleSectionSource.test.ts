import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("collapsible section header does not nest action buttons inside the toggle", () => {
  const componentSource = readFileSync(
    new URL("../SubagentBlocks.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    componentSource,
    /<button[\s\S]*?\{action && <span onClick=\{\(e\) => e\.stopPropagation\(\)\}>\{action\}<\/span>\}[\s\S]*?<\/button>/,
    "action controls such as CopyButton should not render inside the header toggle button",
  );
  assert.match(
    componentSource,
    /<button[\s\S]*?aria-expanded=\{expanded\}[\s\S]*?onClick=\{toggleExpanded\}/,
    "the collapsible header toggle should remain a keyboard-reachable native button",
  );
  assert.match(
    componentSource,
    /\{action && <div className="shrink-0">\{action\}<\/div>\}/,
    "action controls should render as siblings of the header toggle",
  );
});
