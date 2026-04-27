"""
Punto de entrada de la aplicación FastAPI.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

from app.api.v1.router import v1_router
from app.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.rate_limit import (
    DisabledRateLimiter,
    RateLimitBackend,
    RedisSlidingWindowRateLimiter,
)
from app.core.security import RateLimitMiddleware, SecurityHeadersMiddleware


def build_rate_limiter() -> RateLimitBackend:
    """Construir el backend de rate limiting según la configuración activa."""
    if not settings.RATE_LIMIT_ENABLED:
        return DisabledRateLimiter()

    return RedisSlidingWindowRateLimiter(
        redis_url=str(settings.RATE_LIMIT_REDIS_URL),
        key_prefix=settings.RATE_LIMIT_REDIS_KEY_PREFIX,
        connect_timeout_seconds=settings.RATE_LIMIT_REDIS_CONNECT_TIMEOUT_SECONDS,
        operation_timeout_seconds=settings.RATE_LIMIT_REDIS_OPERATION_TIMEOUT_SECONDS,
    )


def create_app(rate_limiter: RateLimitBackend | None = None) -> FastAPI:
    """Factoría de la aplicación FastAPI — patrón factory para facilitar testing."""
    application_rate_limiter = rate_limiter or build_rate_limiter()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.rate_limiter = application_rate_limiter
        try:
            yield
        finally:
            await application_rate_limiter.aclose()

    application = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    application.add_middleware(
        RateLimitMiddleware,
        rate_limiter=application_rate_limiter,
    )
    application.add_middleware(SecurityHeadersMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.CORS_ALLOWED_ORIGINS),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )
    # Registrar routers del API versionado
    application.include_router(v1_router, prefix="/api/v1")

    @application.get("/", include_in_schema=False)
    async def root() -> RedirectResponse:
        """Redirigir la raíz a la documentación interactiva."""
        return RedirectResponse(url="/docs", status_code=307)

    @application.get("/favicon.ico", include_in_schema=False)
    async def favicon() -> Response:
        """Evitar 404 del navegador cuando solicita favicon por defecto."""
        return Response(status_code=204)

    register_exception_handlers(application)

    return application


app = create_app()
