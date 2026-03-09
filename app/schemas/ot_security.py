"""
Layer 3: Seguridad y Segmentación OT (IEC 62443, Modelo Purdue, NIS2)

Define metadata de seguridad que se puede aplicar a dispositivos, racks
o interfaces. Incluye niveles Purdue, zonas IEC 62443 y conductos
de comunicación entre zonas.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.validators import find_duplicates, validate_label, validate_slug


# =============================================================================
# Enums — Layer 3
# =============================================================================

class PurdueLevel(int, Enum):
    """
    Niveles del Modelo Purdue (ISA-95 / IEC 62443).

    Nivel 0: Proceso físico (sensores, actuadores)
    Nivel 1: Control básico (PLCs, RTUs)
    Nivel 2: Supervisión de área (HMI, SCADA local)
    Nivel 3: Operaciones de manufactura (MES, historiador)
    Nivel 4: Planificación empresarial (ERP, IT corporativa)
    Nivel 5: Red empresarial / DMZ / Internet
    """
    LEVEL_0 = 0
    LEVEL_1 = 1
    LEVEL_2 = 2
    LEVEL_3 = 3
    LEVEL_4 = 4
    LEVEL_5 = 5


class SecurityLevel(str, Enum):
    """
    Niveles de seguridad IEC 62443-3-3 (SL).
    Define la capacidad de seguridad requerida para una zona.
    """
    SL_0 = "SL-0"
    SL_1 = "SL-1"
    SL_2 = "SL-2"
    SL_3 = "SL-3"
    SL_4 = "SL-4"


# =============================================================================
# Modelos — Zonas IEC 62443
# =============================================================================

class SecurityZoneSchema(BaseModel):
    """
    Zona de seguridad según IEC 62443.
    Agrupa activos con requisitos de seguridad similares.
    """

    id: str = Field(
        ..., min_length=1, max_length=64,
        examples=["zone-ot-control"],
    )
    name: str = Field(
        ..., min_length=1, max_length=128,
        examples=["Zona Control OT"],
    )
    purdue_level: Optional[PurdueLevel] = Field(
        default=None,
        description="Nivel Purdue predominante de esta zona",
    )
    security_level: SecurityLevel = Field(
        default=SecurityLevel.SL_1,
        description="Nivel de seguridad objetivo (SL-T) según IEC 62443-3-3",
    )
    description: Optional[str] = Field(
        default=None, max_length=256,
    )
    device_ids: list[str] = Field(
        default_factory=list,
        description="Dispositivos pertenecientes a esta zona (por ID)",
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        return validate_slug(v, "Security zone ID")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return validate_label(v, "Security zone name")

    @field_validator("device_ids")
    @classmethod
    def validate_device_id_format(cls, v: list[str]) -> list[str]:
        """Validar formato de IDs de dispositivos referenciados."""
        for dev_id in v:
            validate_slug(dev_id, "Zone device_id reference")
        return v

    @model_validator(mode="after")
    def validate_no_duplicate_devices(self) -> "SecurityZoneSchema":
        """Impedir asignar el mismo dispositivo dos veces a la misma zona."""
        dupes = find_duplicates(self.device_ids)
        if dupes:
            raise ValueError(
                f"Duplicate device assignments in zone '{self.id}': "
                f"{', '.join(sorted(dupes))}"
            )
        return self


# =============================================================================
# Modelos — Conductos (Conduits)
# =============================================================================

class ConduitSchema(BaseModel):
    """
    Conducto de comunicación entre zonas de seguridad (IEC 62443).
    Define el canal autorizado entre dos zonas con políticas de seguridad.
    """

    id: str = Field(
        ..., min_length=1, max_length=64,
        examples=["conduit-ot-to-it"],
    )
    name: str = Field(
        ..., min_length=1, max_length=128,
        examples=["Conducto OT-IT DMZ"],
    )
    source_zone_id: str = Field(
        ..., min_length=1, max_length=64,
        description="Zona de origen del conducto",
    )
    target_zone_id: str = Field(
        ..., min_length=1, max_length=64,
        description="Zona de destino del conducto",
    )
    security_level: SecurityLevel = Field(
        default=SecurityLevel.SL_1,
        description="Nivel de seguridad aplicado al conducto",
    )
    allowed_protocols: list[str] = Field(
        default_factory=list,
        description="Protocolos permitidos a través del conducto",
        examples=[["Modbus/TCP", "OPC-UA", "HTTPS"]],
    )
    description: Optional[str] = Field(
        default=None, max_length=256,
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        return validate_slug(v, "Conduit ID")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return validate_label(v, "Conduit name")

    @field_validator("source_zone_id", "target_zone_id")
    @classmethod
    def validate_zone_refs(cls, v: str) -> str:
        return validate_slug(v, "Conduit zone reference")

    @model_validator(mode="after")
    def validate_different_zones(self) -> "ConduitSchema":
        """Un conducto debe conectar dos zonas distintas."""
        if self.source_zone_id == self.target_zone_id:
            raise ValueError(
                f"Conduit '{self.id}' cannot connect zone "
                f"'{self.source_zone_id}' to itself"
            )
        return self
