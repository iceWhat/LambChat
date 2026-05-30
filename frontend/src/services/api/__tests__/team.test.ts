import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTeamCloneUrl,
  buildTeamCollectionUrl,
  buildTeamItemUrl,
  buildTeamPreferenceUrl,
  teamApi,
} from "../team.ts";

test("buildTeamCollectionUrl uses the backend collection route", () => {
  assert.equal(buildTeamCollectionUrl(), "/api/teams/");
});

test("buildTeamCollectionUrl includes pagination params", () => {
  assert.equal(buildTeamCollectionUrl(10, 25), "/api/teams/?skip=10&limit=25");
});

test("buildTeamCollectionUrl includes filters", () => {
  assert.equal(
    buildTeamCollectionUrl({
      skip: 10,
      limit: 25,
      q: "research",
      tag: "analysis",
      pinned: true,
    }),
    "/api/teams/?skip=10&limit=25&q=research&tag=analysis&pinned=true",
  );
});

test("buildTeamItemUrl encodes team ids", () => {
  assert.equal(buildTeamItemUrl("team/1"), "/api/teams/team%2F1");
});

test("buildTeamCloneUrl encodes team ids", () => {
  assert.equal(buildTeamCloneUrl("team/1"), "/api/teams/team%2F1/clone");
});

test("buildTeamPreferenceUrl matches the backend preference route", () => {
  assert.equal(
    buildTeamPreferenceUrl("team/1"),
    "/api/teams/team%2F1/preference",
  );
});

test("teamApi.list reuses in-flight and fresh identical list requests", async () => {
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
        teams: [],
        total: 0,
        skip: 0,
        limit: 50,
      }),
      { status: 200 },
    );
  };

  try {
    const [first, second] = await Promise.all([
      teamApi.list(0, 50),
      teamApi.list(0, 50),
    ]);
    const third = await teamApi.list(0, 50);

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
