from __future__ import annotations

import asyncio
import time

import pytest

from app.providers.swiggy import SwiggyProvider


def test_get_menu_async_does_not_block_event_loop(monkeypatch):
    """Regression test: search_restaurants() does blocking network I/O.
    Before the fix, get_menu_async() called it directly (no await/thread
    offload), which froze the entire asyncio event loop for its duration -
    meaning every other concurrent request on the server would also stall,
    and asyncio.wait_for's timeout in services.py could never fire early
    because a truly blocking call never yields an await point.

    This runs a slow search_restaurants() call concurrently with a
    lightweight heartbeat coroutine and measures total wall-clock time.
    If the event loop is blocked, total time is roughly
    search_delay + heartbeat_total (sequential). If the event loop stays
    responsive, total time is roughly max(search_delay, heartbeat_total)
    (concurrent). Counting eventual completions alone (without timing)
    would not catch this: asyncio.gather() waits for both regardless of
    whether they ran concurrently or back-to-back.
    """
    provider = SwiggyProvider()
    search_delay = 0.4
    heartbeat_interval = 0.02
    heartbeat_iterations = 20  # totals ~0.4s if run back-to-back with search

    def slow_blocking_search(location, restaurant):
        time.sleep(search_delay)  # simulates a slow/unresponsive network call
        return []  # empty on purpose: raises RuntimeError right after search,
        # before get_menu_async reaches the browser step. Chromium isn't
        # installed in every test environment, and this test only cares
        # about whether search_restaurants() itself blocks the event loop -
        # not about the (unrelated, separately-tested) browser step after it.

    monkeypatch.setattr(provider, "search_restaurants", slow_blocking_search)

    async def run():
        async def heartbeat():
            for _ in range(heartbeat_iterations):
                await asyncio.sleep(heartbeat_interval)

        async def call_provider():
            try:
                await provider.get_menu_async("Agra", "Test Restaurant")
            except Exception:
                pass  # we only care whether search_restaurants blocked the loop

        start = time.monotonic()
        await asyncio.gather(heartbeat(), call_provider())
        return time.monotonic() - start

    elapsed = asyncio.run(run())
    sequential_estimate = search_delay + heartbeat_interval * heartbeat_iterations

    # Concurrent execution should land close to max(search_delay, heartbeat
    # total); blocked/sequential execution should land close to their sum.
    # The threshold sits partway between the two so the test has margin for
    # scheduling jitter without masking a real regression.
    threshold = (max(search_delay, heartbeat_interval * heartbeat_iterations) + sequential_estimate) / 2
    assert elapsed < threshold, (
        f"Took {elapsed:.2f}s (sequential estimate was {sequential_estimate:.2f}s) - "
        "search_restaurants() appears to be blocking the event loop instead "
        "of running concurrently via asyncio.to_thread."
    )
