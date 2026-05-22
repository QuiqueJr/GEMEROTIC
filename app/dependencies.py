"""
Dependencias compartidas para inyección en endpoints.
"""

from functools import lru_cache
from pathlib import Path

from app.config import settings
from app.persistence.database import get_database_session
from app.services.netbox_client import NetBoxClient
from app.services.pipeline_runner import PipelineRunner
from app.services.topology_store import TopologyStore


@lru_cache(maxsize=1)
def get_netbox_client() -> NetBoxClient:
    """Construir un cliente reutilizable de NetBox para toda la aplicación."""
    return NetBoxClient(
        base_url=settings.NETBOX_URL,
        token=settings.NETBOX_TOKEN.get_secret_value(),
        timeout_seconds=settings.NETBOX_TIMEOUT_SECONDS,
        verify_ssl=settings.NETBOX_VERIFY_SSL,
    )


@lru_cache(maxsize=1)
def get_topology_store() -> TopologyStore:
    """Construir el store local de topologías guardadas."""
    return TopologyStore()



def get_pipeline_runner() -> PipelineRunner:
    """Construir runner local del pipeline."""
    docker_host_output_root = (
        Path(settings.PIPELINE_DOCKER_HOST_OUTPUT_ROOT)
        if settings.PIPELINE_DOCKER_HOST_OUTPUT_ROOT
        else None
    )
    return PipelineRunner(docker_host_output_root=docker_host_output_root)


__all__ = [
    "get_database_session",
    "get_netbox_client",
    "get_pipeline_runner",
    "get_topology_store",
]
