"""In-process LiveKit AgentSession evaluation tests for Wave 2.0 `Assistant`.

Includes:
  1. Fast deterministic offline `AgentSession.run(...)` tests verifying greeting replies
     and `@function_tool` execution (`get_current_utc_time`) with zero network calls.
  2. Live Judge LLM evaluation test matching `agent-starter-python/tests/test_agent.py`
     when `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` are configured.
"""

from __future__ import annotations

import os
import textwrap

import pytest
from livekit.agents import AgentSession, inference, llm
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, APIConnectOptions

from backend.agent import Assistant


class _ScriptedStream(llm.LLMStream):
    def __init__(
        self,
        llm_v: llm.LLM,
        *,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool],
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(llm_v, chat_ctx=chat_ctx, tools=tools, conn_options=conn_options)

    async def _run(self) -> None:
        items = list(self._chat_ctx.items)
        last = items[-1] if items else None

        # If a tool result just returned, speak it naturally in plain prose.
        if isinstance(last, llm.FunctionCallOutput):
            self._event_ch.send_nowait(
                llm.ChatChunk(
                    id="chunk-tool-reply",
                    delta=llm.ChoiceDelta(
                        role="assistant",
                        content=f"The current time is {last.output}.",
                    ),
                )
            )
            return

        last_text = getattr(last, "text_content", "") or ""
        if "time" in last_text.lower() or "utc" in last_text.lower():
            self._event_ch.send_nowait(
                llm.ChatChunk(
                    id="chunk-call",
                    delta=llm.ChoiceDelta(
                        role="assistant",
                        tool_calls=[
                            llm.FunctionToolCall(
                                call_id="call-utc-1",
                                name="get_current_utc_time",
                                arguments="{}",
                            )
                        ],
                    ),
                )
            )
            return

        self._event_ch.send_nowait(
            llm.ChatChunk(
                id="chunk-greeting",
                delta=llm.ChoiceDelta(
                    role="assistant",
                    content="Hello there! Welcome to Wave two point zero, how can I help you today?",
                ),
            )
        )


class _ScriptedLLM(llm.LLM):
    def chat(
        self,
        *,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        **kwargs,
    ) -> llm.LLMStream:
        del kwargs
        return _ScriptedStream(
            self,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
        )


@pytest.mark.asyncio
async def test_assistant_greeting_turn_in_process() -> None:
    """Verify Assistant runs inside real LiveKit AgentSession and answers greetings cleanly."""
    async with _ScriptedLLM() as scripted_llm, AgentSession(llm=scripted_llm) as session:
        await session.start(Assistant())
        result = await session.run(user_input="Hello")
        event = result.expect.next_event().is_message(role="assistant")
        assert "Wave two point zero" in event.event().item.text_content
        result.expect.no_more_events()


@pytest.mark.asyncio
async def test_assistant_executes_utc_time_tool_in_process() -> None:
    """Verify Assistant executes @function_tool get_current_utc_time and summarizes the result."""
    async with _ScriptedLLM() as scripted_llm, AgentSession(llm=scripted_llm) as session:
        await session.start(Assistant())
        result = await session.run(user_input="What is the current UTC time?")
        result.expect.next_event().is_function_call(name="get_current_utc_time")
        output_event = result.expect.next_event().is_function_call_output()
        assert "UTC" in output_event.event().item.output
        reply_event = result.expect.next_event().is_message(role="assistant")
        assert "UTC" in reply_event.event().item.text_content
        result.expect.no_more_events()


@pytest.mark.skipif(
    not (os.getenv("LIVEKIT_API_KEY") and os.getenv("LIVEKIT_API_SECRET")),
    reason="Requires live LIVEKIT_API_KEY and LIVEKIT_API_SECRET for LiveKit Inference judge.",
)
@pytest.mark.asyncio
async def test_offers_assistance_with_live_inference_judge() -> None:
    """Live evaluation of Assistant's friendly spoken response via LiveKit Inference."""
    async with (
        inference.LLM(model="openai/gpt-4.1-mini") as judge_llm,
        AgentSession(llm=inference.LLM(model="google/gemma-4-31b-it")) as session,
    ):
        await session.start(Assistant())
        result = await session.run(user_input="Hello")
        await (
            result.expect.next_event()
            .is_message(role="assistant")
            .judge(
                judge_llm,
                intent=textwrap.dedent(
                    """\
                    Greets the user in a friendly manner and offers assistance concisely.
                    """
                ),
            )
        )
        result.expect.no_more_events()
