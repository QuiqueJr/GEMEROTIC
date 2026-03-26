"""
Layer 2: Conectividad Lógica (NetJSON / L2 / L3)

Define la capa lógica del modelo de datos: configuración de interfaces,
direccionamiento IP, MAC, y segmentación por VLANs. Complementa la capa
física con la información necesaria para la configuración de red.
"""


from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.validators import (
    find_duplicates,
    validate_mac_address,
    validate_slug,
)

# =============================================================================
# Modelos — Interfaces lógicas
# =============================================================================

class InterfaceLogicalSchema(BaseModel):
    """
    Configuración lógica de una interfaz de red.
    Vincula un puerto físico (Layer 1) con su configuración L2/L3.
    """

    port_id: str = Field(
        ..., min_length=1, max_length=128,
        description="Referencia al puerto físico (formato: device_id:port_name)",
        examples=["router-01:eth0"],
    )
    mac_address: str | None = Field(
        default=None, max_length=17,
        description="Dirección MAC (formato AA:BB:CC:DD:EE:FF)",
        examples=["00:1A:2B:3C:4D:5E"],
    )
    ipv4_address: str | None = Field(
        default=None, max_length=18,
        description="Dirección IPv4 con máscara CIDR",
        examples=["192.168.1.1/24"],
    )
    ipv6_address: str | None = Field(
        default=None, max_length=43,
        description="Dirección IPv6 con prefijo CIDR",
        examples=["2001:db8::1/64"],
    )
    mgmt_only: bool = Field(
        default=False,
        description="Marcar como interfaz exclusiva de gestión (out-of-band)",
    )
    enabled: bool = Field(
        default=True,
        description="Estado administrativo de la interfaz",
    )
    description: str | None = Field(
        default=None, max_length=256,
    )

    @field_validator("port_id")
    @classmethod
    def validate_port_id(cls, v: str) -> str:
        if ":" not in v:
            raise ValueError(
                "Interface port_id must use format 'device_id:port_name'"
            )
        return v

    @field_validator("mac_address")
    @classmethod
    def validate_mac(cls, v: str | None) -> str | None:
        """Normalizar MAC a formato uppercase con dos puntos."""
        if v is not None:
            return validate_mac_address(v)
        return v

    @field_validator("ipv4_address")
    @classmethod
    def validate_ipv4(cls, v: str | None) -> str | None:
        """Validar formato básico de IPv4 con CIDR."""
        if v is not None:
            import ipaddress
            try:
                ipaddress.IPv4Interface(v)
            except (ipaddress.AddressValueError, ValueError) as e:
                raise ValueError(f"Invalid IPv4 address: {e}") from e
        return v

    @field_validator("ipv6_address")
    @classmethod
    def validate_ipv6(cls, v: str | None) -> str | None:
        """Validar formato de IPv6 con CIDR."""
        if v is not None:
            import ipaddress
            try:
                ipaddress.IPv6Interface(v)
            except (ipaddress.AddressValueError, ValueError) as e:
                raise ValueError(f"Invalid IPv6 address: {e}") from e
        return v


# =============================================================================
# Modelos — VLANs
# =============================================================================

class VLANSchema(BaseModel):
    """
    VLAN para segmentación lógica de red.
    Mapea a objetos VLAN de NetBox.
    """

    id: str = Field(
        ..., min_length=1, max_length=64,
        description="Identificador único de la VLAN en la topología",
        examples=["vlan-100-corp"],
    )
    vlan_id: int = Field(
        ..., ge=1, le=4094,
        description="ID numérico de VLAN (802.1Q: 1-4094)",
    )
    name: str = Field(
        ..., min_length=1, max_length=128,
        examples=["Corporativa", "OT-Control"],
    )
    description: str | None = Field(
        default=None, max_length=256,
    )
    assigned_interfaces: list[str] = Field(
        default_factory=list,
        description="Lista de port_ids asignados a esta VLAN",
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        return validate_slug(v, "VLAN ID")

    @field_validator("assigned_interfaces")
    @classmethod
    def validate_interface_refs(cls, v: list[str]) -> list[str]:
        """Verificar formato de referencias a puertos."""
        for ref in v:
            if ":" not in ref:
                raise ValueError(
                    f"VLAN interface reference '{ref}' must use "
                    f"format 'device_id:port_name'"
                )
        return v

    @model_validator(mode="after")
    def validate_no_duplicate_assignments(self) -> "VLANSchema":
        """Impedir asignar la misma interfaz dos veces a la misma VLAN."""
        dupes = find_duplicates(self.assigned_interfaces)
        if dupes:
            raise ValueError(
                f"Duplicate interface assignments in VLAN '{self.id}': "
                f"{', '.join(sorted(dupes))}"
            )
        return self
