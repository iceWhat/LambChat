import test from "node:test";
import assert from "node:assert/strict";

import { buildRoleListUrl, roleApi } from "../role.ts";

test("buildRoleListUrl includes pagination and search params", () => {
  assert.equal(
    buildRoleListUrl({ skip: 20, limit: 10, q: "admin" }),
    "/api/roles/?skip=20&limit=10&q=admin",
  );
});

test("roleApi.list reuses in-flight and fresh identical list requests", async () => {
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
    return new Response(
      JSON.stringify({
        roles: [],
        total: 0,
        skip: 0,
        limit: 200,
      }),
      { status: 200 },
    );
  };

  try {
    const params = { limit: 200 };
    const [first, second] = await Promise.all([
      roleApi.list(params),
      roleApi.list(params),
    ]);
    const third = await roleApi.list(params);

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
