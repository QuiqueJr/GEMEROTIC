"""
Tests del cliente y endpoint de bootstrap de NetBox.
"""

from fastapi.testclient import TestClient

from app.config import settings
from app.dependencies import get_netbox_client
from app.main import create_app
from app.services.netbox_client import NetBoxClient, NetBoxClientError
from tests.conftest import AllowAllRateLimiter


class FakeNamedEndpoint:
    """Endpoint simulado con búsqueda por `slug` o `name`."""

    def __init__(self, existing_values: list[str] | None = None, key: str = "slug"):
        self._key = key
        self._records = {
            value: {self._key: value} for value in (existing_values or [])
        }
        self.created_payloads: list[dict] = []

    def get(self, **filters):
        return self._records.get(filters[self._key])

    def create(self, payload: dict) -> dict:
        self._records[payload[self._key]] = payload
        self.created_payloads.append(payload)
        return payload


class FakeAPI:
    """Cliente pynetbox simulado para tests unitarios."""

    def __init__(
        self,
        status_payload: dict,
        device_role_endpoint: FakeNamedEndpoint,
        rack_role_endpoint: FakeNamedEndpoint,
        custom_field_endpoint: FakeNamedEndpoint,
    ):
        self._status_payload = status_payload
        self.dcim = type(
            "FakeDCIM",
            (),
            {
                "device_roles": device_role_endpoint,
                "rack_roles": rack_role_endpoint,
            },
        )()
        self.extras = type(
            "FakeExtras",
            (),
            {"custom_fields": custom_field_endpoint},
        )()

    def status(self) -> dict:
        return self._status_payload


class FailingAPI:
    """Cliente pynetbox simulado que falla al consultar estado."""

    def status(self) -> dict:
        raise ValueError("boom")


class ConnectedNetBoxClient:
    """Stub de NetBox conectado para tests de endpoints."""

    def health_check(self) -> bool:
        return True

    def bootstrap(self) -> dict:
        return {
            "netbox_version": "4.5.5",
            "device_roles": {
                "created": ["router"],
                "existing": ["switch"],
                "total_supported": 11,
            },
        }


class FailingNetBoxClient:
    """Stub de NetBox que falla al bootstrapear."""

    def health_check(self) -> bool:
        return False

    def bootstrap(self) -> dict:
        raise NetBoxClientError("NetBox token is not configured")


def _build_client_with_override(
    fake_client,
    monkeypatch,
    api_key: str = "test-api-key",
) -> TestClient:
    monkeypatch.setattr(settings, "API_KEY", api_key)
    application = create_app(rate_limiter=AllowAllRateLimiter())
    application.dependency_overrides[get_netbox_client] = lambda: fake_client
    return TestClient(application)


class TestNetBoxClient:
    """Tests unitarios del servicio de NetBox."""

    def test_health_check_returns_true_when_status_is_available(self):
        role_endpoint = FakeNamedEndpoint(existing_values=["router"])
        rack_role_endpoint = FakeNamedEndpoint(existing_values=["network"])
        custom_field_endpoint = FakeNamedEndpoint(
            existing_values=["gemerotic_firmware_version"],
            key="name",
        )
        client = NetBoxClient(
            base_url="http://localhost:8080",
            token="nbt_fakekey.faketoken",
        )
        client._api = FakeAPI(
            status_payload={"netbox-version": "4.5.5"},
            device_role_endpoint=role_endpoint,
            rack_role_endpoint=rack_role_endpoint,
            custom_field_endpoint=custom_field_endpoint,
        )

        assert client.health_check() is True

    def test_health_check_returns_false_when_status_fails(self):
        client = NetBoxClient(
            base_url="http://localhost:8080",
            token="nbt_fakekey.faketoken",
        )
        client._api = FailingAPI()

        assert client.health_check() is False

    def test_bootstrap_creates_missing_device_roles(self):
        role_endpoint = FakeNamedEndpoint(existing_values=["router", "switch"])
        rack_role_endpoint = FakeNamedEndpoint(existing_values=["network", "server"])
        custom_field_endpoint = FakeNamedEndpoint(
            existing_values=["gemerotic_firmware_version"],
            key="name",
        )
        client = NetBoxClient(
            base_url="http://localhost:8080",
            token="nbt_fakekey.faketoken",
        )
        client._api = FakeAPI(
            status_payload={"netbox-version": "4.5.5"},
            device_role_endpoint=role_endpoint,
            rack_role_endpoint=rack_role_endpoint,
            custom_field_endpoint=custom_field_endpoint,
        )

        result = client.bootstrap()

        assert result["netbox_version"] == "4.5.5"
        assert result["device_roles"]["existing"] == ["router", "switch"]
        assert "firewall" in result["device_roles"]["created"]
        assert len(result["device_roles"]["created"]) == 9
        assert result["rack_roles"]["existing"] == ["network", "server"]
        assert "ot" in result["rack_roles"]["created"]
        assert result["custom_fields"]["existing"] == ["gemerotic_firmware_version"]
        assert result["custom_fields"]["created"] == ["gemerotic_criticality"]

    def test_authorization_header_uses_bearer_for_v2_tokens(self):
        client = NetBoxClient(
            base_url="http://localhost:8080",
            token="nbt_fakekey.faketoken",
        )

        assert client._authorization_header() == "Bearer nbt_fakekey.faketoken"

    def test_authorization_header_uses_token_for_legacy_tokens(self):
        client = NetBoxClient(
            base_url="http://localhost:8080",
            token="legacytoken",
        )

        assert client._authorization_header() == "Token legacytoken"


class TestNetBoxBootstrapEndpoint:
    """Tests HTTP del bootstrap de NetBox."""

    def test_bootstrap_returns_success_response(self, monkeypatch):
        with _build_client_with_override(
            ConnectedNetBoxClient(),
            monkeypatch,
        ) as client:
            response = client.post(
                "/api/v1/netbox/bootstrap",
                headers={"X-API-Key": "test-api-key"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["message"] == "NetBox bootstrap completed successfully"
        assert data["data"]["netbox_version"] == "4.5.5"

    def test_bootstrap_returns_503_on_controlled_netbox_error(self, monkeypatch):
        with _build_client_with_override(
            FailingNetBoxClient(),
            monkeypatch,
        ) as client:
            response = client.post(
                "/api/v1/netbox/bootstrap",
                headers={"X-API-Key": "test-api-key"},
            )

        assert response.status_code == 503
        assert response.json()["status"] == "error"
        assert response.json()["message"] == "NetBox token is not configured"
        assert response.json()["detail"] == "NetBox token is not configured"

    def test_health_can_report_connected_netbox(self, monkeypatch):
        with _build_client_with_override(
            ConnectedNetBoxClient(),
            monkeypatch,
        ) as client:
            response = client.get("/api/v1/health")

        assert response.status_code == 200
        assert response.json()["checks"]["netbox_connected"] is True
