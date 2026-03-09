"""
Endpoint de health check.

Proporciona información del estado del servicio: nombre, versión,
uptime y verificaciones de dependencias externas (NetBox en el futuro).
"""

import time

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import settings

router = APIRouter()

# Marca temporal del arranque del módulo (se establece al importar)
_start_time: float = time.monotonic()


# =============================================================================
# Schemas de respuesta específicos del health check
# =============================================================================

class DependencyChecks(BaseModel):
    """Estado de las dependencias externas del servicio."""

    # FUTURO (Step 5): se reemplazará con un ping real a la API de NetBox.
    netbox_connected: bool = Field(
        default=False,
        description="Indica si la conexión a NetBox está activa",
    )


class HealthResponse(BaseModel):
    """Respuesta del endpoint de health check."""

    status: str = Field(
        ...,
        examples=["healthy"],
        description="Estado general del servicio",
    )
    app_name: str = Field(
        ...,
        examples=["GEMEROTIC"],
    )
    version: str = Field(
        ...,
        examples=["0.1.0"],
    )
    uptime_seconds: float = Field(
        ...,
        description="Tiempo transcurrido desde el arranque del servicio (segundos)",
    )
    checks: DependencyChecks = Field(
        default_factory=DependencyChecks,
        description="Estado de las dependencias externas",
    )


# =============================================================================
# Endpoint
# =============================================================================

@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check del servicio",
    description="Retorna el estado del servicio, versión y uptime.",
)
async def health_check() -> HealthResponse:
    """
    Verificar que el servicio está operativo.

    Retorna información básica del servicio y el estado de las
    dependencias externas (NetBox). En el MVP, la verificación
    de NetBox está deshabilitada (siempre false) hasta Step 5.
    """
    return HealthResponse(
        status="healthy",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        uptime_seconds=round(time.monotonic() - _start_time, 2),
        checks=DependencyChecks(
            netbox_connected=False,  # FUTURO: ping real a NetBox (Step 5)
        ),
    )
