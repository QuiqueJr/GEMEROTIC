"""
Runner controlado para artefactos del pipeline.

La ejecucion usa comandos allowlistados, sin shell, dentro de un directorio
generado por GEMEROTIC.
"""

from __future__ import annotations

import json
import re
import shlex
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.schemas.pipeline import (
    PipelineArtifact,
    PipelineCommandResult,
    PipelineConsoleResult,
    PipelineLabNode,
    PipelineLabStatus,
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
INTERFACE_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9._:-]{1,32}$")
TARGET_PATTERN = re.compile(r"^[a-zA-Z0-9._:-]{1,255}$")


class PipelineRunnerError(RuntimeError):
    """Error controlado durante la ejecucion local del pipeline."""


class PipelineToolError(PipelineRunnerError):
    """Error por herramienta externa ausente o no funcional."""


class PipelineExecutionError(PipelineRunnerError):
    """Error por fallo de un comando controlado."""


class PipelineRuntimeCommandError(PipelineRunnerError):
    """Error por comando de consola no permitido."""


class PipelineLabNotFoundError(PipelineRunnerError):
    """Error cuando el lab no existe o no esta desplegado."""


class PipelineNodeNotFoundError(PipelineRunnerError):
    """Error cuando el nodo no existe dentro del lab."""


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

    def inspect_lab(self, topology_name: str) -> PipelineLabStatus:
        """Inspeccionar un lab desplegado con Containerlab en formato JSON."""
        self._require_tools(("containerlab",))
        completed = self._run_command_raw(
            command=[
                "containerlab",
                "inspect",
                "--name",
                topology_name,
                "-f",
                "json",
            ],
            cwd=REPO_ROOT,
            timeout_seconds=30,
        )
        try:
            payload = json.loads(completed.stdout or "{}")
        except json.JSONDecodeError as exc:
            raise PipelineExecutionError(
                "Containerlab inspect returned invalid JSON"
            ) from exc

        return _build_lab_status(topology_name, payload)

    def run_node_command(
        self,
        topology_name: str,
        node_id: str,
        command_text: str,
    ) -> PipelineConsoleResult:
        """
        Ejecutar un comando de consola controlado sobre un nodo del lab.

        Solo se permiten comandos de inspección y configuración de red muy
        acotados sobre el runtime Linux actual del Step 10.
        """
        self._require_tools(("docker", "containerlab"))
        parsed_command = _parse_runtime_command(command_text)
        lab_status = self.inspect_lab(topology_name)
        node = next(
            (
                candidate
                for candidate in lab_status.nodes
                if candidate.node_id == node_id
            ),
            None,
        )
        if node is None:
            raise PipelineNodeNotFoundError(
                f"Pipeline node is unavailable: {node_id}"
            )

        completed = self._run_command_raw(
            command=["docker", "exec", node.container_name, *parsed_command],
            cwd=REPO_ROOT,
        )
        return PipelineConsoleResult(
            topology_name=topology_name,
            node_id=node_id,
            container_name=node.container_name,
            command=parsed_command,
            exit_code=completed.returncode,
            stdout_tail=_tail(completed.stdout or "", 4000),
            stderr_tail=_tail(completed.stderr or "", 4000),
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
        completed = self._run_command_raw(command=command, cwd=cwd)
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

    def _run_command_raw(
        self,
        command: list[str],
        cwd: Path,
        timeout_seconds: int = COMMAND_TIMEOUT_SECONDS,
    ) -> subprocess.CompletedProcess[str]:
        try:
            completed = self._command_runner(
                command,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                shell=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise PipelineExecutionError("Pipeline command timed out") from exc
        except OSError as exc:
            raise PipelineExecutionError("Pipeline command failed") from exc
        return completed


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


def _build_lab_status(topology_name: str, payload: Any) -> PipelineLabStatus:
    if not isinstance(payload, dict):
        raise PipelineLabNotFoundError(
            f"Pipeline lab is unavailable: {topology_name}"
        )

    lab_rows = payload.get(topology_name)
    if not isinstance(lab_rows, list) or not lab_rows:
        raise PipelineLabNotFoundError(
            f"Pipeline lab is unavailable: {topology_name}"
        )

    nodes = [
        PipelineLabNode(
            node_id=_extract_node_id(topology_name, _read_text(row, "name")),
            container_name=_read_text(row, "name"),
            container_id=_read_text(row, "container_id"),
            image=_read_text(row, "image"),
            kind=_read_text(row, "kind"),
            state=_read_text(row, "state"),
            status=_read_text(row, "status"),
            ipv4_address=_read_text(row, "ipv4_address"),
            ipv6_address=_read_text(row, "ipv6_address"),
        )
        for row in lab_rows
        if _read_text(row, "name")
    ]
    if not nodes:
        raise PipelineLabNotFoundError(
            f"Pipeline lab is unavailable: {topology_name}"
        )

    first_row = lab_rows[0]
    return PipelineLabStatus(
        topology_name=topology_name,
        lab_path=_read_text(first_row, "labPath"),
        abs_lab_path=_read_text(first_row, "absLabPath"),
        nodes=nodes,
    )


def _read_text(row: Any, key: str) -> str:
    if not isinstance(row, dict):
        return ""
    value = row.get(key, "")
    return str(value) if value is not None else ""


def _extract_node_id(topology_name: str, container_name: str) -> str:
    prefix = f"clab-{topology_name}-"
    if container_name.startswith(prefix):
        return container_name[len(prefix) :]
    return container_name


def _parse_runtime_command(command_text: str) -> list[str]:
    try:
        tokens = shlex.split(command_text, posix=True)
    except ValueError as exc:
        raise PipelineRuntimeCommandError("Console command is not valid") from exc

    if not tokens:
        raise PipelineRuntimeCommandError("Console command is empty")

    if tokens == ["hostname"]:
        return tokens
    if tokens == ["cat", "/etc/hosts"]:
        return tokens
    if tokens == ["ip", "link", "show"]:
        return tokens
    if tokens == ["ip", "addr", "show"]:
        return tokens
    if tokens == ["ip", "route", "show"]:
        return tokens
    if tokens == ["ss", "-ltn"]:
        return tokens

    if (
        len(tokens) == 5
        and tokens[:3] == ["ip", "link", "show"]
        and tokens[3] == "dev"
    ):
        _validate_interface_name(tokens[4])
        return tokens

    if (
        len(tokens) == 6
        and tokens[:3] == ["ip", "link", "set"]
        and tokens[3] == "dev"
        and tokens[5] in {"up", "down"}
    ):
        _validate_interface_name(tokens[4])
        return tokens

    if (
        len(tokens) == 5
        and tokens[:3] == ["ip", "addr", "show"]
        and tokens[3] == "dev"
    ):
        _validate_interface_name(tokens[4])
        return tokens

    if (
        len(tokens) == 6
        and tokens[:3] == ["ip", "addr", "replace"]
        and tokens[4] == "dev"
    ):
        _validate_target(tokens[3])
        _validate_interface_name(tokens[5])
        return tokens

    if (
        len(tokens) == 4
        and tokens[:2] == ["ping", "-c"]
        and tokens[2].isdigit()
    ):
        count = int(tokens[2])
        if count < 1 or count > 5:
            raise PipelineRuntimeCommandError(
                "Ping count must be between 1 and 5"
            )
        _validate_target(tokens[3])
        return tokens

    raise PipelineRuntimeCommandError(
        "Console command is not allowlisted for the current runtime"
    )


def _validate_interface_name(value: str) -> None:
    if not INTERFACE_NAME_PATTERN.fullmatch(value):
        raise PipelineRuntimeCommandError("Interface name is not valid")


def _validate_target(value: str) -> None:
    if not TARGET_PATTERN.fullmatch(value):
        raise PipelineRuntimeCommandError("Command target is not valid")
