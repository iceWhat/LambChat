"""
Team Agent 节点 - 团队路由，角色分派

基于 fast_agent/nodes.py 扩展，增加团队解析和多角色子代理。
"""

import time
import uuid
from typing import Any, Dict

from deepagents import create_deep_agent
from deepagents.middleware.subagents import CompiledSubAgent, SubAgent
from langchain_core.runnables import RunnableConfig

from src.agents.core.base import get_presenter
from src.agents.core.node_utils import (
    build_human_message,
    emit_token_usage,
    inline_image_attachments_as_data_urls,
    resolve_fallback_model,
    resolve_model_supports_vision,
)
from src.agents.core.persona import build_persona_prompt_sections
from src.agents.core.subagent_prompts import (
    MAIN_AGENT_PROMPT_SECTIONS,
    SUBAGENT_PROMPT,
    build_role_subagent_prompt,
    get_memory_guide,
)
from src.agents.core.thinking import build_thinking_config
from src.agents.fast_agent.prompt import FAST_SYSTEM_PROMPT
from src.agents.team_agent.context import TeamAgentContext
from src.agents.team_agent.prompt import (
    TEAM_ROUTER_SYSTEM_PROMPT,
    build_team_members_description,
)
from src.infra.agent import AgentEventProcessor
from src.infra.agent.middleware import (
    PromptCachingMiddleware,
    SectionPromptMiddleware,
    ToolResultBinaryMiddleware,
    create_retry_middleware,
)
from src.infra.agent.middleware_subagent import SubagentActivityMiddleware
from src.infra.backend.deepagent import create_persistent_backend_factory
from src.infra.llm.client import LLMClient
from src.infra.logging import get_logger
from src.infra.skill.loader import build_skills_prompt
from src.infra.storage.checkpoint import get_async_checkpointer
from src.infra.storage.mongodb_store import acreate_store
from src.kernel.config import settings

logger = get_logger(__name__)


# ============================================================================
# 节点函数
# ============================================================================


async def team_router_node(state: Dict[str, Any], config: RunnableConfig) -> Dict[str, Any]:
    """
    Team Router 主节点 - 团队路由，角色分派

    特点：
    - 解析团队配置，按角色构建子代理
    - 使用 build_role_subagent_prompt() 为每个角色生成提示词
    - 无团队时回退到单代理模式
    """
    start_time = time.time()

    presenter = get_presenter(config)
    configurable = config.get("configurable", {})
    context: TeamAgentContext = configurable.get("context", TeamAgentContext())

    # 获取 agent_options
    agent_options = configurable.get("agent_options") or {}
    selected_model = agent_options.get("model")
    model_id = agent_options.get("model_id")
    resolved_model_config = agent_options.get("_resolved_model_config")
    thinking_config = build_thinking_config(agent_options)

    # 获取附件
    attachments = state.get("attachments", [])

    # 创建 LLM
    llm_start = time.time()
    llm = await LLMClient.get_model(
        model=selected_model,
        model_id=model_id,
        model_config=resolved_model_config,
        thinking=thinking_config,
    )
    llm_init_time = time.time() - llm_start
    logger.debug(f"[TeamAgent] LLM init: {llm_init_time * 1000:.3f}ms")

    # 查询 fallback_model 配置
    fallback_model_value = agent_options.get("_resolved_fallback_model")
    if "_resolved_fallback_model" not in agent_options:
        fallback_model_value = await resolve_fallback_model(
            model_id, selected_model, log_prefix="[TeamAgent]"
        )
    supports_vision = agent_options.get("_resolved_supports_vision")
    if supports_vision is None:
        supports_vision = await resolve_model_supports_vision(
            model_id, selected_model, log_prefix="[TeamAgent]"
        )
    supports_vision = bool(supports_vision)

    # 多租户隔离
    tenant_id = context.user_id or "default"
    assistant_id = f"assistant-{tenant_id}"

    # ── 团队解析 ──
    team = None
    team_id = configurable.get("team_id")
    if team_id and context.user_id:
        try:
            from src.infra.team.manager import get_team_manager

            tm = get_team_manager()
            team = await tm.resolve_team_for_runtime(team_id, owner_user_id=context.user_id)
            if team:
                logger.info(
                    f"[TeamAgent] Resolved team '{team.name}' "
                    f"with {len(team.active_members)} active members"
                )
            else:
                logger.info("[TeamAgent] Team resolved to None (no active members or not found)")
        except Exception as e:
            logger.warning(f"[TeamAgent] Failed to resolve team: {e}")

    # ── 系统提示 ──
    persona_sections = build_persona_prompt_sections(configurable.get("persona_system_prompt"))

    skills_prompt = ""
    if settings.ENABLE_SKILLS and context.skills:
        try:
            skills_start = time.time()
            skills_prompt = await build_skills_prompt(context.skills)
            skills_init_time = time.time() - skills_start
            logger.debug(f"[TeamAgent] Skills prompt init: {skills_init_time * 1000:.3f}ms")
        except Exception as e:
            logger.warning(f"Failed to build skills prompt: {e}")

    memory_guide = get_memory_guide() if settings.ENABLE_MEMORY else ""

    if team:
        team_members_desc = build_team_members_description(team)
        default_role = "general-purpose"
        if team.default_member_id:
            default_member = next(
                (m for m in team.active_members if m.member_id == team.default_member_id),
                team.active_members[0] if team.active_members else None,
            )
            default_role = (
                (default_member.role_name or default_member.member_id)
                if default_member
                else "general-purpose"
            )
        else:
            default_role = (
                team.active_members[0].role_name if team.active_members else "general-purpose"
            )
        system_prompt = TEAM_ROUTER_SYSTEM_PROMPT.format(
            team_members_description=team_members_desc,
            default_role=default_role,
        )
    else:
        system_prompt = FAST_SYSTEM_PROMPT

    # 创建 backend
    backend_start = time.time()
    backend_factory = create_persistent_backend_factory(
        assistant_id=assistant_id, user_id=context.user_id
    )
    backend = backend_factory(None) if callable(backend_factory) else backend_factory
    logger.info(f"[TeamAgent] Using PersistentBackend for assistant: {assistant_id}")
    backend_init_time = time.time() - backend_start
    logger.debug(f"[TeamAgent] Backend init: {backend_init_time * 1000:.3f}ms")

    # 创建 store
    store = await acreate_store()

    # 过滤工具（懒加载 MCP 工具）
    filtered_tools = None
    if settings.ENABLE_MCP:
        await context.get_tools()
        filtered_tools = context.filter_tools() or None

        if context.deferred_manager is not None and filtered_tools is not None:
            from src.infra.tool.tool_search_tool import ToolSearchTool

            search_tool = ToolSearchTool(
                manager=context.deferred_manager,
                search_limit=settings.DEFERRED_TOOL_SEARCH_LIMIT,
            )
            filtered_tools.append(search_tool)

    # 创建内层 graph (deep agent)
    checkpointer_start = time.time()
    inner_checkpointer = await get_async_checkpointer(thread_id=state.get("session_id"))
    checkpointer_init_time = time.time() - checkpointer_start
    logger.debug(f"[TeamAgent] Checkpointer init: {checkpointer_init_time * 1000:.3f}ms")

    graph_compile_start = time.time()

    # ── 子代理配置 ──
    subagent_base_url = configurable.get("base_url", "")

    def _build_subagent_middleware() -> list:
        """Build the middleware stack for a single subagent."""
        mw = [
            *create_retry_middleware(fallback_model=fallback_model_value, thinking=thinking_config),
            ToolResultBinaryMiddleware(base_url=subagent_base_url),
            SubagentActivityMiddleware(backend=backend),
        ]
        if context.deferred_manager is not None:
            from src.infra.agent.middleware import ToolSearchMiddleware

            subagent_deferred_manager = context.deferred_manager.fork_for_scope(
                "subagent:general-purpose"
            )
            mw.append(
                ToolSearchMiddleware(
                    deferred_manager=subagent_deferred_manager,
                    search_limit=settings.DEFERRED_TOOL_SEARCH_LIMIT,
                )
            )
        mw.append(PromptCachingMiddleware())
        return mw

    custom_subagents: list[SubAgent | CompiledSubAgent] = []

    if team and team.active_members:
        # ── 多角色子代理 ──
        try:
            from src.infra.persona_preset.manager import get_persona_preset_manager

            preset_mgr = get_persona_preset_manager()

            for member in team.active_members:
                try:
                    # 解析 persona preset 获取 system_prompt
                    preset_snapshot = await preset_mgr.use_preset(
                        member.persona_preset_id,
                        user_id=context.user_id or "default",
                        is_admin=False,
                    )
                    role_prompt = build_role_subagent_prompt(
                        role_name=member.role_name,
                        role_system_prompt=preset_snapshot.system_prompt,
                        team_name=team.name,
                        team_instructions=team.team_instructions or None,
                    )
                except Exception as e:
                    logger.warning(
                        f"[TeamAgent] Failed to resolve preset for member "
                        f"'{member.role_name}' ({member.persona_preset_id}): {e}. "
                        f"Using fallback prompt."
                    )
                    role_prompt = build_role_subagent_prompt(
                        role_name=member.role_name,
                        role_system_prompt="",
                        team_name=team.name,
                        team_instructions=team.team_instructions or None,
                    )

                custom_subagents.append(
                    {
                        "name": member.role_name,
                        "description": (
                            f"Team member '{member.role_name}' "
                            f"(member_id: {member.member_id}). "
                            f"Dispatch tasks matching this role's expertise."
                            + (f" {member.role_instructions}" if member.role_instructions else "")
                        ),
                        "system_prompt": role_prompt,
                        "middleware": _build_subagent_middleware(),
                    }
                )

            logger.info(
                f"[TeamAgent] Built {len(custom_subagents)} role subagents for team '{team.name}'"
            )
        except Exception as e:
            logger.error(f"[TeamAgent] Failed to build team subagents: {e}, falling back to single")

    # Fallback: single general-purpose subagent
    if not custom_subagents:
        custom_subagents = [
            {
                "name": "general-purpose",
                "description": "General-purpose agent for researching complex questions, searching for files and content, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you. This agent has access to all tools as the main agent.",
                "system_prompt": SUBAGENT_PROMPT,
                "middleware": _build_subagent_middleware(),
            }
        ]

    # ── 主代理中间件栈 ──
    user_middleware = create_retry_middleware(
        fallback_model=fallback_model_value, thinking=thinking_config
    )
    user_middleware.append(ToolResultBinaryMiddleware(base_url=subagent_base_url))
    _prompt_sections = [
        s
        for s in (*MAIN_AGENT_PROMPT_SECTIONS, *persona_sections, skills_prompt, memory_guide)
        if s
    ]
    if _prompt_sections:
        user_middleware.append(SectionPromptMiddleware(sections=_prompt_sections))
    if settings.ENABLE_MEMORY and settings.NATIVE_MEMORY_INDEX_ENABLED and context.user_id:
        from src.infra.agent.middleware import MemoryIndexMiddleware

        user_middleware.append(MemoryIndexMiddleware(user_id=context.user_id))

    if context.deferred_manager is not None:
        from src.infra.agent.middleware import ToolSearchMiddleware

        user_middleware.append(
            ToolSearchMiddleware(
                deferred_manager=context.deferred_manager,
                search_limit=settings.DEFERRED_TOOL_SEARCH_LIMIT,
            )
        )

    user_middleware.append(PromptCachingMiddleware())

    inner_graph = create_deep_agent(
        model=llm,
        system_prompt=system_prompt,
        backend=backend,
        tools=filtered_tools,
        checkpointer=inner_checkpointer,
        store=store,
        skills=None,
        subagents=custom_subagents,
        middleware=user_middleware,
    ).with_config({"recursion_limit": settings.SESSION_MAX_RUNS_PER_SESSION})
    graph_compile_time = time.time() - graph_compile_start
    logger.debug(f"[TeamAgent] Graph compile: {graph_compile_time * 1000:.3f}ms")

    inner_config: RunnableConfig = {
        "configurable": {
            "thread_id": state.get("session_id", str(uuid.uuid4())),
            "backend": backend,
            "context": context,
            "disabled_skills": configurable.get("disabled_skills"),
            "enabled_skills": configurable.get("enabled_skills"),
            "base_url": configurable.get("base_url", ""),
            "presenter": presenter,
        },
        "recursion_limit": config.get("recursion_limit", settings.SESSION_MAX_RUNS_PER_SESSION),
    }

    # 构建传入的新消息（包含附件）
    user_input = state.get("input", "")
    if supports_vision:
        attachments = await inline_image_attachments_as_data_urls(attachments)
    new_message = build_human_message(user_input, attachments, supports_vision=supports_vision)

    # 创建事件处理器
    logger.info("[TeamAgent] Creating AgentEventProcessor")
    event_processor = AgentEventProcessor(presenter, base_url=configurable.get("base_url", ""))

    logger.info("[TeamAgent] Starting astream_events")
    try:
        async for event in inner_graph.astream_events(
            {"messages": [new_message]},
            inner_config,
            version="v2",
        ):
            await event_processor.process_event(event)
    finally:
        await event_processor.flush()
        await emit_token_usage(
            event_processor,
            presenter,
            start_time,
            model_id=model_id,
            model=selected_model,
        )
    logger.info("[TeamAgent] astream_events completed")

    if settings.ENABLE_MEMORY and context.user_id:
        from src.infra.memory.tools import schedule_auto_memory_capture

        schedule_auto_memory_capture(context.user_id, user_input)

    # 获取内层 graph 的最终状态
    inner_state = await inner_graph.aget_state(inner_config)
    final_messages = inner_state.values.get("messages", [])

    session_id = state.get("session_id")
    if (
        context.deferred_manager is not None
        and session_id
        and context.deferred_manager.discovered_count > 0
    ):
        try:
            from src.infra.tool.deferred_manager import persist_discovered_tools

            await persist_discovered_tools(
                session_id,
                context.deferred_manager.discovered_names,
            )
        except Exception:
            pass

    output_text = event_processor.output_text
    event_processor.clear()

    return {
        "output": output_text,
        "messages": final_messages,
    }
