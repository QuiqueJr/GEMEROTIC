"""
Tests del backend compartido de rate limiting.
"""

import pytest
from redis.exceptions import ConnectionError

from app.core.rate_limit import (
    RateLimitBackendError,
    RedisSlidingWindowRateLimiter,
)

pytestmark = pytest.mark.asyncio


class FakeRedisClient:
    """Cliente Redis asíncrono mínimo para tests unitarios."""

    def __init__(self, eval_result=None, ping_result=True, eval_error=None):
        self._eval_result = eval_result
        self._ping_result = ping_result
        self._eval_error = eval_error
        self.closed = False

    async def eval(self, script, numkeys, key, limit, window_ms, member):
        if self._eval_error is not None:
            raise self._eval_error
        return self._eval_result

    async def ping(self):
        if isinstance(self._ping_result, Exception):
            raise self._ping_result
        return self._ping_result

    async def aclose(self):
        self.closed = True


class TestRedisSlidingWindowRateLimiter:
    """Tests del backend Redis/Valkey."""

    async def test_consume_returns_allowed_decision(self):
        limiter = RedisSlidingWindowRateLimiter(
            redis_url="redis://localhost:6379/0",
            key_prefix="gemerotic:test",
            connect_timeout_seconds=0.1,
            operation_timeout_seconds=0.1,
        )
        limiter._client = FakeRedisClient(eval_result=[1, 4, 0])

        decision = await limiter.consume(
            bucket_key="bucket",
            limit=5,
            window_seconds=60,
        )

        assert decision.allowed is True
        assert decision.remaining == 4
        assert decision.retry_after_seconds == 0

    async def test_consume_raises_controlled_error_on_redis_failure(self):
        limiter = RedisSlidingWindowRateLimiter(
            redis_url="redis://localhost:6379/0",
            key_prefix="gemerotic:test",
            connect_timeout_seconds=0.1,
            operation_timeout_seconds=0.1,
        )
        limiter._client = FakeRedisClient(eval_error=ConnectionError("down"))

        try:
            await limiter.consume(
                bucket_key="bucket",
                limit=5,
                window_seconds=60,
            )
        except RateLimitBackendError as exc:
            assert str(exc) == "Rate limit backend is unavailable"
        else:
            raise AssertionError("Expected RateLimitBackendError")

    async def test_ping_returns_false_when_backend_is_unreachable(self):
        limiter = RedisSlidingWindowRateLimiter(
            redis_url="redis://localhost:6379/0",
            key_prefix="gemerotic:test",
            connect_timeout_seconds=0.1,
            operation_timeout_seconds=0.1,
        )
        limiter._client = FakeRedisClient(ping_result=ConnectionError("down"))

        assert await limiter.ping() is False

    async def test_aclose_delegates_to_client(self):
        limiter = RedisSlidingWindowRateLimiter(
            redis_url="redis://localhost:6379/0",
            key_prefix="gemerotic:test",
            connect_timeout_seconds=0.1,
            operation_timeout_seconds=0.1,
        )
        client = FakeRedisClient(eval_result=[1, 1, 0])
        limiter._client = client

        await limiter.aclose()

        assert client.closed is True
