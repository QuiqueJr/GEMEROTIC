"""
Punto de entrada de la aplicación FastAPI.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import v1_router
from app.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.security import RateLimitMiddleware, SecurityHeadersMiddleware


def create_app() -> FastAPI:
    """Factoría de la aplicación FastAPI — patrón factory para facilitar testing."""
    application = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.CORS_ALLOWED_ORIGINS),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )
    application.add_middleware(SecurityHeadersMiddleware)
    application.add_middleware(RateLimitMiddleware)
    # Registrar routers del API versionado
    application.include_router(v1_router, prefix="/api/v1")
    register_exception_handlers(application)

    return application


app = create_app()
