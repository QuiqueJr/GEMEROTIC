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

    def update_netbox_sync(
        self,
        topology_name: str,
        sync_result: dict[str, Any],
    ) -> None:
        """Anotar el resultado de sincronización con NetBox en metadata."""
        topology_dir = self._topology_dir(topology_name)
        metadata_file = topology_dir / "metadata.json"
        metadata: dict[str, Any] = {}
        if metadata_file.exists():
            try:
                metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                metadata = {}

        metadata["topology_name"] = topology_name
        metadata["netbox_sync"] = sync_result
        metadata["updated_at"] = datetime.now(UTC).isoformat()
        self._write_json_atomic(metadata_file, metadata)

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
