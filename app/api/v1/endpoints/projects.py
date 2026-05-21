"""
Endpoints granulares de proyectos GEMEROTIC.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import require_api_key
from app.dependencies import get_database_session
from app.schemas.project_commands import ProjectCommand, ProjectCommandResult
from app.schemas.responses import APIResponse
from app.schemas.validators import validate_slug
from app.services.granular_project_store import (
    GranularProjectStore,
    GranularStoreConflictError,
)

router = APIRouter(prefix="/projects")


@router.get(
    "/{project_name}/snapshot",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Cargar snapshot granular reconstruido",
)
async def get_project_snapshot(
    project_name: str,
    _: None = Depends(require_api_key),
    session: Session = Depends(get_database_session),
) -> APIResponse:
    """Reconstruir el estado editable desde PostgreSQL."""
    safe_project_name = _safe_project_name(project_name)
    snapshot = GranularProjectStore(session).get_project_snapshot(safe_project_name)
    return APIResponse(
        message="Project snapshot loaded successfully",
        data=snapshot,
    )


@router.post(
    "/{project_name}/commands",
    response_model=APIResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Aplicar comando granular del builder",
)
async def apply_project_command(
    project_name: str,
    command: ProjectCommand,
    _: None = Depends(require_api_key),
    session: Session = Depends(get_database_session),
) -> APIResponse:
    """Persistir una operacion pequeña sin reenviar toda la topologia."""
    safe_project_name = _safe_project_name(project_name)
    try:
        result = GranularProjectStore(session).apply_command(safe_project_name, command)
    except GranularStoreConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    return APIResponse(
        message="Project command accepted",
        data=ProjectCommandResult(**result).model_dump(),
    )


@router.get(
    "/{project_name}/jobs",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Listar trabajos derivados del proyecto",
)
async def list_project_jobs(
    project_name: str,
    _: None = Depends(require_api_key),
    session: Session = Depends(get_database_session),
) -> APIResponse:
    """Mostrar progreso de NetBox, IaC, despliegue y validaciones."""
    safe_project_name = _safe_project_name(project_name)
    jobs = GranularProjectStore(session).list_jobs(safe_project_name)
    return APIResponse(
        message="Project jobs loaded successfully",
        data={"project_name": safe_project_name, "jobs": jobs},
    )


def _safe_project_name(project_name: str) -> str:
    try:
        return validate_slug(project_name, "Project name")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
