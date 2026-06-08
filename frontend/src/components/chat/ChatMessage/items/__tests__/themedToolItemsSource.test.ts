import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

const themedItems = [
  { file: "../ImageGenerateItem.tsx", accent: "rose" },
  { file: "../AudioTranscribeItem.tsx", accent: "violet" },
  { file: "../ScheduledTaskItem.tsx", accent: "amber" },
  { file: "../EnvVarItem.tsx", accent: "emerald" },
  { file: "../PersonaItem.tsx", accent: "violet" },
  { file: "../TeamItem.tsx", accent: "sky" },
  { file: "../SandboxMcpItem.tsx", accent: "teal" },
];

test("internal tool items keep distinct accents while using theme surfaces", () => {
  for (const { file, accent } of themedItems) {
    const source = readSource(file);

    assert.match(
      source,
      new RegExp(`text-${accent}-[0-9]`),
      `${file} should expose its ${accent} accent color`,
    );
    assert.match(
      source,
      /bg-theme-bg/,
      `${file} should use theme background surfaces`,
    );
    assert.match(
      source,
      /border-theme-border/,
      `${file} should use theme border surfaces`,
    );
  }
});

test("sandbox MCP renders as a teal terminal card instead of a stone panel", () => {
  const source = readSource("../SandboxMcpItem.tsx");

  assert.match(source, /Terminal/);
  assert.match(source, /text-teal-500/);
  assert.match(source, /bg-teal-950/);
  assert.match(source, /border-teal-500\/20/);
  assert.match(source, /command\.length > 120/);
  assert.doesNotMatch(source, /bg-stone-900|dark:bg-stone-950/);
});
