"""
Endpoints de integración con NetBox.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import require_api_key
from app.dependencies import get_netbox_client
from app.schemas.responses import APIResponse
from app.services.netbox_client import NetBoxClient, NetBoxClientError

router = APIRouter(prefix="/netbox")


@router.post(
    "/bootstrap",
    response_model=APIResponse,
    summary="Bootstrap mínimo de NetBox para GEMEROTIC",
    description=(
        "Verifica conectividad con NetBox y crea los roles de dispositivo "
        "mínimos requeridos por el modelo de activos de GEMEROTIC."
    ),
)
async def bootstrap_netbox(
    _: None = Depends(require_api_key),
    netbox_client: NetBoxClient = Depends(get_netbox_client),
) -> APIResponse:
    """Inicializar objetos base en NetBox."""
    try:
        result = netbox_client.bootstrap()
    except NetBoxClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="NetBox bootstrap completed successfully",
        data=result,
    )
