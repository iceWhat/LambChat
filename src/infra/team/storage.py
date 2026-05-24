"""Team storage."""

import uuid
from typing import TYPE_CHECKING, Any, Optional

from bson import ObjectId

from src.infra.utils.datetime import utc_now
from src.kernel.config import settings
from src.kernel.schemas.persona_preset import PersonaStarterPrompt
from src.kernel.schemas.team import TeamMemberResponse, TeamResponse, TeamVisibility

if TYPE_CHECKING:
    from motor.motor_asyncio import AsyncIOMotorCollection


class TeamStorage:
    """MongoDB storage for teams."""

    def __init__(self) -> None:
        self._collection: "AsyncIOMotorCollection[Any] | None" = None
        self._user_collection: "AsyncIOMotorCollection[Any] | None" = None

    @property
    def collection(self) -> "AsyncIOMotorCollection[Any]":
        """Lazy MongoDB collection."""
        if self._collection is None:
            from src.infra.storage.mongodb import get_mongo_client

            client = get_mongo_client()
            db = client[settings.MONGODB_DB]
            self._collection = db["teams"]
        return self._collection

    @property
    def user_collection(self) -> "AsyncIOMotorCollection[Any]":
        """Lazy MongoDB users collection for per-user team preferences."""
        if self._user_collection is None:
            from src.infra.storage.mongodb import get_mongo_client

            client = get_mongo_client()
            db = client[settings.MONGODB_DB]
            self._user_collection = db["users"]
        return self._user_collection

    MAX_PINNED = 10

    @staticmethod
    def _user_query_id(user_id: str) -> ObjectId | str:
        try:
            return ObjectId(user_id)
        except Exception:
            return user_id

    # ── Document conversion ──

    @staticmethod
    def _member_doc(member: dict[str, Any]) -> dict[str, Any]:
        """Convert client/member data to a storage member document."""
        return {
            "member_id": member.get("member_id") or f"m-{uuid.uuid4().hex[:12]}",
            "persona_preset_id": member.get("persona_preset_id", ""),
            "role_name": member.get("role_name", ""),
            "role_avatar": member.get("role_avatar"),
            "role_tags": member.get("role_tags", []),
            "role_instructions": member.get("role_instructions", ""),
            "position": member.get("position", 0),
            "enabled": member.get("enabled", True),
        }

    @staticmethod
    def _starter_prompt_docs(prompts: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        """Normalize team starter prompts before persistence."""
        result: list[dict[str, Any]] = []
        for prompt in prompts or []:
            result.append(PersonaStarterPrompt(**prompt).model_dump(mode="json"))
        return result

    @staticmethod
    def _tags_doc(tags: list[str] | None) -> list[str]:
        """Normalize team tags before persistence."""
        seen: set[str] = set()
        result: list[str] = []
        for tag in tags or []:
            item = str(tag).strip()
            if not item or item in seen:
                continue
            seen.add(item)
            result.append(item)
        return result

    @staticmethod
    def _resolve_default_member_id(
        members: list[dict[str, Any]],
        requested_default_member_id: str | None,
    ) -> str | None:
        """Keep a valid default member id, defaulting to the first member."""
        if not members:
            return None

        member_ids = {member["member_id"] for member in members}
        if requested_default_member_id in member_ids:
            return requested_default_member_id
        return members[0]["member_id"]

    @staticmethod
    def _doc_to_response(doc: dict[str, Any]) -> TeamResponse:
        """Convert a MongoDB document to a TeamResponse."""
        result = dict(doc)
        if "_id" in result:
            result["id"] = str(result.pop("_id"))

        members_raw = result.pop("members", [])
        members = []
        for m in members_raw:
            members.append(
                TeamMemberResponse(
                    member_id=m.get("member_id", ""),
                    persona_preset_id=m.get("persona_preset_id", ""),
                    role_name=m.get("role_name", ""),
                    role_avatar=m.get("role_avatar"),
                    role_tags=m.get("role_tags", []),
                    role_instructions=m.get("role_instructions", ""),
                    position=m.get("position", 0),
                    enabled=m.get("enabled", True),
                )
            )
        result["members"] = members
        result.setdefault("description", "")
        result.setdefault("avatar", None)
        result.setdefault("tags", [])
        result.setdefault("default_member_id", None)
        result.setdefault("team_instructions", "")
        result.setdefault("starter_prompts", [])
        result.setdefault("visibility", TeamVisibility.PRIVATE.value)
        result.setdefault("is_favorite", False)
        result.setdefault("is_pinned", False)
        result.setdefault("last_used_at", None)
        return TeamResponse(**result)

    # ── User preference helpers (stored in user metadata) ──

    async def _get_user_team_preference(self, user_id: str) -> dict[str, list[str]]:
        doc = await self.user_collection.find_one(
            {"_id": self._user_query_id(user_id)},
            {"metadata.pinned_team_ids": 1, "metadata.favorite_team_ids": 1},
        )
        metadata = (doc or {}).get("metadata") or {}
        return {
            "pinned": metadata.get("pinned_team_ids") or [],
            "favorite": metadata.get("favorite_team_ids") or [],
        }

    async def _set_user_team_preference(
        self,
        user_id: str,
        pref: dict[str, list[str]],
    ) -> None:
        await self.user_collection.update_one(
            {"_id": self._user_query_id(user_id)},
            {
                "$set": {
                    "metadata.pinned_team_ids": pref["pinned"],
                    "metadata.favorite_team_ids": pref["favorite"],
                    "updated_at": utc_now(),
                }
            },
        )

    async def update_user_preference(
        self,
        *,
        user_id: str,
        team_id: str,
        update: dict[str, Any],
    ) -> dict[str, Any]:
        """Update the current user's favorite/pinned state for a team."""
        pref = await self._get_user_team_preference(user_id)
        pinned: list[str] = list(pref["pinned"])
        favorite: list[str] = list(pref["favorite"])

        if update.get("is_pinned") is not None:
            if update["is_pinned"] and team_id not in pinned:
                if len(pinned) >= self.MAX_PINNED:
                    return {
                        "is_favorite": team_id in favorite,
                        "is_pinned": False,
                        "last_used_at": None,
                    }
                pinned.append(team_id)
            elif not update["is_pinned"] and team_id in pinned:
                pinned.remove(team_id)

        if update.get("is_favorite") is not None:
            if update["is_favorite"] and team_id not in favorite:
                favorite.append(team_id)
            elif not update["is_favorite"] and team_id in favorite:
                favorite.remove(team_id)

        await self._set_user_team_preference(user_id, {"pinned": pinned, "favorite": favorite})
        return {
            "is_favorite": team_id in favorite,
            "is_pinned": team_id in pinned,
            "last_used_at": None,
        }

    async def _remove_team_from_all_user_preferences(self, team_id: str) -> None:
        """Remove a deleted team id from user preference lists."""
        await self.user_collection.update_many(
            {},
            {
                "$pull": {
                    "metadata.pinned_team_ids": team_id,
                    "metadata.favorite_team_ids": team_id,
                }
            },
        )

    async def _apply_user_preferences(
        self,
        user_id: str,
        teams: list[TeamResponse],
    ) -> list[TeamResponse]:
        if not teams:
            return teams
        pref = await self._get_user_team_preference(user_id)
        pinned_set = set(pref["pinned"])
        favorite_set = set(pref["favorite"])
        return [
            team.model_copy(
                update={
                    "is_pinned": team.id in pinned_set,
                    "is_favorite": team.id in favorite_set,
                    "last_used_at": None,
                }
            )
            for team in teams
        ]

    @staticmethod
    def _preference_sort_key(team: TeamResponse) -> tuple:
        updated = team.updated_at
        created = team.created_at
        return (
            0 if team.is_pinned else 1,
            0 if team.is_favorite else 1,
            -(updated.timestamp() if updated else 0),
            -(created.timestamp() if created else 0),
        )

    # ── CRUD ──

    async def create_team(
        self,
        *,
        owner_user_id: str,
        name: str,
        description: str = "",
        avatar: str | None = None,
        tags: list[str] | None = None,
        members: list[dict[str, Any]] | None = None,
        default_member_id: str | None = None,
        team_instructions: str = "",
        starter_prompts: list[dict[str, Any]] | None = None,
    ) -> TeamResponse:
        """Create a new team."""
        now = utc_now()
        members_docs = [self._member_doc(m) for m in members or []]
        doc: dict[str, Any] = {
            "owner_user_id": owner_user_id,
            "name": name,
            "description": description,
            "avatar": avatar,
            "tags": self._tags_doc(tags),
            "members": members_docs,
            "default_member_id": self._resolve_default_member_id(
                members_docs,
                default_member_id,
            ),
            "team_instructions": team_instructions,
            "starter_prompts": self._starter_prompt_docs(starter_prompts),
            "visibility": TeamVisibility.PRIVATE.value,
            "created_at": now,
            "updated_at": now,
        }
        insert_result = await self.collection.insert_one(doc)
        doc["_id"] = insert_result.inserted_id
        return self._doc_to_response(doc)

    async def get_team(
        self,
        team_id: str,
        *,
        owner_user_id: str,
    ) -> Optional[TeamResponse]:
        """Get a team by ID, scoped to owner."""
        try:
            query_id = ObjectId(team_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": query_id, "owner_user_id": owner_user_id})
        if not doc:
            return None
        return self._doc_to_response(doc)

    async def list_teams(
        self,
        *,
        owner_user_id: str,
        skip: int = 0,
        limit: int = 100,
        favorite: bool | None = None,
        pinned: bool | None = None,
        q: str | None = None,
        tag: str | None = None,
    ) -> tuple[list[TeamResponse], int]:
        """List teams for an owner, paginated. Returns (teams, total)."""
        query: dict[str, Any] = {"owner_user_id": owner_user_id}
        if favorite is True or pinned is True:
            pref = await self._get_user_team_preference(owner_user_id)
            target_ids: set[str] = set()
            if pinned:
                target_ids.update(pref["pinned"])
            if favorite:
                target_ids.update(pref["favorite"])
            if not target_ids:
                return [], 0
            try:
                query["_id"] = {"$in": [ObjectId(team_id) for team_id in target_ids]}
            except Exception:
                return [], 0

        cursor = self.collection.find(query)
        docs = [doc async for doc in cursor]
        teams = [self._doc_to_response(doc) for doc in docs]
        if q:
            needle = q.strip().lower()
            if needle:
                teams = [
                    team
                    for team in teams
                    if needle in team.name.lower()
                    or needle in team.description.lower()
                    or any(needle in item.lower() for item in team.tags)
                    or any(
                        needle in member.role_name.lower()
                        or any(needle in item.lower() for item in member.role_tags)
                        for member in team.members
                    )
                ]
        if tag:
            tag_filter = tag.strip()
            if tag_filter:
                teams = [team for team in teams if tag_filter in team.tags]
        teams = await self._apply_user_preferences(owner_user_id, teams)
        teams.sort(key=self._preference_sort_key)
        total = len(teams)
        teams = teams[skip : skip + limit]
        return teams, total

    async def update_team(
        self,
        team_id: str,
        *,
        owner_user_id: str,
        update: dict[str, Any],
    ) -> Optional[TeamResponse]:
        """Update a team by ID, scoped to owner."""
        try:
            query_id = ObjectId(team_id)
        except Exception:
            return None

        update = {k: v for k, v in update.items() if v is not None}
        update["updated_at"] = utc_now()

        # Full replacement semantics for members: regenerate member_ids
        if "members" in update:
            new_members = [self._member_doc(m) for m in update["members"]]
            update["members"] = new_members
            update["default_member_id"] = self._resolve_default_member_id(
                new_members,
                update.get("default_member_id"),
            )
        if "starter_prompts" in update:
            update["starter_prompts"] = self._starter_prompt_docs(
                update["starter_prompts"],
            )
        if "tags" in update:
            update["tags"] = self._tags_doc(update["tags"])

        if not update:
            return await self.get_team(team_id, owner_user_id=owner_user_id)

        doc = await self.collection.find_one_and_update(
            {"_id": query_id, "owner_user_id": owner_user_id},
            {"$set": update},
            return_document=True,
        )
        if not doc:
            return None
        return self._doc_to_response(doc)

    async def delete_team(
        self,
        team_id: str,
        *,
        owner_user_id: str,
    ) -> bool:
        """Delete a team by ID, scoped to owner."""
        try:
            query_id = ObjectId(team_id)
        except Exception:
            return False
        result = await self.collection.delete_one({"_id": query_id, "owner_user_id": owner_user_id})
        if result.deleted_count > 0:
            await self._remove_team_from_all_user_preferences(team_id)
        return result.deleted_count > 0

    async def clone_team(
        self,
        team_id: str,
        *,
        owner_user_id: str,
        new_name: str | None = None,
    ) -> Optional[TeamResponse]:
        """Clone a team for the same owner."""
        original = await self.get_team(team_id, owner_user_id=owner_user_id)
        if not original:
            return None

        # Serialize members back to dicts with new member_ids
        members_data = []
        for m in original.members:
            members_data.append(
                {
                    "persona_preset_id": m.persona_preset_id,
                    "role_name": m.role_name,
                    "role_avatar": m.role_avatar,
                    "role_tags": m.role_tags,
                    "role_instructions": m.role_instructions,
                    "position": m.position,
                    "enabled": m.enabled,
                }
            )

        return await self.create_team(
            owner_user_id=owner_user_id,
            name=new_name or f"{original.name} (copy)",
            description=original.description,
            avatar=original.avatar,
            tags=original.tags,
            members=members_data,
            default_member_id=None,
            team_instructions=original.team_instructions,
            starter_prompts=[prompt.model_dump(mode="json") for prompt in original.starter_prompts],
        )
