"""
Runner controlado para artefactos del pipeline.

La ejecucion usa comandos allowlistados, sin shell, dentro de un directorio
generado por GEMEROTIC.
"""

from __future__ import annotations

import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path

from app.schemas.pipeline import (
    PipelineArtifact,
    PipelineCommandResult,
    PipelineRunResult,
    PipelineToolReport,
    PipelineToolStatus,
)
from app.schemas.topology import TopologyCreate
from app.services.pipeline_artifacts import PipelineArtifactGenerator

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "var" / "pipeline"
COMMAND_TIMEOUT_SECONDS = 300
REQUIRED_DEPLOY_TOOLS = ("docker", "containerlab", "ansible-playbook")
KNOWN_TOOLS = (*REQUIRED_DEPLOY_TOOLS, "opa")


class PipelineRunnerError(RuntimeError):
    """Error controlado durante la ejecucion local del pipeline."""


class PipelineToolError(PipelineRunnerError):
    """Error por herramienta externa ausente o no funcional."""


class PipelineExecutionError(PipelineRunnerError):
    """Error por fallo de un comando controlado."""


class PipelineRunner:
    """Escribe bundles y ejecuta fases locales allowlistadas."""

    def __init__(
        self,
        artifact_generator: PipelineArtifactGenerator | None = None,
        output_root: Path = DEFAULT_OUTPUT_ROOT,
        tool_resolver: Callable[[str], str | None] = shutil.which,
        command_runner: Callable[
            ...,
            subprocess.CompletedProcess[str],
        ] = subprocess.run,
    ):
        self._artifact_generator = artifact_generator or PipelineArtifactGenerator()
        self._output_root = output_root
        self._tool_resolver = tool_resolver
        self._command_runner = command_runner

    def check_tools(self) -> PipelineToolReport:
        """Comprobar disponibilidad local de herramientas externas."""
        return PipelineToolReport(
            tools=[self._check_tool(tool_name) for tool_name in KNOWN_TOOLS],
        )

    def deploy(self, topology: TopologyCreate) -> PipelineRunResult:
        """
        Generar bundle, desplegar Containerlab y aplicar Ansible.

        Si falta una herramienta, la ejecucion se bloquea antes de escribir o
        ejecutar comandos parciales.
        """
        self._require_tools(REQUIRED_DEPLOY_TOOLS)
        artifacts = self._artifact_generator.generate(topology)
        bundle_dir = self._write_bundle(topology.name, artifacts.artifacts)

        commands = [
            self._run_command(
                name="containerlab_deploy",
                command=[
                    "containerlab",
                    "deploy",
                    "--topo",
                    "containerlab/topology.clab.yml",
                ],
                cwd=bundle_dir,
            ),
            self._run_command(
                name="ansible_apply",
                command=[
                    "ansible-playbook",
                    "-i",
                    "ansible/inventory.yml",
                    "ansible/site.yml",
                ],
                cwd=bundle_dir,
            ),
        ]

        return PipelineRunResult(
            topology_name=topology.name,
            bundle_dir=str(bundle_dir),
            artifacts=artifacts.artifacts,
            commands=commands,
        )

    def _check_tool(self, tool_name: str) -> PipelineToolStatus:
        path = self._tool_resolver(tool_name)
        if path is None:
            return PipelineToolStatus(name=tool_name, installed=False)

        version_command = _version_command(tool_name)
        try:
            completed = self._command_runner(
                version_command,
                capture_output=True,
                text=True,
                timeout=30,
                shell=False,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            return PipelineToolStatus(
                name=tool_name,
                installed=True,
                path=path,
                error=str(exc),
            )

        output = (completed.stdout or completed.stderr).strip()
        return PipelineToolStatus(
            name=tool_name,
            installed=completed.returncode == 0,
            path=path,
            version=_tail(output, 512) if completed.returncode == 0 else None,
            error=_tail(output, 512) if completed.returncode != 0 else None,
        )

    def _require_tools(self, tool_names: tuple[str, ...]) -> None:
        missing = [
            status.name
            for status in (self._check_tool(tool_name) for tool_name in tool_names)
            if not status.installed
        ]
        if missing:
            raise PipelineToolError(
                f"Required pipeline tools are unavailable: {', '.join(missing)}"
            )

    def _write_bundle(
        self,
        topology_name: str,
        artifacts: list[PipelineArtifact],
    ) -> Path:
        bundle_dir = (self._output_root / topology_name).resolve()
        output_root = self._output_root.resolve()
        if output_root not in bundle_dir.parents and bundle_dir != output_root:
            raise PipelineRunnerError("Bundle path escaped output root")

        for artifact in artifacts:
            artifact_path = (bundle_dir / artifact.path).resolve()
            if bundle_dir not in artifact_path.parents:
                raise PipelineRunnerError("Artifact path escaped bundle directory")
            artifact_path.parent.mkdir(parents=True, exist_ok=True)
            artifact_path.write_text(artifact.content, encoding="utf-8")

        return bundle_dir

    def _run_command(
        self,
        name: str,
        command: list[str],
        cwd: Path,
    ) -> PipelineCommandResult:
        try:
            completed = self._command_runner(
                command,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=COMMAND_TIMEOUT_SECONDS,
                shell=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise PipelineExecutionError(f"Pipeline command timed out: {name}") from exc
        except OSError as exc:
            raise PipelineExecutionError(f"Pipeline command failed: {name}") from exc

        result = PipelineCommandResult(
            name=name,
            command=command,
            exit_code=completed.returncode,
            stdout_tail=_tail(completed.stdout or "", 4000),
            stderr_tail=_tail(completed.stderr or "", 4000),
        )
        if completed.returncode != 0:
            raise PipelineExecutionError(
                f"Pipeline command returned non-zero exit code: {name}"
            )
        return result


def _version_command(tool_name: str) -> list[str]:
    if tool_name == "docker":
        return ["docker", "--version"]
    if tool_name == "containerlab":
        return ["containerlab", "version"]
    if tool_name == "ansible-playbook":
        return ["ansible-playbook", "--version"]
    if tool_name == "opa":
        return ["opa", "version"]
    return [tool_name, "--version"]


def _tail(value: str, max_length: int) -> str:
    if len(value) <= max_length:
        return value
    return value[-max_length:]
