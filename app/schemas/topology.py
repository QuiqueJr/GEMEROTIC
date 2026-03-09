"""
Schemas Pydantic para la topologia de red del MVP.

Define la estructura estricta del payload JSON que recibe el API
para crear una topologia: dispositivos, interfaces y enlaces.
"""

import re
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator


class DeviceRole(str, Enum):
    """Roles permitidos para dispositivos en el MVP."""

    ROUTER = "router"
    SWITCH = "switch"
    HOST = "host"


class InterfaceSchema(BaseModel):
    """Representa una interfaz de red en un dispositivo."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=64,
        examples=["eth0", "GigabitEthernet0/0"],
    )

    @field_validator("name")
    @classmethod
    def validate_interface_name(cls, v: str) -> str:
        """Permitir nombres de interfaz realistas: alfanuméricos, guiones, barras y puntos."""
        if not re.match(r"^[a-zA-Z0-9/_.-]+$", v):
            raise ValueError(
                "Interface name must contain only alphanumeric characters, "
                "hyphens, underscores, forward slashes, and dots"
            )
        return v


class DeviceSchema(BaseModel):
    """Representa un dispositivo de red (router, switch o host)."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=64,
        examples=["router-01", "switch-01", "host-01"],
    )
    role: DeviceRole
    interfaces: list[InterfaceSchema] = Field(
        ...,
        min_length=1,
        description="Al menos una interfaz es requerida por dispositivo",
    )

    @field_validator("name")
    @classmethod
    def validate_device_name(cls, v: str) -> str:
        """Sanitizar nombre: solo alfanuméricos, guiones y guiones bajos."""
        if not re.match(r"^[a-zA-Z0-9_-]+$", v):
            raise ValueError(
                "Device name must contain only alphanumeric characters, "
                "hyphens, and underscores"
            )
        return v.lower()

    @model_validator(mode="after")
    def validate_unique_interfaces(self) -> "DeviceSchema":
        """Rechazar interfaces duplicadas dentro del mismo dispositivo."""
        names = [iface.name for iface in self.interfaces]
        duplicates = {n for n in names if names.count(n) > 1}
        if duplicates:
            raise ValueError(
                f"Duplicate interface names in device '{self.name}': "
                f"{', '.join(sorted(duplicates))}"
            )
        return self


class LinkSchema(BaseModel):
    """Representa un enlace físico punto a punto entre dos interfaces."""

    source_device: str = Field(..., min_length=1, max_length=64)
    source_interface: str = Field(..., min_length=1, max_length=64)
    target_device: str = Field(..., min_length=1, max_length=64)
    target_interface: str = Field(..., min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_no_self_loop(self) -> "LinkSchema":
        """Impedir enlaces de un dispositivo consigo mismo en la misma interfaz."""
        if (
            self.source_device == self.target_device
            and self.source_interface == self.target_interface
        ):
            raise ValueError(
                "A link cannot connect a device interface to itself"
            )
        return self


class TopologyCreate(BaseModel):
    """
    Payload principal para crear una topología completa.
    Contiene la lista de dispositivos y sus enlaces.
    """

    name: str = Field(
        ...,
        min_length=1,
        max_length=128,
        examples=["mvp-lab-01"],
    )
    devices: list[DeviceSchema] = Field(
        ...,
        min_length=1,
        description="Lista de dispositivos de la topología",
    )
    links: list[LinkSchema] = Field(
        default_factory=list,
        description="Enlaces entre dispositivos (puede estar vacío)",
    )

    @field_validator("name")
    @classmethod
    def validate_topology_name(cls, v: str) -> str:
        """Sanitizar nombre de topología: solo alfanuméricos, guiones y guiones bajos."""
        if not re.match(r"^[a-zA-Z0-9_-]+$", v):
            raise ValueError(
                "Topology name must contain only alphanumeric characters, "
                "hyphens, and underscores"
            )
        return v.lower()

    @model_validator(mode="after")
    def validate_unique_device_names(self) -> "TopologyCreate":
        """Rechazar nombres de dispositivos duplicados en la topología."""
        names = [d.name for d in self.devices]
        duplicates = {n for n in names if names.count(n) > 1}
        if duplicates:
            raise ValueError(
                f"Duplicate device names: {', '.join(sorted(duplicates))}"
            )
        return self

    @model_validator(mode="after")
    def validate_links_reference_existing_devices(self) -> "TopologyCreate":
        """Verificar que los enlaces solo referencien dispositivos e interfaces existentes."""
        # Construir mapa de dispositivo -> set de interfaces
        device_interfaces: dict[str, set[str]] = {}
        for device in self.devices:
            device_interfaces[device.name] = {
                iface.name for iface in device.interfaces
            }

        for i, link in enumerate(self.links):
            # Verificar que los dispositivos existen
            if link.source_device not in device_interfaces:
                raise ValueError(
                    f"Link {i}: source_device '{link.source_device}' "
                    f"does not exist in topology devices"
                )
            if link.target_device not in device_interfaces:
                raise ValueError(
                    f"Link {i}: target_device '{link.target_device}' "
                    f"does not exist in topology devices"
                )
            # Verificar que las interfaces existen en sus respectivos dispositivos
            if link.source_interface not in device_interfaces[link.source_device]:
                raise ValueError(
                    f"Link {i}: interface '{link.source_interface}' "
                    f"does not exist on device '{link.source_device}'"
                )
            if link.target_interface not in device_interfaces[link.target_device]:
                raise ValueError(
                    f"Link {i}: interface '{link.target_interface}' "
                    f"does not exist on device '{link.target_device}'"
                )

        return self

    @model_validator(mode="after")
    def validate_no_duplicate_links(self) -> "TopologyCreate":
        """Impedir enlaces duplicados (A->B es igual que B->A)."""
        seen: set[tuple[str, str, str, str]] = set()
        for i, link in enumerate(self.links):
            # Normalizar dirección para detectar duplicados bidireccionales
            endpoints = tuple(
                sorted(
                    [
                        (link.source_device, link.source_interface),
                        (link.target_device, link.target_interface),
                    ]
                )
            )
            canonical = (
                endpoints[0][0],
                endpoints[0][1],
                endpoints[1][0],
                endpoints[1][1],
            )
            if canonical in seen:
                raise ValueError(
                    f"Link {i}: duplicate link between "
                    f"'{link.source_device}:{link.source_interface}' and "
                    f"'{link.target_device}:{link.target_interface}'"
                )
            seen.add(canonical)
        return self
