"""
Fixtures compartidos para todos los tests.
"""

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_netbox_client
from app.main import create_app


class DisconnectedNetBoxClient:
    """Stub de NetBox para tests unitarios sin dependencias externas."""

    def health_check(self) -> bool:
        return False


@pytest.fixture()
def client() -> TestClient:
    """
    Cliente HTTP síncrono para tests de endpoints.
    Usa el patrón factory para crear una instancia limpia de la app por test.
    """
    application = create_app()
    application.dependency_overrides[get_netbox_client] = (
        lambda: DisconnectedNetBoxClient()
    )
    with TestClient(application) as c:
        yield c
