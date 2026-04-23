"""
Schemas de artefactos generados para el pipeline de despliegue.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

PipelineStage = Literal["containerlab", "ansible", "batfish", "opa", "metadata"]


class PipelineArtifact(BaseModel):
    """Archivo renderizado para una fase concreta del pipeline."""

    path: str = Field(
        ..., min_length=1, max_length=256,
        description="Ruta relativa POSIX dentro del bundle generado",
    )
    stage: PipelineStage = Field(
        ...,
        description="Fase del pipeline a la que pertenece el artefacto",
    )
    content_type: str = Field(
        ..., min_length=1, max_length=80,
        description="Tipo de contenido del archivo",
    )
    content: str = Field(
        ..., min_length=1,
        description="Contenido completo del archivo renderizado",
    )

    @field_validator("path")
    @classmethod
    def validate_relative_path(cls, value: str) -> str:
        """Evitar rutas absolutas o path traversal en artefactos generados."""
        if value.startswith(("/", "\\")) or "\\" in value:
            raise ValueError("Artifact path must be a relative POSIX path")
        parts = value.split("/")
        if any(part in {"", ".", ".."} for part in parts):
            raise ValueError("Artifact path contains unsafe segments")
        return value


class PipelineArtifacts(BaseModel):
    """Respuesta estructurada del generador de artefactos."""

    topology_name: str = Field(
        ..., min_length=1, max_length=64,
        description="Nombre validado de la topología",
    )
    artifacts: list[PipelineArtifact] = Field(
        ..., min_length=1,
        description="Archivos generados para el pipeline",
    )


class PipelineToolStatus(BaseModel):
    """Estado local de una herramienta externa del pipeline."""

    name: str = Field(..., min_length=1, max_length=64)
    installed: bool = Field(...)
    path: str | None = Field(default=None, max_length=512)
    version: str | None = Field(default=None, max_length=512)
    error: str | None = Field(default=None, max_length=1024)


class PipelineToolReport(BaseModel):
    """Reporte de disponibilidad de herramientas externas."""

    tools: list[PipelineToolStatus] = Field(..., min_length=1)


class PipelineCommandResult(BaseModel):
    """Resultado resumido de un comando controlado del pipeline."""

    name: str = Field(..., min_length=1, max_length=64)
    command: list[str] = Field(..., min_length=1)
    exit_code: int = Field(...)
    stdout_tail: str = Field(default="", max_length=4000)
    stderr_tail: str = Field(default="", max_length=4000)


class PipelineRunResult(BaseModel):
    """Resultado de una ejecucion controlada del pipeline."""

    topology_name: str = Field(..., min_length=1, max_length=64)
    bundle_dir: str = Field(..., min_length=1, max_length=512)
    artifacts: list[PipelineArtifact] = Field(..., min_length=1)
    commands: list[PipelineCommandResult] = Field(default_factory=list)
