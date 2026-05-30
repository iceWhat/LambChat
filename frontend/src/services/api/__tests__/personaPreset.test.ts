import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPersonaPresetListUrl,
  buildPersonaPresetPreferenceUrl,
  personaPresetApi,
} from "../personaPreset.ts";

test("buildPersonaPresetPreferenceUrl encodes preset ids", () => {
  assert.equal(
    buildPersonaPresetPreferenceUrl("preset/1"),
    "/api/persona-presets/preset%2F1/preference",
  );
});

test("buildPersonaPresetListUrl keeps page-sized pagination params", () => {
  assert.equal(
    buildPersonaPresetListUrl({ skip: 12, limit: 12, q: "planner" }),
    "/api/persona-presets/?q=planner&skip=12&limit=12",
  );
});

test("personaPresetApi.list reuses in-flight and fresh identical list requests", async () => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  let fetchCount = 0;

  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  } as unknown as Storage;
  globalThis.window = {
    dispatchEvent: () => true,
    location: { pathname: "/chat", search: "" },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({
        presets: [],
        total: 0,
        skip: 0,
        limit: 20,
      }),
      { status: 200 },
    );
  };

  try {
    const params = { skip: 0, limit: 20 };
    const [first, second] = await Promise.all([
      personaPresetApi.list(params),
      personaPresetApi.list(params),
    ]);
    const third = await personaPresetApi.list(params);

    assert.equal(fetchCount, 1);
    assert.equal(first.total, 0);
    assert.equal(second.total, 0);
    assert.equal(third.total, 0);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
    globalThis.window = previousWindow;
  }
});
