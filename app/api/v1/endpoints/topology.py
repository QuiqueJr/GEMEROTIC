"""
Endpoint principal de topología.
"""

from fastapi import APIRouter, Depends, status

from app.core.security import require_api_key
from app.dependencies import get_netbox_client, get_topology_store
from app.schemas.responses import APIResponse
from app.schemas.topology import TopologyCreate
from app.services.netbox_client import NetBoxClient, NetBoxClientError
from app.services.topology_importer import TopologyImportError
from app.services.topology_store import TopologyStore

router = APIRouter(prefix="/topology")


@router.post(
    "",
    response_model=APIResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Guardar una topología completa",
    description=(
        "Guardar las 3 capas del modelo GEMEROTIC como estado operativo local "
        "y sincronizar NetBox como destino derivado de mejor esfuerzo."
    ),
)
async def create_topology(
    topology: TopologyCreate,
    _: None = Depends(require_api_key),
    netbox_client: NetBoxClient = Depends(get_netbox_client),
    topology_store: TopologyStore = Depends(get_topology_store),
) -> APIResponse:
    """Guardar una topología validada y sincronizar NetBox sin bloquear el guardado."""
    saved = topology_store.save(topology)
    netbox_sync = {
        "status": "synchronized",
        "detail": None,
        "result": None,
    }
    try:
        netbox_sync["result"] = netbox_client.import_topology(topology)
    except TopologyImportError as exc:
        netbox_sync["status"] = "failed"
        netbox_sync["detail"] = str(exc)
    except NetBoxClientError as exc:
        netbox_sync["status"] = "failed"
        netbox_sync["detail"] = str(exc)

    topology_store.update_netbox_sync(topology.name, netbox_sync)

    return APIResponse(
        message="Topology saved successfully",
        data={
            **saved,
            "netbox_sync": netbox_sync,
        },
    )
