import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../SidebarSkeleton.tsx", import.meta.url),
  "utf8",
);

test("sidebar skeleton shares repeated rail and nav row primitives", () => {
  assert.match(source, /function SidebarRailIconSkeleton\(\)/);
  assert.match(source, /function SidebarNavRowSkeleton\(/);
  assert.match(source, /className="skeleton-line size-9 rounded-full mx-2"/);
  assert.match(
    source,
    /className="w-full h-8 rounded-\[10px\] flex items-center gap-3 px-\[9px\]"/,
  );
  assert.match(source, /className="skeleton-line size-5 rounded-md shrink-0"/);

  assert.equal(
    source.match(/skeleton-line size-9 rounded-full mx-2/g)?.length,
    1,
  );
  assert.equal(
    source.match(
      /w-full h-8 rounded-\[10px\] flex items-center gap-3 px-\[9px\]/g,
    )?.length,
    1,
  );
  assert.equal(
    source.match(/skeleton-line size-5 rounded-md shrink-0/g)?.length,
    1,
  );
});
