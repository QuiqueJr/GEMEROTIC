"""
Tests del runner controlado del pipeline.
"""

import subprocess

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.endpoints.pipeline import (
    _update_runtime_running_config,
    get_pipeline_runner,
)
from app.config import settings
from app.dependencies import get_topology_store
from app.main import create_app
from app.persistence.database import Base, get_engine, reset_engine_for_tests
from app.persistence.models import ProjectEntityRecord, ProjectRecord
from app.schemas.pipeline import (
    PipelineArtifact,
    PipelineConsoleResult,
    PipelineLabNode,
    PipelineLabStatus,
    PipelineRunningConfigSyncResult,
    PipelineRunResult,
    PipelineTerminalTarget,
    PipelineToolReport,
    PipelineToolStatus,
)
from app.schemas.topology import TopologyCreate
from app.services.pipeline_runner import (
    PipelineLabNotFoundError,
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

    def sync_node_running_config(
        self,
        topology_name: str,
        node_id: str,
    ) -> PipelineRunningConfigSyncResult:
        return PipelineRunningConfigSyncResult(
            topology_name=topology_name,
            node_id=node_id,
            container_name=f"clab-{topology_name}-{node_id}",
            command=["docker", "exec", f"clab-{topology_name}-{node_id}", "vtysh"],
            running_config="hostname router-01\n",
            stdout_tail="hostname router-01\n",
            stderr_tail="",
        )

    def resolve_terminal_target(
        self,
        topology_name: str,
        node_id: str,
    ) -> PipelineTerminalTarget:
        return PipelineTerminalTarget(
            topology_name=topology_name,
            node_id=node_id,
            container_name=f"clab-{topology_name}-{node_id}",
            image="quay.io/frrouting/frr:10.5.4",
            kind="linux",
            profile="nos",
            is_frr=True,
            command=[
                "docker",
                "exec",
                "-i",
                f"clab-{topology_name}-{node_id}",
                "vtysh",
            ],
        )


class MissingLabPipelineRunner(FakePipelineRunner):
    """Runner falso para labs todavía no desplegados."""

    def inspect_lab(self, topology_name: str) -> PipelineLabStatus:
        raise PipelineLabNotFoundError(
            f"Pipeline lab is unavailable: {topology_name}"
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

    def test_terminal_target_requires_exact_container_name(self, tmp_path):
        def command_runner(command, **kwargs):
            if command[:2] == ["containerlab", "inspect"]:
                return subprocess.CompletedProcess(
                    args=command,
                    returncode=0,
                    stdout=(
                        '{"mvp-lab-01":[{"name":"clab-other-lab-router-01",'
                        '"image":"frrouting/frr:latest","kind":"linux",'
                        '"state":"running","status":"Up 5 seconds"}]}'
                    ),
                    stderr="",
                )
            return subprocess.CompletedProcess(
                args=command,
                returncode=0,
                stdout="tool ok",
                stderr="",
            )

        runner = PipelineRunner(
            output_root=tmp_path,
            tool_resolver=_tool_resolver,
            command_runner=command_runner,
        )

        try:
            runner.resolve_terminal_target("mvp-lab-01", "router-01")
        except PipelineRuntimeCommandError as exc:
            assert "container target" in str(exc)
        else:
            raise AssertionError("unexpected terminal target was accepted")

    def test_frr_running_config_uses_vtysh_command(self, tmp_path):
        calls: list[list[str]] = []

        def command_runner(command, **kwargs):
            calls.append(command)
            if command[:2] == ["containerlab", "inspect"]:
                return subprocess.CompletedProcess(
                    args=command,
                    returncode=0,
                    stdout=(
                        '{"mvp-lab-01":[{"name":"clab-mvp-lab-01-router-01",'
                        '"image":"frrouting/frr:latest","kind":"linux",'
                        '"state":"running","status":"Up 5 seconds"}]}'
                    ),
                    stderr="",
                )
            return subprocess.CompletedProcess(
                args=command,
                returncode=0,
                stdout="hostname router-01\n",
                stderr="",
            )

        runner = PipelineRunner(
            output_root=tmp_path,
            tool_resolver=_tool_resolver,
            command_runner=command_runner,
        )

        result = runner.sync_node_running_config("mvp-lab-01", "router-01")

        assert result.running_config == "hostname router-01\n"
        assert [
            "docker",
            "exec",
            "clab-mvp-lab-01-router-01",
            "vtysh",
            "-c",
            "show running-config",
        ] in calls

    def test_running_config_sync_rejects_non_frr_node(self, tmp_path):
        def command_runner(command, **kwargs):
            if command[:2] == ["containerlab", "inspect"]:
                return subprocess.CompletedProcess(
                    args=command,
                    returncode=0,
                    stdout=(
                        '{"mvp-lab-01":[{"name":"clab-mvp-lab-01-host-01",'
                        '"image":"ghcr.io/srl-labs/network-multitool",'
                        '"kind":"linux","state":"running","status":"Up 5 seconds"}]}'
                    ),
                    stderr="",
                )
            return subprocess.CompletedProcess(
                args=command,
                returncode=0,
                stdout="tool ok",
                stderr="",
            )

        runner = PipelineRunner(
            output_root=tmp_path,
            tool_resolver=_tool_resolver,
            command_runner=command_runner,
        )

        try:
            runner.sync_node_running_config("mvp-lab-01", "host-01")
        except PipelineRuntimeCommandError as exc:
            assert "FRR" in str(exc)
        else:
            raise AssertionError("non-FRR node accepted running-config sync")

    def test_terminal_target_rejects_non_frr_node(self, tmp_path):
        def command_runner(command, **kwargs):
            if command[:2] == ["containerlab", "inspect"]:
                return subprocess.CompletedProcess(
                    args=command,
                    returncode=0,
                    stdout=(
                        '{"mvp-lab-01":[{"name":"clab-mvp-lab-01-host-01",'
                        '"image":"ghcr.io/srl-labs/network-multitool",'
                        '"kind":"linux","state":"running","status":"Up 5 seconds"}]}'
                    ),
                    stderr="",
                )
            return subprocess.CompletedProcess(
                args=command,
                returncode=0,
                stdout="tool ok",
                stderr="",
            )

        runner = PipelineRunner(
            output_root=tmp_path,
            tool_resolver=_tool_resolver,
            command_runner=command_runner,
        )

        try:
            runner.resolve_terminal_target("mvp-lab-01", "host-01")
        except PipelineRuntimeCommandError as exc:
            assert "FRR" in str(exc)
        else:
            raise AssertionError("non-FRR node accepted interactive terminal")

    def test_running_config_sync_updates_granular_asset_config(
        self,
        monkeypatch,
        tmp_path,
    ):
        monkeypatch.setattr(
            settings,
            "DATABASE_URL",
            f"sqlite:///{tmp_path / 'db.sqlite'}",
        )
        reset_engine_for_tests()
        Base.metadata.create_all(bind=get_engine())

        with Session(get_engine()) as session:
            session.add(
                ProjectRecord(
                    name="mvp-lab-01",
                    display_name="MVP Lab 01",
                    state_snapshot={
                        "nodes": [{"id": "router-01", "data": {"label": "Router"}}]
                    },
                    topology_payload={
                        "devices": [{"id": "router-01", "config": {}}]
                    },
                )
            )
            session.commit()

            updated = _update_runtime_running_config(
                session,
                "mvp-lab-01",
                "router-01",
                "clab-mvp-lab-01-router-01",
                "hostname runtime-router\n!",
            )
            config_row = session.scalar(
                select(ProjectEntityRecord).where(
                    ProjectEntityRecord.project_name == "mvp-lab-01",
                    ProjectEntityRecord.entity_type == "asset.config",
                    ProjectEntityRecord.entity_id == "router-01",
                )
            )
            project = session.get(ProjectRecord, "mvp-lab-01")

        assert updated is True
        assert config_row is not None
        assert config_row.payload["runningConfig"] == "hostname runtime-router\n!"
        assert project is not None
        assert project.state_snapshot["nodes"][0]["data"]["runningConfig"].startswith(
            "hostname runtime-router"
        )
        topology_config = project.topology_payload["devices"][0]["config"]
        assert topology_config["runningConfig"].startswith("hostname runtime-router")


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

    def test_inspect_lab_endpoint_returns_not_deployed_state(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())
        application.dependency_overrides[get_pipeline_runner] = (
            lambda: MissingLabPipelineRunner()
        )

        with TestClient(application) as client:
            response = client.get(
                "/api/v1/pipeline/labs/mvp-lab-01",
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        assert response.json()["message"] == "Pipeline lab is not deployed"
        assert response.json()["data"]["deployed"] is False
        assert response.json()["data"]["nodes"] == []

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

    def test_terminal_websocket_route_is_registered(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())

        route_paths = {getattr(route, "path", "") for route in application.routes}

        assert (
            "/api/v1/pipeline/labs/{topology_name}/nodes/{node_id}/terminal"
            in route_paths
        )
        assert (
            "/api/v1/pipeline/labs/{topology_name}/nodes/{node_id}/terminal/session"
            in route_paths
        )

    def test_terminal_session_endpoint_returns_short_lived_token(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        monkeypatch.setattr(settings, "RUNTIME_TERMINAL_TOKEN_TTL_SECONDS", 60)
        application = create_app(rate_limiter=AllowAllRateLimiter())
        application.dependency_overrides[get_pipeline_runner] = (
            lambda: FakePipelineRunner()
        )

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/pipeline/labs/mvp-lab-01/nodes/router-01/terminal/session",
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        assert response.json()["message"] == "Pipeline terminal session created"
        assert response.json()["data"]["node_id"] == "router-01"
        assert response.json()["data"]["ttl_seconds"] == 60
        assert response.json()["data"]["token"]

    def test_running_config_sync_endpoint_uses_runner(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        monkeypatch.setattr(settings, "GRANULAR_STORE_ENABLED", False)
        application = create_app(rate_limiter=AllowAllRateLimiter())
        application.dependency_overrides[get_pipeline_runner] = (
            lambda: FakePipelineRunner()
        )

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/pipeline/labs/mvp-lab-01/nodes/router-01/"
                "running-config/sync",
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        assert response.json()["message"] == "Pipeline running config synchronized"
        assert response.json()["data"]["node_id"] == "router-01"
        assert response.json()["data"]["database_updated"] is False
