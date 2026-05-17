import test from "node:test";
import assert from "node:assert/strict";

import type { BackendSession } from "../../../services/api/session.ts";
import {
  getNextRecentChatsState,
  mergeRecentChatSessions,
} from "../recentChatsPagination.ts";

function session(id: string): BackendSession {
  return {
    id,
    agent_id: "default",
    created_at: "2026-05-18T00:00:00.000Z",
    updated_at: "2026-05-18T00:00:00.000Z",
    is_active: true,
    metadata: {},
  };
}

test("mergeRecentChatSessions appends later pages without duplicating refreshed rows", () => {
  assert.deepEqual(
    mergeRecentChatSessions(
      [session("newest"), session("overlap")],
      [session("overlap"), session("older")],
    ).map((item) => item.id),
    ["newest", "overlap", "older"],
  );
});

test("getNextRecentChatsState advances skip by the appended page size", () => {
  assert.deepEqual(
    getNextRecentChatsState({
      previousSessions: [session("a"), session("b")],
      pageSessions: [session("c"), session("d")],
      previousSkip: 2,
      reset: false,
      hasMore: true,
    }),
    {
      sessions: [session("a"), session("b"), session("c"), session("d")],
      skip: 4,
      hasMore: true,
    },
  );
});

test("getNextRecentChatsState replaces sessions on reset", () => {
  assert.deepEqual(
    getNextRecentChatsState({
      previousSessions: [session("old")],
      pageSessions: [session("fresh")],
      previousSkip: 20,
      reset: true,
      hasMore: false,
    }),
    {
      sessions: [session("fresh")],
      skip: 1,
      hasMore: false,
    },
  );
});
