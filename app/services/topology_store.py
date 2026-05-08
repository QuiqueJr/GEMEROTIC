"""
Persistencia local del estado guardado del gemelo digital.

El store mantiene el último `TopologyCreate` validado como fuente operativa
para el pipeline IaC del MVP. NetBox se trata como sincronización derivada.
"""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.schemas.pipeline import PipelineArtifact
from app.schemas.topology import TopologyCreate
from app.schemas.validators import validate_slug
from app.services.pipeline_artifacts import PipelineArtifactGenerator

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TOPOLOGY_STORE_ROOT = REPO_ROOT / "var" / "topologies"


class TopologyStoreError(RuntimeError):
    """Error controlado del store local de topologías."""


class TopologyNotFoundError(TopologyStoreError):
    """Error cuando una topología guardada no existe."""


class TopologyStore:
    """Guarda y carga topologías validadas junto con sus artefactos derivados."""

    def __init__(
        self,
        root: Path = DEFAULT_TOPOLOGY_STORE_ROOT,
        artifact_generator: PipelineArtifactGenerator | None = None,
    ):
        self._root = root
        self._artifact_generator = artifact_generator or PipelineArtifactGenerator()

    def save(self, topology: TopologyCreate) -> dict[str, Any]:
        """Persistir la topología y renderizar artefactos derivados."""
        topology_dir = self._topology_dir(topology.name)
        topology_dir.mkdir(parents=True, exist_ok=True)

        artifacts = self._artifact_generator.generate(topology)
        saved_at = datetime.now(UTC).isoformat()
        topology_payload = topology.model_dump(mode="json", exclude_none=True)
        metadata = {
            "topology_name": topology.name,
            "saved_at": saved_at,
            "artifact_count": len(artifacts.artifacts),
        }

        self._write_json_atomic(topology_dir / "topology.json", topology_payload)
        self._write_json_atomic(topology_dir / "metadata.json", metadata)
        self._write_artifacts(topology_dir / "artifacts", artifacts.artifacts)
        return {
            "topology_name": topology.name,
            "saved_at": saved_at,
            "store_dir": str(topology_dir),
            "artifact_count": len(artifacts.artifacts),
        }

    def save_project_state(
        self,
        project_name: str,
        state: dict[str, Any],
    ) -> dict[str, Any]:
        """Persistir el estado editable del builder aunque aun no sea desplegable."""
        topology_dir = self._topology_dir(project_name)
        topology_dir.mkdir(parents=True, exist_ok=True)
        saved_at = datetime.now(UTC).isoformat()
        payload = {
            **state,
            "project_name": validate_slug(project_name, "Project name"),
            "saved_at": saved_at,
        }

        self._write_json_atomic(topology_dir / "state.json", payload)
        self._merge_metadata(
            topology_dir / "metadata.json",
            {
                "project_name": payload["project_name"],
                "state_saved_at": saved_at,
                "state_version": payload.get("version", 1),
            },
        )
        return {
            "project_name": payload["project_name"],
            "saved_at": saved_at,
            "store_dir": str(topology_dir),
        }

    def load(self, topology_name: str) -> TopologyCreate:
        """Cargar la última topología guardada por nombre."""
        topology_dir = self._topology_dir(topology_name)
        topology_file = topology_dir / "topology.json"
        if not topology_file.exists():
            raise TopologyNotFoundError(f"Saved topology not found: {topology_name}")

        try:
            payload = json.loads(topology_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise TopologyStoreError(
                f"Saved topology file is invalid: {topology_name}"
            ) from exc
        return TopologyCreate(**payload)

    def load_project_state(self, project_name: str) -> dict[str, Any]:
        """Cargar el ultimo estado editable guardado por proyecto."""
        topology_dir = self._topology_dir(project_name)
        state_file = topology_dir / "state.json"
        if not state_file.exists():
            raise TopologyNotFoundError(
                f"Saved project state not found: {project_name}"
            )

        try:
            payload = json.loads(state_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise TopologyStoreError(
                f"Saved project state file is invalid: {project_name}"
            ) from exc
        if not isinstance(payload, dict):
            raise TopologyStoreError(
                f"Saved project state file is invalid: {project_name}"
            )
        return payload

    def list_project_names(self) -> list[str]:
        """Listar proyectos con estado local guardado."""
        if not self._root.exists():
            return []

        names: list[str] = []
        for path in self._root.iterdir():
            if not path.is_dir():
                continue
            if (path / "state.json").exists() or (path / "topology.json").exists():
                names.append(path.name)
        return sorted(names)

    def update_netbox_sync(
        self,
        topology_name: str,
        sync_result: dict[str, Any],
    ) -> None:
        """Anotar el resultado de sincronización con NetBox en metadata."""
        topology_dir = self._topology_dir(topology_name)
        metadata_file = topology_dir / "metadata.json"
        self._merge_metadata(
            metadata_file,
            {
                "topology_name": topology_name,
                "netbox_sync": sync_result,
                "updated_at": datetime.now(UTC).isoformat(),
            },
        )

    def _topology_dir(self, topology_name: str) -> Path:
        """Resolver un directorio seguro dentro del store."""
        safe_name = validate_slug(topology_name, "Topology name")
        path = (self._root / safe_name).resolve()
        root = self._root.resolve()
        if root not in path.parents and path != root:
            raise TopologyStoreError("Resolved topology path escapes store root")
        return path

    def _write_artifacts(
        self,
        artifacts_dir: Path,
        artifacts: list[PipelineArtifact],
    ) -> None:
        """Escribir una copia navegable de los artefactos derivados."""
        root = self._root.resolve()
        target = artifacts_dir.resolve()
        if root not in target.parents:
            raise TopologyStoreError("Resolved artifacts path escapes store root")
        if artifacts_dir.exists():
            shutil.rmtree(artifacts_dir)
        artifacts_dir.mkdir(parents=True, exist_ok=True)

        for artifact in artifacts:
            artifact_path = (artifacts_dir / artifact.path).resolve()
            if target not in artifact_path.parents:
                raise TopologyStoreError(
                    "Resolved artifact path escapes artifacts root"
                )
            artifact_path.parent.mkdir(parents=True, exist_ok=True)
            artifact_path.write_text(artifact.content, encoding="utf-8")

    def _write_json_atomic(self, path: Path, payload: dict[str, Any]) -> None:
        """Escribir JSON de forma atómica dentro del mismo directorio."""
        temporary_path = path.with_name(f"{path.name}.tmp")
        temporary_path.write_text(
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary_path.replace(path)

    def _merge_metadata(self, path: Path, patch: dict[str, Any]) -> None:
        """Actualizar metadata conservando claves previas validas."""
        metadata: dict[str, Any] = {}
        if path.exists():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    metadata = loaded
            except json.JSONDecodeError:
                metadata = {}
        metadata.update(patch)
        self._write_json_atomic(path, metadata)
