"""
Endpoints de generación de artefactos del pipeline.
"""

from fastapi import APIRouter, Depends, status

from app.core.security import require_api_key
from app.schemas.responses import APIResponse
from app.schemas.topology import TopologyCreate
from app.services.pipeline_artifacts import PipelineArtifactGenerator

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
