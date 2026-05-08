from typing import Annotated, TypedDict

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

import src.infra.storage.checkpoint as checkpoint_mod


class _State(TypedDict):
    messages: Annotated[list, add_messages]


def _reply_node(state: _State):
    last = state["messages"][-1]
    return {"messages": [AIMessage(content=f"reply to {last.content}")]}


@pytest.mark.asyncio
async def test_clone_checkpoints_for_fork_copies_assistant_turn(monkeypatch: pytest.MonkeyPatch):
    builder = StateGraph(_State)
    builder.add_node("reply", _reply_node)
    builder.add_edge(START, "reply")
    builder.add_edge("reply", END)

    source_saver = InMemorySaver()
    target_saver = InMemorySaver()
    graph = builder.compile(checkpointer=source_saver)
    config = {"configurable": {"thread_id": "source-thread"}}

    graph.invoke({"messages": [HumanMessage(content="one")]}, config)
    graph.invoke({"messages": [HumanMessage(content="two")]}, config)

    async def _fake_get_async_checkpointer(thread_id: str | None = None):
        if thread_id == "source-thread":
            return source_saver
        if thread_id == "target-thread":
            return target_saver
        raise AssertionError(f"unexpected thread_id {thread_id}")

    monkeypatch.setattr(checkpoint_mod, "get_async_checkpointer", _fake_get_async_checkpointer)

    copied = await checkpoint_mod.clone_checkpoints_for_fork(
        "source-thread",
        "target-thread",
        turn_index=1,
        target_type="assistant",
    )

    assert copied > 0

    checkpoints = [
        item async for item in target_saver.alist({"configurable": {"thread_id": "target-thread"}})
    ]
    latest_messages = checkpoints[0].checkpoint["channel_values"]["messages"]
    assert [type(message).__name__ for message in latest_messages] == ["HumanMessage", "AIMessage"]
    assert latest_messages[0].content == "one"
    assert latest_messages[1].content == "reply to one"
