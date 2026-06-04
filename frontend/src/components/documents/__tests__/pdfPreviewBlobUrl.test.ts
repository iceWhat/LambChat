import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stateSource = readFileSync(
  new URL("../useDocumentPreviewState.ts", import.meta.url),
  "utf8",
);
const contentSource = readFileSync(
  new URL("../DocumentPreviewContent.tsx", import.meta.url),
  "utf8",
);

test("PDF preview uses a local PDF blob URL instead of embedding the download URL directly", () => {
  const pdfBranch = stateSource.match(
    /if \(resolvedPdfFile\) \{(?<body>[\s\S]*?)\n\s*\}\n\n\s*if \(resolvedVideoFile\)/,
  )?.groups?.body;

  assert.ok(pdfBranch, "resolvedPdfFile branch should exist");
  assert.match(pdfBranch, /fetchDocumentArrayBuffer\(url\)/);
  assert.match(
    pdfBranch,
    /new Blob\(\[.*\], \{ type: "application\/pdf" \}\)/s,
  );
  assert.match(pdfBranch, /URL\.createObjectURL/);
  assert.doesNotMatch(pdfBranch, /setPdfUrl\(url\)/);
});

test("PDF preview revokes generated blob URLs", () => {
  assert.match(stateSource, /if \(pdfUrl\?\.startsWith\("blob:"\)\)/);
  assert.match(stateSource, /URL\.revokeObjectURL\(pdfUrl\)/);
});

test("unsupported preview files render a guardrail instead of auto-downloading", () => {
  const unsupportedBranch = stateSource.match(
    /else if \(unsupportedPreviewFile\) \{(?<body>[\s\S]*?)\n\s*\}\s*else if \(wordPreviewFile/,
  )?.groups?.body;

  assert.ok(unsupportedBranch, "unsupported preview branch should exist");
  assert.doesNotMatch(unsupportedBranch, /document\.createElement\("a"\)/);
  assert.match(contentSource, /documents\.unsupportedFilePreview/);
  assert.match(contentSource, /documents\.unsupportedFileHint/);
});
