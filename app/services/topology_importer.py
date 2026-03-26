"""
Importador de topologías hacia NetBox.

Traduce el payload validado de GEMEROTIC al modelo operativo de NetBox,
manteniendo la separación de 3 capas y reutilizando el plugin OT para
persistir zonas y conductos.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from hashlib import sha1
from typing import Any

import requests
from pynetbox.core.query import RequestError

from app.schemas.ot_security import ConduitSchema, SecurityZoneSchema
from app.schemas.physical import (
    CableCategory,
    CableSchema,
    DevicePortSchema,
    DeviceSchema,
    PatchPanelPortSchema,
    PatchPanelSchema,
    PortType,
    RackSchema,
)
from app.schemas.topology import TopologyCreate
from app.services.netbox_client import NetBoxClient, NetBoxClientError

DEFAULT_DEVICE_INTERFACE_TYPE = "other"
DEFAULT_PATCH_PANEL_PORT_TYPE = "other"
DEFAULT_ACTIVE_STATUS = "active"
DEFAULT_CONNECTED_CABLE_STATUS = "connected"
DEFAULT_INTERFACE_OBJECT_TYPE = "dcim.interface"
DEFAULT_FRONT_PORT_OBJECT_TYPE = "dcim.frontport"
DEFAULT_REAR_PORT_OBJECT_TYPE = "dcim.rearport"
DEFAULT_SLUG_MAX_LENGTH = 100
DEFAULT_ASSET_TAG_MAX_LENGTH = 50
DEFAULT_VLAN_NAME_MAX_LENGTH = 64
DEFAULT_DEVICE_NAME_MAX_LENGTH = 64

CABLE_TYPE_BY_CATEGORY: dict[CableCategory, str] = {
    CableCategory.CAT5E: "cat5e",
    CableCategory.CAT6: "cat6",
    CableCategory.CAT6A: "cat6a",
    CableCategory.CAT7: "cat7",
    CableCategory.CAT8: "cat8",
    CableCategory.OM3: "mmf",
    CableCategory.OM4: "mmf",
    CableCategory.OS2: "smf",
}


class TopologyImportError(ValueError):
    """Error controlado de traducción del modelo GEMEROTIC a NetBox."""


def truncate_text(value: str, max_length: int) -> str:
    """Recortar texto largo conservando un sufijo ASCII."""
    if len(value) <= max_length:
        return value
    return value[: max_length - 3].rstrip() + "..."


@dataclass
class ResourceSummary:
    """Contadores y mapeo de IDs lógicos hacia IDs internos de NetBox."""

    created: int = 0
    existing: int = 0
    objects: dict[str, int] = field(default_factory=dict)

    def register(self, schema_id: str, record: Any, created: bool) -> None:
        self.objects[schema_id] = int(record.id)
        if created:
            self.created += 1
        else:
            self.existing += 1


@dataclass(frozen=True)
class PortBinding:
    """Vincula un port ID de GEMEROTIC con su objeto real en NetBox."""

    object_type: str
    record: Any


class TopologyImporter:
    """Sincroniza una topología completa de GEMEROTIC dentro de NetBox."""

    def __init__(self, client: NetBoxClient):
        self._client = client
        self._api = client._api

    def import_topology(self, topology: TopologyCreate) -> dict[str, Any]:
        """Persistir una topología completa y retornar un resumen operativo."""
        if not self._client.is_configured():
            raise NetBoxClientError("NetBox token is not configured")

        try:
            foundation = self._client.bootstrap()
            return self._import_topology(topology, foundation)
        except TopologyImportError:
            raise
        except (RequestError, requests.RequestException, ValueError) as exc:
            raise NetBoxClientError("NetBox topology import failed") from exc

    def _import_topology(
        self,
        topology: TopologyCreate,
        foundation: dict[str, Any],
    ) -> dict[str, Any]:
        summaries = {
            "sites": ResourceSummary(),
            "rooms": ResourceSummary(),
            "racks": ResourceSummary(),
            "devices": ResourceSummary(),
            "patch_panels": ResourceSummary(),
            "interfaces": ResourceSummary(),
            "vlans": ResourceSummary(),
            "cables": ResourceSummary(),
            "security_zones": ResourceSummary(),
            "conduits": ResourceSummary(),
        }

        site_records: dict[str, Any] = {}
        room_records: dict[str, Any] = {}
        rack_records: dict[str, Any] = {}
        device_records: dict[str, Any] = {}
        patch_panel_records: dict[str, Any] = {}
        port_bindings: dict[str, PortBinding] = {}

        for site in topology.sites:
            record, created = self._ensure_site(
                topology.name,
                site.id,
                site.name,
                site.description,
            )
            site_records[site.id] = record
            summaries["sites"].register(site.id, record, created)

        for room in topology.rooms:
            site_record = site_records[room.site_id]
            record, created = self._ensure_room(
                topology.name,
                room.id,
                room.name,
                site_record,
            )
            room_records[room.id] = record
            summaries["rooms"].register(room.id, record, created)

        for rack in topology.racks:
            room_record = room_records[rack.room_id]
            site_id = self._find_site_id_for_room(topology, rack.room_id)
            site_record = site_records[site_id]
            record, created = self._ensure_rack(
                topology.name,
                rack,
                site_record,
                room_record,
            )
            rack_records[rack.id] = record
            summaries["racks"].register(rack.id, record, created)

        for device in topology.devices:
            site_record, room_record, rack_record = self._resolve_device_placement(
                topology,
                device,
                site_records,
                room_records,
                rack_records,
            )
            record, created = self._ensure_device(
                topology_name=topology.name,
                device=device,
                site_record=site_record,
                room_record=room_record,
                rack_record=rack_record,
            )
            device_records[device.id] = record
            summaries["devices"].register(device.id, record, created)

            for port in device.ports:
                interface_record, port_created = self._ensure_device_interface(
                    device_record=record,
                    port=port,
                )
                port_bindings[port.id] = PortBinding(
                    object_type=DEFAULT_INTERFACE_OBJECT_TYPE,
                    record=interface_record,
                )
                summaries["interfaces"].register(
                    port.id,
                    interface_record,
                    port_created,
                )

        for panel in topology.patch_panels:
            rack_record = rack_records[panel.rack_id]
            room_id = self._find_room_id_for_rack(topology, panel.rack_id)
            room_record = room_records[room_id]
            site_id = self._find_site_id_for_room(topology, room_id)
            site_record = site_records[site_id]
            panel_record, created = self._ensure_patch_panel(
                topology_name=topology.name,
                panel=panel,
                site_record=site_record,
                room_record=room_record,
                rack_record=rack_record,
            )
            patch_panel_records[panel.id] = panel_record
            summaries["patch_panels"].register(panel.id, panel_record, created)

            for port in panel.ports:
                binding_record, port_created = self._ensure_patch_panel_port(
                    panel_record=panel_record,
                    port=port,
                )
                port_bindings[port.id] = binding_record
                summaries["interfaces"].register(
                    port.id,
                    binding_record.record,
                    port_created,
                )

        vlan_memberships = self._build_vlan_memberships(topology)
        vlan_records: dict[str, Any] = {}
        for vlan in topology.vlans:
            record, created = self._ensure_vlan(
                topology.name,
                vlan.id,
                vlan.vlan_id,
                vlan.name,
                vlan.description,
            )
            vlan_records[vlan.id] = record
            summaries["vlans"].register(vlan.id, record, created)

        for interface in topology.interfaces:
            binding = port_bindings.get(interface.port_id)
            if binding is None:
                raise TopologyImportError(
                    f"Interface port '{interface.port_id}' was not created in NetBox"
                )
            self._apply_interface_configuration(
                record=binding.record,
                interface_payload=interface,
                assigned_vlans=[
                    vlan_records[vlan_id]
                    for vlan_id in vlan_memberships.get(interface.port_id, [])
                ],
            )

        for cable in topology.cables:
            record, created = self._ensure_cable(
                topology.name,
                cable,
                port_bindings,
            )
            summaries["cables"].register(cable.id, record, created)

        zone_records: dict[str, Any] = {}
        for zone in topology.security_zones:
            devices = [device_records[device_id] for device_id in zone.device_ids]
            record, created = self._ensure_security_zone(
                topology.name,
                zone,
                devices,
            )
            zone_records[zone.id] = record
            summaries["security_zones"].register(zone.id, record, created)

        for conduit in topology.conduits:
            record, created = self._ensure_conduit(
                topology_name=topology.name,
                conduit=conduit,
                source_zone=zone_records[conduit.source_zone_id],
                target_zone=zone_records[conduit.target_zone_id],
            )
            summaries["conduits"].register(conduit.id, record, created)

        return {
            "topology_name": topology.name,
            "topology_description": topology.description,
            "netbox_version": foundation.get("netbox_version"),
            "foundation": {
                "device_roles": foundation.get("device_roles"),
                "rack_roles": foundation.get("rack_roles"),
                "custom_fields": foundation.get("custom_fields"),
            },
            "summary": {
                "sites": self._serialize_summary(summaries["sites"]),
                "rooms": self._serialize_summary(summaries["rooms"]),
                "racks": self._serialize_summary(summaries["racks"]),
                "devices": self._serialize_summary(summaries["devices"]),
                "patch_panels": self._serialize_summary(summaries["patch_panels"]),
                "interfaces": self._serialize_summary(summaries["interfaces"]),
                "vlans": self._serialize_summary(summaries["vlans"]),
                "cables": self._serialize_summary(summaries["cables"]),
                "security_zones": self._serialize_summary(summaries["security_zones"]),
                "conduits": self._serialize_summary(summaries["conduits"]),
            },
        }

    def _ensure_site(
        self,
        topology_name: str,
        site_id: str,
        name: str,
        description: str | None,
    ) -> tuple[Any, bool]:
        scoped_site_id = self._scoped_slug(topology_name, site_id)
        record = self._api.dcim.sites.get(slug=scoped_site_id)
        if record is not None:
            return record, False

        payload = {
            "name": self._scoped_name(topology_name, name),
            "slug": scoped_site_id,
        }
        if description:
            payload["description"] = description
        return self._api.dcim.sites.create(payload), True

    def _ensure_room(
        self,
        topology_name: str,
        room_id: str,
        name: str,
        site_record: Any,
    ) -> tuple[Any, bool]:
        scoped_room_id = self._scoped_slug(topology_name, room_id)
        record = self._api.dcim.locations.get(slug=scoped_room_id)
        if record is not None:
            return record, False

        return (
            self._api.dcim.locations.create(
                {
                    "name": self._scoped_name(topology_name, name),
                    "slug": scoped_room_id,
                    "site": site_record.id,
                }
            ),
            True,
        )

    def _ensure_rack(
        self,
        topology_name: str,
        rack: RackSchema,
        site_record: Any,
        room_record: Any,
    ) -> tuple[Any, bool]:
        scoped_rack_id = self._scoped_token(topology_name, rack.id)
        record = self._api.dcim.racks.get(asset_tag=scoped_rack_id)
        if record is not None:
            return record, False

        rack_role = self._api.dcim.rack_roles.get(slug=rack.rack_type.value)
        if rack_role is None:
            raise TopologyImportError(
                f"Rack role '{rack.rack_type.value}' is not present in NetBox"
            )

        payload = {
            "name": rack.name,
            "site": site_record.id,
            "location": room_record.id,
            "u_height": rack.height_ru,
            "asset_tag": scoped_rack_id,
            "status": DEFAULT_ACTIVE_STATUS,
            "role": rack_role.id,
        }
        return self._api.dcim.racks.create(payload), True

    def _ensure_device(
        self,
        topology_name: str,
        device: DeviceSchema,
        site_record: Any,
        room_record: Any | None,
        rack_record: Any | None,
    ) -> tuple[Any, bool]:
        scoped_device_id = self._scoped_token(topology_name, device.id)
        record = self._api.dcim.devices.get(asset_tag=scoped_device_id)
        if record is not None:
            return record, False

        manufacturer = self._ensure_manufacturer(device.manufacturer or "Generic")
        device_type = self._ensure_device_type(
            manufacturer_record=manufacturer,
            model_name=(
                device.model or self._default_model_name(device.asset_type.value)
            ),
        )
        role = self._api.dcim.device_roles.get(slug=device.asset_type.value)
        if role is None:
            raise TopologyImportError(
                f"Device role '{device.asset_type.value}' is not present in NetBox"
            )

        payload: dict[str, Any] = {
            "name": self._scoped_name(
                topology_name,
                device.name,
                max_length=DEFAULT_DEVICE_NAME_MAX_LENGTH,
            ),
            "device_type": device_type.id,
            "role": role.id,
            "site": site_record.id,
            "asset_tag": scoped_device_id,
            "status": DEFAULT_ACTIVE_STATUS,
            "custom_fields": self._build_device_custom_fields(device),
        }

        if room_record is not None:
            payload["location"] = room_record.id
        if rack_record is not None:
            payload["rack"] = rack_record.id
        if device.rack_position is not None:
            payload["position"] = device.rack_position
            payload["face"] = "front"
        if device.serial_number:
            payload["serial"] = device.serial_number

        return self._api.dcim.devices.create(payload), True

    def _ensure_patch_panel(
        self,
        topology_name: str,
        panel: PatchPanelSchema,
        site_record: Any,
        room_record: Any,
        rack_record: Any,
    ) -> tuple[Any, bool]:
        scoped_panel_id = self._scoped_token(topology_name, panel.id)
        record = self._api.dcim.devices.get(asset_tag=scoped_panel_id)
        if record is not None:
            return record, False

        manufacturer = self._ensure_manufacturer("Generic")
        device_type = self._ensure_device_type(
            manufacturer_record=manufacturer,
            model_name=f"Patch Panel {panel.port_count}",
        )
        role = self._api.dcim.device_roles.get(slug="patch_panel")
        if role is None:
            raise TopologyImportError(
                "Device role 'patch_panel' is not present in NetBox"
            )

        payload = {
            "name": self._scoped_name(
                topology_name,
                panel.name,
                max_length=DEFAULT_DEVICE_NAME_MAX_LENGTH,
            ),
            "device_type": device_type.id,
            "role": role.id,
            "site": site_record.id,
            "location": room_record.id,
            "rack": rack_record.id,
            "asset_tag": scoped_panel_id,
            "status": DEFAULT_ACTIVE_STATUS,
        }
        return self._api.dcim.devices.create(payload), True

    def _ensure_device_interface(
        self,
        device_record: Any,
        port: DevicePortSchema,
    ) -> tuple[Any, bool]:
        record = self._api.dcim.interfaces.get(
            device_id=device_record.id,
            name=port.name,
        )
        if record is not None:
            return record, False

        payload = {
            "device": device_record.id,
            "name": port.name,
            "type": DEFAULT_DEVICE_INTERFACE_TYPE,
        }
        return self._api.dcim.interfaces.create(payload), True

    def _ensure_patch_panel_port(
        self,
        panel_record: Any,
        port: PatchPanelPortSchema,
    ) -> tuple[PortBinding, bool]:
        if port.port_type == PortType.FRONT_PORT:
            endpoint = self._api.dcim.front_ports
            object_type = DEFAULT_FRONT_PORT_OBJECT_TYPE
        else:
            endpoint = self._api.dcim.rear_ports
            object_type = DEFAULT_REAR_PORT_OBJECT_TYPE

        record = endpoint.get(device_id=panel_record.id, name=port.name)
        if record is not None:
            return PortBinding(object_type=object_type, record=record), False

        created = endpoint.create(
            {
                "device": panel_record.id,
                "name": port.name,
                "type": DEFAULT_PATCH_PANEL_PORT_TYPE,
                "positions": 1,
            }
        )
        return PortBinding(object_type=object_type, record=created), True

    def _ensure_vlan(
        self,
        topology_name: str,
        vlan_id: str,
        vid: int,
        name: str,
        description: str | None,
    ) -> tuple[Any, bool]:
        scoped_name = self._scoped_name(
            topology_name,
            name,
            max_length=DEFAULT_VLAN_NAME_MAX_LENGTH,
        )
        record = self._api.ipam.vlans.get(vid=vid, name=scoped_name)
        if record is not None:
            return record, False

        payload = {"vid": vid, "name": scoped_name, "status": DEFAULT_ACTIVE_STATUS}
        payload["description"] = description or vlan_id
        return self._api.ipam.vlans.create(payload), True

    def _ensure_cable(
        self,
        topology_name: str,
        cable: CableSchema,
        port_bindings: dict[str, PortBinding],
    ) -> tuple[Any, bool]:
        lookup_label = self._scoped_token(
            topology_name,
            cable.id,
            max_length=DEFAULT_SLUG_MAX_LENGTH,
        )
        record = self._api.dcim.cables.get(label=lookup_label)
        if record is not None:
            return record, False

        first = port_bindings[cable.terminations[0].port_id]
        second = port_bindings[cable.terminations[1].port_id]

        payload: dict[str, Any] = {
            "label": lookup_label,
            "status": DEFAULT_CONNECTED_CABLE_STATUS,
            "a_terminations": [
                {
                    "object_type": first.object_type,
                    "object_id": first.record.id,
                }
            ],
            "b_terminations": [
                {
                    "object_type": second.object_type,
                    "object_id": second.record.id,
                }
            ],
        }

        cable_type = self._map_cable_type(cable)
        if cable_type is not None:
            payload["type"] = cable_type

        return self._api.dcim.cables.create(payload), True

    def _ensure_security_zone(
        self,
        topology_name: str,
        zone: SecurityZoneSchema,
        devices: list[Any],
    ) -> tuple[Any, bool]:
        endpoint = self._api.plugins.ot_security.security_zones
        scoped_zone_id = self._scoped_slug(topology_name, zone.id)
        record = endpoint.get(slug=scoped_zone_id)
        if record is not None:
            return record, False

        payload = {
            "name": self._scoped_name(topology_name, zone.name),
            "slug": scoped_zone_id,
            "security_level": zone.security_level.value,
            "devices": [device.id for device in devices],
        }
        if zone.description:
            payload["description"] = zone.description
        if zone.purdue_level is not None:
            payload["purdue_level"] = int(zone.purdue_level.value)

        return endpoint.create(payload), True

    def _ensure_conduit(
        self,
        topology_name: str,
        conduit: ConduitSchema,
        source_zone: Any,
        target_zone: Any,
    ) -> tuple[Any, bool]:
        endpoint = self._api.plugins.ot_security.conduits
        scoped_conduit_id = self._scoped_slug(topology_name, conduit.id)
        record = endpoint.get(slug=scoped_conduit_id)
        if record is not None:
            return record, False

        payload = {
            "name": self._scoped_name(topology_name, conduit.name),
            "slug": scoped_conduit_id,
            "source_zone": source_zone.id,
            "target_zone": target_zone.id,
            "security_level": conduit.security_level.value,
            "allowed_protocols": list(conduit.allowed_protocols),
        }
        if conduit.description:
            payload["description"] = conduit.description

        return endpoint.create(payload), True

    def _apply_interface_configuration(
        self,
        record: Any,
        interface_payload: Any,
        assigned_vlans: list[Any],
    ) -> None:
        update_payload: dict[str, Any] = {
            "enabled": interface_payload.enabled,
            "mgmt_only": interface_payload.mgmt_only,
        }
        if interface_payload.mac_address is not None:
            update_payload["mac_address"] = interface_payload.mac_address
        if interface_payload.description is not None:
            update_payload["description"] = interface_payload.description

        if len(assigned_vlans) == 1:
            update_payload["mode"] = "access"
            update_payload["untagged_vlan"] = assigned_vlans[0].id
            update_payload["tagged_vlans"] = []
        elif len(assigned_vlans) > 1:
            update_payload["mode"] = "tagged"
            update_payload["untagged_vlan"] = None
            update_payload["tagged_vlans"] = [vlan.id for vlan in assigned_vlans]

        self._update_record(record, update_payload)

        if interface_payload.ipv4_address is not None:
            self._ensure_ip_address(interface_payload.ipv4_address, record)
        if interface_payload.ipv6_address is not None:
            self._ensure_ip_address(interface_payload.ipv6_address, record)

    def _ensure_ip_address(self, address: str, interface_record: Any) -> None:
        record = self._api.ipam.ip_addresses.get(address=address)
        if record is None:
            self._api.ipam.ip_addresses.create(
                {
                    "address": address,
                    "status": DEFAULT_ACTIVE_STATUS,
                    "assigned_object_type": DEFAULT_INTERFACE_OBJECT_TYPE,
                    "assigned_object_id": interface_record.id,
                }
            )
            return

        self._update_record(
            record,
            {
                "assigned_object_type": DEFAULT_INTERFACE_OBJECT_TYPE,
                "assigned_object_id": interface_record.id,
                "status": DEFAULT_ACTIVE_STATUS,
            },
        )

    def _update_record(self, record: Any, payload: dict[str, Any]) -> None:
        dirty = False
        for field_name, value in payload.items():
            current_value = self._normalize_value(getattr(record, field_name, None))
            if current_value == self._normalize_value(value):
                continue
            setattr(record, field_name, value)
            dirty = True

        if dirty:
            record.save()

    def _ensure_manufacturer(self, name: str) -> Any:
        slug = self._slugify(name)
        record = self._api.dcim.manufacturers.get(slug=slug)
        if record is not None:
            return record
        return self._api.dcim.manufacturers.create({"name": name, "slug": slug})

    def _ensure_device_type(self, manufacturer_record: Any, model_name: str) -> Any:
        slug = self._slugify(f"{manufacturer_record.name}-{model_name}")
        record = self._api.dcim.device_types.get(slug=slug)
        if record is not None:
            return record
        return self._api.dcim.device_types.create(
            {
                "manufacturer": manufacturer_record.id,
                "model": model_name,
                "slug": slug,
            }
        )

    def _resolve_device_placement(
        self,
        topology: TopologyCreate,
        device: DeviceSchema,
        site_records: dict[str, Any],
        room_records: dict[str, Any],
        rack_records: dict[str, Any],
    ) -> tuple[Any, Any | None, Any | None]:
        if device.rack_id is not None:
            rack_record = rack_records[device.rack_id]
            room_id = self._find_room_id_for_rack(topology, device.rack_id)
            room_record = room_records[room_id]
            site_id = self._find_site_id_for_room(topology, room_id)
            return site_records[site_id], room_record, rack_record

        if len(topology.sites) == 1:
            return site_records[topology.sites[0].id], None, None

        raise TopologyImportError(
            "Device "
            f"'{device.id}' is not assigned to a rack and the topology "
            "has multiple sites"
        )

    def _build_vlan_memberships(self, topology: TopologyCreate) -> dict[str, list[str]]:
        memberships: dict[str, list[str]] = defaultdict(list)
        for vlan in topology.vlans:
            for port_id in vlan.assigned_interfaces:
                memberships[port_id].append(vlan.id)
        return memberships

    def _build_device_custom_fields(self, device: DeviceSchema) -> dict[str, str]:
        payload: dict[str, str] = {
            "gemerotic_criticality": device.criticality.value,
        }
        if device.firmware_version:
            payload["gemerotic_firmware_version"] = device.firmware_version
        return payload

    def _find_room_id_for_rack(self, topology: TopologyCreate, rack_id: str) -> str:
        for rack in topology.racks:
            if rack.id == rack_id:
                return rack.room_id
        raise TopologyImportError(
            f"Rack '{rack_id}' is not present in topology payload"
        )

    def _find_site_id_for_room(self, topology: TopologyCreate, room_id: str) -> str:
        for room in topology.rooms:
            if room.id == room_id:
                return room.site_id
        raise TopologyImportError(
            f"Room '{room_id}' is not present in topology payload"
        )

    def _map_cable_type(self, cable: CableSchema) -> str | None:
        if cable.category is None:
            return None
        return CABLE_TYPE_BY_CATEGORY.get(cable.category)

    def _default_model_name(self, asset_type: str) -> str:
        return asset_type.replace("_", " ").title()

    def _serialize_summary(self, summary: ResourceSummary) -> dict[str, Any]:
        return {
            "created": summary.created,
            "existing": summary.existing,
            "objects": summary.objects,
        }

    def _slugify(self, value: str) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "-", value.lower())
        parts = [part for part in normalized.replace("_", "-").split("-") if part]
        return "-".join(parts)

    def _scoped_slug(
        self,
        topology_name: str,
        raw_id: str,
        *,
        max_length: int = DEFAULT_SLUG_MAX_LENGTH,
    ) -> str:
        normalized = self._slugify(f"{topology_name}-{raw_id}")
        if len(normalized) <= max_length:
            return normalized

        digest = sha1(normalized.encode("utf-8")).hexdigest()[:8]
        trimmed = normalized[: max_length - len(digest) - 1].rstrip("-")
        return f"{trimmed}-{digest}"

    def _scoped_token(
        self,
        topology_name: str,
        raw_id: str,
        *,
        max_length: int = DEFAULT_ASSET_TAG_MAX_LENGTH,
    ) -> str:
        return self._scoped_slug(
            topology_name,
            raw_id,
            max_length=max_length,
        )

    def _scoped_name(
        self,
        topology_name: str,
        raw_name: str,
        *,
        max_length: int = DEFAULT_SLUG_MAX_LENGTH,
    ) -> str:
        scoped_name = f"{raw_name} [{topology_name}]"
        if len(scoped_name) <= max_length:
            return scoped_name
        return truncate_text(scoped_name, max_length)

    def _normalize_value(self, value: Any) -> Any:
        if isinstance(value, list):
            return sorted(self._normalize_value(item) for item in value)
        if hasattr(value, "id"):
            return int(value.id)
        if isinstance(value, dict) and "id" in value:
            return int(value["id"])
        return value
