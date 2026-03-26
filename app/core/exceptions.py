"""
Manejadores de excepciones del API.
"""

import logging

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.schemas.responses import APIError

logger = logging.getLogger(__name__)


def _sanitize_validation_errors(
    errors: list[dict[str, object]],
) -> list[dict[str, object]]:
    """Eliminar campos sensibles del detalle de validación."""
    sanitized_errors: list[dict[str, object]] = []

    for error in errors:
        sanitized_errors.append(
            {
                "loc": list(error.get("loc", [])),
                "msg": error.get("msg"),
                "type": error.get("type"),
            }
        )

    return sanitized_errors


def register_exception_handlers(application: FastAPI) -> None:
    """Registrar respuestas de error uniformes para todo el API."""

    @application.exception_handler(HTTPException)
    async def http_exception_handler(
        request: Request,
        exc: HTTPException,
    ) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        payload = APIError(message=message, detail=exc.detail)
        return JSONResponse(status_code=exc.status_code, content=payload.model_dump())

    @application.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        payload = APIError(
            message="Validation failed",
            detail=_sanitize_validation_errors(exc.errors()),
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=payload.model_dump(),
        )

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        logger.exception(
            "Unhandled exception while processing %s %s",
            request.method,
            request.url.path,
            exc_info=exc,
        )

        detail: str | None = None
        if settings.DEBUG:
            detail = str(exc)

        payload = APIError(message="Internal server error", detail=detail)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=payload.model_dump(),
        )
