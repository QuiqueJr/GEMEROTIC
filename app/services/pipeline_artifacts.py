"""
Generador de artefactos para el pipeline de despliegue.

Convierte una topología GEMEROTIC validada en archivos reproducibles para
Containerlab, Ansible, Batfish y OPA sin ejecutar herramientas externas.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.schemas.pipeline import PipelineArtifact, PipelineArtifacts
from app.schemas.topology import TopologyCreate

DEFAULT_LINUX_KIND = "linux"
DEFAULT_LINUX_IMAGE = "alpine:3.20"
DEFAULT_LINUX_CMD = "sleep infinity"
DEFAULT_NOS_KIND = "ceos"
DEFAULT_NOS_IMAGE = "ceos:4.32.0F"
TEMPLATE_ROOT = Path(__file__).resolve().parent.parent / "templates"
NOS_ASSET_TYPES = {
    "router",
    "switch",
    "firewall",
}


class PipelineArtifactGenerator:
    """Renderiza el bundle declarativo de una topología."""

    def __init__(self, template_root: Path = TEMPLATE_ROOT):
        self._environment = Environment(
            loader=FileSystemLoader(str(template_root)),
            autoescape=select_autoescape(disabled_extensions=("j2",)),
            undefined=StrictUndefined,
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self._environment.filters["json_string"] = json_string
        self._environment.filters["to_pretty_json"] = to_pretty_json

    def generate(self, topology: TopologyCreate) -> PipelineArtifacts:
        """Generar todos los artefactos soportados para la topología."""
        context = self._build_context(topology)
        split_artifacts = [
            self._json_artifact(
                path="topology/topology.json",
                stage="topology",
                payload=context["topology_payload"],
            ),
            self._json_artifact(
                path="topology/canvas.json",
                stage="topology",
                payload=context["canvas"],
            ),
            self._json_artifact(
                path="inventory/netbox_inventory.json",
                stage="inventory",
                payload=context["netbox_inventory"],
            ),
            self._json_artifact(
                path="runtime/containerlab_nodes.json",
                stage="runtime",
                payload=context["containerlab_runtime"]["nodes"],
            ),
            self._json_artifact(
                path="runtime/containerlab_links.json",
                stage="runtime",
                payload=context["containerlab_runtime"]["links"],
            ),
            self._json_artifact(
                path="ansible/vars.json",
                stage="ansible",
                payload=context["ansible_variables"],
            ),
        ]
        artifacts = [
            *split_artifacts,
            self._render_artifact(
                path="containerlab/topology.clab.yml",
                stage="containerlab",
                content_type="application/x-yaml",
                template_name="containerlab/topology.clab.yml.j2",
                context=context,
            ),
            self._render_artifact(
                path="ansible/inventory.yml",
                stage="ansible",
                content_type="application/x-yaml",
                template_name="ansible/inventory.yml.j2",
                context=context,
            ),
            self._render_artifact(
                path="ansible/site.yml",
                stage="ansible",
                content_type="application/x-yaml",
                template_name="ansible/site.yml.j2",
                context=context,
            ),
            self._render_artifact(
                path="opa/input.json",
                stage="opa",
                content_type="application/json",
                template_name="opa/input.json.j2",
                context=context,
            ),
            self._render_artifact(
                path="opa/policies/gemerotic_baseline.rego",
                stage="opa",
                content_type="text/x-rego",
                template_name="opa/gemerotic_baseline.rego.j2",
                context=context,
            ),
            self._render_artifact(
                path="batfish/README.md",
                stage="batfish",
                content_type="text/markdown",
                template_name="batfish/README.md.j2",
                context=context,
            ),
            self._render_artifact(
                path="manifest.json",
                stage="metadata",
                content_type="application/json",
                template_name="manifest.json.j2",
                context=context,
            ),
        ]

        for node in context["nodes"]:
            if node["profile"] == "nos":
                artifacts.append(
                    self._render_artifact(
                        path=f"batfish/configs/{node['id']}.cfg",
                        stage="batfish",
                        content_type="text/plain",
                        template_name="batfish/configs/nos.cfg.j2",
                        context={**context, "node": node},
                    )
                )
            else:
                artifacts.append(
                    self._render_artifact(
                        path=f"batfish/hosts/{node['id']}.json",
                        stage="batfish",
                        content_type="application/json",
                        template_name="batfish/hosts/host.json.j2",
                        context={**context, "node": node},
                    )
                )
                artifacts.append(
                    self._render_artifact(
                        path=f"batfish/iptables/{node['id']}.iptables",
                        stage="batfish",
                        content_type="text/plain",
                        template_name="batfish/iptables/host.iptables.j2",
                        context={**context, "node": node},
                    )
                )

        return PipelineArtifacts(
            topology_name=topology.name,
            artifacts=artifacts,
        )

    def _render_artifact(
        self,
        path: str,
        stage: str,
        content_type: str,
        template_name: str,
        context: dict[str, Any],
    ) -> PipelineArtifact:
        template = self._environment.get_template(template_name)
        content = template.render(**context).strip() + "\n"
        return PipelineArtifact(
            path=path,
            stage=stage,
            content_type=content_type,
            content=content,
        )

    def _json_artifact(
        self,
        path: str,
        stage: str,
        payload: dict[str, Any] | list[Any],
    ) -> PipelineArtifact:
        """Crear artefacto JSON estructurado sin plantilla intermedia."""
        return PipelineArtifact(
            path=path,
            stage=stage,
            content_type="application/json",
            content=to_pretty_json(payload) + "\n",
        )

    def _build_context(self, topology: TopologyCreate) -> dict[str, Any]:
        vlan_by_port = _build_vlan_memberships(topology)
        interface_by_port = {
            interface.port_id: interface for interface in topology.interfaces
        }
        zone_by_device = _build_zone_memberships(topology)
        zone_by_id = {zone.id: zone for zone in topology.security_zones}
        lab_interface_by_port = _build_lab_interface_map(topology)
        connected_port_ids = _build_connected_port_ids(topology)

        nodes = []
        runtime_nodes = []
        for device in topology.devices:
            device_zone = zone_by_device.get(device.id)
            asset_type_val = device.asset_type.value
            is_nos = asset_type_val in NOS_ASSET_TYPES
            logical_interfaces = []
            for port in device.ports:
                interface_payload = interface_by_port.get(port.id)
                logical_interfaces.append(
                    {
                        "port_id": port.id,
                        "port_name": port.name,
                        "lab_interface": lab_interface_by_port[port.id],
                        "enabled": (
                            interface_payload.enabled
                            if interface_payload is not None
                            else True
                        ),
                        "mgmt_only": (
                            interface_payload.mgmt_only
                            if interface_payload is not None
                            else False
                        ),
                        "ipv4_address": (
                            interface_payload.ipv4_address
                            if interface_payload is not None
                            else None
                        ),
                        "ipv6_address": (
                            interface_payload.ipv6_address
                            if interface_payload is not None
                            else None
                        ),
                        "vlans": vlan_by_port.get(port.id, []),
                    }
                )

            node = {
                "id": device.id,
                "name": device.name,
                "asset_type": asset_type_val,
                "profile": "nos" if is_nos else "linux",
                "criticality": device.criticality.value,
                "manufacturer": device.manufacturer,
                "model": device.model,
                "zone_id": device_zone.id if device_zone is not None else None,
                "zone_name": device_zone.name if device_zone is not None else None,
                "purdue_level": (
                    device_zone.purdue_level.value
                    if device_zone is not None
                    else None
                ),
                "security_level": (
                    device_zone.security_level.value
                    if device_zone is not None
                    else None
                ),
                "containerlab": {
                    "kind": DEFAULT_LINUX_KIND,
                    "image": DEFAULT_LINUX_IMAGE,
                    "cmd": DEFAULT_LINUX_CMD,
                },
                "batfish": {
                    "kind": DEFAULT_NOS_KIND if is_nos else DEFAULT_LINUX_KIND,
                    "image": DEFAULT_NOS_IMAGE if is_nos else DEFAULT_LINUX_IMAGE,
                },
                "interfaces": logical_interfaces,
            }
            nodes.append(node)
            runtime_nodes.append(
                {
                    **node,
                    "interfaces": [
                        interface
                        for interface in logical_interfaces
                        if interface["port_id"] in connected_port_ids
                    ],
                }
            )

        links = []
        for cable in topology.cables:
            first, second = cable.terminations
            links.append(
                {
                    "id": cable.id,
                    "endpoints": [
                        _build_lab_endpoint(first.port_id, lab_interface_by_port),
                        _build_lab_endpoint(second.port_id, lab_interface_by_port),
                    ],
                }
            )

        conduits = []
        for conduit in topology.conduits:
            source_zone = zone_by_id[conduit.source_zone_id]
            target_zone = zone_by_id[conduit.target_zone_id]
            conduits.append(
                {
                    "id": conduit.id,
                    "name": conduit.name,
                    "source_zone_id": conduit.source_zone_id,
                    "source_zone_name": source_zone.name,
                    "target_zone_id": conduit.target_zone_id,
                    "target_zone_name": target_zone.name,
                    "security_level": conduit.security_level.value,
                    "allowed_protocols": conduit.allowed_protocols,
                }
            )

        mgmt_ipv4_subnet, mgmt_ipv6_subnet = _build_mgmt_subnets(topology.name)
        context = {
            "topology": topology,
            "topology_name": topology.name,
            "mgmt_network": f"gemerotic-{topology.name}-mgmt",
            "mgmt_ipv4_subnet": mgmt_ipv4_subnet,
            "mgmt_ipv6_subnet": mgmt_ipv6_subnet,
            "nodes": nodes,
            "runtime_nodes": runtime_nodes,
            "links": links,
            "vlans": [
                {
                    "id": vlan.id,
                    "vlan_id": vlan.vlan_id,
                    "name": vlan.name,
                    "assigned_interfaces": vlan.assigned_interfaces,
                }
                for vlan in topology.vlans
            ],
            "zones": [
                {
                    "id": zone.id,
                    "name": zone.name,
                    "purdue_level": zone.purdue_level.value,
                    "security_level": zone.security_level.value,
                    "device_ids": zone.device_ids,
                }
                for zone in topology.security_zones
            ],
            "conduits": conduits,
        }
        context["topology_payload"] = topology.model_dump(mode="json")
        context["canvas"] = (
            topology.canvas.model_dump(mode="json")
            if topology.canvas is not None
            else {"assets": [], "cables": []}
        )
        context["netbox_inventory"] = _build_netbox_inventory(topology)
        context["containerlab_runtime"] = {
            "topology_name": topology.name,
            "mgmt_network": context["mgmt_network"],
            "mgmt_ipv4_subnet": context["mgmt_ipv4_subnet"],
            "mgmt_ipv6_subnet": context["mgmt_ipv6_subnet"],
            "nodes": runtime_nodes,
            "links": links,
        }
        context["ansible_variables"] = {
            "gemerotic_topology": topology.name,
            "gemerotic_containerlab_prefix": f"clab-{topology.name}-",
            "gemerotic_nodes": runtime_nodes,
        }
        return context


def _build_mgmt_subnets(topology_name: str) -> tuple[str, str]:
    """Generar subredes de management estables sin pisar rangos Docker comunes."""
    stable_value = sum(
        (index + 1) * ord(char)
        for index, char in enumerate(topology_name)
    )
    third_octet = 100 + (stable_value % 100)
    return (
        f"10.254.{third_octet}.0/24",
        f"3fff:10:254:{third_octet}::/80",
    )


def _build_netbox_inventory(topology: TopologyCreate) -> dict[str, Any]:
    """Separar inventario SSoT de los artefactos de runtime."""
    return {
        "topology_name": topology.name,
        "sites": [site.model_dump(mode="json") for site in topology.sites],
        "rooms": [room.model_dump(mode="json") for room in topology.rooms],
        "racks": [rack.model_dump(mode="json") for rack in topology.racks],
        "devices": [device.model_dump(mode="json") for device in topology.devices],
        "patch_panels": [
            panel.model_dump(mode="json") for panel in topology.patch_panels
        ],
        "cables": [cable.model_dump(mode="json") for cable in topology.cables],
        "interfaces": [
            interface.model_dump(mode="json") for interface in topology.interfaces
        ],
        "vlans": [vlan.model_dump(mode="json") for vlan in topology.vlans],
        "security_zones": [
            zone.model_dump(mode="json") for zone in topology.security_zones
        ],
        "conduits": [
            conduit.model_dump(mode="json") for conduit in topology.conduits
        ],
    }


def _build_vlan_memberships(
    topology: TopologyCreate,
) -> dict[str, list[dict[str, Any]]]:
    memberships: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for vlan in topology.vlans:
        for port_id in vlan.assigned_interfaces:
            memberships[port_id].append(
                {
                    "id": vlan.id,
                    "vlan_id": vlan.vlan_id,
                    "name": vlan.name,
                }
            )
    return dict(memberships)


def _build_zone_memberships(topology: TopologyCreate) -> dict[str, Any]:
    zone_by_device: dict[str, Any] = {}
    for zone in topology.security_zones:
        for device_id in zone.device_ids:
            zone_by_device[device_id] = zone
    return zone_by_device


def _build_connected_port_ids(topology: TopologyCreate) -> set[str]:
    """Calcular los puertos que existen como interfaces reales en Containerlab."""
    return {
        termination.port_id
        for cable in topology.cables
        for termination in cable.terminations
    }


def _build_lab_interface_map(topology: TopologyCreate) -> dict[str, str]:
    lab_interfaces: dict[str, str] = {}
    for device in topology.devices:
        for index, port in enumerate(device.ports, start=1):
            lab_interfaces[port.id] = f"eth{index}"
    return lab_interfaces


def _build_lab_endpoint(
    port_id: str,
    lab_interface_by_port: dict[str, str],
) -> dict[str, str]:
    node_id, _ = port_id.split(":", 1)
    lab_interface = lab_interface_by_port[port_id]
    return {
        "port_id": port_id,
        "node_id": node_id,
        "lab_interface": lab_interface,
        "endpoint": f"{node_id}:{lab_interface}",
    }


def json_string(value: Any) -> str:
    """Serializar un valor como string JSON seguro para YAML."""
    return json.dumps(value, ensure_ascii=True)


def to_pretty_json(value: Any) -> str:
    """Serializar estructuras de Python como JSON estable."""
    return json.dumps(value, ensure_ascii=True, indent=2, sort_keys=True)
