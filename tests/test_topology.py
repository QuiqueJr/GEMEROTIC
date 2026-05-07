"""
Tests del importador y endpoint de topología.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.dependencies import get_netbox_client, get_topology_store
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
        self._deleted = False
        for key, value in payload.items():
            setattr(self, key, value)

    def save(self) -> None:
        self._save_calls += 1

    def delete(self) -> None:
        self._deleted = True

    def serialize(self) -> dict:
        return {
            key: getattr(self, key)
            for key in ("a_terminations", "b_terminations", "label")
            if hasattr(self, key)
        }


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
            if record._deleted:
                continue
            if all(self._matches(record, key, value) for key, value in filters.items()):
                return record
        return None

    def create(self, payload: dict):
        return self.seed(payload)

    def all(self) -> list[FakeRecord]:
        return [record for record in self.records if not record._deleted]

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

    def clean_topology(self, topology_name: str) -> dict:
        return {
            "topology_name": topology_name,
            "summary": {"devices": 0, "cables": 0},
        }


class FailingTopologyClient:
    """Stub que simula un error de traducción del payload."""

    def import_topology(self, topology: TopologyCreate) -> dict:
        raise TopologyImportError(
            "Device 'host-01' is not assigned to a rack and the topology "
            "has multiple sites"
        )

    def clean_topology(self, topology_name: str) -> dict:
        return {
            "topology_name": topology_name,
            "summary": {"devices": 0, "cables": 0},
        }


class BrokenNetBoxTopologyClient:
    """Stub que simula un error operativo al hablar con NetBox."""

    def import_topology(self, topology: TopologyCreate) -> dict:
        raise NetBoxClientError("NetBox topology import failed")

    def clean_topology(self, topology_name: str) -> dict:
        raise NetBoxClientError("NetBox topology cleanup failed")


class FakeTopologyStore:
    """Store mínimo en memoria para tests de endpoints."""

    def __init__(self):
        self.saved: dict[str, TopologyCreate] = {}
        self.project_states: dict[str, dict] = {}
        self.sync_results: dict[str, dict] = {}

    def save(self, topology: TopologyCreate) -> dict:
        self.saved[topology.name] = topology
        return {
            "topology_name": topology.name,
            "saved_at": "2026-05-07T00:00:00+00:00",
            "store_dir": "/tmp/gemerotic-test",
            "artifact_count": 13,
        }

    def load(self, topology_name: str) -> TopologyCreate:
        return self.saved[topology_name]

    def save_project_state(self, project_name: str, state: dict) -> dict:
        self.project_states[project_name] = state
        return {
            "project_name": project_name,
            "saved_at": "2026-05-07T00:00:00+00:00",
            "store_dir": "/tmp/gemerotic-test",
        }

    def load_project_state(self, project_name: str) -> dict:
        return self.project_states[project_name]

    def update_netbox_sync(self, topology_name: str, sync_result: dict) -> None:
        self.sync_results[topology_name] = sync_result


def _build_client_with_override(
    fake_client,
    monkeypatch,
    api_key: str = "test-api-key",
    topology_store=None,
) -> TestClient:
    monkeypatch.setattr(settings, "API_KEY", api_key)
    application = create_app(rate_limiter=AllowAllRateLimiter())
    application.dependency_overrides[get_netbox_client] = lambda: fake_client
    application.dependency_overrides[get_topology_store] = (
        lambda: topology_store or FakeTopologyStore()
    )
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

    def test_importer_replaces_stale_cables_when_cable_ids_change(self):
        first_payload = TopologyCreate(**_mvp_topology_payload())
        second_dict = _mvp_topology_payload()
        second_dict["cables"][0]["id"] = "cable-001-renamed"
        second_payload = TopologyCreate(**second_dict)
        importer = TopologyImporter(FakeTopologyClient())

        importer.import_topology(first_payload)
        result = importer.import_topology(second_payload)

        labels = [record.label for record in importer._api.dcim.cables.all()]
        assert "mvp-lab-01-cable-001" not in labels
        assert "mvp-lab-01-cable-001-renamed" in labels
        assert len(labels) == 3
        assert result["summary"]["cables"]["created"] == 1

    def test_importer_recreates_cable_when_endpoints_change(self):
        first_payload = TopologyCreate(**_mvp_topology_payload())
        second_dict = _mvp_topology_payload()
        second_dict["cables"][0]["terminations"] = [
            {"port_id": "router-01:eth1"},
            {"port_id": "switch-01:eth0"},
        ]
        second_payload = TopologyCreate(**second_dict)
        importer = TopologyImporter(FakeTopologyClient())

        importer.import_topology(first_payload)
        result = importer.import_topology(second_payload)

        cable = importer._api.dcim.cables.get(label="mvp-lab-01-cable-001")
        assert cable.a_terminations == [
            {"object_type": "dcim.interface", "object_id": 2}
        ]
        assert len(importer._api.dcim.cables.all()) == 3
        assert result["summary"]["cables"]["created"] == 1

    def test_importer_deletes_stale_devices_for_same_topology(self):
        first_payload = TopologyCreate(**_mvp_topology_payload())
        second_dict = _mvp_topology_payload()
        second_dict["devices"] = [
            device for device in second_dict["devices"] if device["id"] != "host-02"
        ]
        second_dict["cables"] = [
            cable
            for cable in second_dict["cables"]
            if all(
                termination["port_id"].split(":")[0] != "host-02"
                for termination in cable["terminations"]
            )
        ]
        for zone in second_dict["security_zones"]:
            zone["device_ids"] = [
                device_id for device_id in zone["device_ids"] if device_id != "host-02"
            ]
        second_payload = TopologyCreate(**second_dict)
        importer = TopologyImporter(FakeTopologyClient())

        importer.import_topology(first_payload)
        result = importer.import_topology(second_payload)

        asset_tags = [record.asset_tag for record in importer._api.dcim.devices.all()]
        cable_labels = [record.label for record in importer._api.dcim.cables.all()]
        assert "mvp-lab-01-host-02" not in asset_tags
        assert len(asset_tags) == 3
        assert len(cable_labels) == 2
        assert result["summary"]["cleanup"]["devices"] == 1

    def test_importer_can_clean_topology_namespace(self):
        payload = TopologyCreate(**_mvp_topology_payload())
        importer = TopologyImporter(FakeTopologyClient())

        importer.import_topology(payload)
        result = importer.clean_topology("mvp-lab-01")

        assert len(importer._api.dcim.devices.all()) == 0
        assert len(importer._api.dcim.cables.all()) == 0
        assert len(importer._api.dcim.sites.all()) == 0
        assert result["summary"]["devices"] == 4

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
        assert data["message"] == "Topology saved successfully"
        assert data["data"]["topology_name"] == "mvp-lab-01"
        assert data["data"]["netbox_sync"]["status"] == "synchronized"

    def test_create_topology_saves_on_mapping_error(self, monkeypatch):
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

        assert response.status_code == 201
        assert response.json()["status"] == "success"
        assert response.json()["data"]["netbox_sync"]["status"] == "failed"
        assert "multiple sites" in response.json()["data"]["netbox_sync"]["detail"]

    def test_create_topology_saves_on_netbox_error(self, monkeypatch):
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

        assert response.status_code == 201
        assert response.json()["status"] == "success"
        assert response.json()["message"] == "Topology saved successfully"
        assert response.json()["data"]["netbox_sync"]["status"] == "failed"
        assert (
            response.json()["data"]["netbox_sync"]["detail"]
            == "NetBox topology import failed"
        )

    def test_save_state_persists_valid_builder_state(self, monkeypatch):
        payload = _mvp_topology_payload()
        topology_store = FakeTopologyStore()
        state_payload = {
            "project_name": "mvp-lab-01",
            "version": 1,
            "settings": {"name": "mvp-lab-01"},
            "nodes": [{"id": "router-01"}],
            "edges": [],
            "drawings": [],
            "active_view": "physical",
            "topology": payload,
        }

        with _build_client_with_override(
            ConnectedTopologyClient(),
            monkeypatch,
            topology_store=topology_store,
        ) as client:
            response = client.put(
                "/api/v1/topology/state/mvp-lab-01",
                json=state_payload,
                headers={"X-API-Key": "test-api-key"},
            )

        data = response.json()["data"]
        assert response.status_code == 201
        assert data["project_name"] == "mvp-lab-01"
        assert data["topology_validation"]["status"] == "valid"
        assert data["netbox_sync"]["status"] == "synchronized"
        assert topology_store.project_states["mvp-lab-01"]["settings"]["name"] == (
            "mvp-lab-01"
        )
        assert "mvp-lab-01" in topology_store.saved

    def test_save_state_survives_invalid_topology_payload(self, monkeypatch):
        payload = _mvp_topology_payload()
        payload["cables"][0]["terminations"][0]["port_id"] = "missing-port"
        topology_store = FakeTopologyStore()
        state_payload = {
            "project_name": "mvp-lab-01",
            "version": 1,
            "settings": {"name": "mvp-lab-01"},
            "nodes": [{"id": "router-01"}],
            "edges": [],
            "drawings": [],
            "active_view": "physical",
            "topology": payload,
        }

        with _build_client_with_override(
            ConnectedTopologyClient(),
            monkeypatch,
            topology_store=topology_store,
        ) as client:
            response = client.put(
                "/api/v1/topology/state/mvp-lab-01",
                json=state_payload,
                headers={"X-API-Key": "test-api-key"},
            )

        data = response.json()["data"]
        assert response.status_code == 201
        assert data["project_name"] == "mvp-lab-01"
        assert data["topology_validation"]["status"] == "failed"
        assert data["netbox_sync"]["status"] == "skipped"
        assert "mvp-lab-01" in topology_store.project_states
        assert topology_store.saved == {}

    def test_save_blank_state_cleans_netbox_without_rejecting_payload(
        self, monkeypatch
    ):
        topology_store = FakeTopologyStore()
        state_payload = {
            "project_name": "mvp-lab-01",
            "version": 1,
            "settings": {"name": "mvp-lab-01"},
            "nodes": [],
            "edges": [],
            "drawings": [],
            "active_view": "physical",
            "topology": {
                "name": "mvp-lab-01",
                "sites": [{"id": "site-main", "name": "Planta Principal"}],
                "rooms": [],
                "racks": [],
                "devices": [],
                "cables": [],
            },
        }

        with _build_client_with_override(
            ConnectedTopologyClient(),
            monkeypatch,
            topology_store=topology_store,
        ) as client:
            response = client.put(
                "/api/v1/topology/state/mvp-lab-01",
                json=state_payload,
                headers={"X-API-Key": "test-api-key"},
            )

        data = response.json()["data"]
        assert response.status_code == 201
        assert data["topology_validation"]["status"] == "failed"
        assert data["netbox_sync"]["status"] == "synchronized"
        assert data["netbox_sync"]["detail"] == "Topology cleared from NetBox"
        assert topology_store.saved == {}

    def test_get_state_returns_saved_builder_state(self, monkeypatch):
        topology_store = FakeTopologyStore()
        topology_store.project_states["mvp-lab-01"] = {
            "project_name": "mvp-lab-01",
            "settings": {"name": "mvp-lab-01"},
            "nodes": [],
            "edges": [],
            "drawings": [],
            "active_view": "logical",
        }

        with _build_client_with_override(
            ConnectedTopologyClient(),
            monkeypatch,
            topology_store=topology_store,
        ) as client:
            response = client.get(
                "/api/v1/topology/state/mvp-lab-01",
                headers={"X-API-Key": "test-api-key"},
            )

        assert response.status_code == 200
        assert response.json()["data"]["active_view"] == "logical"
