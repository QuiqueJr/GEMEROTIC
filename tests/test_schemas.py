"""
Tests unitarios para los schemas Pydantic de topología.

Cubre validaciones de:
- Campos requeridos y tipos
- Sanitización de nombres (regex, normalización a minúsculas)
- Restricciones de enum (DeviceRole)
- Interfaces duplicadas dentro de un dispositivo
- Dispositivos duplicados dentro de una topología
- Enlaces que referencian dispositivos/interfaces inexistentes
- Enlaces duplicados y auto-loops
- Payload MVP completo válido
"""

import pytest
from pydantic import ValidationError

from app.schemas.topology import (
    DeviceRole,
    DeviceSchema,
    InterfaceSchema,
    LinkSchema,
    TopologyCreate,
)
from app.schemas.responses import APIResponse, APIError


# =============================================================================
# Helpers: payload MVP válido reutilizable
# =============================================================================

def _valid_topology_payload() -> dict:
    """Retorna un payload MVP completo y válido para reusar en tests."""
    return {
        "name": "mvp-lab-01",
        "devices": [
            {
                "name": "router-01",
                "role": "router",
                "interfaces": [{"name": "eth0"}, {"name": "eth1"}],
            },
            {
                "name": "switch-01",
                "role": "switch",
                "interfaces": [
                    {"name": "eth0"},
                    {"name": "eth1"},
                    {"name": "eth2"},
                ],
            },
            {
                "name": "host-01",
                "role": "host",
                "interfaces": [{"name": "eth0"}],
            },
            {
                "name": "host-02",
                "role": "host",
                "interfaces": [{"name": "eth0"}],
            },
        ],
        "links": [
            {
                "source_device": "router-01",
                "source_interface": "eth0",
                "target_device": "switch-01",
                "target_interface": "eth0",
            },
            {
                "source_device": "switch-01",
                "source_interface": "eth1",
                "target_device": "host-01",
                "target_interface": "eth0",
            },
            {
                "source_device": "switch-01",
                "source_interface": "eth2",
                "target_device": "host-02",
                "target_interface": "eth0",
            },
        ],
    }


# =============================================================================
# InterfaceSchema
# =============================================================================

class TestInterfaceSchema:
    """Tests para validación de nombres de interfaz."""

    def test_valid_simple_name(self):
        iface = InterfaceSchema(name="eth0")
        assert iface.name == "eth0"

    def test_valid_cisco_style_name(self):
        iface = InterfaceSchema(name="GigabitEthernet0/0/1")
        assert iface.name == "GigabitEthernet0/0/1"

    def test_valid_name_with_dot(self):
        iface = InterfaceSchema(name="eth0.100")
        assert iface.name == "eth0.100"

    def test_reject_empty_name(self):
        with pytest.raises(ValidationError) as exc_info:
            InterfaceSchema(name="")
        assert "min_length" in str(exc_info.value).lower() or "at least" in str(exc_info.value).lower()

    def test_reject_special_characters(self):
        with pytest.raises(ValidationError) as exc_info:
            InterfaceSchema(name="eth0; rm -rf /")
        assert "Interface name" in str(exc_info.value)

    def test_reject_spaces(self):
        with pytest.raises(ValidationError):
            InterfaceSchema(name="eth 0")

    def test_reject_exceeds_max_length(self):
        with pytest.raises(ValidationError):
            InterfaceSchema(name="a" * 65)


# =============================================================================
# DeviceSchema
# =============================================================================

class TestDeviceSchema:
    """Tests para validación de dispositivos."""

    def test_valid_device(self):
        device = DeviceSchema(
            name="Router-01",
            role="router",
            interfaces=[{"name": "eth0"}],
        )
        # Verificar normalización a minúsculas
        assert device.name == "router-01"
        assert device.role == DeviceRole.ROUTER

    def test_name_normalized_to_lowercase(self):
        device = DeviceSchema(
            name="SWITCH-01",
            role="switch",
            interfaces=[{"name": "eth0"}],
        )
        assert device.name == "switch-01"

    def test_reject_invalid_name_characters(self):
        with pytest.raises(ValidationError) as exc_info:
            DeviceSchema(
                name="router 01!",
                role="router",
                interfaces=[{"name": "eth0"}],
            )
        assert "Device name" in str(exc_info.value)

    def test_reject_empty_name(self):
        with pytest.raises(ValidationError):
            DeviceSchema(
                name="",
                role="router",
                interfaces=[{"name": "eth0"}],
            )

    def test_reject_invalid_role(self):
        with pytest.raises(ValidationError) as exc_info:
            DeviceSchema(
                name="firewall-01",
                role="firewall",
                interfaces=[{"name": "eth0"}],
            )
        assert "firewall" in str(exc_info.value).lower()

    def test_reject_empty_interfaces(self):
        with pytest.raises(ValidationError):
            DeviceSchema(
                name="router-01",
                role="router",
                interfaces=[],
            )

    def test_reject_missing_interfaces(self):
        with pytest.raises(ValidationError):
            DeviceSchema(
                name="router-01",
                role="router",
            )

    def test_reject_duplicate_interfaces(self):
        with pytest.raises(ValidationError) as exc_info:
            DeviceSchema(
                name="router-01",
                role="router",
                interfaces=[{"name": "eth0"}, {"name": "eth0"}],
            )
        assert "Duplicate interface" in str(exc_info.value)

    def test_all_roles_accepted(self):
        for role in DeviceRole:
            device = DeviceSchema(
                name=f"{role.value}-01",
                role=role.value,
                interfaces=[{"name": "eth0"}],
            )
            assert device.role == role


# =============================================================================
# LinkSchema
# =============================================================================

class TestLinkSchema:
    """Tests para validación de enlaces."""

    def test_valid_link(self):
        link = LinkSchema(
            source_device="router-01",
            source_interface="eth0",
            target_device="switch-01",
            target_interface="eth0",
        )
        assert link.source_device == "router-01"
        assert link.target_device == "switch-01"

    def test_reject_self_loop_same_interface(self):
        with pytest.raises(ValidationError) as exc_info:
            LinkSchema(
                source_device="router-01",
                source_interface="eth0",
                target_device="router-01",
                target_interface="eth0",
            )
        assert "cannot connect a device interface to itself" in str(exc_info.value)

    def test_allow_same_device_different_interfaces(self):
        """Un loopback entre interfaces distintas del mismo dispositivo es válido."""
        link = LinkSchema(
            source_device="router-01",
            source_interface="eth0",
            target_device="router-01",
            target_interface="eth1",
        )
        assert link.source_interface != link.target_interface

    def test_reject_missing_fields(self):
        with pytest.raises(ValidationError):
            LinkSchema(
                source_device="router-01",
                source_interface="eth0",
            )


# =============================================================================
# TopologyCreate — validación completa
# =============================================================================

class TestTopologyCreate:
    """Tests para el payload principal de topología."""

    def test_valid_mvp_topology(self):
        """El payload MVP completo debe ser aceptado sin errores."""
        topology = TopologyCreate(**_valid_topology_payload())
        assert topology.name == "mvp-lab-01"
        assert len(topology.devices) == 4
        assert len(topology.links) == 3

    def test_name_normalized_to_lowercase(self):
        payload = _valid_topology_payload()
        payload["name"] = "MVP-Lab-01"
        topology = TopologyCreate(**payload)
        assert topology.name == "mvp-lab-01"

    def test_reject_invalid_topology_name(self):
        payload = _valid_topology_payload()
        payload["name"] = "my lab 01!"
        with pytest.raises(ValidationError) as exc_info:
            TopologyCreate(**payload)
        assert "Topology name" in str(exc_info.value)

    def test_reject_empty_devices(self):
        with pytest.raises(ValidationError):
            TopologyCreate(name="test-lab", devices=[], links=[])

    def test_accept_topology_without_links(self):
        """Una topología sin enlaces es válida (dispositivos aislados)."""
        topology = TopologyCreate(
            name="isolated-lab",
            devices=[
                {
                    "name": "host-01",
                    "role": "host",
                    "interfaces": [{"name": "eth0"}],
                }
            ],
        )
        assert len(topology.links) == 0

    def test_reject_duplicate_device_names(self):
        payload = _valid_topology_payload()
        # Duplicar el primer dispositivo
        payload["devices"].append(
            {
                "name": "router-01",
                "role": "router",
                "interfaces": [{"name": "eth0"}],
            }
        )
        with pytest.raises(ValidationError) as exc_info:
            TopologyCreate(**payload)
        assert "Duplicate device" in str(exc_info.value)

    def test_reject_link_to_nonexistent_device(self):
        payload = _valid_topology_payload()
        payload["links"].append(
            {
                "source_device": "router-01",
                "source_interface": "eth0",
                "target_device": "firewall-01",
                "target_interface": "eth0",
            }
        )
        with pytest.raises(ValidationError) as exc_info:
            TopologyCreate(**payload)
        assert "does not exist in topology" in str(exc_info.value)

    def test_reject_link_to_nonexistent_interface(self):
        payload = _valid_topology_payload()
        payload["links"].append(
            {
                "source_device": "router-01",
                "source_interface": "eth99",
                "target_device": "switch-01",
                "target_interface": "eth0",
            }
        )
        with pytest.raises(ValidationError) as exc_info:
            TopologyCreate(**payload)
        assert "does not exist on device" in str(exc_info.value)

    def test_reject_duplicate_links(self):
        payload = _valid_topology_payload()
        # Duplicar el primer enlace
        payload["links"].append(payload["links"][0].copy())
        with pytest.raises(ValidationError) as exc_info:
            TopologyCreate(**payload)
        assert "duplicate link" in str(exc_info.value)

    def test_reject_duplicate_links_reversed_direction(self):
        """A->B y B->A deben detectarse como duplicados."""
        payload = _valid_topology_payload()
        first_link = payload["links"][0]
        payload["links"].append(
            {
                "source_device": first_link["target_device"],
                "source_interface": first_link["target_interface"],
                "target_device": first_link["source_device"],
                "target_interface": first_link["source_interface"],
            }
        )
        with pytest.raises(ValidationError) as exc_info:
            TopologyCreate(**payload)
        assert "duplicate link" in str(exc_info.value)

    def test_reject_sql_injection_in_name(self):
        """Nombres con caracteres SQL deben ser rechazados."""
        payload = _valid_topology_payload()
        payload["name"] = "'; DROP TABLE topologies;--"
        with pytest.raises(ValidationError):
            TopologyCreate(**payload)

    def test_reject_xss_in_device_name(self):
        """Nombres con HTML/JS deben ser rechazados."""
        payload = _valid_topology_payload()
        payload["devices"][0]["name"] = "<script>alert(1)</script>"
        with pytest.raises(ValidationError):
            TopologyCreate(**payload)


# =============================================================================
# Response schemas
# =============================================================================

class TestAPIResponse:
    """Tests para modelos de respuesta."""

    def test_success_response(self):
        resp = APIResponse(message="Topology created", data={"id": 1})
        assert resp.status == "success"
        assert resp.data == {"id": 1}

    def test_success_response_without_data(self):
        resp = APIResponse(message="OK")
        assert resp.data is None

    def test_error_response(self):
        err = APIError(message="Validation failed", detail=["field required"])
        assert err.status == "error"
        assert err.detail == ["field required"]
