"""
Tests del runner controlado del pipeline.
"""

import subprocess

from fastapi.testclient import TestClient

from app.api.v1.endpoints.pipeline import get_pipeline_runner
from app.config import settings
from app.main import create_app
from app.schemas.pipeline import (
    PipelineArtifact,
    PipelineRunResult,
    PipelineToolReport,
    PipelineToolStatus,
)
from app.schemas.topology import TopologyCreate
from app.services.pipeline_runner import PipelineRunner, PipelineToolError
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
