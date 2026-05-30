import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatMessageSource = readFileSync(
  new URL("../index.tsx", import.meta.url),
  "utf8",
);

test("recommended questions wait for the completed assistant action bar", () => {
  assert.match(
    chatMessageSource,
    /!\s*message\.isStreaming\s*&&\s*isLastMessage\s*&&\s*message\.parts\?\.some\(\(p\) => p\.type === "recommend_questions"\)/,
  );
});
