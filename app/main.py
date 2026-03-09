"""
Punto de entrada de la aplicación FastAPI.
"""

from fastapi import FastAPI

from app.config import settings


def create_app() -> FastAPI:
    """Factoría de la aplicación FastAPI — patrón factory para facilitar testing."""
    application = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Registrar routers aquí conforme se vayan creando
    # from app.api.v1.router import v1_router
    # application.include_router(v1_router, prefix="/api/v1")

    return application


app = create_app()
