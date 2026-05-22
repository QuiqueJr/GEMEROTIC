"""
Seguridad transversal del API.
"""

from base64 import urlsafe_b64decode, urlsafe_b64encode
from hashlib import sha256
from hmac import new as hmac_new
from json import dumps, loads
from secrets import compare_digest
from time import time

from fastapi import HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.config import settings
from app.core.rate_limit import (
    RateLimitBackend,
    RateLimitBackendError,
)
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

    En MVP queda desactivada por defecto para no bloquear pruebas de UI.
    Si `API_KEY_REQUIRED=true`, mantiene el modo fail-closed anterior.
    """
    if not settings.API_KEY_REQUIRED:
        return None

    if not is_api_key_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API key protection is not configured",
        )

    if not is_valid_api_key(api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )


def is_api_key_configured() -> bool:
    """Comprobar si existe clave de API usable para protecciones no HTTP."""
    return bool(_setting_secret(settings.API_KEY))


def is_valid_api_key(api_key: str | None) -> bool:
    """Validar una API key recibida por un canal distinto a headers HTTP."""
    configured_api_key = _setting_secret(settings.API_KEY)
    if not configured_api_key or api_key is None:
        return False
    return compare_digest(api_key.strip(), configured_api_key)


def create_terminal_session_token(
    topology_name: str,
    node_id: str,
    now: int | None = None,
) -> tuple[str, int, int]:
    """Crear token corto para abrir WebSocket de terminal sin exponer API key."""
    configured_api_key = _setting_secret(settings.API_KEY)
    if not configured_api_key:
        raise ValueError("API key protection is not configured")

    ttl_seconds = min(max(settings.RUNTIME_TERMINAL_TOKEN_TTL_SECONDS, 1), 3600)
    issued_at = int(now if now is not None else time())
    expires_at = issued_at + ttl_seconds
    payload = {
        "topology_name": topology_name,
        "node_id": node_id,
        "expires_at": expires_at,
    }
    payload_token = _base64_urlsafe(
        dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = _sign_terminal_payload(payload_token, configured_api_key)
    return f"{payload_token}.{signature}", expires_at, ttl_seconds


def is_valid_terminal_session_token(
    token: str | None,
    topology_name: str,
    node_id: str,
    now: int | None = None,
) -> bool:
    """Validar token corto de terminal para topología y nodo exactos."""
    configured_api_key = _setting_secret(settings.API_KEY)
    if not configured_api_key or not token:
        return False

    parts = token.strip().split(".")
    if len(parts) != 2:
        return False

    payload_token, received_signature = parts
    expected_signature = _sign_terminal_payload(payload_token, configured_api_key)
    if not compare_digest(received_signature, expected_signature):
        return False

    try:
        payload = loads(_base64_urlsafe_decode(payload_token).decode("utf-8"))
    except (ValueError, TypeError, UnicodeDecodeError):
        return False

    expires_at = payload.get("expires_at") if isinstance(payload, dict) else None
    if not isinstance(expires_at, int):
        return False

    current_time = int(now if now is not None else time())
    return (
        current_time <= expires_at
        and payload.get("topology_name") == topology_name
        and payload.get("node_id") == node_id
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Añadir headers defensivos a todas las respuestas HTTP."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header_name, header_value in SECURITY_HEADERS.items():
            response.headers.setdefault(header_name, header_value)
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting compartido para operaciones mutantes del API."""

    def __init__(self, app, rate_limiter: RateLimitBackend):
        super().__init__(app)
        self._rate_limiter = rate_limiter

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self._should_limit(request):
            return await call_next(request)

        bucket_key = self._build_bucket_key(request)
        try:
            decision = await self._rate_limiter.consume(
                bucket_key=bucket_key,
                limit=max(settings.RATE_LIMIT_MAX_REQUESTS, 1),
                window_seconds=max(settings.RATE_LIMIT_WINDOW_SECONDS, 1),
            )
        except RateLimitBackendError:
            body = APIError(message="Rate limit backend unavailable")
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=body.model_dump(),
            )

        if not decision.allowed:
            body = APIError(
                message="Rate limit exceeded",
                detail={"retry_after_seconds": decision.retry_after_seconds},
            )
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content=body.model_dump(),
                headers={
                    "Retry-After": str(decision.retry_after_seconds),
                    "X-RateLimit-Limit": str(max(settings.RATE_LIMIT_MAX_REQUESTS, 1)),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers.setdefault(
            "X-RateLimit-Limit",
            str(max(settings.RATE_LIMIT_MAX_REQUESTS, 1)),
        )
        response.headers.setdefault(
            "X-RateLimit-Remaining",
            str(max(decision.remaining, 0)),
        )
        return response

    def _should_limit(self, request: Request) -> bool:
        if not settings.RATE_LIMIT_ENABLED:
            return False
        if not request.url.path.startswith("/api/"):
            return False
        return request.method.upper() in MUTATING_METHODS

    def _build_bucket_key(self, request: Request) -> str:
        client_host = self._client_host(request)
        identity = self._client_identity(request)
        method = request.method.upper()
        path = request.url.path
        return f"{identity}:{client_host}:{method}:{path}"

    def _client_host(self, request: Request) -> str:
        client_ip = request.client.host if request.client is not None else ""
        is_trusted = (
            "*" in settings.TRUSTED_PROXIES
            or client_ip in settings.TRUSTED_PROXIES
        )

        if is_trusted:
            forwarded_for = request.headers.get("X-Forwarded-For", "")
            if forwarded_for.strip():
                return forwarded_for.split(",")[0].strip()

            real_ip = request.headers.get("X-Real-IP", "").strip()
            if real_ip:
                return real_ip

        if request.client is not None:
            return request.client.host
        return "unknown"

    def _client_identity(self, request: Request) -> str:
        if not settings.API_KEY_REQUIRED:
            return "mvp"

        configured_api_key = _setting_secret(settings.API_KEY)
        api_key = request.headers.get(API_KEY_HEADER_NAME, "").strip()
        if (
            not configured_api_key
            or not api_key
            or not compare_digest(api_key, configured_api_key)
        ):
            return "anonymous"

        fingerprint = sha256(configured_api_key.encode("utf-8")).hexdigest()[:16]
        return f"api-key:{fingerprint}"


def _setting_secret(value: object) -> str:
    """Extraer secretos de Pydantic o strings parcheados en tests."""
    if hasattr(value, "get_secret_value"):
        return str(value.get_secret_value()).strip()
    return str(value).strip()


def _base64_urlsafe(value: bytes) -> str:
    """Codificar sin padding para URLs limpias."""
    return urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _base64_urlsafe_decode(value: str) -> bytes:
    """Decodificar base64 URL-safe con padding reconstruido."""
    padding = "=" * (-len(value) % 4)
    return urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def _sign_terminal_payload(payload_token: str, configured_api_key: str) -> str:
    """Firmar payload de terminal con HMAC-SHA256."""
    signature = hmac_new(
        configured_api_key.encode("utf-8"),
        payload_token.encode("ascii"),
        sha256,
    ).digest()
    return _base64_urlsafe(signature)
