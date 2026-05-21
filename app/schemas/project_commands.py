"""
Schemas de comandos granulares del builder.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.validators import validate_slug

ProjectCommandType = Literal[
    "create_asset",
    "update_asset",
    "move_asset",
    "delete_asset",
    "upsert_connection",
    "delete_connection",
    "upsert_config",
    "upsert_interface",
    "upsert_vlan",
    "upsert_security_zone",
    "upsert_conduit",
    "upsert_physical_location",
    "upsert_physical_object",
    "upsert_map",
    "set_project_snapshot",
    "save_project",
]
RuntimePowerAction = Literal["start", "stop", "restart"]


class ProjectCommand(BaseModel):
    """Comando granular emitido por la UI."""

    command_type: ProjectCommandType
    entity_id: str | None = Field(default=None, max_length=128)
    entity_type: str | None = Field(default=None, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    expected_revision: int | None = Field(default=None, ge=0)
    idempotency_key: str | None = Field(default=None, max_length=128)

    @field_validator("entity_id")
    @classmethod
    def validate_entity_id(cls, value: str | None) -> str | None:
        """Sanitizar IDs cuando el comando los define."""
        if value is None:
            return None
        return validate_slug(value, "Entity ID")


class RuntimePowerRequest(BaseModel):
    """Accion de encendido/apagado del runtime."""

    action: RuntimePowerAction


class ProjectCommandResult(BaseModel):
    """Resultado comun de un comando granular."""

    project_name: str
    revision: int
    entity_type: str | None = None
    entity_id: str | None = None
    jobs_queued: list[str] = Field(default_factory=list)
