"""
Endpoint principal de topología.
"""

import re
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import ValidationError

from app.config import settings
from app.core.security import require_api_key
from app.dependencies import get_netbox_client, get_pipeline_runner, get_topology_store
from app.persistence.database import get_session_factory, init_database
from app.schemas.project_state import TopologyProjectState
from app.schemas.responses import APIResponse
from app.schemas.topology import TopologyCreate
from app.schemas.validators import validate_slug
from app.services.granular_project_store import GranularProjectStore
from app.services.netbox_client import NetBoxClient, NetBoxClientError
from app.services.pipeline_runner import (
    PipelineExecutionError,
    PipelineRunner,
    PipelineToolError,
)
from app.services.topology_importer import TopologyImportError
from app.services.topology_store import (
    TopologyNotFoundError,
    TopologyStore,
    TopologyStoreError,
)

router = APIRouter(prefix="/topology")


@router.get(
    "/state/{project_name}",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Cargar estado editable del builder",
)
async def get_topology_state(
    project_name: str,
    _: None = Depends(require_api_key),
    topology_store: TopologyStore = Depends(get_topology_store),
) -> APIResponse:
    """Cargar el ultimo borrador visual guardado."""
    try:
        project_state = topology_store.load_project_state(project_name)
    except TopologyNotFoundError:
        return APIResponse(
            message="Topology state not found",
            data=None,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except TopologyStoreError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="Topology state loaded successfully",
        data=project_state,
    )


@router.put(
    "/state/{project_name}",
    response_model=APIResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Guardar estado editable del builder",
    description=(
        "Persistir el estado visual aunque la topologia aun no sea valida "
        "para NetBox o para el pipeline IaC."
    ),
)
async def save_topology_state(
    project_name: str,
    project_state: TopologyProjectState,
    background_tasks: BackgroundTasks,
    _: None = Depends(require_api_key),
    netbox_client: NetBoxClient = Depends(get_netbox_client),
    pipeline_runner: PipelineRunner = Depends(get_pipeline_runner),
    topology_store: TopologyStore = Depends(get_topology_store),
) -> APIResponse:
    """Guardar borrador visual y ejecutar derivaciones de mejor esfuerzo."""
    try:
        safe_project_name = validate_slug(project_name, "Project name")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    if project_state.project_name != safe_project_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project name mismatch",
        )

    state_payload = project_state.model_dump(mode="json", exclude_none=True)
    saved_state = topology_store.save_project_state(safe_project_name, state_payload)
    granular_save = _try_save_granular_project_state(safe_project_name, state_payload)
    if granular_save is not None:
        saved_state["granular_store"] = granular_save

    derived = _try_save_operational_topology(
        safe_project_name,
        state_payload.get("topology"),
        topology_store,
    )
    queued_sync = _queued_netbox_sync(derived, state_payload)
    derived["netbox_sync"] = queued_sync
    if len(_project_nodes(state_payload)) == 0:
        derived["netbox_cleanup"] = queued_sync
    elif queued_sync["detail"] == "Draft NetBox sync queued":
        derived["netbox_draft_sync"] = queued_sync

    background_tasks.add_task(
        _sync_netbox_from_project_state,
        safe_project_name,
        state_payload,
        netbox_client,
        topology_store,
    )

    topology = _build_topology_or_none(state_payload.get("topology"))
    if _should_auto_deploy(state_payload, topology, derived):
        derived["pipeline_deploy"] = _deploy_topology_after_save(
            topology,
            pipeline_runner,
            topology_store,
        )

    return APIResponse(
        message="Topology state saved successfully",
        data={
            **saved_state,
            **derived,
        },
    )


def _try_save_granular_project_state(
    project_name: str,
    project_state: dict[str, Any],
) -> dict[str, Any] | None:
    """Guardar la fuente granular si esta habilitada."""
    if not settings.GRANULAR_STORE_ENABLED:
        return None
    try:
        init_database()
        session_factory = get_session_factory()
        with session_factory() as session:
            return GranularProjectStore(session).save_project_state(
                project_name,
                project_state,
            )
    except Exception as exc:  # pragma: no cover - defensa de persistencia nueva
        return {
            "status": "failed",
            "detail": str(exc),
        }


def _sync_netbox_from_project_state(
    project_name: str,
    project_state: dict[str, Any],
    netbox_client: NetBoxClient,
    topology_store: TopologyStore,
) -> None:
    """Ejecutar la derivación NetBox fuera del camino crítico de guardado."""
    project_cleanup = _try_clean_other_netbox_projects(
        project_name,
        netbox_client,
        topology_store,
    )
    nodes = _project_nodes(project_state)
    if len(nodes) == 0:
        sync_result = _try_clean_netbox_project(project_name, netbox_client)
        if project_cleanup is not None:
            sync_result["project_cleanup"] = project_cleanup
        topology_store.update_netbox_sync(project_name, sync_result)
        return

    raw_topology = project_state.get("topology")
    topology = _build_topology_or_none(raw_topology)
    if topology is not None and _topology_matches_project_state(
        project_state,
        topology,
    ):
        sync_result = _try_import_topology_to_netbox(topology, netbox_client)
        if project_cleanup is not None:
            sync_result["project_cleanup"] = project_cleanup
        topology_store.update_netbox_sync(topology.name, sync_result)
        if sync_result["status"] == "synchronized":
            return

    draft_sync = _try_sync_project_state(
        project_name,
        project_state,
        netbox_client,
        topology_store,
    )
    if project_cleanup is not None:
        draft_sync["project_cleanup"] = project_cleanup
        topology_store.update_netbox_sync(project_name, draft_sync)


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


def _should_auto_deploy(
    project_state: dict[str, Any],
    topology: TopologyCreate | None,
    derived: dict[str, Any],
) -> bool:
    """Decidir si el guardado debe reconciliar el runtime automaticamente."""
    if not settings.AUTO_DEPLOY_ON_SAVE:
        return False
    if topology is None:
        return False
    if derived["topology_validation"]["status"] != "valid":
        return False
    if len(_project_nodes(project_state)) == 0:
        return False
    return _topology_matches_project_state(project_state, topology)


def _deploy_topology_after_save(
    topology: TopologyCreate,
    pipeline_runner: PipelineRunner,
    topology_store: TopologyStore,
) -> dict[str, Any]:
    """Ejecutar Containerlab + Ansible de forma transparente al guardar."""
    deploy_result: dict[str, Any] = {
        "status": "deployed",
        "detail": None,
        "result": None,
    }
    try:
        result = pipeline_runner.deploy(topology)
        deploy_result["result"] = result.model_dump()
    except (PipelineToolError, PipelineExecutionError) as exc:
        deploy_result["status"] = "failed"
        deploy_result["detail"] = str(exc)
    except Exception as exc:  # pragma: no cover - defensa del proceso externo
        deploy_result["status"] = "failed"
        deploy_result["detail"] = f"Automatic deployment failed: {exc}"
    topology_store.update_pipeline_deploy(topology.name, deploy_result)
    return deploy_result


def _try_save_operational_topology(
    project_name: str,
    raw_topology: Any,
    topology_store: TopologyStore,
) -> dict[str, Any]:
    """Validar y guardar la topologia operativa sin llamar a sistemas externos."""
    if not isinstance(raw_topology, dict):
        return {
            "topology_name": None,
            "topology_save": None,
            "topology_validation": {
                "status": "skipped",
                "detail": "Topology payload missing",
            },
        }

    try:
        topology = TopologyCreate(**raw_topology)
    except (TypeError, ValueError, ValidationError) as exc:
        return {
            "topology_name": raw_topology.get("name") or project_name,
            "topology_save": None,
            "topology_validation": {
                "status": "failed",
                "detail": str(exc),
            },
        }

    try:
        saved = topology_store.save(topology)
    except Exception as exc:  # pragma: no cover - defensa de persistencia visual
        return {
            "topology_name": topology.name,
            "topology_save": None,
            "topology_validation": {
                "status": "valid",
                "detail": None,
            },
            "topology_save_error": f"Local topology save failed: {exc}",
        }

    return {
        "topology_name": topology.name,
        "topology_save": saved,
        "topology_validation": {
            "status": "valid",
            "detail": None,
        },
    }


def _queued_netbox_sync(
    derived: dict[str, Any],
    project_state: dict[str, Any],
) -> dict[str, Any]:
    """Describir la sincronización NetBox que queda en segundo plano."""
    nodes = _project_nodes(project_state)
    validation_status = derived["topology_validation"]["status"]
    topology = _build_topology_or_none(project_state.get("topology"))
    if (
        validation_status == "valid"
        and topology is not None
        and _topology_matches_project_state(project_state, topology)
    ):
        detail = "Operational NetBox sync queued"
    elif len(nodes) == 0:
        detail = "NetBox cleanup queued"
    else:
        detail = "Draft NetBox sync queued"
    return {
        "status": "queued",
        "detail": detail,
        "result": None,
    }


def _build_topology_or_none(raw_topology: Any) -> TopologyCreate | None:
    """Revalidar payload para la tarea asíncrona de NetBox."""
    if not isinstance(raw_topology, dict):
        return None
    try:
        return TopologyCreate(**raw_topology)
    except (TypeError, ValueError, ValidationError):
        return None


def _try_import_topology_to_netbox(
    topology: TopologyCreate,
    netbox_client: NetBoxClient,
) -> dict[str, Any]:
    """Importar una topología válida en NetBox como tarea derivada."""
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
    return netbox_sync


def _project_nodes(project_state: dict[str, Any]) -> list[dict[str, Any]]:
    """Extraer nodos visuales válidos de un estado permisivo."""
    nodes = project_state.get("nodes")
    if not isinstance(nodes, list):
        return []
    return [node for node in nodes if isinstance(node, dict)]


def _project_edges(project_state: dict[str, Any]) -> list[dict[str, Any]]:
    """Extraer enlaces visuales válidos de un estado permisivo."""
    edges = project_state.get("edges")
    if not isinstance(edges, list):
        return []
    return [edge for edge in edges if isinstance(edge, dict)]


def _topology_matches_project_state(
    project_state: dict[str, Any],
    topology: TopologyCreate,
) -> bool:
    """Evitar que NetBox se quede con una topología operativa obsoleta."""
    node_ids = {
        _builder_slug(node.get("id"))
        for node in _project_nodes(project_state)
        if _builder_slug(node.get("id"))
    }
    topology_device_ids = {device.id for device in topology.devices}
    if node_ids != topology_device_ids:
        return False

    return len(_project_edges(project_state)) == len(topology.cables)


def _builder_slug(value: Any) -> str:
    """Normalizar IDs visuales con la misma tolerancia que el importador draft."""
    if not isinstance(value, str):
        return ""
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower())
    parts = [part for part in normalized.replace("_", "-").split("-") if part]
    return "-".join(parts)


def _try_sync_project_state(
    project_name: str,
    project_state: dict[str, Any],
    netbox_client: NetBoxClient,
    topology_store: TopologyStore,
) -> dict[str, Any]:
    """Sincronizar inventario draft en NetBox sin bloquear el guardado."""
    netbox_sync = {
        "status": "draft_synchronized",
        "detail": None,
        "result": None,
    }
    try:
        netbox_sync["result"] = netbox_client.sync_project_state(
            project_name,
            project_state,
        )
    except (TopologyImportError, NetBoxClientError, TypeError, ValueError) as exc:
        netbox_sync["status"] = "failed"
        netbox_sync["detail"] = str(exc)

    topology_store.update_netbox_sync(project_name, netbox_sync)
    return netbox_sync


def _try_clean_netbox_project(
    project_name: str,
    netbox_client: NetBoxClient,
) -> dict[str, Any]:
    """Limpiar NetBox para reflejar un canvas vacío sin bloquear guardado."""
    netbox_sync = {
        "status": "synchronized",
        "detail": "Topology cleared from NetBox",
        "result": None,
    }
    try:
        netbox_sync["result"] = netbox_client.clean_topology(project_name)
    except (TopologyImportError, NetBoxClientError) as exc:
        netbox_sync["status"] = "failed"
        netbox_sync["detail"] = str(exc)
    return netbox_sync


def _try_clean_other_netbox_projects(
    project_name: str,
    netbox_client: NetBoxClient,
    topology_store: TopologyStore,
) -> list[dict[str, Any]] | None:
    """En MVP monoprojecto, NetBox debe reflejar solo el proyecto activo."""
    if not settings.NETBOX_SINGLE_PROJECT_MODE:
        return None

    cleanup_results: list[dict[str, Any]] = []
    managed_projects = set(topology_store.list_project_names())
    try:
        managed_projects.update(netbox_client.list_managed_project_names())
    except (TopologyImportError, NetBoxClientError) as exc:
        cleanup_results.append(
            {
                "status": "failed",
                "detail": f"NetBox project discovery failed: {exc}",
                "result": None,
            }
        )

    for managed_project in sorted(managed_projects):
        if managed_project == project_name:
            continue
        cleanup_results.append(
            _try_clean_netbox_project(managed_project, netbox_client)
        )
    return cleanup_results
