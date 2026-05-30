import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wrapperSource = readFileSync(
  new URL("../TeamBuilderWrapper.tsx", import.meta.url),
  "utf8",
);

test("team cards expose a use action that opens chat in team mode", () => {
  assert.match(wrapperSource, /Sparkles/);
  assert.match(wrapperSource, /handleUseTeam/);
  assert.match(
    wrapperSource,
    /navigate\(`\/chat\?agent=team&team=\$\{encodeURIComponent\(team\.id\)\}`/,
  );
  assert.match(wrapperSource, /title=\{t\("team\.use"/);
});

test("team use action has locale entries", () => {
  const zhLocale = JSON.parse(
    readFileSync(
      new URL("../../../i18n/locales/zh.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(zhLocale.team.use, "使用");
  assert.match(zhLocale.team.useSuccess, /^已切换到团队/);
});
