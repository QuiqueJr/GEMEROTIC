"""
Endpoints de generación de artefactos del pipeline.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import require_api_key
from app.schemas.responses import APIResponse
from app.schemas.topology import TopologyCreate
from app.services.pipeline_artifacts import PipelineArtifactGenerator
from app.services.pipeline_runner import (
    PipelineExecutionError,
    PipelineRunner,
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
