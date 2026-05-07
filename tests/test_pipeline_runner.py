"""
Tests del runner controlado del pipeline.
"""

import subprocess

from fastapi.testclient import TestClient

from app.api.v1.endpoints.pipeline import get_pipeline_runner
from app.config import settings
from app.dependencies import get_topology_store
from app.main import create_app
from app.schemas.pipeline import (
    PipelineArtifact,
    PipelineConsoleResult,
    PipelineLabNode,
    PipelineLabStatus,
    PipelineRunResult,
    PipelineToolReport,
    PipelineToolStatus,
)
from app.schemas.topology import TopologyCreate
from app.services.pipeline_runner import (
    PipelineRunner,
    PipelineRuntimeCommandError,
    PipelineToolError,
)
from tests.conftest import AllowAllRateLimiter
from tests.test_schemas import _mvp_topology_payload


class RecordingCommandRunner:
    """Stub de subprocess.run que registra comandos sin ejecutarlos."""

    def __init__(self, return_code: int = 0):
        self.calls: list[dict] = []
        self.return_code = return_code

    def __call__(self, command, **kwargs):
        self.calls.append({"command": command, "kwargs": kwargs})
        return subprocess.CompletedProcess(
            args=command,
            returncode=self.return_code,
            stdout="tool ok",
            stderr="",
        )


class FakePipelineRunner:
    """Runner falso para tests HTTP sin herramientas externas."""

    def check_tools(self) -> PipelineToolReport:
        return PipelineToolReport(
            tools=[
                PipelineToolStatus(
                    name="docker",
                    installed=True,
                    path="C:/tools/docker.exe",
                    version="Docker version test",
                )
            ]
        )

    def deploy(self, topology: TopologyCreate) -> PipelineRunResult:
        return PipelineRunResult(
            topology_name=topology.name,
            bundle_dir="C:/tmp/gemerotic/mvp-lab-01",
            artifacts=[
                PipelineArtifact(
                    path="manifest.json",
                    stage="metadata",
                    content_type="application/json",
                    content="{}",
                )
            ],
            commands=[],
        )

    def inspect_lab(self, topology_name: str) -> PipelineLabStatus:
        return PipelineLabStatus(
            topology_name=topology_name,
            lab_path="/tmp/demo.clab.yml",
            abs_lab_path="/tmp/demo.clab.yml",
            nodes=[
                PipelineLabNode(
                    node_id="router-01",
                    container_name=f"clab-{topology_name}-router-01",
                    container_id="abc123",
                    image="ghcr.io/srl-labs/network-multitool",
                    kind="linux",
                    state="running",
                    status="Up 5 seconds",
                    ipv4_address="172.20.20.2/24",
                    ipv6_address="",
                )
            ],
        )

    def run_node_command(
        self,
        topology_name: str,
        node_id: str,
        command_text: str,
    ) -> PipelineConsoleResult:
        return PipelineConsoleResult(
            topology_name=topology_name,
            node_id=node_id,
            container_name=f"clab-{topology_name}-{node_id}",
            command=["ip", "link", "show"],
            exit_code=0,
            stdout_tail=f"executed {command_text}",
            stderr_tail="",
        )


class FakeTopologyStore:
    """Store falso para cargar la última topología guardada."""

    def load(self, topology_name: str) -> TopologyCreate:
        payload = _mvp_topology_payload()
        payload["name"] = topology_name
        return TopologyCreate(**payload)


def _tool_resolver(tool_name: str) -> str:
    """Resolver herramientas como instaladas para tests unitarios."""
    return f"C:/tools/{tool_name}.exe"


class TestPipelineRunner:
    """Tests unitarios del runner local."""

    def test_check_tools_reports_missing_tools(self, tmp_path):
        runner = PipelineRunner(
            output_root=tmp_path,
            tool_resolver=lambda _: None,
            command_runner=RecordingCommandRunner(),
        )

        report = runner.check_tools()

        assert all(not tool.installed for tool in report.tools)

    def test_deploy_writes_bundle_and_runs_allowlisted_commands(self, tmp_path):
        command_runner = RecordingCommandRunner()
        runner = PipelineRunner(
            output_root=tmp_path,
            tool_resolver=_tool_resolver,
            command_runner=command_runner,
        )
        topology = TopologyCreate(**_mvp_topology_payload())

        result = runner.deploy(topology)

        assert result.bundle_dir == str(tmp_path / "mvp-lab-01")
        assert (tmp_path / "mvp-lab-01" / "containerlab/topology.clab.yml").exists()
        deploy_commands = [call["command"] for call in command_runner.calls]
        assert [
            "containerlab",
            "deploy",
            "--reconfigure",
            "--topo",
            "containerlab/topology.clab.yml",
        ] in deploy_commands
        assert [
            "ansible-playbook",
            "-i",
            "ansible/inventory.yml",
            "ansible/site.yml",
        ] in deploy_commands
        assert all(call["kwargs"]["shell"] is False for call in command_runner.calls)

    def test_deploy_fails_before_writing_when_required_tool_is_missing(self, tmp_path):
        runner = PipelineRunner(
            output_root=tmp_path,
            tool_resolver=lambda tool_name: None if tool_name == "docker" else "ok",
            command_runner=RecordingCommandRunner(),
        )
        topology = TopologyCreate(**_mvp_topology_payload())

        try:
            runner.deploy(topology)
        except PipelineToolError as exc:
            assert "docker" in str(exc)
        else:
            raise AssertionError("missing docker did not block deploy")

        assert not (tmp_path / "mvp-lab-01").exists()

    def test_inspect_lab_parses_containerlab_json(self, tmp_path):
        runner = PipelineRunner(
            output_root=tmp_path,
            tool_resolver=_tool_resolver,
            command_runner=lambda command, **kwargs: subprocess.CompletedProcess(
                args=command,
                returncode=0,
                stdout=(
                    '{"mvp-lab-01":[{"lab_name":"mvp-lab-01","labPath":"demo.clab.yml",'
                    '"absLabPath":"/labs/demo.clab.yml","name":"clab-mvp-lab-01-router-01",'
                    '"container_id":"abc123","image":"ghcr.io/srl-labs/network-multitool",'
                    '"kind":"linux","state":"running","status":"Up 5 seconds",'
                    '"ipv4_address":"172.20.20.2/24","ipv6_address":""}]}'
                ),
                stderr="",
            ),
        )

        result = runner.inspect_lab("mvp-lab-01")

        assert result.topology_name == "mvp-lab-01"
        assert result.nodes[0].node_id == "router-01"
        assert result.nodes[0].container_name == "clab-mvp-lab-01-router-01"

    def test_run_node_command_executes_allowlisted_console_command(self, tmp_path):
        calls: list[dict] = []

        def command_runner(command, **kwargs):
            calls.append({"command": command, "kwargs": kwargs})
            if command[:2] == ["containerlab", "inspect"]:
                return subprocess.CompletedProcess(
                    args=command,
                    returncode=0,
                    stdout=(
                        '{"mvp-lab-01":[{"lab_name":"mvp-lab-01","labPath":"demo.clab.yml",'
                        '"absLabPath":"/labs/demo.clab.yml","name":"clab-mvp-lab-01-router-01",'
                        '"container_id":"abc123","image":"ghcr.io/srl-labs/network-multitool",'
                        '"kind":"linux","state":"running","status":"Up 5 seconds",'
                        '"ipv4_address":"172.20.20.2/24","ipv6_address":""}]}'
                    ),
                    stderr="",
                )
            return subprocess.CompletedProcess(
                args=command,
                returncode=0,
                stdout="2: eth1: <BROADCAST,UP>",
                stderr="",
            )

        runner = PipelineRunner(
            output_root=tmp_path,
            tool_resolver=_tool_resolver,
            command_runner=command_runner,
        )

        result = runner.run_node_command(
            topology_name="mvp-lab-01",
            node_id="router-01",
            command_text="ip link show dev eth1",
        )

        assert result.exit_code == 0
        assert result.command == ["ip", "link", "show", "dev", "eth1"]
        assert [
            "docker",
            "exec",
            "clab-mvp-lab-01-router-01",
            "ip",
            "link",
            "show",
            "dev",
            "eth1",
        ] in [call["command"] for call in calls]

    def test_run_node_command_rejects_non_allowlisted_console_command(self, tmp_path):
        runner = PipelineRunner(
            output_root=tmp_path,
            tool_resolver=_tool_resolver,
            command_runner=RecordingCommandRunner(),
        )

        try:
            runner.run_node_command(
                topology_name="mvp-lab-01",
                node_id="router-01",
                command_text="rm -rf /",
            )
        except PipelineRuntimeCommandError as exc:
            assert "allowlisted" in str(exc)
        else:
            raise AssertionError("unexpected console command was accepted")


class TestPipelineRunnerEndpoint:
    """Tests HTTP de endpoints del runner."""

    def test_tools_endpoint_returns_status(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())
        application.dependency_overrides[get_pipeline_runner] = (
            lambda: FakePipelineRunner()
        )

        with TestClient(application) as client:
            response = client.get(
                "/api/v1/pipeline/tools",
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        assert response.json()["data"]["tools"][0]["name"] == "docker"

    def test_deploy_endpoint_uses_runner(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())
        application.dependency_overrides[get_pipeline_runner] = (
            lambda: FakePipelineRunner()
        )

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/pipeline/deploy",
                json=_mvp_topology_payload(),
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        assert response.json()["message"] == "Pipeline deployed successfully"

    def test_deploy_saved_endpoint_uses_last_saved_topology(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())
        application.dependency_overrides[get_pipeline_runner] = (
            lambda: FakePipelineRunner()
        )
        application.dependency_overrides[get_topology_store] = (
            lambda: FakeTopologyStore()
        )

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/pipeline/deploy/mvp-lab-01",
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        assert response.json()["message"] == "Pipeline deployed from saved topology"
        assert response.json()["data"]["topology_name"] == "mvp-lab-01"

    def test_inspect_lab_endpoint_returns_runtime_nodes(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())
        application.dependency_overrides[get_pipeline_runner] = (
            lambda: FakePipelineRunner()
        )

        with TestClient(application) as client:
            response = client.get(
                "/api/v1/pipeline/labs/mvp-lab-01",
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        assert response.json()["data"]["nodes"][0]["node_id"] == "router-01"

    def test_console_endpoint_executes_runtime_command(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())
        application.dependency_overrides[get_pipeline_runner] = (
            lambda: FakePipelineRunner()
        )

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/pipeline/labs/mvp-lab-01/nodes/router-01/console",
                json={"command": "ip link show"},
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        assert response.json()["data"]["node_id"] == "router-01"
