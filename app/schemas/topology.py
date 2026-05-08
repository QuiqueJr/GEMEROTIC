"""
Schema raíz de topología — une las 3 capas del modelo de datos.

Importa los modelos de physical.py (Layer 1), logical.py (Layer 2) y
ot_security.py (Layer 3) para componer el payload completo de una
topología. Incluye validaciones de integridad referencial entre capas.
"""


from pydantic import BaseModel, Field, field_validator, model_validator

# --- Layer 2: Conectividad Lógica ---
from app.schemas.logical import (
    InterfaceLogicalSchema,
    VLANSchema,
)

# --- Layer 3: Seguridad y Segmentación OT ---
from app.schemas.ot_security import (
    ConduitSchema,
    PurdueLevel,
    SecurityLevel,
    SecurityZoneSchema,
)

# --- Layer 1: Infraestructura Física ---
from app.schemas.physical import (
    AssetType,
    CableCategory,
    CableMedium,
    CableSchema,
    Criticality,
    DevicePortSchema,
    DeviceSchema,
    PatchPanelSchema,
    PortType,
    RackSchema,
    RackType,
    RoomSchema,
    SiteSchema,
)
from app.schemas.validators import find_duplicates, validate_slug

# Re-exportar para que se puedan importar desde topology.py directamente
__all__ = [
    # Enums
    "AssetType",
    "CableCategory",
    "CableMedium",
    "Criticality",
    "PortType",
    "PurdueLevel",
    "RackType",
    "SecurityLevel",
    # Layer 1
    "SiteSchema",
    "RoomSchema",
    "RackSchema",
    "DevicePortSchema",
    "DeviceSchema",
    "PatchPanelSchema",
    "CableSchema",
    # Layer 2
    "InterfaceLogicalSchema",
    "VLANSchema",
    # Layer 3
    "SecurityZoneSchema",
    "ConduitSchema",
    # UI canvas
    "CanvasPositionSchema",
    "CanvasAssetSchema",
    "CanvasCableSchema",
    "CanvasTopologySchema",
    # Root
    "TopologyCreate",
]


class CanvasPositionSchema(BaseModel):
    """Coordenadas visuales de un elemento del builder."""

    x: float = Field(..., ge=-100000, le=100000)
    y: float = Field(..., ge=-100000, le=100000)


class CanvasAssetSchema(BaseModel):
    """Activo representado en el canvas sin mezclarlo con NetBox."""

    id: str = Field(..., min_length=1, max_length=64)
    asset_type: AssetType = Field(...)
    label: str = Field(..., min_length=1, max_length=128)
    position: CanvasPositionSchema = Field(...)
    width: float | None = Field(default=None, ge=1, le=2000)
    height: float | None = Field(default=None, ge=1, le=2000)

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        """Sanitizar ID visual de activo."""
        return validate_slug(value, "Canvas asset ID")


class CanvasCableSchema(BaseModel):
    """Cable visual con extremos y puertos elegidos en la UI."""

    id: str = Field(..., min_length=1, max_length=64)
    source_device_id: str = Field(..., min_length=1, max_length=64)
    target_device_id: str = Field(..., min_length=1, max_length=64)
    source_port_id: str | None = Field(default=None, max_length=128)
    target_port_id: str | None = Field(default=None, max_length=128)

    @field_validator("id", "source_device_id", "target_device_id")
    @classmethod
    def validate_slug_fields(cls, value: str) -> str:
        """Sanitizar IDs visuales relacionados con cables."""
        return validate_slug(value, "Canvas cable field")


class CanvasTopologySchema(BaseModel):
    """Estado visual opcional usado para reconstruir el builder."""

    assets: list[CanvasAssetSchema] = Field(default_factory=list)
    cables: list[CanvasCableSchema] = Field(default_factory=list)


class TopologyCreate(BaseModel):
    """
    Payload principal para crear una topología completa.

    Estructura de 3 capas:
      - Layer 1 (Física): sites, rooms, racks, devices, patch_panels, cables
      - Layer 2 (Lógica): interfaces, vlans
      - Layer 3 (Seguridad OT): security_zones, conduits

    Todos los campos de Layer 2 y Layer 3 son opcionales para mantener
    el MVP simple, pero el schema está preparado para payloads enterprise.
    """

    # --- Metadatos de la topología ---
    name: str = Field(
        ..., min_length=1, max_length=128,
        examples=["mvp-lab-01"],
    )
    description: str | None = Field(
        default=None, max_length=512,
    )

    # --- Layer 1: Infraestructura Física ---
    sites: list[SiteSchema] = Field(
        ..., min_length=1,
        description="Sitios físicos (mínimo 1)",
    )
    rooms: list[RoomSchema] = Field(
        default_factory=list,
        description="Salas/áreas dentro de los sitios",
    )
    racks: list[RackSchema] = Field(
        default_factory=list,
        description="Racks de equipamiento",
    )
    devices: list[DeviceSchema] = Field(
        ..., min_length=1,
        description="Dispositivos de red y activos OT (mínimo 1)",
    )
    patch_panels: list[PatchPanelSchema] = Field(
        default_factory=list,
        description="Patch panels para cableado estructurado",
    )
    cables: list[CableSchema] = Field(
        default_factory=list,
        description="Cables físicos punto a punto",
    )

    # --- Layer 2: Conectividad Lógica ---
    interfaces: list[InterfaceLogicalSchema] = Field(
        default_factory=list,
        description="Configuración lógica de interfaces (IP, MAC)",
    )
    vlans: list[VLANSchema] = Field(
        default_factory=list,
        description="VLANs para segmentación de red",
    )

    # --- Layer 3: Seguridad y Segmentación OT ---
    security_zones: list[SecurityZoneSchema] = Field(
        default_factory=list,
        description="Zonas de seguridad IEC 62443",
    )
    conduits: list[ConduitSchema] = Field(
        default_factory=list,
        description="Conductos de comunicación entre zonas",
    )

    # --- Estado visual del builder ---
    canvas: CanvasTopologySchema | None = Field(
        default=None,
        description="Coordenadas y metadatos visuales del canvas UI",
    )

    # =========================================================================
    # Validadores de campo
    # =========================================================================

    @field_validator("name")
    @classmethod
    def validate_topology_name(cls, v: str) -> str:
        """Sanitizar nombre de topología."""
        return validate_slug(v, "Topology name")

    # =========================================================================
    # Validadores de integridad referencial — IDs únicos
    # =========================================================================

    @model_validator(mode="after")
    def validate_unique_ids_across_topology(self) -> "TopologyCreate":
        """Verificar que no haya IDs duplicados dentro de cada colección."""
        checks: list[tuple[str, list[str]]] = [
            ("Site", [s.id for s in self.sites]),
            ("Room", [r.id for r in self.rooms]),
            ("Rack", [r.id for r in self.racks]),
            ("Device", [d.id for d in self.devices]),
            ("Patch panel", [p.id for p in self.patch_panels]),
            ("Cable", [c.id for c in self.cables]),
            ("VLAN", [v.id for v in self.vlans]),
            ("Security zone", [z.id for z in self.security_zones]),
            ("Conduit", [c.id for c in self.conduits]),
        ]
        for label, ids in checks:
            dupes = find_duplicates(ids)
            if dupes:
                raise ValueError(
                    f"Duplicate {label} IDs: {', '.join(sorted(dupes))}"
                )
        return self

    # =========================================================================
    # Validadores de integridad referencial — Layer 1 (jerarquía física)
    # =========================================================================

    @model_validator(mode="after")
    def validate_rooms_reference_sites(self) -> "TopologyCreate":
        """Verificar que cada sala referencie un sitio existente."""
        site_ids = {s.id for s in self.sites}
        for room in self.rooms:
            if room.site_id not in site_ids:
                raise ValueError(
                    f"Room '{room.id}': site_id '{room.site_id}' "
                    f"does not exist in topology sites"
                )
        return self

    @model_validator(mode="after")
    def validate_racks_reference_rooms(self) -> "TopologyCreate":
        """Verificar que cada rack referencie una sala existente."""
        room_ids = {r.id for r in self.rooms}
        for rack in self.racks:
            if rack.room_id not in room_ids:
                raise ValueError(
                    f"Rack '{rack.id}': room_id '{rack.room_id}' "
                    f"does not exist in topology rooms"
                )
        return self

    @model_validator(mode="after")
    def validate_devices_reference_racks(self) -> "TopologyCreate":
        """
        Verificar que los dispositivos montados en rack referencien
        racks existentes.
        """
        rack_ids = {r.id for r in self.racks}
        for device in self.devices:
            if device.rack_id is not None and device.rack_id not in rack_ids:
                raise ValueError(
                    f"Device '{device.id}': rack_id '{device.rack_id}' "
                    f"does not exist in topology racks"
                )
        return self

    @model_validator(mode="after")
    def validate_panels_reference_racks(self) -> "TopologyCreate":
        """Verificar que los patch panels referencien racks existentes."""
        rack_ids = {r.id for r in self.racks}
        for panel in self.patch_panels:
            if panel.rack_id not in rack_ids:
                raise ValueError(
                    f"Patch panel '{panel.id}': rack_id '{panel.rack_id}' "
                    f"does not exist in topology racks"
                )
        return self

    # =========================================================================
    # Validadores de integridad referencial — Cables y puertos
    # =========================================================================

    @model_validator(mode="after")
    def validate_cable_terminations_exist(self) -> "TopologyCreate":
        """
        Verificar que cada terminación de cable referencie un puerto existente
        (ya sea de un dispositivo o de un patch panel).
        """
        # Construir índice global de puertos válidos
        valid_port_ids: set[str] = set()
        for device in self.devices:
            for port in device.ports:
                valid_port_ids.add(port.id)
        for panel in self.patch_panels:
            for port in panel.ports:
                valid_port_ids.add(port.id)

        for cable in self.cables:
            for term in cable.terminations:
                if term.port_id not in valid_port_ids:
                    raise ValueError(
                        f"Cable '{cable.id}': termination port "
                        f"'{term.port_id}' does not exist in any "
                        f"device or patch panel"
                    )
        return self

    @model_validator(mode="after")
    def validate_no_duplicate_cables(self) -> "TopologyCreate":
        """Impedir cables duplicados (mismas terminaciones en cualquier orden)."""
        seen: set[tuple[str, ...]] = set()
        for cable in self.cables:
            endpoints: tuple[str, ...] = tuple(
                sorted(t.port_id for t in cable.terminations)
            )
            if endpoints in seen:
                raise ValueError(
                    f"Cable '{cable.id}': duplicate cable between "
                    f"'{cable.terminations[0].port_id}' and "
                    f"'{cable.terminations[1].port_id}'"
                )
            seen.add(endpoints)
        return self

    @model_validator(mode="after")
    def validate_cable_ports_are_single_use(self) -> "TopologyCreate":
        """Impedir que un puerto físico aparezca en más de un cable."""
        port_usage: dict[str, str] = {}
        for cable in self.cables:
            for termination in cable.terminations:
                previous_cable_id = port_usage.get(termination.port_id)
                if previous_cable_id is not None:
                    raise ValueError(
                        f"Cable '{cable.id}': termination port "
                        f"'{termination.port_id}' is already used by cable "
                        f"'{previous_cable_id}'"
                    )
                port_usage[termination.port_id] = cable.id
        return self

    # =========================================================================
    # Validadores de integridad referencial — Layer 2 (lógica)
    # =========================================================================

    @model_validator(mode="after")
    def validate_interfaces_reference_ports(self) -> "TopologyCreate":
        """Verificar que cada interfaz lógica referencie un puerto físico existente."""
        valid_port_ids: set[str] = set()
        for device in self.devices:
            for port in device.ports:
                valid_port_ids.add(port.id)

        for iface in self.interfaces:
            if iface.port_id not in valid_port_ids:
                raise ValueError(
                    f"Interface config for port '{iface.port_id}' "
                    f"references a non-existent device port"
                )
        return self

    @model_validator(mode="after")
    def validate_vlans_reference_ports(self) -> "TopologyCreate":
        """Verificar que las interfaces asignadas a VLANs existan como puertos."""
        valid_port_ids: set[str] = set()
        for device in self.devices:
            for port in device.ports:
                valid_port_ids.add(port.id)

        for vlan in self.vlans:
            for ref in vlan.assigned_interfaces:
                if ref not in valid_port_ids:
                    raise ValueError(
                        f"VLAN '{vlan.id}': assigned interface '{ref}' "
                        f"does not exist as a device port"
                    )
        return self

    # =========================================================================
    # Validadores de integridad referencial — Layer 3 (seguridad OT)
    # =========================================================================

    @model_validator(mode="after")
    def validate_zones_reference_devices(self) -> "TopologyCreate":
        """Verificar que los dispositivos asignados a zonas existan."""
        device_ids = {d.id for d in self.devices}
        for zone in self.security_zones:
            for dev_id in zone.device_ids:
                if dev_id not in device_ids:
                    raise ValueError(
                        f"Security zone '{zone.id}': device '{dev_id}' "
                        f"does not exist in topology devices"
                    )
        return self

    @model_validator(mode="after")
    def validate_conduits_reference_zones(self) -> "TopologyCreate":
        """Verificar que los conductos referencien zonas existentes."""
        zone_ids = {z.id for z in self.security_zones}
        for conduit in self.conduits:
            if conduit.source_zone_id not in zone_ids:
                raise ValueError(
                    f"Conduit '{conduit.id}': source_zone_id "
                    f"'{conduit.source_zone_id}' does not exist "
                    f"in topology security zones"
                )
            if conduit.target_zone_id not in zone_ids:
                raise ValueError(
                    f"Conduit '{conduit.id}': target_zone_id "
                    f"'{conduit.target_zone_id}' does not exist "
                    f"in topology security zones"
                )
        return self
