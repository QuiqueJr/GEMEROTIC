"""
Schemas para persistir el estado editable del builder visual.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.validators import validate_slug


class TopologyProjectState(BaseModel):
    """Estado permisivo del gemelo editable en UI."""

    model_config = ConfigDict(extra="allow")

    project_name: str = Field(min_length=1, max_length=64)
    version: int = Field(default=1, ge=1)
    settings: dict[str, Any] = Field(default_factory=dict)
    nodes: list[dict[str, Any]] = Field(default_factory=list, max_length=500)
    edges: list[dict[str, Any]] = Field(default_factory=list, max_length=1000)
    drawings: list[dict[str, Any]] = Field(default_factory=list, max_length=500)
    active_view: Literal["physical", "logical", "security"] = "physical"
    topology: dict[str, Any] | None = None

    @field_validator("project_name")
    @classmethod
    def validate_project_name(cls, value: str) -> str:
        """Validar nombre estable de proyecto."""
        return validate_slug(value, "Project name")
