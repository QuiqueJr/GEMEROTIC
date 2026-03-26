"""
Endpoint principal de topología.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import require_api_key
from app.dependencies import get_netbox_client
from app.schemas.responses import APIResponse
from app.schemas.topology import TopologyCreate
from app.services.netbox_client import NetBoxClient, NetBoxClientError
from app.services.topology_importer import TopologyImportError

router = APIRouter(prefix="/topology")


@router.post(
    "",
    response_model=APIResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una topología completa en NetBox",
    description=(
        "Persistir las 3 capas del modelo GEMEROTIC: infraestructura física, "
        "conectividad lógica y segmentación OT."
    ),
)
async def create_topology(
    topology: TopologyCreate,
    _: None = Depends(require_api_key),
    netbox_client: NetBoxClient = Depends(get_netbox_client),
) -> APIResponse:
    """Importar una topología validada al SSoT NetBox."""
    try:
        result = netbox_client.import_topology(topology)
    except TopologyImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except NetBoxClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="Topology created successfully",
        data=result,
    )
