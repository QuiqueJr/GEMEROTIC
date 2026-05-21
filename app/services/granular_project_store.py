"""
Store canonico granular respaldado por PostgreSQL.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.persistence.models import OutboxEventRecord, ProjectEntityRecord, ProjectRecord
from app.schemas.project_commands import ProjectCommand
from app.schemas.validators import validate_slug
from app.services.granular_importer import (
    MANAGED_ENTITY_TYPES,
    extract_project_entities,
)

COMMAND_ENTITY_TYPES: dict[str, str] = {
    "create_asset": "ui.asset",
    "update_asset": "ui.asset",
    "move_asset": "ui.asset",
    "delete_asset": "ui.asset",
    "upsert_connection": "ui.connection",
    "delete_connection": "ui.connection",
    "upsert_config": "asset.config",
    "upsert_interface": "logical.interface",
    "upsert_vlan": "logical.vlan",
    "upsert_security_zone": "security.zone",
    "upsert_conduit": "security.conduit",
    "upsert_physical_location": "ui.physical_location",
    "upsert_physical_object": "ui.physical_object",
    "upsert_map": "ui.map",
    "set_project_snapshot": "ui.snapshot",
    "save_project": "project.revision",
}
DELETE_COMMANDS = {"delete_asset", "delete_connection"}


class GranularStoreConflictError(RuntimeError):
    """Error de revision optimista."""


class GranularProjectStore:
    """Persistir proyectos, entidades y eventos de forma granular."""

    def __init__(self, session: Session):
        self._session = session

    def save_project_state(
        self, project_name: str, state: dict[str, Any]
    ) -> dict[str, Any]:
        """Importar snapshot legacy hacia la fuente granular."""
        safe_project_name = validate_slug(project_name, "Project name")
        project = self._get_or_create_project(safe_project_name, state)
        project.revision += 1
        project.active_view = str(state.get("active_view") or project.active_view)
        project.state_snapshot = state
        topology = state.get("topology")
        project.topology_payload = topology if isinstance(topology, dict) else None
        project.netbox_status = "queued"
        project.deployment_status = "queued" if project.topology_payload else "draft"
        project.validation_status = "queued" if project.topology_payload else "draft"
        project.updated_at = datetime.now(UTC)

        self._replace_imported_entities(safe_project_name, state, project.revision)
        job_ids = self._queue_standard_jobs(safe_project_name, project.revision, state)
        self._session.commit()
        return {
            "project_name": safe_project_name,
            "revision": project.revision,
            "jobs_queued": job_ids,
            "deployment_status": project.deployment_status,
            "netbox_status": project.netbox_status,
        }

    def apply_command(
        self, project_name: str, command: ProjectCommand
    ) -> dict[str, Any]:
        """Aplicar un comando de dominio a una entidad."""
        safe_project_name = validate_slug(project_name, "Project name")
        project = self._get_or_create_project(safe_project_name, {})
        if (
            command.expected_revision is not None
            and command.expected_revision != project.revision
        ):
            raise GranularStoreConflictError("Project revision conflict")

        project.revision += 1
        project.updated_at = datetime.now(UTC)
        entity_type = command.entity_type or COMMAND_ENTITY_TYPES[command.command_type]
        entity_id = command.entity_id or safe_project_name

        if command.command_type in DELETE_COMMANDS:
            self._session.execute(
                delete(ProjectEntityRecord).where(
                    ProjectEntityRecord.project_name == safe_project_name,
                    ProjectEntityRecord.entity_type == entity_type,
                    ProjectEntityRecord.entity_id == entity_id,
                )
            )
        elif command.command_type != "save_project":
            self._upsert_entity(
                safe_project_name,
                entity_type,
                entity_id,
                command.payload,
                project.revision,
            )

        job_ids = self._queue_jobs_for_command(
            safe_project_name, project.revision, command, entity_type, entity_id
        )
        self._session.commit()
        return {
            "project_name": safe_project_name,
            "revision": project.revision,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "jobs_queued": job_ids,
        }

    def get_project_snapshot(self, project_name: str) -> dict[str, Any] | None:
        """Recuperar snapshot reconstruible para la UI."""
        project = self._session.get(
            ProjectRecord, validate_slug(project_name, "Project name")
        )
        if project is None:
            return None
        snapshot = (
            project.state_snapshot if isinstance(project.state_snapshot, dict) else {}
        )
        return {
            **snapshot,
            "project_name": project.name,
            "revision": project.revision,
            "deployment_status": project.deployment_status,
            "netbox_status": project.netbox_status,
            "validation_status": project.validation_status,
        }

    def list_jobs(self, project_name: str, limit: int = 50) -> list[dict[str, Any]]:
        """Listar jobs recientes de un proyecto."""
        safe_project_name = validate_slug(project_name, "Project name")
        rows = self._session.scalars(
            select(OutboxEventRecord)
            .where(OutboxEventRecord.project_name == safe_project_name)
            .order_by(OutboxEventRecord.created_at.desc())
            .limit(limit)
        ).all()
        return [_event_to_dict(row) for row in rows]

    def claim_pending_events(self, limit: int = 10) -> list[OutboxEventRecord]:
        """Reclamar eventos pendientes para el worker."""
        rows = self._session.scalars(
            select(OutboxEventRecord)
            .where(OutboxEventRecord.status == "pending")
            .order_by(OutboxEventRecord.created_at.asc())
            .limit(limit)
        ).all()
        for row in rows:
            row.status = "running"
            row.attempts += 1
            row.updated_at = datetime.now(UTC)
        self._session.commit()
        return rows

    def mark_event_done(
        self, event_id: str, status: str, error: str | None = None
    ) -> None:
        """Actualizar resultado de un evento."""
        event = self._session.get(OutboxEventRecord, event_id)
        if event is None:
            return
        event.status = status
        event.error = error
        event.updated_at = datetime.now(UTC)
        project = self._session.get(ProjectRecord, event.project_name)
        if project is not None:
            if event.event_type.startswith("deploy."):
                project.deployment_status = "ready" if status == "done" else "failed"
            elif event.event_type.startswith("netbox."):
                project.netbox_status = "synchronized" if status == "done" else "failed"
            elif event.event_type.startswith("validate."):
                project.validation_status = "ready" if status == "done" else "failed"
            if error:
                project.last_error = error
        self._session.commit()

    def _get_or_create_project(
        self, project_name: str, state: dict[str, Any]
    ) -> ProjectRecord:
        project = self._session.get(ProjectRecord, project_name)
        if project is not None:
            return project
        settings = (
            state.get("settings") if isinstance(state.get("settings"), dict) else {}
        )
        display_name = str(settings.get("name") or project_name)
        project = ProjectRecord(
            name=project_name,
            display_name=display_name[:128],
            revision=0,
        )
        self._session.add(project)
        return project

    def _replace_imported_entities(
        self, project_name: str, state: dict[str, Any], revision: int
    ) -> None:
        self._session.execute(
            delete(ProjectEntityRecord).where(
                ProjectEntityRecord.project_name == project_name,
                ProjectEntityRecord.entity_type.in_(MANAGED_ENTITY_TYPES),
            )
        )
        for entity in extract_project_entities(project_name, state):
            self._upsert_entity(
                project_name,
                entity.entity_type,
                entity.entity_id,
                entity.payload,
                revision,
            )

    def _upsert_entity(
        self,
        project_name: str,
        entity_type: str,
        entity_id: str,
        payload: dict[str, Any],
        revision: int,
    ) -> None:
        row = self._session.scalar(
            select(ProjectEntityRecord).where(
                ProjectEntityRecord.project_name == project_name,
                ProjectEntityRecord.entity_type == entity_type,
                ProjectEntityRecord.entity_id == entity_id,
            )
        )
        if row is None:
            self._session.add(
                ProjectEntityRecord(
                    project_name=project_name,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    revision=revision,
                    payload=payload,
                )
            )
            return
        row.payload = payload
        row.revision = revision
        row.updated_at = datetime.now(UTC)

    def _queue_standard_jobs(
        self, project_name: str, revision: int, state: dict[str, Any]
    ) -> list[str]:
        jobs = ["netbox.sync", "artifacts.generate"]
        if isinstance(state.get("topology"), dict):
            jobs.extend(["deploy.reconcile", "validate.compliance"])
        return [
            self._queue_event(
                project_name, job, revision, payload={"source": "legacy_state"}
            )
            for job in jobs
        ]

    def _queue_jobs_for_command(
        self,
        project_name: str,
        revision: int,
        command: ProjectCommand,
        entity_type: str,
        entity_id: str,
    ) -> list[str]:
        jobs = ["artifacts.generate"]
        if entity_type.startswith("ui.") and command.command_type == "move_asset":
            jobs = ["artifacts.canvas"]
        elif entity_type in {
            "ui.asset",
            "ui.connection",
            "physical.device",
            "physical.cable",
        }:
            jobs.extend(["netbox.sync", "deploy.reconcile"])
        elif entity_type.startswith("logical.") or entity_type == "asset.config":
            jobs.extend(["netbox.sync", "deploy.configure", "validate.compliance"])
        elif entity_type.startswith("security."):
            jobs.extend(["netbox.sync", "validate.compliance"])
        return [
            self._queue_event(
                project_name,
                job,
                revision,
                entity_type=entity_type,
                entity_id=entity_id,
                payload={"command_type": command.command_type},
            )
            for job in dict.fromkeys(jobs)
        ]

    def _queue_event(
        self,
        project_name: str,
        event_type: str,
        revision: int,
        entity_type: str | None = None,
        entity_id: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> str:
        event_id = uuid4().hex
        self._session.add(
            OutboxEventRecord(
                id=event_id,
                project_name=project_name,
                event_type=event_type,
                entity_type=entity_type,
                entity_id=entity_id,
                revision=revision,
                payload=payload or {},
            )
        )
        return event_id


def _event_to_dict(event: OutboxEventRecord) -> dict[str, Any]:
    return {
        "id": event.id,
        "project_name": event.project_name,
        "event_type": event.event_type,
        "entity_type": event.entity_type,
        "entity_id": event.entity_id,
        "revision": event.revision,
        "status": event.status,
        "attempts": event.attempts,
        "error": event.error,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "updated_at": event.updated_at.isoformat() if event.updated_at else None,
    }
