import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../Header.tsx", import.meta.url), "utf8");

test("header overflow menu shares item and icon wrappers", () => {
  assert.match(source, /function HeaderMenuItem\(/);
  assert.match(source, /function HeaderMenuIcon\(/);
  assert.match(
    source,
    /className="flex w-full items-center gap-3 px-3 py-2\.5 text-left text-sm transition-colors text-\[var\(--theme-text-secondary\)\] hover:text-\[var\(--theme-text\)\] hover:bg-\[var\(--theme-primary-light\)\]"/,
  );
  assert.match(
    source,
    /className="flex items-center justify-center w-5 shrink-0"/,
  );

  assert.equal(
    source.match(
      /flex w-full items-center gap-3 px-3 py-2\.5 text-left text-sm transition-colors text-\[var\(--theme-text-secondary\)\] hover:text-\[var\(--theme-text\)\] hover:bg-\[var\(--theme-primary-light\)\]/g,
    )?.length,
    1,
  );
  assert.equal(
    source.match(/flex items-center justify-center w-5 shrink-0/g)?.length,
    1,
  );
});
