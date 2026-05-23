from src.agents.team_agent.prompt import build_team_members_description
from src.kernel.schemas.team import TeamMemberResponse, TeamResponse


def test_build_team_members_description():
    team = TeamResponse(
        id="t1",
        owner_user_id="u1",
        name="Dev Team",
        members=[
            TeamMemberResponse(
                member_id="m1",
                persona_preset_id="p1",
                role_name="Researcher",
                role_instructions="Focus on facts.",
                position=0,
                enabled=True,
            ),
            TeamMemberResponse(
                member_id="m2", persona_preset_id="p2", role_name="Writer", position=1, enabled=True
            ),
        ],
    )
    desc = build_team_members_description(team)
    assert "Researcher" in desc
    assert "Writer" in desc
    assert "Focus on facts." in desc


def test_build_team_members_description_skips_disabled():
    team = TeamResponse(
        id="t1",
        owner_user_id="u1",
        name="Team",
        members=[
            TeamMemberResponse(
                member_id="m1", persona_preset_id="p1", role_name="Active", enabled=True
            ),
            TeamMemberResponse(
                member_id="m2", persona_preset_id="p2", role_name="Disabled", enabled=False
            ),
        ],
    )
    desc = build_team_members_description(team)
    assert "Active" in desc
    assert "Disabled" not in desc
