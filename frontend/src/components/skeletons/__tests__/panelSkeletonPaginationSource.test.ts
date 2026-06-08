import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../PanelSkeletons.tsx", import.meta.url),
  "utf8",
);

test("panel skeletons share the repeated pagination placeholder", () => {
  assert.match(source, /function PanelPaginationSkeleton\(/);
  assert.match(source, /type PanelPaginationVariant =/);
  assert.match(source, /default:\s*"glass-divider px-3 py-3 sm:px-4 mt-2"/);
  assert.match(
    source,
    /transparent:\s*"glass-divider bg-transparent px-4 py-4 sm:px-6 mt-2"/,
  );
  assert.match(
    source,
    /<div className="flex items-center justify-center gap-2">/,
  );
  assert.match(source, /<PanelPaginationSkeleton variant="transparent" \/>/);

  assert.equal(source.match(/skeleton-line size-8 rounded-lg/g)?.length, 2);
  assert.equal(source.match(/skeleton-line w-24 h-3/g)?.length, 1);
  assert.doesNotMatch(source, /skeleton-line h-3 w-24/);
});

test("panel skeletons share segmented tab placeholders", () => {
  assert.match(source, /function PanelSegmentedTabsSkeleton\(/);
  assert.match(
    source,
    /className="inline-grid grid-cols-2 rounded-lg border border-\[var\(--glass-border\)\] bg-\[var\(--glass-bg-subtle\)\] p-1 sm:my-3"/,
  );
  assert.match(
    source,
    /panelSegmentedTabItemClass =\s*"flex items-center justify-center gap-2 rounded-md px-3 py-2"/,
  );

  assert.equal(
    source.match(
      /inline-grid grid-cols-2 rounded-lg border border-\[var\(--glass-border\)\] bg-\[var\(--glass-bg-subtle\)\] p-1 sm:my-3/g,
    )?.length,
    1,
  );
  assert.equal(
    source.match(/flex items-center justify-center gap-2 rounded-md px-3 py-2/g)
      ?.length,
    1,
  );
});
