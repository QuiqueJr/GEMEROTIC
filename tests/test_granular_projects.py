"""
Tests de la fuente granular de proyectos.
"""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.rate_limit import RateLimitDecision
from app.main import create_app
from app.persistence.database import Base, get_engine, reset_engine_for_tests
from app.persistence.models import ProjectEntityRecord
from app.services.granular_project_store import GranularProjectStore
from tests.test_schemas import _mvp_topology_payload


class AllowAllRateLimiter:
    """Rate limiter permisivo para endpoints granulares."""

    async def consume(
        self,
        bucket_key: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        return RateLimitDecision(
            allowed=True,
            remaining=max(limit - 1, 0),
            retry_after_seconds=0,
        )

    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        return None


def _client(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setattr(settings, "GRANULAR_STORE_ENABLED", True)
    monkeypatch.setattr(settings, "API_KEY", "test-api-key")
    reset_engine_for_tests()
    Base.metadata.create_all(bind=get_engine())
    app = create_app(rate_limiter=AllowAllRateLimiter())
    return TestClient(app)


def test_project_command_persists_entity_and_queues_jobs(monkeypatch, tmp_path):
    with _client(monkeypatch, tmp_path) as client:
        response = client.post(
            "/api/v1/projects/mvp-lab-01/commands",
            headers={"X-API-Key": "test-api-key"},
            json={
                "command_type": "create_asset",
                "entity_id": "router-01",
                "payload": {"label": "Router 01", "assetType": "router"},
            },
        )
        jobs = client.get(
            "/api/v1/projects/mvp-lab-01/jobs",
            headers={"X-API-Key": "test-api-key"},
        )

    assert response.status_code == 202
    assert response.json()["data"]["revision"] == 1
    assert response.json()["data"]["entity_type"] == "ui.asset"
    assert jobs.status_code == 200
    assert {job["event_type"] for job in jobs.json()["data"]["jobs"]} >= {
        "artifacts.generate",
        "netbox.sync",
        "deploy.reconcile",
    }


def test_project_command_rejects_stale_revision(monkeypatch, tmp_path):
    with _client(monkeypatch, tmp_path) as client:
        first = client.post(
            "/api/v1/projects/mvp-lab-01/commands",
            headers={"X-API-Key": "test-api-key"},
            json={"command_type": "save_project", "expected_revision": 0},
        )
        stale = client.post(
            "/api/v1/projects/mvp-lab-01/commands",
            headers={"X-API-Key": "test-api-key"},
            json={"command_type": "save_project", "expected_revision": 0},
        )

    assert first.status_code == 202
    assert stale.status_code == 409


def test_project_state_import_uses_port_id_for_logical_interfaces(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    reset_engine_for_tests()
    Base.metadata.create_all(bind=get_engine())
    payload = _mvp_topology_payload()
    payload["name"] = "mvp-lab-01"
    state = {
        "project_name": "mvp-lab-01",
        "settings": {"name": "mvp-lab-01"},
        "nodes": [{"id": device["id"]} for device in payload["devices"]],
        "edges": [{"id": cable["id"]} for cable in payload["cables"]],
        "topology": payload,
    }

    engine = get_engine()
    with Session(engine) as session:
        result = GranularProjectStore(session).save_project_state("mvp-lab-01", state)
        interface_ids = session.scalars(
            select(ProjectEntityRecord.entity_id)
            .where(ProjectEntityRecord.project_name == "mvp-lab-01")
            .where(ProjectEntityRecord.entity_type == "logical.interface")
            .order_by(ProjectEntityRecord.entity_id)
        ).all()

    assert result["revision"] == 1
    assert interface_ids == ["router-01:eth0", "switch-01:eth0"]
