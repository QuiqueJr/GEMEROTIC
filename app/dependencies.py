"""
Dependencias compartidas para inyección en endpoints.
"""

from functools import lru_cache

from app.config import settings
from app.services.netbox_client import NetBoxClient
from app.services.topology_store import TopologyStore


@lru_cache(maxsize=1)
def get_netbox_client() -> NetBoxClient:
    """Construir un cliente reutilizable de NetBox para toda la aplicación."""
    return NetBoxClient(
        base_url=settings.NETBOX_URL,
        token=settings.NETBOX_TOKEN,
        timeout_seconds=settings.NETBOX_TIMEOUT_SECONDS,
        verify_ssl=settings.NETBOX_VERIFY_SSL,
    )


@lru_cache(maxsize=1)
def get_topology_store() -> TopologyStore:
    """Construir el store local de topologías guardadas."""
    return TopologyStore()
