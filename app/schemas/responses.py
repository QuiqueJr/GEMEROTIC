"""
Modelos de respuesta estandarizados del API.

Todas las respuestas del API siguen una estructura uniforme
para facilitar el consumo desde cualquier cliente.
"""

from typing import Any

from pydantic import BaseModel, Field


class APIResponse(BaseModel):
    """Respuesta estándar exitosa del API."""

    status: str = Field(
        default="success",
        examples=["success"],
    )
    message: str = Field(
        ...,
        examples=["Topology created successfully"],
    )
    data: Any = Field(
        default=None,
        description="Payload de datos de la respuesta (estructura variable)",
    )


class APIError(BaseModel):
    """Respuesta estándar de error del API."""

    status: str = Field(
        default="error",
        examples=["error"],
    )
    message: str = Field(
        ...,
        examples=["Validation failed"],
    )
    detail: Any = Field(
        default=None,
        description="Detalles adicionales del error para debugging",
    )
