"""
Tests de seguridad transversal del API.
"""

from fastapi.testclient import TestClient

from app.config import settings
from app.dependencies import get_netbox_client
from app.main import create_app
from tests.test_schemas import _mvp_topology_payload


class ConnectedNetBoxClient:
    """Stub mínimo para tests de seguridad."""

    def health_check(self) -> bool:
        return True

    def bootstrap(self) -> dict:
        return {"netbox_version": "4.5.5"}

    def import_topology(self, topology) -> dict:
        return {"topology_name": topology.name}


def _build_client(monkeypatch) -> TestClient:
    application = create_app()
    application.dependency_overrides[get_netbox_client] = (
        lambda: ConnectedNetBoxClient()
    )
    return TestClient(application)


class TestAPIKeySecurity:
    """Tests de protección por API key."""

    def test_write_endpoint_requires_configured_api_key(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "")

        with _build_client(monkeypatch) as client:
            response = client.post("/api/v1/netbox/bootstrap")

        assert response.status_code == 503
        assert response.json()["status"] == "error"
        assert response.json()["message"] == "API key protection is not configured"

    def test_write_endpoint_rejects_invalid_api_key(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")

        with _build_client(monkeypatch) as client:
            response = client.post(
                "/api/v1/netbox/bootstrap",
                headers={"X-API-Key": "wrong-key"},
            )

        assert response.status_code == 401
        assert response.json()["status"] == "error"
        assert response.json()["message"] == "Invalid API key"

    def test_write_endpoint_accepts_valid_api_key(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")

        with _build_client(monkeypatch) as client:
            response = client.post(
                "/api/v1/netbox/bootstrap",
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 200
        assert response.json()["status"] == "success"


class TestRateLimitSecurity:
    """Tests del rate limiting transversal."""

    def test_rate_limit_blocks_repeated_mutating_requests(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")
        monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
        monkeypatch.setattr(settings, "RATE_LIMIT_MAX_REQUESTS", 1)
        monkeypatch.setattr(settings, "RATE_LIMIT_WINDOW_SECONDS", 60)

        with _build_client(monkeypatch) as client:
            first = client.post(
                "/api/v1/netbox/bootstrap",
                headers={"X-API-Key": "secret-key"},
            )
            second = client.post(
                "/api/v1/netbox/bootstrap",
                headers={"X-API-Key": "secret-key"},
            )

        assert first.status_code == 200
        assert second.status_code == 429
        assert second.json()["status"] == "error"
        assert second.json()["message"] == "Rate limit exceeded"
        assert second.headers["Retry-After"] == "60"
        assert second.headers["X-RateLimit-Remaining"] == "0"


class TestSecurityHeaders:
    """Tests de headers defensivos globales."""

    def test_security_headers_are_present_on_responses(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")

        with _build_client(monkeypatch) as client:
            response = client.get("/api/v1/health")

        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"
        assert response.headers["Pragma"] == "no-cache"
        assert response.headers["Referrer-Policy"] == "no-referrer"
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["X-Frame-Options"] == "DENY"

    def test_cors_preflight_allows_local_frontend_origin(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")

        with _build_client(monkeypatch) as client:
            response = client.options(
                "/api/v1/topology",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "POST",
                },
            )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == (
            "http://localhost:5173"
        )


class TestExceptionHandlers:
    """Tests de formato uniforme de errores."""

    def test_validation_errors_return_api_error_payload(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")

        with _build_client(monkeypatch) as client:
            response = client.post(
                "/api/v1/topology",
                json={},
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 422
        assert response.json()["status"] == "error"
        assert response.json()["message"] == "Validation failed"
        assert isinstance(response.json()["detail"], list)
        assert "input" not in response.json()["detail"][0]

    def test_valid_payload_reaches_topology_endpoint_with_api_key(self, monkeypatch):
        monkeypatch.setattr(settings, "API_KEY", "secret-key")

        with _build_client(monkeypatch) as client:
            response = client.post(
                "/api/v1/topology",
                json=_mvp_topology_payload(),
                headers={"X-API-Key": "secret-key"},
            )

        assert response.status_code == 201
        assert response.json()["status"] == "success"
