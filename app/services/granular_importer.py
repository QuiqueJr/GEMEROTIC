"""
Traduccion del snapshot legacy a entidades granulares.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

MANAGED_ENTITY_TYPES = {
    "ui.settings",
    "ui.asset",
    "ui.connection",
    "ui.drawing",
    "ui.physical_layout",
    "physical.site",
    "physical.room",
    "physical.rack",
    "physical.device",
    "physical.patch_panel",
    "physical.cable",
    "logical.interface",
    "logical.vlan",
    "security.zone",
    "security.conduit",
    "asset.config",
}

_TOPOLOGY_COLLECTIONS: tuple[tuple[str, str], ...] = (
    ("sites", "physical.site"),
    ("rooms", "physical.room"),
    ("racks", "physical.rack"),
    ("devices", "physical.device"),
    ("patch_panels", "physical.patch_panel"),
    ("cables", "physical.cable"),
    ("interfaces", "logical.interface"),
    ("vlans", "logical.vlan"),
    ("security_zones", "security.zone"),
    ("conduits", "security.conduit"),
)


@dataclass(frozen=True)
class GranularEntity:
    """Entidad canonica extraida del estado editable."""

    entity_type: str
    entity_id: str
    payload: dict[str, Any]


def extract_project_entities(
    project_name: str, project_state: dict[str, Any]
) -> list[GranularEntity]:
    """Separar el snapshot del builder en entidades persistibles."""
    entities: list[GranularEntity] = []
    settings = _mapping(project_state.get("settings"))
    entities.append(GranularEntity("ui.settings", project_name, settings))

    for node in _list_of_mappings(project_state.get("nodes")):
        entity_id = _entity_id(node, "node")
        entities.append(GranularEntity("ui.asset", entity_id, node))
        config_payload = _extract_asset_config(node)
        if config_payload:
            entities.append(GranularEntity("asset.config", entity_id, config_payload))

    for edge in _list_of_mappings(project_state.get("edges")):
        entities.append(GranularEntity("ui.connection", _entity_id(edge, "edge"), edge))

    for drawing in _list_of_mappings(project_state.get("drawings")):
        entities.append(
            GranularEntity("ui.drawing", _entity_id(drawing, "drawing"), drawing)
        )

    physical_layout = project_state.get("physical_layout")
    if isinstance(physical_layout, dict):
        entities.append(
            GranularEntity("ui.physical_layout", "default", physical_layout)
        )

    topology = project_state.get("topology")
    if isinstance(topology, dict):
        for collection_name, entity_type in _TOPOLOGY_COLLECTIONS:
            for item in _list_of_mappings(topology.get(collection_name)):
                entities.append(
                    GranularEntity(
                        entity_type,
                        _topology_entity_id(item, collection_name),
                        item,
                    )
                )

    return entities


def _extract_asset_config(node: dict[str, Any]) -> dict[str, Any]:
    """Extraer configuracion editable por activo sin imponer schema cerrado."""
    data = _mapping(node.get("data"))
    config_keys = {
        "ipAddress",
        "ipv4Address",
        "ipv6Address",
        "gateway",
        "vlanId",
        "hostname",
        "ports",
        "allowedProtocols",
        "vendor",
        "model",
        "firmware",
        "runningConfig",
    }
    config = {key: data[key] for key in config_keys if key in data}
    nested_config = data.get("config")
    if isinstance(nested_config, dict):
        config.update(nested_config)
    return config


def _entity_id(payload: dict[str, Any], fallback_prefix: str) -> str:
    raw_id = payload.get("id")
    if isinstance(raw_id, str) and raw_id.strip():
        return raw_id.strip()[:128]
    raw_name = payload.get("name") or payload.get("label")
    if isinstance(raw_name, str) and raw_name.strip():
        return raw_name.strip().lower().replace(" ", "-")[:128]
    return f"{fallback_prefix}-unknown"


def _topology_entity_id(payload: dict[str, Any], collection_name: str) -> str:
    """Resolver identidad estable para colecciones del payload operativo."""
    if collection_name == "interfaces":
        port_id = payload.get("port_id")
        if isinstance(port_id, str) and port_id.strip():
            return port_id.strip()[:128]
    return _entity_id(payload, collection_name)


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list_of_mappings(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]
