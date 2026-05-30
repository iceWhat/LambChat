export interface TeamRouteRequest {
  agentId: "team";
  teamId: string;
}

function getStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field : null;
}

export function getTeamRouteRequest(
  searchParams: URLSearchParams,
  locationState: unknown,
): TeamRouteRequest | null {
  const stateAgentId = getStringField(locationState, "agentId");
  const stateTeamId = getStringField(locationState, "teamId");
  if (stateAgentId === "team" && stateTeamId) {
    return { agentId: "team", teamId: stateTeamId };
  }

  const queryAgentId = searchParams.get("agent");
  const queryTeamId = searchParams.get("team");
  if (queryAgentId === "team" && queryTeamId) {
    return { agentId: "team", teamId: queryTeamId };
  }

  return null;
}
