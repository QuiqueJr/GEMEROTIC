"""
Endpoints de generación de artefactos del pipeline.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import require_api_key
from app.dependencies import get_pipeline_runner, get_topology_store
from app.schemas.pipeline import PipelineConsoleRequest, PipelineLabStatus
from app.schemas.project_commands import RuntimePowerRequest
from app.schemas.responses import APIResponse
from app.schemas.topology import TopologyCreate
from app.services.pipeline_artifacts import PipelineArtifactGenerator
from app.services.pipeline_runner import (
    PipelineExecutionError,
    PipelineLabNotFoundError,
    PipelineNodeNotFoundError,
    PipelineRunner,
    PipelineRuntimeCommandError,
    PipelineToolError,
)
from app.services.topology_store import (
    TopologyNotFoundError,
    TopologyStore,
    TopologyStoreError,
)

router = APIRouter(prefix="/pipeline")


@router.post(
    "/artifacts",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Generar artefactos del pipeline",
    description=(
        "Renderizar artefactos declarativos para Containerlab, Ansible, "
        "Batfish y OPA desde un payload TopologyCreate validado."
    ),
)
async def generate_pipeline_artifacts(
    topology: TopologyCreate,
    _: None = Depends(require_api_key),
) -> APIResponse:
    """Generar archivos reproducibles sin ejecutar herramientas externas."""
    artifacts = PipelineArtifactGenerator().generate(topology)
    return APIResponse(
        message="Pipeline artifacts generated successfully",
        data=artifacts.model_dump(),
    )


@router.post(
    "/artifacts/{topology_name}",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Generar artefactos desde la última topología guardada",
)
async def generate_saved_pipeline_artifacts(
    topology_name: str,
    _: None = Depends(require_api_key),
    topology_store: TopologyStore = Depends(get_topology_store),
) -> APIResponse:
    """Generar artefactos desde el estado guardado, no desde NetBox."""
    topology = _load_saved_topology(topology_name, topology_store)
    artifacts = PipelineArtifactGenerator().generate(topology)
    return APIResponse(
        message="Pipeline artifacts generated from saved topology",
        data=artifacts.model_dump(),
    )


@router.get(
    "/tools",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Comprobar herramientas locales del pipeline",
)
async def check_pipeline_tools(
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Reportar disponibilidad local de Docker, Containerlab, Ansible y OPA."""
    report = runner.check_tools()
    return APIResponse(
        message="Pipeline tool status collected",
        data=report.model_dump(),
    )


@router.post(
    "/deploy",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Desplegar topología con Containerlab y Ansible",
)
async def deploy_pipeline(
    topology: TopologyCreate,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Ejecutar despliegue local controlado desde un payload validado."""
    try:
        result = runner.deploy(topology)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="Pipeline deployed successfully",
        data=result.model_dump(),
    )


@router.post(
    "/deploy/{topology_name}",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Desplegar la última topología guardada",
)
async def deploy_saved_pipeline(
    topology_name: str,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
    topology_store: TopologyStore = Depends(get_topology_store),
) -> APIResponse:
    """Ejecutar despliegue controlado desde el último guardado local."""
    topology = _load_saved_topology(topology_name, topology_store)
    try:
        result = runner.deploy(topology)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="Pipeline deployed from saved topology",
        data=result.model_dump(),
    )


@router.get(
    "/labs/{topology_name}",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Inspeccionar lab desplegado",
)
async def inspect_pipeline_lab(
    topology_name: str,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Consultar el estado resumido de un lab activo en Containerlab."""
    try:
        result = runner.inspect_lab(topology_name)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineLabNotFoundError as exc:
        result = PipelineLabStatus(
            topology_name=topology_name,
            deployed=False,
            detail=str(exc),
        )
        return APIResponse(
            message="Pipeline lab is not deployed",
            data=result.model_dump(),
        )
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="Pipeline lab status collected",
        data=result.model_dump(),
    )


@router.post(
    "/labs/{topology_name}/nodes/{node_id}/console",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Ejecutar comando controlado sobre un nodo del lab",
)
async def run_pipeline_node_console(
    topology_name: str,
    node_id: str,
    request: PipelineConsoleRequest,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Ejecutar comandos allowlistados de consola sobre el runtime Linux del lab."""
    try:
        result = runner.run_node_command(
            topology_name=topology_name,
            node_id=node_id,
            command_text=request.command,
        )
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineLabNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineNodeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineRuntimeCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="Pipeline console command executed",
        data=result.model_dump(),
    )


@router.post(
    "/labs/{topology_name}/nodes/{node_id}/power",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Encender, apagar o reiniciar un nodo del lab",
)
async def control_pipeline_node_power(
    topology_name: str,
    node_id: str,
    request: RuntimePowerRequest,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Controlar el ciclo de vida de un activo desplegado."""
    try:
        result = runner.control_node_power(topology_name, node_id, request.action)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineLabNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineNodeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineRuntimeCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return APIResponse(
        message="Pipeline node power action executed",
        data=result,
    )


@router.post(
    "/labs/{topology_name}/power",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Encender, apagar o reiniciar todos los nodos del lab",
)
async def control_pipeline_lab_power(
    topology_name: str,
    request: RuntimePowerRequest,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Controlar el ciclo de vida global del gemelo desplegado."""
    try:
        result = runner.control_lab_power(topology_name, request.action)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineLabNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineRuntimeCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return APIResponse(
        message="Pipeline lab power action executed",
        data=result,
    )


def _load_saved_topology(
    topology_name: str,
    topology_store: TopologyStore,
) -> TopologyCreate:
    """Cargar una topología guardada y mapear errores HTTP."""
    try:
        return topology_store.load(topology_name)
    except TopologyNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
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
