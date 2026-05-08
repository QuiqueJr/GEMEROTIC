"""
Tests del generador de artefactos del pipeline.
"""

import json

import yaml
from fastapi.testclient import TestClient

from app.config import settings
from app.dependencies import get_topology_store
from app.main import create_app
from app.schemas.pipeline import PipelineArtifact
from app.schemas.topology import TopologyCreate
from app.services.pipeline_artifacts import PipelineArtifactGenerator
from tests.conftest import AllowAllRateLimiter
from tests.test_schemas import _mvp_topology_payload


def _artifact_by_path(artifacts, path: str):
    """Buscar un artefacto por ruta dentro del bundle generado."""
    return next(artifact for artifact in artifacts if artifact.path == path)


class FakeTopologyStore:
    """Store falso para endpoints basados en topología guardada."""

    def load(self, topology_name: str) -> TopologyCreate:
        payload = _mvp_topology_payload()
        payload["name"] = topology_name
        return TopologyCreate(**payload)


class TestPipelineArtifactGenerator:
    """Tests unitarios del generador declarativo."""

    def test_generator_renders_containerlab_ansible_opa_and_metadata(self):
        topology = TopologyCreate(**_mvp_topology_payload())

        result = PipelineArtifactGenerator().generate(topology)

        assert result.topology_name == "mvp-lab-01"
        assert {artifact.stage for artifact in result.artifacts} == {
            "topology",
            "inventory",
            "runtime",
            "containerlab",
            "ansible",
            "ansible_vars",
            "batfish",
            "opa",
            "metadata",
        }

    def test_containerlab_yaml_uses_linux_nodes_and_lab_interfaces(self):
        topology = TopologyCreate(**_mvp_topology_payload())
        result = PipelineArtifactGenerator().generate(topology)

        content = _artifact_by_path(
            result.artifacts,
            "containerlab/topology.clab.yml",
        ).content
        document = yaml.safe_load(content)

        assert document["name"] == "mvp-lab-01"
        assert document["mgmt"]["ipv4-subnet"].startswith("10.254.")
        assert document["mgmt"]["ipv6-subnet"].startswith("3fff:10:254:")
        assert document["topology"]["nodes"]["router-01"]["kind"] == "linux"
        assert document["topology"]["nodes"]["router-01"]["cmd"] == "sleep infinity"
        endpoints = document["topology"]["links"][0]["endpoints"]
        assert all(":eth0" not in endpoint for endpoint in endpoints)

    def test_ansible_inventory_and_opa_input_are_valid_structured_files(self):
        topology = TopologyCreate(**_mvp_topology_payload())
        result = PipelineArtifactGenerator().generate(topology)

        inventory = yaml.safe_load(
            _artifact_by_path(result.artifacts, "ansible/inventory.yml").content
        )
        opa_input = json.loads(
            _artifact_by_path(result.artifacts, "opa/input.json").content
        )
        netbox_inventory = json.loads(
            _artifact_by_path(
                result.artifacts,
                "inventory/netbox_inventory.json",
            ).content
        )
        ansible_vars = json.loads(
            _artifact_by_path(result.artifacts, "ansible/vars.json").content
        )
        router_config = json.loads(
            _artifact_by_path(result.artifacts, "configs/assets/router-01.json").content
        )

        assert inventory["all"]["hosts"]["localhost"]["ansible_connection"] == "local"
        assert len(inventory["all"]["vars"]["gemerotic_nodes"]) == 4
        assert opa_input["topology_name"] == "mvp-lab-01"
        assert len(opa_input["zones"]) == 2
        assert len(netbox_inventory["devices"]) == 4
        assert len(ansible_vars["gemerotic_nodes"]) == 4
        assert router_config["id"] == "router-01"
        router_inventory = next(
            device
            for device in netbox_inventory["devices"]
            if device["id"] == "router-01"
        )
        router_runtime = next(
            node
            for node in ansible_vars["gemerotic_nodes"]
            if node["id"] == "router-01"
        )
        router_interfaces = [
            interface["lab_interface"] for interface in router_runtime["interfaces"]
        ]
        assert len(router_inventory["ports"]) == 2
        assert router_interfaces == ["eth1"]

    def test_artifact_schema_rejects_unsafe_paths(self):
        try:
            PipelineArtifact(
                path="../secret.env",
                stage="metadata",
                content_type="text/plain",
                content="unsafe",
            )
        except ValueError as exc:
            assert "unsafe" in str(exc)
        else:
            raise AssertionError("unsafe path was accepted")


class TestPipelineArtifactsEndpoint:
    """Tests HTTP del endpoint de artefactos."""

    def test_generate_pipeline_artifacts_allows_mvp_mode_without_api_key(
        self,
        monkeypatch,
    ):
        monkeypatch.setattr(settings, "API_KEY_REQUIRED", False)
        monkeypatch.setattr(settings, "API_KEY", "")
        application = create_app(rate_limiter=AllowAllRateLimiter())

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/pipeline/artifacts",
                json=_mvp_topology_payload(),
            )

        assert response.status_code == 200
        assert response.json()["data"]["topology_name"] == "mvp-lab-01"

    def test_generate_pipeline_artifacts_returns_bundle(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/pipeline/artifacts",
                json=_mvp_topology_payload(),
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["topology_name"] == "mvp-lab-01"
        assert any(
            artifact["path"] == "containerlab/topology.clab.yml"
            for artifact in data["artifacts"]
        )

    def test_generate_saved_pipeline_artifacts_returns_bundle(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())
        application.dependency_overrides[get_topology_store] = (
            lambda: FakeTopologyStore()
        )

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/pipeline/artifacts/mvp-lab-01",
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["topology_name"] == "mvp-lab-01"
        assert any(
            artifact["path"] == "containerlab/topology.clab.yml"
            for artifact in data["artifacts"]
        )
