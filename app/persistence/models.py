"""
Modelos SQL granulares de GEMEROTIC.
"""

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.persistence.database import Base


def utc_now() -> datetime:
    """Fecha UTC para columnas auditables."""
    return datetime.now(UTC)


class ProjectRecord(Base):
    """Proyecto/gemelo digital versionado."""

    __tablename__ = "gemerotic_projects"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active_view: Mapped[str] = mapped_column(
        String(32), nullable=False, default="logical"
    )
    state_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    topology_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    netbox_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending"
    )
    deployment_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending"
    )
    validation_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending"
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )


class ProjectEntityRecord(Base):
    """Entidad granular del proyecto: activo, cable, VLAN, zona, mapa, config."""

    __tablename__ = "gemerotic_project_entities"
    __table_args__ = (
        UniqueConstraint(
            "project_name",
            "entity_type",
            "entity_id",
            name="uq_gemerotic_project_entity",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )


class OutboxEventRecord(Base):
    """Evento durable para proyecciones y despliegue."""

    __tablename__ = "gemerotic_outbox_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )


class RuntimeNodeRecord(Base):
    """Estado runtime de un activo desplegado."""

    __tablename__ = "gemerotic_runtime_nodes"
    __table_args__ = (
        UniqueConstraint(
            "project_name",
            "node_id",
            name="uq_gemerotic_runtime_node",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    node_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    container_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    image: Mapped[str | None] = mapped_column(String(256), nullable=True)
    power_state: Mapped[str] = mapped_column(
        String(32), nullable=False, default="unknown"
    )
    console_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    running_config: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )
