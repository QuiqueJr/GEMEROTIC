"""
Tests del importador y endpoint de topología.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.dependencies import get_netbox_client
from app.main import create_app
from app.schemas.physical import AssetType, RackType
from app.schemas.topology import TopologyCreate
from app.services.netbox_client import NetBoxClientError
from app.services.topology_importer import TopologyImporter, TopologyImportError
from tests.conftest import AllowAllRateLimiter
from tests.test_schemas import _mvp_topology_payload


class FakeRecord:
    """Registro mutable mínimo para simular objetos de pynetbox."""

    def __init__(self, endpoint_name: str, record_id: int, payload: dict):
        self._endpoint_name = endpoint_name
        self.id = record_id
        self._save_calls = 0
        for key, value in payload.items():
            setattr(self, key, value)

    def save(self) -> None:
        self._save_calls += 1


class FakeEndpoint:
    """Endpoint mínimo con `get()` y `create()` para tests unitarios."""

    def __init__(self, endpoint_name: str):
        self.endpoint_name = endpoint_name
        self.records: list[FakeRecord] = []
        self._next_id = 1

    def seed(self, payload: dict) -> FakeRecord:
        record = FakeRecord(self.endpoint_name, self._next_id, payload)
        self._next_id += 1
        self.records.append(record)
        return record

    def get(self, **filters):
        for record in self.records:
            if all(self._matches(record, key, value) for key, value in filters.items()):
                return record
        return None

    def create(self, payload: dict):
        return self.seed(payload)

    def _matches(self, record: FakeRecord, key: str, value):
        attribute_name = key
        if not hasattr(record, attribute_name) and key.endswith("_id"):
            attribute_name = key[:-3]

        current = getattr(record, attribute_name, None)
        return self._normalize(current) == self._normalize(value)

    def _normalize(self, value):
        if isinstance(value, list):
            return sorted(self._normalize(item) for item in value)
        if hasattr(value, "id"):
            return value.id
        if isinstance(value, dict) and "id" in value:
            return value["id"]
        return value


class FakeAPI:
    """Árbol mínimo de endpoints usados por el importador."""

    def __init__(self):
        self.dcim = SimpleNamespace(
            sites=FakeEndpoint("sites"),
            locations=FakeEndpoint("locations"),
            racks=FakeEndpoint("racks"),
            manufacturers=FakeEndpoint("manufacturers"),
            device_types=FakeEndpoint("device_types"),
            device_roles=FakeEndpoint("device_roles"),
            rack_roles=FakeEndpoint("rack_roles"),
            devices=FakeEndpoint("devices"),
            interfaces=FakeEndpoint("interfaces"),
            front_ports=FakeEndpoint("front_ports"),
            rear_ports=FakeEndpoint("rear_ports"),
            cables=FakeEndpoint("cables"),
        )
        self.ipam = SimpleNamespace(
            vlans=FakeEndpoint("vlans"),
            ip_addresses=FakeEndpoint("ip_addresses"),
        )
        self.plugins = SimpleNamespace(
            ot_security=SimpleNamespace(
                security_zones=FakeEndpoint("security_zones"),
                conduits=FakeEndpoint("conduits"),
            )
        )
        self.extras = SimpleNamespace(
            custom_fields=FakeEndpoint("custom_fields"),
        )
        self._seed_roles()

    def _seed_roles(self) -> None:
        for asset_type in AssetType:
            self.dcim.device_roles.seed(
                {"slug": asset_type.value, "name": asset_type.value}
            )
        for rack_type in RackType:
            self.dcim.rack_roles.seed(
                {"slug": rack_type.value, "name": rack_type.value}
            )


class FakeTopologyClient:
    """Cliente mínimo para probar el importador sin NetBox real."""

    def __init__(self):
        self._api = FakeAPI()

    def is_configured(self) -> bool:
        return True

    def bootstrap(self) -> dict:
        return {
            "netbox_version": "4.5.5",
            "device_roles": {"created": [], "existing": [], "total_supported": 11},
            "rack_roles": {"created": [], "existing": [], "total_supported": 5},
            "custom_fields": {"created": [], "existing": [], "total_supported": 2},
        }


class ConnectedTopologyClient:
    """Stub conectado para tests HTTP del endpoint."""

    def import_topology(self, topology: TopologyCreate) -> dict:
        return {
            "topology_name": topology.name,
            "netbox_version": "4.5.5",
            "summary": {
                "sites": {"created": 1, "existing": 0, "objects": {"site-main": 1}},
            },
        }


class FailingTopologyClient:
    """Stub que simula un error de traducción del payload."""

    def import_topology(self, topology: TopologyCreate) -> dict:
        raise TopologyImportError(
            "Device 'host-01' is not assigned to a rack and the topology "
            "has multiple sites"
        )


class BrokenNetBoxTopologyClient:
    """Stub que simula un error operativo al hablar con NetBox."""

    def import_topology(self, topology: TopologyCreate) -> dict:
        raise NetBoxClientError("NetBox topology import failed")


def _build_client_with_override(
    fake_client,
    monkeypatch,
    api_key: str = "test-api-key",
) -> TestClient:
    monkeypatch.setattr(settings, "API_KEY", api_key)
    application = create_app(rate_limiter=AllowAllRateLimiter())
    application.dependency_overrides[get_netbox_client] = lambda: fake_client
    return TestClient(application)


class TestTopologyImporter:
    """Tests unitarios del importador de topologías."""

    def test_importer_creates_all_layers_and_applies_vlan_modes(self):
        payload = _mvp_topology_payload()
        payload["patch_panels"] = [
            {
                "id": "pp-01",
                "name": "Patch Panel 01",
                "rack_id": "rack-net-01",
                "port_count": 2,
                "ports": [
                    {
                        "id": "pp-01:front-1",
                        "name": "front-1",
                        "port_type": "front_port",
                    },
                    {
                        "id": "pp-01:rear-1",
                        "name": "rear-1",
                        "port_type": "rear_port",
                    },
                ],
            }
        ]
        payload["interfaces"].extend(
            [
                {
                    "port_id": "switch-01:eth1",
                    "enabled": True,
                    "description": "Trunk OT",
                },
                {
                    "port_id": "switch-01:eth2",
                    "enabled": True,
                },
            ]
        )
        payload["vlans"].append(
            {
                "id": "vlan-200-ot",
                "vlan_id": 200,
                "name": "OT",
                "assigned_interfaces": ["switch-01:eth1", "switch-01:eth2"],
            }
        )
        payload["cables"][0]["category"] = "Cat6"

        importer = TopologyImporter(FakeTopologyClient())

        result = importer.import_topology(TopologyCreate(**payload))

        assert result["topology_name"] == "mvp-lab-01"
        assert result["summary"]["devices"]["created"] == 4
        assert result["summary"]["patch_panels"]["created"] == 1
        assert result["summary"]["security_zones"]["created"] == 2
        assert result["summary"]["conduits"]["created"] == 1

        interface_endpoint = importer._api.dcim.interfaces
        trunk_interface = interface_endpoint.get(device_id=2, name="eth1")
        assert trunk_interface.mode == "tagged"
        assert trunk_interface.tagged_vlans == [1, 2]

        ip_endpoint = importer._api.ipam.ip_addresses
        assert ip_endpoint.get(address="10.0.0.1/30") is not None

    def test_importer_is_idempotent_for_existing_records(self):
        payload = TopologyCreate(**_mvp_topology_payload())
        importer = TopologyImporter(FakeTopologyClient())

        first_result = importer.import_topology(payload)
        second_result = importer.import_topology(payload)

        assert first_result["summary"]["sites"]["created"] == 1
        assert second_result["summary"]["sites"]["existing"] == 1
        assert len(importer._api.dcim.sites.records) == 1
        assert len(importer._api.dcim.devices.records) == 4

    def test_importer_rejects_unplaced_device_in_multisite_topology(self):
        payload = _mvp_topology_payload()
        payload["sites"].append({"id": "site-remote", "name": "Planta Remota"})
        topology = TopologyCreate(**payload)
        importer = TopologyImporter(FakeTopologyClient())

        with pytest.raises(TopologyImportError, match="multiple sites"):
            importer.import_topology(topology)

    def test_importer_namespaces_records_per_topology_name(self):
        first_payload = TopologyCreate(**_mvp_topology_payload())
        second_dict = _mvp_topology_payload()
        second_dict["name"] = "mvp-lab-02"
        second_payload = TopologyCreate(**second_dict)
        importer = TopologyImporter(FakeTopologyClient())

        importer.import_topology(first_payload)
        importer.import_topology(second_payload)

        assert len(importer._api.dcim.sites.records) == 2
        assert len(importer._api.dcim.devices.records) == 8
        assert len(importer._api.plugins.ot_security.security_zones.records) == 4


class TestTopologyEndpoint:
    """Tests HTTP del endpoint de topología."""

    def test_create_topology_returns_201(self, monkeypatch):
        payload = _mvp_topology_payload()

        with _build_client_with_override(
            ConnectedTopologyClient(),
            monkeypatch,
        ) as client:
            response = client.post(
                "/api/v1/topology",
                json=payload,
                headers={"X-API-Key": "test-api-key"},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "success"
        assert data["message"] == "Topology created successfully"
        assert data["data"]["topology_name"] == "mvp-lab-01"

    def test_create_topology_returns_400_on_mapping_error(self, monkeypatch):
        payload = _mvp_topology_payload()

        with _build_client_with_override(
            FailingTopologyClient(),
            monkeypatch,
        ) as client:
            response = client.post(
                "/api/v1/topology",
                json=payload,
                headers={"X-API-Key": "test-api-key"},
            )

        assert response.status_code == 400
        assert response.json()["status"] == "error"
        assert "multiple sites" in response.json()["message"]
        assert "multiple sites" in response.json()["detail"]

    def test_create_topology_returns_503_on_netbox_error(self, monkeypatch):
        payload = _mvp_topology_payload()

        with _build_client_with_override(
            BrokenNetBoxTopologyClient(),
            monkeypatch,
        ) as client:
            response = client.post(
                "/api/v1/topology",
                json=payload,
                headers={"X-API-Key": "test-api-key"},
            )

        assert response.status_code == 503
        assert response.json()["status"] == "error"
        assert response.json()["message"] == "NetBox topology import failed"
        assert response.json()["detail"] == "NetBox topology import failed"
