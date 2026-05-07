"""
Cliente de NetBox usando pynetbox.

Centraliza verificación de conectividad y bootstrap mínimo del SSoT
para que el resto del backend no dependa de llamadas HTTP dispersas.
"""

from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin

import pynetbox
import requests
from pynetbox.core.query import RequestError

from app.schemas.physical import AssetType, RackType
from app.schemas.topology import TopologyCreate


class NetBoxClientError(RuntimeError):
    """Error controlado al interactuar con NetBox."""


class NetBoxSession(requests.Session):
    """Sesión HTTP con timeout por defecto y verificación TLS configurable."""

    def __init__(self, timeout_seconds: float, verify_ssl: bool):
        super().__init__()
        self._timeout_seconds = timeout_seconds
        self.verify = verify_ssl

    def request(self, method: str, url: str, **kwargs):  # type: ignore[override]
        kwargs.setdefault("timeout", self._timeout_seconds)
        return super().request(method, url, **kwargs)


@dataclass(frozen=True)
class DeviceRoleBlueprint:
    """Datos mínimos para bootstrapear roles de dispositivos en NetBox."""

    name: str
    slug: str
    color: str


@dataclass(frozen=True)
class RackRoleBlueprint:
    """Datos mínimos para bootstrapear roles de rack en NetBox."""

    name: str
    slug: str
    color: str


@dataclass(frozen=True)
class CustomFieldBlueprint:
    """Definición mínima de un custom field gestionado por GEMEROTIC."""

    name: str
    label: str
    description: str
    object_types: tuple[str, ...]
    field_type: str = "text"
    group_name: str = "gemerotic"


DEVICE_ROLE_BLUEPRINTS: tuple[DeviceRoleBlueprint, ...] = (
    DeviceRoleBlueprint(name="Router", slug=AssetType.ROUTER.value, color="2563eb"),
    DeviceRoleBlueprint(name="Switch", slug=AssetType.SWITCH.value, color="0891b2"),
    DeviceRoleBlueprint(name="Firewall", slug=AssetType.FIREWALL.value, color="dc2626"),
    DeviceRoleBlueprint(name="Host", slug=AssetType.HOST.value, color="4b5563"),
    DeviceRoleBlueprint(name="Server", slug=AssetType.SERVER.value, color="475569"),
    DeviceRoleBlueprint(name="PLC", slug=AssetType.PLC.value, color="ea580c"),
    DeviceRoleBlueprint(name="HMI", slug=AssetType.HMI.value, color="ca8a04"),
    DeviceRoleBlueprint(name="RTU", slug=AssetType.RTU.value, color="16a34a"),
    DeviceRoleBlueprint(
        name="SCADA Server",
        slug=AssetType.SCADA_SERVER.value,
        color="7c3aed",
    ),
    DeviceRoleBlueprint(
        name="Patch Panel",
        slug=AssetType.PATCH_PANEL.value,
        color="6b7280",
    ),
    DeviceRoleBlueprint(
        name="Wireless AP",
        slug=AssetType.WIRELESS_AP.value,
        color="0f766e",
    ),
)

RACK_ROLE_BLUEPRINTS: tuple[RackRoleBlueprint, ...] = (
    RackRoleBlueprint(name="Network", slug=RackType.NETWORK.value, color="2563eb"),
    RackRoleBlueprint(name="Server", slug=RackType.SERVER.value, color="475569"),
    RackRoleBlueprint(name="OT", slug=RackType.OT.value, color="ea580c"),
    RackRoleBlueprint(name="Patch", slug=RackType.PATCH.value, color="6b7280"),
    RackRoleBlueprint(name="Mixed", slug=RackType.MIXED.value, color="0f766e"),
)

CUSTOM_FIELD_BLUEPRINTS: tuple[CustomFieldBlueprint, ...] = (
    CustomFieldBlueprint(
        name="gemerotic_firmware_version",
        label="Firmware version",
        description="Versión de firmware gestionada por GEMEROTIC",
        object_types=("dcim.device",),
    ),
    CustomFieldBlueprint(
        name="gemerotic_criticality",
        label="Criticality",
        description="Criticidad OT/IT calculada por GEMEROTIC",
        object_types=("dcim.device",),
    ),
)


class NetBoxClient:
    """Cliente de alto nivel para NetBox."""

    RESOURCE_ENDPOINTS: dict[str, str] = {
        "cables": "/api/dcim/cables/",
        "conduits": "/api/plugins/ot-security/conduits/",
        "device_roles": "/api/dcim/device-roles/",
        "device_types": "/api/dcim/device-types/",
        "devices": "/api/dcim/devices/",
        "front_ports": "/api/dcim/front-ports/",
        "interfaces": "/api/dcim/interfaces/",
        "ip_addresses": "/api/ipam/ip-addresses/",
        "locations": "/api/dcim/locations/",
        "manufacturers": "/api/dcim/manufacturers/",
        "racks": "/api/dcim/racks/",
        "rear_ports": "/api/dcim/rear-ports/",
        "security_zones": "/api/plugins/ot-security/security-zones/",
        "sites": "/api/dcim/sites/",
        "vlan_groups": "/api/ipam/vlan-groups/",
        "vlans": "/api/ipam/vlans/",
    }

    def __init__(
        self,
        base_url: str,
        token: str,
        timeout_seconds: float = 10.0,
        verify_ssl: bool = True,
    ):
        self.base_url = base_url.rstrip("/")
        self.token = token.strip()
        self.timeout_seconds = timeout_seconds
        self.verify_ssl = verify_ssl
        self._api = self._build_api()

    def _build_api(self):
        """Construir instancia de pynetbox con una sesión HTTP controlada."""
        api = pynetbox.api(self.base_url, token=self.token or None, threading=False)
        api.http_session = NetBoxSession(
            timeout_seconds=self.timeout_seconds,
            verify_ssl=self.verify_ssl,
        )
        return api

    def is_configured(self) -> bool:
        """Indicar si existe configuración mínima para hablar con NetBox."""
        return bool(self.base_url and self.token)

    def get_status(self) -> dict:
        """Obtener estado de NetBox o lanzar un error controlado."""
        if not self.is_configured():
            raise NetBoxClientError("NetBox token is not configured")

        try:
            return self._api.status()
        except (RequestError, requests.RequestException, ValueError) as exc:
            raise NetBoxClientError("NetBox status request failed") from exc

    def health_check(self) -> bool:
        """Retornar `True` solo si NetBox responde correctamente."""
        try:
            self.get_status()
        except NetBoxClientError:
            return False
        return True

    def ensure_device_roles(self) -> dict[str, list[str] | int]:
        """Asegurar que existen los roles de dispositivo base de GEMEROTIC."""
        try:
            return self._ensure_sluggable_objects(
                self._api.dcim.device_roles,
                DEVICE_ROLE_BLUEPRINTS,
            )
        except (RequestError, requests.RequestException, ValueError) as exc:
            raise NetBoxClientError("NetBox bootstrap failed") from exc

    def get_record(self, resource: str, **filters: Any) -> dict[str, Any] | None:
        """Obtener el primer objeto que cumpla unos filtros exactos."""
        records = self.list_records(resource, **filters)
        if not records:
            return None
        return records[0]

    def list_records(self, resource: str, **filters: Any) -> list[dict[str, Any]]:
        """Listar objetos de NetBox manejando la paginación REST."""
        endpoint = self._resource_endpoint(resource)
        params = {
            "limit": 100,
            **{key: value for key, value in filters.items() if value is not None},
        }
        results: list[dict[str, Any]] = []
        next_url: str | None = endpoint
        current_params: dict[str, Any] | None = params

        while next_url is not None:
            payload = self._request_json(
                "GET",
                next_url,
                params=current_params,
                expected_statuses=(200,),
            )
            current_params = None

            if isinstance(payload, dict) and "results" in payload:
                results.extend(payload["results"])
                next_url = payload.get("next")
                continue

            if isinstance(payload, list):
                results.extend(payload)
                break

            raise NetBoxClientError("NetBox list response has an unexpected format")

        return results

    def create_record(self, resource: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Crear un objeto arbitrario usando la API REST de NetBox."""
        return self._request_json(
            "POST",
            self._resource_endpoint(resource),
            json=payload,
            expected_statuses=(200, 201),
        )

    def update_record(
        self,
        resource: str,
        record_id: int,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Actualizar parcialmente un objeto existente."""
        return self._request_json(
            "PATCH",
            f"{self._resource_endpoint(resource)}{record_id}/",
            json=payload,
            expected_statuses=(200,),
        )

    def _ensure_sluggable_objects(
        self,
        endpoint,
        blueprints: tuple[DeviceRoleBlueprint | RackRoleBlueprint, ...],
    ) -> dict[str, list[str] | int]:
        created: list[str] = []
        existing: list[str] = []

        for blueprint in blueprints:
            current = endpoint.get(slug=blueprint.slug)
            if current is not None:
                existing.append(blueprint.slug)
                continue

            endpoint.create(
                {
                    "name": blueprint.name,
                    "slug": blueprint.slug,
                    "color": blueprint.color,
                }
            )
            created.append(blueprint.slug)

        return {
            "created": created,
            "existing": existing,
            "total_supported": len(blueprints),
        }

    def _ensure_custom_fields(self) -> dict[str, list[str] | int]:
        created: list[str] = []
        existing: list[str] = []

        for blueprint in CUSTOM_FIELD_BLUEPRINTS:
            current = self._api.extras.custom_fields.get(name=blueprint.name)
            if current is not None:
                existing.append(blueprint.name)
                continue

            self._api.extras.custom_fields.create(
                {
                    "name": blueprint.name,
                    "type": blueprint.field_type,
                    "label": blueprint.label,
                    "description": blueprint.description,
                    "object_types": list(blueprint.object_types),
                    "group_name": blueprint.group_name,
                    "required": False,
                    "ui_visible": "always",
                    "ui_editable": "yes",
                }
            )
            created.append(blueprint.name)

        return {
            "created": created,
            "existing": existing,
            "total_supported": len(CUSTOM_FIELD_BLUEPRINTS),
        }

    def bootstrap(self) -> dict:
        """Crear objetos base requeridos por GEMEROTIC en NetBox."""
        status = self.get_status()

        try:
            device_roles = self.ensure_device_roles()
            rack_roles = self._ensure_sluggable_objects(
                self._api.dcim.rack_roles,
                RACK_ROLE_BLUEPRINTS,
            )
            custom_fields = self._ensure_custom_fields()
        except (RequestError, requests.RequestException, ValueError) as exc:
            raise NetBoxClientError("NetBox bootstrap failed") from exc

        return {
            "netbox_version": status.get("netbox-version"),
            "device_roles": device_roles,
            "rack_roles": rack_roles,
            "custom_fields": custom_fields,
        }

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        expected_statuses: tuple[int, ...] = (200,),
    ) -> Any:
        """Ejecutar una petición autenticada y devolver JSON."""
        if not self.is_configured():
            raise NetBoxClientError("NetBox token is not configured")

        url = (
            path
            if path.startswith("http")
            else urljoin(f"{self.base_url}/", path.lstrip("/"))
        )

        try:
            response = self._api.http_session.request(
                method=method,
                url=url,
                params=params,
                json=json,
                headers={
                    "Accept": "application/json",
                    "Authorization": self._authorization_header(),
                },
            )
        except requests.RequestException as exc:
            raise NetBoxClientError("NetBox request failed") from exc

        if response.status_code not in expected_statuses:
            raise NetBoxClientError(
                f"NetBox request failed with status {response.status_code}"
            )

        if response.status_code == 204 or not response.content:
            return None

        try:
            return response.json()
        except ValueError as exc:
            raise NetBoxClientError("NetBox returned a non-JSON response") from exc

    def _resource_endpoint(self, resource: str) -> str:
        """Resolver la ruta REST de un recurso soportado."""
        try:
            return self.RESOURCE_ENDPOINTS[resource]
        except KeyError as exc:
            raise NetBoxClientError(
                f"Unsupported NetBox resource '{resource}'"
            ) from exc

    def import_topology(self, topology: TopologyCreate) -> dict[str, Any]:
        """Persistir una topología completa usando el importador dedicado."""
        from app.services.topology_importer import TopologyImporter

        importer = TopologyImporter(self)
        return importer.import_topology(topology)

    def clean_topology(self, topology_name: str) -> dict[str, Any]:
        """Eliminar de NetBox los objetos gestionados para una topología."""
        from app.services.topology_importer import TopologyImporter

        importer = TopologyImporter(self)
        return importer.clean_topology(topology_name)

    def _authorization_header(self) -> str:
        """Construir el header correcto para tokens NetBox v1/v2."""
        if self.token.startswith("nbt_"):
            return f"Bearer {self.token}"
        return f"Token {self.token}"
