import test from "node:test";
import assert from "node:assert/strict";

import { agentApi } from "../agent.ts";

test("agentApi.list reuses in-flight and fresh identical list requests", async () => {
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
    location: { pathname: "/settings", search: "" },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ agents: [] }), { status: 200 });
  };

  try {
    const [first, second] = await Promise.all([
      agentApi.list(),
      agentApi.list(),
    ]);
    const third = await agentApi.list();

    assert.equal(fetchCount, 1);
    assert.deepEqual(first, { agents: [] });
    assert.deepEqual(second, { agents: [] });
    assert.deepEqual(third, { agents: [] });
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
    globalThis.window = previousWindow;
  }
});
