"""
Dependencias compartidas para inyección en endpoints.
"""

from functools import lru_cache

from app.config import settings
from app.services.netbox_client import NetBoxClient


@lru_cache(maxsize=1)
def get_netbox_client() -> NetBoxClient:
    """Construir un cliente reutilizable de NetBox para toda la aplicación."""
    return NetBoxClient(
        base_url=settings.NETBOX_URL,
        token=settings.NETBOX_TOKEN.get_secret_value(),
        timeout_seconds=settings.NETBOX_TIMEOUT_SECONDS,
        verify_ssl=settings.NETBOX_VERIFY_SSL,
    )
