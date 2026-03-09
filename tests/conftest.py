"""
Fixtures compartidos para todos los tests.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client() -> TestClient:
    """
    Cliente HTTP síncrono para tests de endpoints.
    Usa el patrón factory para crear una instancia limpia de la app por test.
    """
    application = create_app()
    with TestClient(application) as c:
        yield c
