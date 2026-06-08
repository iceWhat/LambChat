import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

const argsCopyConsumers = [
  "../EditFileItem.tsx",
  "../ExecuteItem.tsx",
  "../GlobItem.tsx",
  "../GrepItem.tsx",
  "../LsItem.tsx",
  "../McpBlockPreview.tsx",
  "../ReadFileItem.tsx",
  "../WriteFileItem.tsx",
];

test("tool argument copy controls share one hover-positioned wrapper", () => {
  const source = readSource("../ToolHoverCopyButton.tsx");

  assert.match(
    source,
    /type ToolHoverCopyPosition =[\s\S]*"args"[\s\S]*"argsCompact"[\s\S]*"panel"[\s\S]*"panelRaised"[\s\S]*"panelCompact"[\s\S]*"panelCompactRaised"[\s\S]*"result"[\s\S]*"resultCompact"/,
  );
  assert.match(
    source,
    /args:\s*"absolute top-1\.5 right-1\.5 opacity-0 group-hover\/args:opacity-100 transition-opacity"/,
  );
  assert.match(
    source,
    /argsCompact:\s*"absolute top-0\.5 right-0\.5 opacity-0 group-hover\/args:opacity-100 transition-opacity"/,
  );
  assert.match(
    source,
    /panel:\s*"absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"/,
  );
  assert.match(
    source,
    /panelRaised:\s*"absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"/,
  );
  assert.match(
    source,
    /panelCompact:\s*"absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"/,
  );
  assert.match(
    source,
    /panelCompactRaised:\s*"absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"/,
  );
  assert.match(
    source,
    /result:\s*"absolute top-1\.5 right-1\.5 opacity-0 group-hover\/result:opacity-100 transition-opacity"/,
  );
  assert.match(
    source,
    /resultCompact:\s*"absolute top-0\.5 right-0\.5 opacity-0 group-hover\/result:opacity-100 transition-opacity"/,
  );
  assert.match(source, /<CopyButton/);

  for (const relativePath of argsCopyConsumers) {
    const consumer = readSource(relativePath);

    assert.match(
      consumer,
      /import \{ ToolHoverCopyButton \} from "\.\/ToolHoverCopyButton"/,
      `${relativePath} should import ToolHoverCopyButton`,
    );
    if (relativePath !== "../McpBlockPreview.tsx") {
      assert.match(
        consumer,
        /<ToolHoverCopyButton[\s\S]*position="args"/,
        `${relativePath} should use the full argument copy position`,
      );
      assert.match(
        consumer,
        /<ToolHoverCopyButton[\s\S]*position="argsCompact"/,
        `${relativePath} should use the compact argument copy position`,
      );
    }
    if (relativePath === "../McpBlockPreview.tsx") {
      assert.match(
        consumer,
        /<ToolHoverCopyButton[\s\S]*position="resultCompact"/,
        `${relativePath} should use the compact result copy position`,
      );
    }
    assert.doesNotMatch(
      consumer,
      /absolute top-(?:1\.5|0\.5|2|1) right-(?:1\.5|0\.5|2|1) opacity-0 group-hover(?:\/args|\/result)?:opacity-100 transition-opacity(?: z-10)?/,
      `${relativePath} should not duplicate hover copy wrapper classes`,
    );
  }
});
