import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("excalidraw reveal files render with the thumbnail card preview", () => {
  const source = readFileSync(
    new URL("../FileRevealItem.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /ExcalidrawCardPreview/);
  assert.match(source, /const isExcalidraw = isExcalidrawFile/);
  assert.match(source, /canPreview \|\| isExcalidraw/);
  assert.match(source, /<ExcalidrawCardPreview url=\{parsed\.s3Url\} \/>/);
});

test("legacy file_reveal results resolve s3_url for inline previews", () => {
  const source = readFileSync(
    new URL("../FileRevealItem.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /s3Url\s*=\s*getFullUrl\(r\.file\.s3_url\)/);
});
