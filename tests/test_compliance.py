"""
Tests del motor y endpoints de cumplimiento OT.
"""

import json

from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.schemas.compliance import ComplianceChatMessage
from app.schemas.topology import TopologyCreate
from app.services.compliance_assistant import ComplianceAssistant
from app.services.compliance_engine import ComplianceEngine
from app.services.ollama_client import (
    OLLAMA_COMPLIANCE_FORMAT_SCHEMA,
    OllamaComplianceClient,
)
from tests.conftest import AllowAllRateLimiter
from tests.test_schemas import _mvp_topology_payload


class TestComplianceEngine:
    """Tests unitarios del informe determinista."""

    def test_engine_returns_partial_posture_for_mvp_payload(self):
        topology = TopologyCreate(**_mvp_topology_payload())

        report = ComplianceEngine().evaluate(topology)

        assert report.topology_name == "mvp-lab-01"
        assert report.summary.overall_posture == "attention_required"
        assert any(
            finding.control_id == "IEC62443-ZONE-001" and finding.status == "pass"
            for finding in report.findings
        )
        assert any(
            finding.status == "not_assessed" for finding in report.findings
        )

    def test_engine_fails_when_cross_zone_cable_has_no_conduit(self):
        payload = _mvp_topology_payload()
        payload["conduits"] = []
        topology = TopologyCreate(**payload)

        report = ComplianceEngine().evaluate(topology)
        finding = next(
            finding
            for finding in report.findings
            if finding.control_id == "IEC62443-CONDUIT-001"
        )

        assert finding.status == "fail"
        assert finding.evidence["unmanaged_links"][0]["cable_id"] == "cable-002"


class TestComplianceAssistant:
    """Tests del asistente local basado en findings."""

    def test_assistant_returns_contextual_response(self):
        topology = TopologyCreate(**_mvp_topology_payload())
        assistant = ComplianceAssistant()

        response = assistant.answer(
            topology,
            [ComplianceChatMessage(role="user", content="Cumple esta topologia?")],
        )

        assert response.mode == "local_advisor"
        assert "Postura actual" in response.answer
        assert response.cited_controls

    def test_assistant_rejects_questions_outside_scope(self):
        topology = TopologyCreate(**_mvp_topology_payload())
        assistant = ComplianceAssistant()

        response = assistant.answer(
            topology,
            [
                ComplianceChatMessage(
                    role="user",
                    content="Cual es la capital de Francia?",
                )
            ],
        )

        assert response.mode == "scope_guard"
        assert response.scope_allowed is False
        assert "Solo puedo responder" in response.answer

    def test_assistant_can_use_ollama_as_explainer(self, monkeypatch):
        topology = TopologyCreate(**_mvp_topology_payload())
        monkeypatch.setattr(settings, "COMPLIANCE_ASSISTANT_PROVIDER", "ollama")

        def fake_post(*args, **kwargs):
            assert kwargs["json"]["format"] == OLLAMA_COMPLIANCE_FORMAT_SCHEMA
            assert "maxLength" not in json.dumps(kwargs["json"]["format"])

            class FakeResponse:
                def raise_for_status(self):
                    return None

                def json(self):
                    return {
                        "message": {
                            "content": json.dumps(
                                {
                                    "in_scope": True,
                                    "answer": "Revisa el conduit OT-IT.",
                                    "cited_controls": [
                                        "IEC62443-CONDUIT-001"
                                    ],
                                    "suggested_actions": [
                                        "Declarar un conduit explicito."
                                    ],
                                }
                            )
                        }
                    }

            return FakeResponse()

        assistant = ComplianceAssistant(
            ollama_client=OllamaComplianceClient(
                base_url="http://localhost:11434",
                model="gpt-oss",
                request_func=fake_post,
            )
        )

        response = assistant.answer(
            topology,
            [
                ComplianceChatMessage(
                    role="user",
                    content="Como reviso los conduits?",
                )
            ],
        )

        assert response.mode == "ollama_advisor"
        assert response.scope_allowed is True
        assert response.cited_controls == ["IEC62443-CONDUIT-001"]
        assert "conduit" in response.answer.lower()


class TestComplianceEndpoints:
    """Tests HTTP de informe y chat."""

    def test_report_allows_mvp_mode_without_api_key(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY_REQUIRED", False)
        monkeypatch.setattr(settings, "API_KEY", "")
        application = create_app(rate_limiter=AllowAllRateLimiter())

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/compliance/report",
                json=_mvp_topology_payload(),
            )

        assert response.status_code == 200
        assert response.json()["data"]["topology_name"] == "mvp-lab-01"

    def test_report_returns_findings(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/compliance/report",
                json=_mvp_topology_payload(),
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["topology_name"] == "mvp-lab-01"
        assert data["summary"]["overall_posture"] == "attention_required"
        assert len(data["findings"]) >= 6

    def test_chat_returns_answer_and_report(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        application = create_app(rate_limiter=AllowAllRateLimiter())

        with TestClient(application) as client:
            response = client.post(
                "/api/v1/compliance/chat",
                json={
                    "topology": _mvp_topology_payload(),
                    "messages": [
                        {"role": "user", "content": "Como debo revisar los conduits?"}
                    ],
                },
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["mode"] == "local_advisor"
        assert "conduit" in data["answer"].lower()
        assert data["report"]["topology_name"] == "mvp-lab-01"
