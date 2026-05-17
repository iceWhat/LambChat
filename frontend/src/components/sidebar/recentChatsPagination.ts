import type { BackendSession } from "../../services/api/session";

export interface RecentChatsPaginationState {
  sessions: BackendSession[];
  skip: number;
  hasMore: boolean;
}

export function mergeRecentChatSessions(
  previous: BackendSession[],
  nextPage: BackendSession[],
): BackendSession[] {
  const seen = new Set<string>();
  return [...previous, ...nextPage].filter((session) => {
    if (seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
}

export function getNextRecentChatsState(input: {
  previousSessions: BackendSession[];
  pageSessions: BackendSession[];
  previousSkip: number;
  reset: boolean;
  hasMore: boolean;
}): RecentChatsPaginationState {
  const sessions = input.reset
    ? mergeRecentChatSessions([], input.pageSessions)
    : mergeRecentChatSessions(input.previousSessions, input.pageSessions);

  return {
    sessions,
    skip: input.reset
      ? input.pageSessions.length
      : input.previousSkip + input.pageSessions.length,
    hasMore: input.pageSessions.length > 0 ? input.hasMore : false,
  };
}
