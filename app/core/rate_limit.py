"""
Backend compartido de rate limiting para GEMEROTIC.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4

from redis import asyncio as redis_async
from redis.exceptions import RedisError

SLIDING_WINDOW_LUA = """
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local member = ARGV[3]
local time = redis.call('TIME')
local now_ms = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)
local threshold = now_ms - window_ms

redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, threshold)

local current = redis.call('ZCARD', KEYS[1])
if current >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry_after_ms = window_ms
  if oldest[2] ~= nil then
    retry_after_ms = window_ms - (now_ms - tonumber(oldest[2]))
  end

  if retry_after_ms < 1 then
    retry_after_ms = 1
  end

  return {0, 0, math.ceil(retry_after_ms / 1000)}
end

redis.call('ZADD', KEYS[1], now_ms, member)
redis.call('EXPIRE', KEYS[1], math.max(math.ceil(window_ms / 1000), 1))

local remaining = limit - current - 1
if remaining < 0 then
  remaining = 0
end

return {1, remaining, 0}
"""


class RateLimitBackendError(RuntimeError):
    """Error controlado al interactuar con el backend compartido."""


@dataclass(frozen=True)
class RateLimitDecision:
    """Resultado normalizado de una consulta de rate limit."""

    allowed: bool
    remaining: int
    retry_after_seconds: int


class RateLimitBackend(Protocol):
    """Contrato mínimo que usa el middleware de seguridad."""

    async def consume(
        self,
        bucket_key: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision: ...

    async def ping(self) -> bool: ...

    async def aclose(self) -> None: ...


class DisabledRateLimiter:
    """Backend nulo para tests o despliegues sin rate limiting."""

    async def consume(
        self,
        bucket_key: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        return RateLimitDecision(
            allowed=True,
            remaining=max(limit - 1, 0),
            retry_after_seconds=0,
        )

    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        return None


class RedisSlidingWindowRateLimiter:
    """Rate limiter compartido sobre Redis/Valkey con ventana deslizante."""

    def __init__(
        self,
        redis_url: str,
        key_prefix: str,
        connect_timeout_seconds: float,
        operation_timeout_seconds: float,
    ):
        self._key_prefix = key_prefix.strip(":")
        self._client = redis_async.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=connect_timeout_seconds,
            socket_timeout=operation_timeout_seconds,
            health_check_interval=30,
        )

    async def consume(
        self,
        bucket_key: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        try:
            raw_result = await self._client.eval(
                SLIDING_WINDOW_LUA,
                1,
                self._storage_key(bucket_key),
                max(limit, 1),
                max(window_seconds, 1) * 1000,
                uuid4().hex,
            )
        except RedisError as exc:
            raise RateLimitBackendError("Rate limit backend is unavailable") from exc

        allowed_flag, remaining, retry_after_seconds = self._parse_result(raw_result)
        return RateLimitDecision(
            allowed=allowed_flag == 1,
            remaining=remaining,
            retry_after_seconds=retry_after_seconds,
        )

    async def ping(self) -> bool:
        try:
            return bool(await self._client.ping())
        except RedisError:
            return False

    async def aclose(self) -> None:
        await self._client.aclose()

    def _storage_key(self, bucket_key: str) -> str:
        return f"{self._key_prefix}:{bucket_key}"

    def _parse_result(self, raw_result: object) -> tuple[int, int, int]:
        if not isinstance(raw_result, (list, tuple)) or len(raw_result) != 3:
            raise RateLimitBackendError(
                "Rate limit backend returned an invalid payload"
            )

        try:
            allowed_flag = int(raw_result[0])
            remaining = int(raw_result[1])
            retry_after_seconds = int(raw_result[2])
        except (TypeError, ValueError) as exc:
            raise RateLimitBackendError(
                "Rate limit backend returned non-integer counters"
            ) from exc

        return allowed_flag, remaining, retry_after_seconds
