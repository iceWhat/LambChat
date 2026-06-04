import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const previewSource = readFileSync(
  new URL("../PptPreview.tsx", import.meta.url),
  "utf8",
);
const stateSource = readFileSync(
  new URL("../../useDocumentPreviewState.ts", import.meta.url),
  "utf8",
);
const frontendPackage = JSON.parse(
  readFileSync(new URL("../../../../../package.json", import.meta.url), "utf8"),
);

test("PPT preview renders locally instead of embedding Office Online", () => {
  assert.match(previewSource, /from\s+"@jvmr\/pptx-to-html"/);
  assert.doesNotMatch(previewSource, /from\s+"pptx-preview"/);
  assert.doesNotMatch(previewSource, /view\.officeapps\.live\.com/);
  assert.doesNotMatch(previewSource, /<iframe\b/);
  assert.doesNotMatch(previewSource, /https:\/\/.*office/i);
});

test("PPT preview receives file bytes for browser-side rendering", () => {
  const pptBranch = stateSource.match(
    /if \(pptFile\) \{(?<body>[\s\S]*?)\n\s*\}\n\n\s*if \(htmlFile\)/,
  )?.groups?.body;

  assert.ok(pptBranch, "pptFile branch should exist");
  assert.match(pptBranch, /fetchDocumentArrayBuffer\(url\)/);
  assert.match(pptBranch, /setPptxBuffer\(buffer\)/);
  assert.doesNotMatch(pptBranch, /setPptUrl\(url\)/);
});

test("PPT preview does not let placeholder text content bypass storage bytes", () => {
  assert.match(
    stateSource,
    /content !== undefined && !\(pptFile && \(s3Key \|\| signedUrl\)\)/,
  );
});

test("PPT preview dependency is declared for bundled local rendering", () => {
  assert.equal(frontendPackage.dependencies["@jvmr/pptx-to-html"], "^1.0.1");
  assert.equal(frontendPackage.dependencies["pptx-preview"], undefined);
});

test("PPT preview normalizes mislabeled SVG image data URLs before injection", async () => {
  const { normalizePptxRenderedHtml } = await import("../pptHtmlPreview.ts");
  const svgBase64 = btoa('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

  const html = normalizePptxRenderedHtml(
    `<img src="data:image/png;base64,${svgBase64}" />`,
  );

  assert.match(html, /data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(html, /data:image\/png;base64,/);
});

test("PPT preview does not rerender slides from resize measurements", () => {
  assert.doesNotMatch(previewSource, /containerWidth/);
  assert.doesNotMatch(previewSource, /\[arrayBuffer,\s*previewWidth\]/);
  assert.match(
    previewSource,
    /pptxToHtml\(arrayBuffer\.slice\(0\),\s*\{[\s\S]*width:\s*PPT_PREVIEW_WIDTH/,
  );
  assert.match(previewSource, /\[arrayBuffer\]/);
});

test("PPT preview zooms and pans rendered slides without rotation controls", () => {
  assert.match(previewSource, /from\s+"\.{2}\/\.{2}\/common\/ViewerToolbar"/);
  assert.match(previewSource, /showRotation=\{false\}/);
  assert.match(previewSource, /addEventListener\("wheel",\s*handleNativeWheel/);
  assert.match(previewSource, /passive:\s*false/);
  assert.match(previewSource, /event\.preventDefault\(\)/);
  assert.match(previewSource, /onMouseDown=\{handleMouseDown\}/);
  assert.match(previewSource, /transformOrigin:\s*"top center"/);
  assert.match(previewSource, /left:\s*"50%"/);
});

test("PPT preview treats 100 percent zoom as fitting the sidebar width", () => {
  assert.match(previewSource, /ResizeObserver/);
  assert.match(previewSource, /viewportWidth/);
  assert.match(previewSource, /fitScale/);
  assert.match(previewSource, /PPT_VIEWPORT_HORIZONTAL_PADDING/);
  assert.match(previewSource, /fitScale \* scale/);
  assert.match(previewSource, /scale=\{scale\}/);
});
