"""
Tests unitarios para el modelo de datos de 3 capas (Step 2 Refactor).

Cubre validaciones de:
- Layer 1 (Física): Sites, Rooms, Racks, Devices, Ports, Patch Panels, Cables
- Layer 2 (Lógica): Interfaces lógicas (MAC, IPv4, IPv6), VLANs
- Layer 3 (Seguridad OT): Zonas IEC 62443, Conductos, Purdue
- TopologyCreate: Integridad referencial cruzada entre las 3 capas
- Seguridad: Inyección SQL, XSS, abuso de payload
- Schemas de respuesta: APIResponse, APIError
"""

import pytest
from pydantic import ValidationError

# --- Validadores compartidos ---
from app.schemas.validators import (
    find_duplicates,
    validate_interface_name,
    validate_label,
    validate_mac_address,
    validate_slug,
)

# --- Layer 1 ---
from app.schemas.physical import (
    AssetType,
    CableCategory,
    CableMedium,
    CableSchema,
    CableTerminationSchema,
    Criticality,
    DevicePortSchema,
    DeviceSchema,
    PatchPanelPortSchema,
    PatchPanelSchema,
    PortType,
    RackSchema,
    RackType,
    RoomSchema,
    SiteSchema,
)

# --- Layer 2 ---
from app.schemas.logical import (
    InterfaceLogicalSchema,
    VLANSchema,
)

# --- Layer 3 ---
from app.schemas.ot_security import (
    ConduitSchema,
    PurdueLevel,
    SecurityLevel,
    SecurityZoneSchema,
)

# --- Root ---
from app.schemas.topology import TopologyCreate

# --- Respuestas ---
from app.schemas.responses import APIError, APIResponse


# =============================================================================
# Helpers: bloques reutilizables para construir payloads válidos
# =============================================================================

def _minimal_site(site_id: str = "site-main") -> dict:
    """Retorna un sitio mínimo válido."""
    return {"id": site_id, "name": "Planta Principal"}


def _minimal_room(room_id: str = "room-srv-01", site_id: str = "site-main") -> dict:
    """Retorna una sala mínima válida vinculada a un sitio."""
    return {"id": room_id, "name": "Cuarto Servidores", "site_id": site_id}


def _minimal_rack(
    rack_id: str = "rack-net-01", room_id: str = "room-srv-01"
) -> dict:
    """Retorna un rack mínimo válido vinculado a una sala."""
    return {"id": rack_id, "name": "Rack Red 01", "room_id": room_id}


def _minimal_device(
    device_id: str = "router-01",
    asset_type: str = "router",
    ports: list[dict] | None = None,
    rack_id: str | None = None,
) -> dict:
    """Retorna un dispositivo mínimo válido con 1 puerto."""
    if ports is None:
        ports = [{"id": f"{device_id}:eth0", "name": "eth0"}]
    d = {
        "id": device_id,
        "name": f"Device {device_id}",
        "asset_type": asset_type,
        "ports": ports,
    }
    if rack_id is not None:
        d["rack_id"] = rack_id
    return d


def _minimal_cable(
    cable_id: str = "cable-001",
    port_a: str = "router-01:eth0",
    port_b: str = "switch-01:eth0",
) -> dict:
    """Retorna un cable mínimo válido con 2 terminaciones."""
    return {
        "id": cable_id,
        "terminations": [{"port_id": port_a}, {"port_id": port_b}],
    }


def _mvp_topology_payload() -> dict:
    """
    Retorna un payload MVP completo y válido para la topología de 3 capas.
    1 Router, 1 Switch, 2 Hosts con cables, interfaces lógicas,
    1 VLAN, 2 zonas de seguridad y 1 conducto.
    """
    return {
        "name": "mvp-lab-01",
        # --- Layer 1 ---
        "sites": [_minimal_site()],
        "rooms": [_minimal_room()],
        "racks": [_minimal_rack()],
        "devices": [
            _minimal_device(
                "router-01", "router",
                [
                    {"id": "router-01:eth0", "name": "eth0"},
                    {"id": "router-01:eth1", "name": "eth1"},
                ],
                rack_id="rack-net-01",
            ),
            _minimal_device(
                "switch-01", "switch",
                [
                    {"id": "switch-01:eth0", "name": "eth0"},
                    {"id": "switch-01:eth1", "name": "eth1"},
                    {"id": "switch-01:eth2", "name": "eth2"},
                ],
                rack_id="rack-net-01",
            ),
            _minimal_device(
                "host-01", "host",
                [{"id": "host-01:eth0", "name": "eth0"}],
            ),
            _minimal_device(
                "host-02", "host",
                [{"id": "host-02:eth0", "name": "eth0"}],
            ),
        ],
        "cables": [
            _minimal_cable("cable-001", "router-01:eth0", "switch-01:eth0"),
            _minimal_cable("cable-002", "switch-01:eth1", "host-01:eth0"),
            _minimal_cable("cable-003", "switch-01:eth2", "host-02:eth0"),
        ],
        # --- Layer 2 ---
        "interfaces": [
            {
                "port_id": "router-01:eth0",
                "ipv4_address": "10.0.0.1/30",
                "mac_address": "00:1A:2B:3C:4D:01",
            },
            {
                "port_id": "switch-01:eth0",
                "mac_address": "00:1A:2B:3C:4D:02",
            },
        ],
        "vlans": [
            {
                "id": "vlan-100-corp",
                "vlan_id": 100,
                "name": "Corporativa",
                "assigned_interfaces": [
                    "switch-01:eth1",
                    "switch-01:eth2",
                ],
            },
        ],
        # --- Layer 3 ---
        "security_zones": [
            {
                "id": "zone-it",
                "name": "Zona IT",
                "purdue_level": 4,
                "security_level": "SL-2",
                "device_ids": ["router-01", "switch-01"],
            },
            {
                "id": "zone-endpoints",
                "name": "Zona Endpoints",
                "purdue_level": 5,
                "security_level": "SL-1",
                "device_ids": ["host-01", "host-02"],
            },
        ],
        "conduits": [
            {
                "id": "conduit-it-endpoints",
                "name": "Conducto IT a Endpoints",
                "source_zone_id": "zone-it",
                "target_zone_id": "zone-endpoints",
                "allowed_protocols": ["HTTPS", "SSH"],
            },
        ],
    }


# =============================================================================
# Validadores compartidos (validators.py)
# =============================================================================

class TestValidators:
    """Tests para funciones de validación compartidas."""

    def test_validate_slug_valid(self):
        assert validate_slug("router-01", "Test") == "router-01"

    def test_validate_slug_normalizes_lowercase(self):
        assert validate_slug("Router-01", "Test") == "router-01"

    def test_validate_slug_rejects_spaces(self):
        with pytest.raises(ValueError, match="must contain only"):
            validate_slug("router 01", "Test")

    def test_validate_slug_rejects_special_chars(self):
        with pytest.raises(ValueError):
            validate_slug("router;01", "Test")

    def test_validate_interface_name_valid(self):
        assert validate_interface_name("GigabitEthernet0/0/1") == "GigabitEthernet0/0/1"

    def test_validate_interface_name_with_dot(self):
        assert validate_interface_name("eth0.100") == "eth0.100"

    def test_validate_interface_name_rejects_spaces(self):
        with pytest.raises(ValueError):
            validate_interface_name("eth 0")

    def test_validate_interface_name_rejects_injection(self):
        with pytest.raises(ValueError):
            validate_interface_name("eth0; rm -rf /")

    def test_validate_label_allows_spaces(self):
        assert validate_label("Cuarto de Servidores", "Test") == "Cuarto de Servidores"

    def test_validate_label_rejects_special_chars(self):
        with pytest.raises(ValueError):
            validate_label("Room <script>", "Test")

    def test_validate_mac_address_valid_colons(self):
        assert validate_mac_address("00:1a:2b:3c:4d:5e") == "00:1A:2B:3C:4D:5E"

    def test_validate_mac_address_valid_hyphens(self):
        assert validate_mac_address("00-1A-2B-3C-4D-5E") == "00:1A:2B:3C:4D:5E"

    def test_validate_mac_address_rejects_invalid(self):
        with pytest.raises(ValueError, match="MAC address"):
            validate_mac_address("not-a-mac")

    def test_find_duplicates_returns_dupes(self):
        assert find_duplicates(["a", "b", "a", "c"]) == {"a"}

    def test_find_duplicates_returns_empty_when_unique(self):
        assert find_duplicates(["a", "b", "c"]) == set()


# =============================================================================
# Layer 1: SiteSchema
# =============================================================================

class TestSiteSchema:
    """Tests para validación de sitios físicos."""

    def test_valid_site(self):
        site = SiteSchema(id="site-main", name="Planta Principal")
        assert site.id == "site-main"
        assert site.name == "Planta Principal"

    def test_id_normalized_to_lowercase(self):
        site = SiteSchema(id="Site-Main", name="Planta")
        assert site.id == "site-main"

    def test_reject_empty_id(self):
        with pytest.raises(ValidationError):
            SiteSchema(id="", name="Planta")

    def test_reject_id_with_spaces(self):
        with pytest.raises(ValidationError):
            SiteSchema(id="site main", name="Planta")

    def test_optional_description(self):
        site = SiteSchema(id="site-01", name="Sitio", description="Un sitio de prueba")
        assert site.description == "Un sitio de prueba"

    def test_reject_xss_in_name(self):
        with pytest.raises(ValidationError):
            SiteSchema(id="site-01", name="<script>alert(1)</script>")


# =============================================================================
# Layer 1: RoomSchema
# =============================================================================

class TestRoomSchema:
    """Tests para validación de salas."""

    def test_valid_room(self):
        room = RoomSchema(id="room-srv-01", name="Cuarto Servidores", site_id="site-main")
        assert room.site_id == "site-main"

    def test_reject_invalid_site_id_format(self):
        with pytest.raises(ValidationError):
            RoomSchema(id="room-01", name="Room", site_id="site main!")


# =============================================================================
# Layer 1: RackSchema
# =============================================================================

class TestRackSchema:
    """Tests para validación de racks."""

    def test_valid_rack_defaults(self):
        rack = RackSchema(id="rack-01", name="Rack 01", room_id="room-01")
        assert rack.height_ru == 42
        assert rack.rack_type == RackType.MIXED

    def test_custom_rack_type(self):
        rack = RackSchema(
            id="rack-ot", name="Rack OT", room_id="room-01", rack_type="ot"
        )
        assert rack.rack_type == RackType.OT

    def test_reject_height_out_of_range(self):
        with pytest.raises(ValidationError):
            RackSchema(id="rack-01", name="Rack", room_id="room-01", height_ru=100)

    def test_reject_height_zero(self):
        with pytest.raises(ValidationError):
            RackSchema(id="rack-01", name="Rack", room_id="room-01", height_ru=0)


# =============================================================================
# Layer 1: DevicePortSchema
# =============================================================================

class TestDevicePortSchema:
    """Tests para validación de puertos de dispositivo."""

    def test_valid_port(self):
        port = DevicePortSchema(id="router-01:eth0", name="eth0")
        assert port.port_type == PortType.DEVICE_INTERFACE

    def test_reject_port_id_without_colon(self):
        with pytest.raises(ValidationError, match="device_id:port_name"):
            DevicePortSchema(id="router01-eth0", name="eth0")

    def test_valid_cisco_style_port(self):
        port = DevicePortSchema(
            id="switch-01:GigabitEthernet0/0/1",
            name="GigabitEthernet0/0/1",
        )
        assert port.name == "GigabitEthernet0/0/1"

    def test_reject_injection_in_port_name(self):
        with pytest.raises(ValidationError):
            DevicePortSchema(id="dev:eth0; rm -rf /", name="eth0; rm -rf /")


# =============================================================================
# Layer 1: DeviceSchema
# =============================================================================

class TestDeviceSchema:
    """Tests para validación de dispositivos."""

    def test_valid_device(self):
        device = DeviceSchema(
            id="router-01",
            name="Router Core",
            asset_type="router",
            ports=[{"id": "router-01:eth0", "name": "eth0"}],
        )
        assert device.id == "router-01"
        assert device.asset_type == AssetType.ROUTER

    def test_id_normalized_to_lowercase(self):
        device = DeviceSchema(
            id="Router-01",
            name="Router",
            asset_type="router",
            ports=[{"id": "router-01:eth0", "name": "eth0"}],
        )
        assert device.id == "router-01"

    def test_all_asset_types_accepted(self):
        """Verificar que todos los tipos de activo (IT + OT) sean válidos."""
        for asset in AssetType:
            device = DeviceSchema(
                id=f"{asset.value}-01",
                name=f"Device {asset.value}",
                asset_type=asset.value,
                ports=[{"id": f"{asset.value}-01:eth0", "name": "eth0"}],
            )
            assert device.asset_type == asset

    def test_ot_device_types_plc_hmi_rtu(self):
        """Verificar que los tipos OT específicos funcionen."""
        for ot_type in ["plc", "hmi", "rtu", "scada_server"]:
            device = DeviceSchema(
                id=f"{ot_type}-01",
                name=f"Device {ot_type}",
                asset_type=ot_type,
                ports=[{"id": f"{ot_type}-01:eth0", "name": "eth0"}],
            )
            assert device.asset_type.value == ot_type

    def test_reject_empty_ports(self):
        with pytest.raises(ValidationError):
            DeviceSchema(
                id="router-01",
                name="Router",
                asset_type="router",
                ports=[],
            )

    def test_reject_duplicate_port_names(self):
        with pytest.raises(ValidationError, match="Duplicate port names"):
            DeviceSchema(
                id="router-01",
                name="Router",
                asset_type="router",
                ports=[
                    {"id": "router-01:eth0", "name": "eth0"},
                    {"id": "router-01:eth0", "name": "eth0"},
                ],
            )

    def test_reject_port_id_prefix_mismatch(self):
        """Los IDs de puertos deben empezar con el ID del dispositivo."""
        with pytest.raises(ValidationError, match="prefix must match"):
            DeviceSchema(
                id="router-01",
                name="Router",
                asset_type="router",
                ports=[{"id": "switch-01:eth0", "name": "eth0"}],
            )

    def test_optional_rack_id(self):
        device = DeviceSchema(
            id="host-01",
            name="Host",
            asset_type="host",
            ports=[{"id": "host-01:eth0", "name": "eth0"}],
        )
        assert device.rack_id is None

    def test_criticality_default(self):
        device = DeviceSchema(
            id="plc-01",
            name="PLC Linea A",
            asset_type="plc",
            ports=[{"id": "plc-01:eth0", "name": "eth0"}],
        )
        assert device.criticality == Criticality.MEDIUM

    def test_criticality_override(self):
        device = DeviceSchema(
            id="plc-01",
            name="PLC Linea A",
            asset_type="plc",
            criticality="critical",
            ports=[{"id": "plc-01:eth0", "name": "eth0"}],
        )
        assert device.criticality == Criticality.CRITICAL

    def test_reject_invalid_asset_type(self):
        with pytest.raises(ValidationError):
            DeviceSchema(
                id="unknown-01",
                name="Unknown",
                asset_type="toaster",
                ports=[{"id": "unknown-01:eth0", "name": "eth0"}],
            )

    def test_reject_sql_injection_in_id(self):
        with pytest.raises(ValidationError):
            DeviceSchema(
                id="'; DROP TABLE devices;--",
                name="Hacked",
                asset_type="router",
                ports=[{"id": "x:eth0", "name": "eth0"}],
            )


# =============================================================================
# Layer 1: PatchPanelSchema
# =============================================================================

class TestPatchPanelSchema:
    """Tests para validación de patch panels."""

    def test_valid_patch_panel_no_ports(self):
        pp = PatchPanelSchema(
            id="pp-01", name="Patch Panel 01", rack_id="rack-01", port_count=24
        )
        assert pp.port_count == 24
        assert pp.ports == []

    def test_valid_patch_panel_with_ports(self):
        pp = PatchPanelSchema(
            id="pp-01",
            name="Patch Panel 01",
            rack_id="rack-01",
            port_count=24,
            ports=[
                {"id": "pp-01:front-1", "name": "front-1", "port_type": "front_port"},
                {"id": "pp-01:rear-1", "name": "rear-1", "port_type": "rear_port"},
            ],
        )
        assert len(pp.ports) == 2

    def test_reject_device_interface_type_on_panel(self):
        """Los puertos de patch panel no pueden ser device_interface."""
        with pytest.raises(ValidationError, match="front_port.*rear_port"):
            PatchPanelSchema(
                id="pp-01",
                name="PP",
                rack_id="rack-01",
                port_count=24,
                ports=[
                    {
                        "id": "pp-01:port-1",
                        "name": "port-1",
                        "port_type": "device_interface",
                    }
                ],
            )

    def test_reject_port_id_prefix_mismatch(self):
        with pytest.raises(ValidationError, match="prefix must match"):
            PatchPanelSchema(
                id="pp-01",
                name="PP",
                rack_id="rack-01",
                port_count=24,
                ports=[
                    {"id": "pp-99:front-1", "name": "front-1", "port_type": "front_port"}
                ],
            )

    def test_reject_port_count_zero(self):
        with pytest.raises(ValidationError):
            PatchPanelSchema(
                id="pp-01", name="PP", rack_id="rack-01", port_count=0
            )


# =============================================================================
# Layer 1: CableSchema
# =============================================================================

class TestCableSchema:
    """Tests para validación de cables."""

    def test_valid_cable(self):
        cable = CableSchema(
            id="cable-001",
            terminations=[
                {"port_id": "router-01:eth0"},
                {"port_id": "switch-01:eth0"},
            ],
        )
        assert cable.medium == CableMedium.COPPER
        assert cable.category is None

    def test_cable_with_full_metadata(self):
        cable = CableSchema(
            id="cable-fiber-01",
            label="C-R01-PP01-001",
            medium="fiber",
            category="OM4",
            length_meters=15.5,
            terminations=[
                {"port_id": "router-01:sfp0"},
                {"port_id": "switch-01:sfp0"},
            ],
        )
        assert cable.medium == CableMedium.FIBER
        assert cable.category == CableCategory.OM4
        assert cable.length_meters == 15.5

    def test_reject_self_termination(self):
        """Un cable no puede conectar un puerto consigo mismo."""
        with pytest.raises(ValidationError, match="same port"):
            CableSchema(
                id="cable-loop",
                terminations=[
                    {"port_id": "router-01:eth0"},
                    {"port_id": "router-01:eth0"},
                ],
            )

    def test_reject_single_termination(self):
        with pytest.raises(ValidationError):
            CableSchema(
                id="cable-bad",
                terminations=[{"port_id": "router-01:eth0"}],
            )

    def test_reject_three_terminations(self):
        with pytest.raises(ValidationError):
            CableSchema(
                id="cable-bad",
                terminations=[
                    {"port_id": "a:p1"},
                    {"port_id": "b:p1"},
                    {"port_id": "c:p1"},
                ],
            )

    def test_reject_termination_without_colon(self):
        with pytest.raises(ValidationError, match="owner_id:port_name"):
            CableTerminationSchema(port_id="badformat")

    def test_cable_serial_medium(self):
        cable = CableSchema(
            id="cable-serial",
            medium="serial",
            category="RS232",
            terminations=[
                {"port_id": "plc-01:com1"},
                {"port_id": "hmi-01:com1"},
            ],
        )
        assert cable.medium == CableMedium.SERIAL
        assert cable.category == CableCategory.RS232


# =============================================================================
# Layer 2: InterfaceLogicalSchema
# =============================================================================

class TestInterfaceLogicalSchema:
    """Tests para configuración lógica de interfaces."""

    def test_valid_interface_minimal(self):
        iface = InterfaceLogicalSchema(port_id="router-01:eth0")
        assert iface.mac_address is None
        assert iface.ipv4_address is None
        assert iface.mgmt_only is False
        assert iface.enabled is True

    def test_valid_interface_full(self):
        iface = InterfaceLogicalSchema(
            port_id="router-01:eth0",
            mac_address="00:1a:2b:3c:4d:5e",
            ipv4_address="192.168.1.1/24",
            ipv6_address="2001:db8::1/64",
            mgmt_only=True,
            description="Management interface",
        )
        # MAC normalizada a uppercase con colons
        assert iface.mac_address == "00:1A:2B:3C:4D:5E"

    def test_reject_invalid_mac(self):
        with pytest.raises(ValidationError, match="MAC address"):
            InterfaceLogicalSchema(
                port_id="dev:eth0", mac_address="not-a-mac"
            )

    def test_reject_invalid_ipv4(self):
        with pytest.raises(ValidationError, match="Invalid IPv4"):
            InterfaceLogicalSchema(
                port_id="dev:eth0", ipv4_address="999.999.999.999/24"
            )

    def test_ipv4_without_cidr_defaults_to_host(self):
        """IPv4 sin CIDR es válido (Python lo interpreta como /32)."""
        iface = InterfaceLogicalSchema(
            port_id="dev:eth0", ipv4_address="192.168.1.1"
        )
        assert iface.ipv4_address == "192.168.1.1"

    def test_reject_ipv4_with_invalid_octet(self):
        with pytest.raises(ValidationError, match="Invalid IPv4"):
            InterfaceLogicalSchema(
                port_id="dev:eth0", ipv4_address="192.168.1.999/24"
            )

    def test_reject_invalid_ipv6(self):
        with pytest.raises(ValidationError, match="Invalid IPv6"):
            InterfaceLogicalSchema(
                port_id="dev:eth0", ipv6_address="not:an:ipv6"
            )

    def test_reject_port_id_without_colon(self):
        with pytest.raises(ValidationError, match="device_id:port_name"):
            InterfaceLogicalSchema(port_id="badformat")

    def test_mac_hyphens_normalized_to_colons(self):
        iface = InterfaceLogicalSchema(
            port_id="dev:eth0", mac_address="AA-BB-CC-DD-EE-FF"
        )
        assert iface.mac_address == "AA:BB:CC:DD:EE:FF"


# =============================================================================
# Layer 2: VLANSchema
# =============================================================================

class TestVLANSchema:
    """Tests para validación de VLANs."""

    def test_valid_vlan(self):
        vlan = VLANSchema(id="vlan-100", vlan_id=100, name="Corporativa")
        assert vlan.vlan_id == 100
        assert vlan.assigned_interfaces == []

    def test_vlan_id_range_min(self):
        vlan = VLANSchema(id="vlan-1", vlan_id=1, name="Default")
        assert vlan.vlan_id == 1

    def test_vlan_id_range_max(self):
        vlan = VLANSchema(id="vlan-4094", vlan_id=4094, name="Max")
        assert vlan.vlan_id == 4094

    def test_reject_vlan_id_zero(self):
        with pytest.raises(ValidationError):
            VLANSchema(id="vlan-0", vlan_id=0, name="Invalid")

    def test_reject_vlan_id_4095(self):
        with pytest.raises(ValidationError):
            VLANSchema(id="vlan-4095", vlan_id=4095, name="Invalid")

    def test_vlan_with_assigned_interfaces(self):
        vlan = VLANSchema(
            id="vlan-200",
            vlan_id=200,
            name="OT Control",
            assigned_interfaces=["switch-01:eth1", "switch-01:eth2"],
        )
        assert len(vlan.assigned_interfaces) == 2

    def test_reject_duplicate_interface_assignments(self):
        with pytest.raises(ValidationError, match="Duplicate interface"):
            VLANSchema(
                id="vlan-100",
                vlan_id=100,
                name="Corp",
                assigned_interfaces=["sw:eth1", "sw:eth1"],
            )

    def test_reject_interface_ref_without_colon(self):
        with pytest.raises(ValidationError, match="device_id:port_name"):
            VLANSchema(
                id="vlan-100",
                vlan_id=100,
                name="Corp",
                assigned_interfaces=["badformat"],
            )


# =============================================================================
# Layer 3: SecurityZoneSchema
# =============================================================================

class TestSecurityZoneSchema:
    """Tests para zonas de seguridad IEC 62443."""

    def test_valid_zone(self):
        zone = SecurityZoneSchema(
            id="zone-ot",
            name="Zona OT",
            purdue_level=2,
            security_level="SL-3",
            device_ids=["plc-01", "hmi-01"],
        )
        assert zone.purdue_level == PurdueLevel.LEVEL_2
        assert zone.security_level == SecurityLevel.SL_3

    def test_zone_defaults(self):
        zone = SecurityZoneSchema(id="zone-01", name="Zona Default")
        assert zone.purdue_level is None
        assert zone.security_level == SecurityLevel.SL_1
        assert zone.device_ids == []

    def test_all_purdue_levels(self):
        for level in PurdueLevel:
            zone = SecurityZoneSchema(
                id=f"zone-l{level.value}",
                name=f"Zone Level {level.value}",
                purdue_level=level.value,
            )
            assert zone.purdue_level == level

    def test_all_security_levels(self):
        for sl in SecurityLevel:
            zone = SecurityZoneSchema(
                id=f"zone-{sl.value.lower()}",
                name=f"Zone {sl.value}",
                security_level=sl.value,
            )
            assert zone.security_level == sl

    def test_reject_duplicate_device_ids(self):
        with pytest.raises(ValidationError, match="Duplicate device"):
            SecurityZoneSchema(
                id="zone-01",
                name="Zone",
                device_ids=["plc-01", "plc-01"],
            )

    def test_reject_invalid_device_id_format(self):
        with pytest.raises(ValidationError):
            SecurityZoneSchema(
                id="zone-01",
                name="Zone",
                device_ids=["invalid device!"],
            )


# =============================================================================
# Layer 3: ConduitSchema
# =============================================================================

class TestConduitSchema:
    """Tests para conductos de comunicación entre zonas."""

    def test_valid_conduit(self):
        conduit = ConduitSchema(
            id="conduit-ot-it",
            name="OT to IT",
            source_zone_id="zone-ot",
            target_zone_id="zone-it",
            allowed_protocols=["Modbus/TCP", "OPC-UA"],
        )
        assert conduit.source_zone_id == "zone-ot"
        assert len(conduit.allowed_protocols) == 2

    def test_reject_same_zone_conduit(self):
        """Un conducto no puede conectar una zona consigo misma."""
        with pytest.raises(ValidationError, match="cannot connect zone.*to itself"):
            ConduitSchema(
                id="conduit-loop",
                name="Loop",
                source_zone_id="zone-ot",
                target_zone_id="zone-ot",
            )

    def test_conduit_defaults(self):
        conduit = ConduitSchema(
            id="conduit-01",
            name="Conduit",
            source_zone_id="zone-a",
            target_zone_id="zone-b",
        )
        assert conduit.security_level == SecurityLevel.SL_1
        assert conduit.allowed_protocols == []

    def test_reject_invalid_zone_ref(self):
        with pytest.raises(ValidationError):
            ConduitSchema(
                id="conduit-01",
                name="Conduit",
                source_zone_id="zone with spaces!",
                target_zone_id="zone-b",
            )


# =============================================================================
# TopologyCreate — Payload MVP completo
# =============================================================================

class TestTopologyCreateMVP:
    """Tests para el payload principal de topología."""

    def test_valid_mvp_topology(self):
        """El payload MVP completo con las 3 capas debe ser aceptado."""
        topology = TopologyCreate(**_mvp_topology_payload())
        assert topology.name == "mvp-lab-01"
        assert len(topology.devices) == 4
        assert len(topology.cables) == 3
        assert len(topology.interfaces) == 2
        assert len(topology.vlans) == 1
        assert len(topology.security_zones) == 2
        assert len(topology.conduits) == 1

    def test_name_normalized_to_lowercase(self):
        payload = _mvp_topology_payload()
        payload["name"] = "MVP-Lab-01"
        topology = TopologyCreate(**payload)
        assert topology.name == "mvp-lab-01"

    def test_minimal_topology_only_layer1(self):
        """Una topología mínima con solo Layer 1 (sin L2/L3) debe ser válida."""
        topology = TopologyCreate(
            name="minimal-lab",
            sites=[_minimal_site()],
            devices=[_minimal_device("host-01", "host")],
        )
        assert len(topology.devices) == 1
        assert topology.interfaces == []
        assert topology.vlans == []
        assert topology.security_zones == []


# =============================================================================
# TopologyCreate — Integridad referencial Layer 1 (jerarquía física)
# =============================================================================

class TestTopologyReferentialIntegrityL1:
    """Tests de integridad referencial para la jerarquía física."""

    def test_reject_room_referencing_nonexistent_site(self):
        with pytest.raises(ValidationError, match="does not exist in topology sites"):
            TopologyCreate(
                name="bad-lab",
                sites=[_minimal_site("site-a")],
                rooms=[_minimal_room("room-01", site_id="site-nonexistent")],
                devices=[_minimal_device()],
            )

    def test_reject_rack_referencing_nonexistent_room(self):
        with pytest.raises(ValidationError, match="does not exist in topology rooms"):
            TopologyCreate(
                name="bad-lab",
                sites=[_minimal_site()],
                rooms=[_minimal_room()],
                racks=[_minimal_rack("rack-01", room_id="room-nonexistent")],
                devices=[_minimal_device()],
            )

    def test_reject_device_referencing_nonexistent_rack(self):
        with pytest.raises(
            ValidationError, match="does not exist in topology racks"
        ):
            TopologyCreate(
                name="bad-lab",
                sites=[_minimal_site()],
                rooms=[_minimal_room()],
                racks=[_minimal_rack()],
                devices=[
                    _minimal_device("router-01", "router", rack_id="rack-ghost")
                ],
            )

    def test_device_without_rack_is_valid(self):
        """Dispositivos sin rack_id son válidos (ej: hosts sueltos)."""
        topology = TopologyCreate(
            name="no-rack-lab",
            sites=[_minimal_site()],
            devices=[_minimal_device("host-01", "host")],
        )
        assert topology.devices[0].rack_id is None

    def test_reject_panel_referencing_nonexistent_rack(self):
        with pytest.raises(ValidationError, match="does not exist in topology racks"):
            TopologyCreate(
                name="bad-lab",
                sites=[_minimal_site()],
                rooms=[_minimal_room()],
                racks=[_minimal_rack()],
                devices=[_minimal_device()],
                patch_panels=[
                    {
                        "id": "pp-01",
                        "name": "Panel",
                        "rack_id": "rack-ghost",
                        "port_count": 24,
                    }
                ],
            )


# =============================================================================
# TopologyCreate — Integridad referencial Cables y puertos
# =============================================================================

class TestTopologyReferentialCables:
    """Tests de integridad referencial para cables."""

    def test_reject_cable_to_nonexistent_port(self):
        with pytest.raises(
            ValidationError, match="does not exist in any device or patch panel"
        ):
            TopologyCreate(
                name="bad-cable-lab",
                sites=[_minimal_site()],
                devices=[
                    _minimal_device("router-01", "router"),
                    _minimal_device("switch-01", "switch"),
                ],
                cables=[
                    _minimal_cable("c-01", "router-01:eth0", "switch-01:eth99")
                ],
            )

    def test_reject_duplicate_cables(self):
        """Dos cables con las mismas terminaciones deben rechazarse."""
        with pytest.raises(ValidationError, match="duplicate cable"):
            TopologyCreate(
                name="dupe-cable-lab",
                sites=[_minimal_site()],
                devices=[
                    _minimal_device(
                        "router-01", "router",
                        [
                            {"id": "router-01:eth0", "name": "eth0"},
                            {"id": "router-01:eth1", "name": "eth1"},
                        ],
                    ),
                    _minimal_device("switch-01", "switch"),
                ],
                cables=[
                    _minimal_cable("c-01", "router-01:eth0", "switch-01:eth0"),
                    _minimal_cable("c-02", "router-01:eth0", "switch-01:eth0"),
                ],
            )

    def test_reject_duplicate_cables_reversed(self):
        """A->B y B->A deben detectarse como cables duplicados."""
        with pytest.raises(ValidationError, match="duplicate cable"):
            TopologyCreate(
                name="rev-cable-lab",
                sites=[_minimal_site()],
                devices=[
                    _minimal_device(
                        "router-01", "router",
                        [
                            {"id": "router-01:eth0", "name": "eth0"},
                            {"id": "router-01:eth1", "name": "eth1"},
                        ],
                    ),
                    _minimal_device("switch-01", "switch"),
                ],
                cables=[
                    _minimal_cable("c-01", "router-01:eth0", "switch-01:eth0"),
                    _minimal_cable("c-02", "switch-01:eth0", "router-01:eth0"),
                ],
            )


# =============================================================================
# TopologyCreate — Integridad referencial Layer 2 (lógica)
# =============================================================================

class TestTopologyReferentialIntegrityL2:
    """Tests de integridad referencial para Layer 2."""

    def test_reject_interface_referencing_nonexistent_port(self):
        with pytest.raises(
            ValidationError, match="non-existent device port"
        ):
            TopologyCreate(
                name="bad-iface-lab",
                sites=[_minimal_site()],
                devices=[_minimal_device()],
                interfaces=[{"port_id": "router-01:eth99"}],
            )

    def test_reject_vlan_referencing_nonexistent_port(self):
        with pytest.raises(
            ValidationError, match="does not exist as a device port"
        ):
            TopologyCreate(
                name="bad-vlan-lab",
                sites=[_minimal_site()],
                devices=[_minimal_device()],
                vlans=[
                    {
                        "id": "vlan-100",
                        "vlan_id": 100,
                        "name": "Corp",
                        "assigned_interfaces": ["router-01:eth99"],
                    }
                ],
            )


# =============================================================================
# TopologyCreate — Integridad referencial Layer 3 (seguridad OT)
# =============================================================================

class TestTopologyReferentialIntegrityL3:
    """Tests de integridad referencial para Layer 3."""

    def test_reject_zone_referencing_nonexistent_device(self):
        with pytest.raises(
            ValidationError, match="does not exist in topology devices"
        ):
            TopologyCreate(
                name="bad-zone-lab",
                sites=[_minimal_site()],
                devices=[_minimal_device()],
                security_zones=[
                    {
                        "id": "zone-01",
                        "name": "Zone",
                        "device_ids": ["ghost-device"],
                    }
                ],
            )

    def test_reject_conduit_referencing_nonexistent_zone(self):
        with pytest.raises(
            ValidationError, match="does not exist in topology security zones"
        ):
            TopologyCreate(
                name="bad-conduit-lab",
                sites=[_minimal_site()],
                devices=[_minimal_device()],
                security_zones=[
                    {"id": "zone-a", "name": "Zone A"},
                ],
                conduits=[
                    {
                        "id": "conduit-01",
                        "name": "Bad Conduit",
                        "source_zone_id": "zone-a",
                        "target_zone_id": "zone-nonexistent",
                    }
                ],
            )


# =============================================================================
# TopologyCreate — IDs duplicados
# =============================================================================

class TestTopologyDuplicateIDs:
    """Tests para detección de IDs duplicados entre colecciones."""

    def test_reject_duplicate_device_ids(self):
        with pytest.raises(ValidationError, match="Duplicate Device IDs"):
            TopologyCreate(
                name="dupe-lab",
                sites=[_minimal_site()],
                devices=[
                    _minimal_device("router-01", "router"),
                    _minimal_device("router-01", "switch"),
                ],
            )

    def test_reject_duplicate_site_ids(self):
        with pytest.raises(ValidationError, match="Duplicate Site IDs"):
            TopologyCreate(
                name="dupe-site-lab",
                sites=[_minimal_site("site-a"), _minimal_site("site-a")],
                devices=[_minimal_device()],
            )

    def test_reject_duplicate_cable_ids(self):
        with pytest.raises(ValidationError, match="Duplicate Cable IDs"):
            TopologyCreate(
                name="dupe-cable-lab",
                sites=[_minimal_site()],
                devices=[
                    _minimal_device(
                        "router-01", "router",
                        [
                            {"id": "router-01:eth0", "name": "eth0"},
                            {"id": "router-01:eth1", "name": "eth1"},
                        ],
                    ),
                    _minimal_device("switch-01", "switch"),
                ],
                cables=[
                    _minimal_cable("cable-001", "router-01:eth0", "switch-01:eth0"),
                    _minimal_cable("cable-001", "router-01:eth1", "switch-01:eth0"),
                ],
            )


# =============================================================================
# Seguridad — Inyección y abuso de payload
# =============================================================================

class TestSecurityInjection:
    """Tests de seguridad contra inyección y abuso."""

    def test_reject_sql_injection_in_topology_name(self):
        with pytest.raises(ValidationError):
            TopologyCreate(
                name="'; DROP TABLE topologies;--",
                sites=[_minimal_site()],
                devices=[_minimal_device()],
            )

    def test_reject_xss_in_device_id(self):
        with pytest.raises(ValidationError):
            DeviceSchema(
                id="<script>alert(1)</script>",
                name="Bad Device",
                asset_type="router",
                ports=[{"id": "x:eth0", "name": "eth0"}],
            )

    def test_reject_xss_in_site_name(self):
        with pytest.raises(ValidationError):
            SiteSchema(id="site-01", name="<img onerror=alert(1)>")

    def test_reject_command_injection_in_port_name(self):
        with pytest.raises(ValidationError):
            DevicePortSchema(id="dev:$(whoami)", name="$(whoami)")

    def test_reject_oversized_topology_name(self):
        with pytest.raises(ValidationError):
            TopologyCreate(
                name="a" * 200,
                sites=[_minimal_site()],
                devices=[_minimal_device()],
            )


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
