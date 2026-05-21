"""
Fixtures compartidos para todos los tests.
"""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.rate_limit import RateLimitDecision
from app.dependencies import get_netbox_client
from app.main import create_app
from app.persistence.database import reset_engine_for_tests


class DisconnectedNetBoxClient:
    """Stub de NetBox para tests unitarios sin dependencias externas."""

    def health_check(self) -> bool:
        return False


class AllowAllRateLimiter:
    """Stub de rate limiting que siempre permite la operación."""

    async def consume(
        self,
        bucket_key: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        return RateLimitDecision(
            allowed=True,
            remaining=max(limit - 1, 0),
            retry_after_seconds=0,
        )

    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        return None


@pytest.fixture(autouse=True)
def isolated_runtime_settings(monkeypatch):
    """
    Aisla los tests del .env real de despliegue.
    """
    monkeypatch.setattr(settings, "GRANULAR_STORE_ENABLED", False)
    monkeypatch.setattr(settings, "AUTO_DEPLOY_ON_SAVE", False)
    monkeypatch.setattr(settings, "DATABASE_URL", "sqlite:///./var/test.db")
    reset_engine_for_tests()
    yield
    reset_engine_for_tests()


@pytest.fixture()
def client() -> TestClient:
    """
    Cliente HTTP síncrono para tests de endpoints.
    Usa el patrón factory para crear una instancia limpia de la app por test.
    """
    application = create_app(rate_limiter=AllowAllRateLimiter())
    application.dependency_overrides[get_netbox_client] = (
        lambda: DisconnectedNetBoxClient()
    )
    with TestClient(application) as c:
        yield c
