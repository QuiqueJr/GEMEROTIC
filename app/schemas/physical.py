"""
Layer 1: Infraestructura Física (ISO 11801, TIA-606-C)

Define la capa física del modelo de datos: ubicaciones, racks, dispositivos,
patch panels, puertos y cableado. Mapea directamente a objetos de NetBox
(Sites, Racks, Devices, Cables, etc.).
"""

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.validators import (
    find_duplicates,
    validate_interface_name,
    validate_label,
    validate_slug,
)

# =============================================================================
# Enums — Layer 1
# =============================================================================

class AssetType(StrEnum):
    """Tipos de activo de red/OT soportados. Extensible para futuras fases."""
    ROUTER = "router"
    SWITCH = "switch"
    FIREWALL = "firewall"
    HOST = "host"
    SERVER = "server"
    PLC = "plc"
    HMI = "hmi"
    RTU = "rtu"
    SCADA_SERVER = "scada_server"
    PATCH_PANEL = "patch_panel"
    WIRELESS_AP = "wireless_ap"


class RackType(StrEnum):
    """Tipos de rack según uso."""
    NETWORK = "network"
    SERVER = "server"
    OT = "ot"
    PATCH = "patch"
    MIXED = "mixed"


class CableMedium(StrEnum):
    """Medio físico del cable (ISO 11801)."""
    COPPER = "copper"
    FIBER = "fiber"
    SERIAL = "serial"
    COAXIAL = "coaxial"


class CableCategory(StrEnum):
    """Categoría del cable según estándar (ISO 11801 / TIA-568)."""
    CAT5E = "Cat5e"
    CAT6 = "Cat6"
    CAT6A = "Cat6A"
    CAT7 = "Cat7"
    CAT8 = "Cat8"
    OM3 = "OM3"
    OM4 = "OM4"
    OS2 = "OS2"
    RS232 = "RS232"
    RS485 = "RS485"


class PortType(StrEnum):
    """Tipo de puerto/terminación."""
    DEVICE_INTERFACE = "device_interface"
    FRONT_PORT = "front_port"
    REAR_PORT = "rear_port"


class Criticality(StrEnum):
    """Nivel de criticidad del activo (alineado con NIS2 y análisis de riesgo)."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# =============================================================================
# Modelos — Ubicaciones
# =============================================================================

class SiteSchema(BaseModel):
    """Sitio físico (planta, edificio, campus)."""

    id: str = Field(
        ..., min_length=1, max_length=64,
        examples=["site-main"],
    )
    name: str = Field(
        ..., min_length=1, max_length=128,
        examples=["Planta Industrial Norte"],
    )
    description: str | None = Field(
        default=None, max_length=256,
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        """Sanitizar ID de sitio."""
        return validate_slug(v, "Site ID")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validar nombre descriptivo del sitio."""
        return validate_label(v, "Site name")


class RoomSchema(BaseModel):
    """Sala o área dentro de un sitio (cuarto de servidores, sala de control, etc.)."""

    id: str = Field(
        ..., min_length=1, max_length=64,
        examples=["room-serverroom-01"],
    )
    name: str = Field(
        ..., min_length=1, max_length=128,
        examples=["Cuarto de Servidores Principal"],
    )
    site_id: str = Field(
        ..., min_length=1, max_length=64,
        description="Referencia al sitio que contiene esta sala",
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        return validate_slug(v, "Room ID")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return validate_label(v, "Room name")

    @field_validator("site_id")
    @classmethod
    def validate_site_id(cls, v: str) -> str:
        return validate_slug(v, "Room site_id")


class RackSchema(BaseModel):
    """Rack de equipamiento (gabinete estándar 19')."""

    id: str = Field(
        ..., min_length=1, max_length=64,
        examples=["rack-net-01"],
    )
    name: str = Field(
        ..., min_length=1, max_length=128,
        examples=["Rack Red Principal"],
    )
    room_id: str = Field(
        ..., min_length=1, max_length=64,
        description="Referencia a la sala que contiene este rack",
    )
    height_ru: int = Field(
        default=42, ge=1, le=60,
        description="Altura del rack en unidades de rack (RU)",
    )
    rack_type: RackType = Field(
        default=RackType.MIXED,
        description="Tipo de rack según su uso principal",
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        return validate_slug(v, "Rack ID")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return validate_label(v, "Rack name")

    @field_validator("room_id")
    @classmethod
    def validate_room_id(cls, v: str) -> str:
        return validate_slug(v, "Rack room_id")


# =============================================================================
# Modelos — Puertos
# =============================================================================

class DevicePortSchema(BaseModel):
    """Puerto/interfaz física de un dispositivo."""

    id: str = Field(
        ..., min_length=1, max_length=128,
        description="ID único global del puerto (formato: device_id:port_name)",
        examples=["router-01:eth0"],
    )
    name: str = Field(
        ..., min_length=1, max_length=64,
        examples=["eth0", "GigabitEthernet0/0/1"],
    )
    port_type: PortType = Field(
        default=PortType.DEVICE_INTERFACE,
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Permitir nomenclatura estándar de interfaces de red."""
        return validate_interface_name(v)

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        """Validar formato de ID de puerto (device_id:port_name)."""
        if ":" not in v:
            raise ValueError(
                "Port ID must use format 'device_id:port_name' "
                "(e.g., 'router-01:eth0')"
            )
        return v


# =============================================================================
# Modelos — Dispositivos
# =============================================================================

class DeviceSchema(BaseModel):
    """
    Dispositivo de red o activo OT.
    Mapea a un Device de NetBox con campos adicionales para OT/compliance.
    """

    id: str = Field(
        ..., min_length=1, max_length=64,
        examples=["router-01", "plc-line-a"],
    )
    name: str = Field(
        ..., min_length=1, max_length=128,
        examples=["Router Core Principal"],
    )
    asset_type: AssetType = Field(
        ...,
        description="Tipo de activo (determina rol en NetBox)",
    )
    rack_id: str | None = Field(
        default=None, max_length=64,
        description="Rack donde está montado (opcional para hosts sin rack)",
    )
    rack_position: int | None = Field(
        default=None, ge=1, le=60,
        description="Posición en unidades de rack (RU) dentro del rack",
    )
    manufacturer: str | None = Field(
        default=None, max_length=128,
        examples=["Cisco", "Siemens", "Allen-Bradley"],
    )
    model: str | None = Field(
        default=None, max_length=128,
        examples=["ISR 4321", "S7-1500"],
    )
    firmware_version: str | None = Field(
        default=None, max_length=64,
        examples=["16.9.4", "V2.8.3"],
    )
    serial_number: str | None = Field(
        default=None, max_length=128,
    )
    criticality: Criticality = Field(
        default=Criticality.MEDIUM,
        description="Nivel de criticidad para análisis de riesgo (NIS2)",
    )
    ports: list[DevicePortSchema] = Field(
        ..., min_length=1,
        description="Puertos/interfaces físicas del dispositivo (mínimo 1)",
    )
    config: dict[str, Any] = Field(
        default_factory=dict,
        description="Configuración granular opcional usada por IaC y runtime",
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        return validate_slug(v, "Device ID")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return validate_label(v, "Device name")

    @field_validator("rack_id")
    @classmethod
    def validate_rack_id(cls, v: str | None) -> str | None:
        if v is not None:
            return validate_slug(v, "Device rack_id")
        return v

    @model_validator(mode="after")
    def validate_unique_port_names(self) -> "DeviceSchema":
        """Rechazar puertos con nombres duplicados dentro del mismo dispositivo."""
        names = [p.name for p in self.ports]
        dupes = find_duplicates(names)
        if dupes:
            raise ValueError(
                f"Duplicate port names in device '{self.id}': "
                f"{', '.join(sorted(dupes))}"
            )
        return self

    @model_validator(mode="after")
    def validate_port_ids_match_device(self) -> "DeviceSchema":
        """Verificar que los IDs de puertos usen el ID del dispositivo como prefijo."""
        for port in self.ports:
            prefix = port.id.split(":")[0]
            if prefix != self.id:
                raise ValueError(
                    f"Port '{port.id}' prefix must match device ID '{self.id}' "
                    f"(expected '{self.id}:{port.name}')"
                )
        return self


# =============================================================================
# Modelos — Patch Panels
# =============================================================================

class PatchPanelPortSchema(BaseModel):
    """Puerto individual de un patch panel (frente o trasero)."""

    id: str = Field(
        ..., min_length=1, max_length=128,
        examples=["pp-01:front-1", "pp-01:rear-1"],
    )
    name: str = Field(
        ..., min_length=1, max_length=64,
        examples=["front-1", "rear-1"],
    )
    port_type: PortType = Field(
        ...,
        description="Tipo de puerto: front_port o rear_port",
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if ":" not in v:
            raise ValueError(
                "Patch panel port ID must use format 'panel_id:port_name'"
            )
        return v

    @field_validator("port_type")
    @classmethod
    def validate_port_type(cls, v: PortType) -> PortType:
        """Solo permitir front_port y rear_port en patch panels."""
        if v == PortType.DEVICE_INTERFACE:
            raise ValueError(
                "Patch panel ports must be 'front_port' or 'rear_port', "
                "not 'device_interface'"
            )
        return v


class PatchPanelSchema(BaseModel):
    """
    Patch panel para distribución de cableado estructurado.
    Soporta puertos frontales y traseros (TIA-606-C).
    """

    id: str = Field(
        ..., min_length=1, max_length=64,
        examples=["pp-01"],
    )
    name: str = Field(
        ..., min_length=1, max_length=128,
        examples=["Patch Panel Rack 01"],
    )
    rack_id: str = Field(
        ..., min_length=1, max_length=64,
        description="Rack donde está montado el patch panel",
    )
    port_count: int = Field(
        ..., ge=1, le=96,
        description="Número total de puertos del panel",
    )
    ports: list[PatchPanelPortSchema] = Field(
        default_factory=list,
        description="Puertos definidos del patch panel (pueden ser parciales)",
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        return validate_slug(v, "Patch panel ID")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return validate_label(v, "Patch panel name")

    @field_validator("rack_id")
    @classmethod
    def validate_rack_id(cls, v: str) -> str:
        return validate_slug(v, "Patch panel rack_id")

    @model_validator(mode="after")
    def validate_port_ids_match_panel(self) -> "PatchPanelSchema":
        """Verificar que los IDs de puertos referencien este panel."""
        for port in self.ports:
            prefix = port.id.split(":")[0]
            if prefix != self.id:
                raise ValueError(
                    f"Port '{port.id}' prefix must match panel ID '{self.id}'"
                )
        return self


# =============================================================================
# Modelos — Cableado
# =============================================================================

class CableTerminationSchema(BaseModel):
    """
    Punto de terminación de un cable.
    Referencia un puerto por su ID global (device_id:port o panel_id:port).
    """

    port_id: str = Field(
        ..., min_length=1, max_length=128,
        description="ID del puerto al que se conecta (formato: owner_id:port_name)",
        examples=["router-01:eth0", "pp-01:rear-1"],
    )

    @field_validator("port_id")
    @classmethod
    def validate_port_id(cls, v: str) -> str:
        if ":" not in v:
            raise ValueError(
                "Termination port_id must use format 'owner_id:port_name'"
            )
        return v


class CableSchema(BaseModel):
    """
    Cable físico punto a punto con exactamente dos terminaciones.
    Soporta rutas complejas: Device -> Panel -> Cable -> Panel -> Device.
    """

    id: str = Field(
        ..., min_length=1, max_length=64,
        examples=["cable-001"],
    )
    label: str | None = Field(
        default=None, max_length=128,
        description="Etiqueta física del cable (TIA-606-C)",
        examples=["C-R01-PP01-001"],
    )
    medium: CableMedium = Field(
        default=CableMedium.COPPER,
        description="Medio físico del cable",
    )
    category: CableCategory | None = Field(
        default=None,
        description="Categoría del cable según estándar",
    )
    length_meters: float | None = Field(
        default=None, gt=0, le=10000,
        description="Longitud del cable en metros",
    )
    terminations: list[CableTerminationSchema] = Field(
        ..., min_length=2, max_length=2,
        description="Exactamente dos puntos de terminación (punto a punto)",
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        return validate_slug(v, "Cable ID")

    @model_validator(mode="after")
    def validate_no_self_termination(self) -> "CableSchema":
        """Impedir que un cable conecte un puerto consigo mismo."""
        if self.terminations[0].port_id == self.terminations[1].port_id:
            raise ValueError(
                f"Cable '{self.id}' cannot terminate on the same port "
                f"at both ends: '{self.terminations[0].port_id}'"
            )
        return self
