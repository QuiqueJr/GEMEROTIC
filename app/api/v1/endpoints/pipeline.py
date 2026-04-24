"""
Endpoints de generación de artefactos del pipeline.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import require_api_key
from app.schemas.pipeline import PipelineConsoleRequest
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

router = APIRouter(prefix="/pipeline")


def get_pipeline_runner() -> PipelineRunner:
    """Crear runner local del pipeline."""
    return PipelineRunner()


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
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
