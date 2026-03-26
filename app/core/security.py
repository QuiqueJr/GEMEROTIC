"""
Seguridad transversal del API.
"""

from collections import defaultdict, deque
from math import ceil
from secrets import compare_digest
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.config import settings
from app.schemas.responses import APIError

API_KEY_HEADER_NAME = "X-API-Key"
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
SECURITY_HEADERS = {
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

api_key_header = APIKeyHeader(name=API_KEY_HEADER_NAME, auto_error=False)


def require_api_key(
    api_key: str | None = Security(api_key_header),
) -> None:
    """
    Exigir API key para toda operación mutante del API.

    El servicio falla en modo cerrado si la clave no está configurada.
    """
    configured_api_key = settings.API_KEY.strip()
    if not configured_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API key protection is not configured",
        )

    if api_key is None or not compare_digest(api_key, configured_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Añadir headers defensivos a todas las respuestas HTTP."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header_name, header_value in SECURITY_HEADERS.items():
            response.headers.setdefault(header_name, header_value)
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting básico en memoria para operaciones mutantes del API."""

    def __init__(self, app):
        super().__init__(app)
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self._should_limit(request):
            return await call_next(request)

        bucket_key = self._build_bucket_key(request)
        allowed, retry_after_seconds, remaining = self._consume(bucket_key)
        if not allowed:
            body = APIError(
                message="Rate limit exceeded",
                detail={"retry_after_seconds": retry_after_seconds},
            )
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content=body.model_dump(),
                headers={
                    "Retry-After": str(retry_after_seconds),
                    "X-RateLimit-Limit": str(max(settings.RATE_LIMIT_MAX_REQUESTS, 1)),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers.setdefault(
            "X-RateLimit-Limit",
            str(max(settings.RATE_LIMIT_MAX_REQUESTS, 1)),
        )
        response.headers.setdefault("X-RateLimit-Remaining", str(remaining))
        return response

    def _should_limit(self, request: Request) -> bool:
        if not settings.RATE_LIMIT_ENABLED:
            return False
        if not request.url.path.startswith("/api/"):
            return False
        return request.method.upper() in MUTATING_METHODS

    def _build_bucket_key(self, request: Request) -> str:
        forwarded_for = request.headers.get("X-Forwarded-For", "")
        client_host = forwarded_for.split(",")[0].strip()
        if not client_host:
            client_host = (
                request.client.host if request.client is not None else "unknown"
            )
        return f"{client_host}:{request.method}:{request.url.path}"

    def _consume(self, bucket_key: str) -> tuple[bool, int, int]:
        current_time = monotonic()
        window_seconds = max(settings.RATE_LIMIT_WINDOW_SECONDS, 1)
        max_requests = max(settings.RATE_LIMIT_MAX_REQUESTS, 1)
        threshold = current_time - window_seconds

        with self._lock:
            bucket = self._buckets[bucket_key]
            while bucket and bucket[0] <= threshold:
                bucket.popleft()

            if len(bucket) >= max_requests:
                retry_after = ceil(window_seconds - (current_time - bucket[0]))
                return False, max(retry_after, 1), 0

            bucket.append(current_time)
            remaining = max(max_requests - len(bucket), 0)
            return True, 0, remaining
