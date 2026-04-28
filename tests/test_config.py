"""
Tests de configuracion del proyecto.

Verifica defaults criticos usados para la integracion local con NetBox.
"""

from app.config import Settings


class TestSettings:
    """Tests para defaults y overrides de configuracion."""

    def test_netbox_url_uses_local_stack_port_by_default(self, monkeypatch):
        """El stack local de NetBox no debe colisionar con FastAPI en localhost."""
        monkeypatch.delenv("NETBOX_URL", raising=False)

        settings = Settings(_env_file=None)

        assert settings.NETBOX_URL == "http://localhost:8080"

    def test_netbox_timeout_has_secure_default(self, monkeypatch):
        """El cliente de NetBox debe usar un timeout finito por defecto."""
        monkeypatch.delenv("NETBOX_TIMEOUT_SECONDS", raising=False)

        settings = Settings(_env_file=None)

        assert settings.NETBOX_TIMEOUT_SECONDS == 10.0

    def test_rate_limit_defaults_are_finite(self, monkeypatch):
        """El rate limiting no debe quedar desactivado por defecto."""
        monkeypatch.delenv("RATE_LIMIT_ENABLED", raising=False)
        monkeypatch.delenv("RATE_LIMIT_MAX_REQUESTS", raising=False)
        monkeypatch.delenv("RATE_LIMIT_WINDOW_SECONDS", raising=False)

        settings = Settings(_env_file=None)

        assert settings.RATE_LIMIT_ENABLED is True
        assert settings.RATE_LIMIT_MAX_REQUESTS == 60
        assert settings.RATE_LIMIT_WINDOW_SECONDS == 60

    def test_cors_defaults_allow_local_frontend_hosts(self, monkeypatch):
        """La futura UI local debe poder conectar sin abrir CORS globalmente."""
        monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)

        settings = Settings(_env_file=None)

        assert "http://localhost:5173" in settings.CORS_ALLOWED_ORIGINS
        assert "http://localhost:3000" in settings.CORS_ALLOWED_ORIGINS

    def test_rate_limit_defaults_are_enabled(self, monkeypatch):
        """El rate limiting debe activarse por defecto en el API."""
        monkeypatch.delenv("RATE_LIMIT_ENABLED", raising=False)
        monkeypatch.delenv("RATE_LIMIT_MAX_REQUESTS", raising=False)
        monkeypatch.delenv("RATE_LIMIT_WINDOW_SECONDS", raising=False)

        settings = Settings(_env_file=None)

        assert settings.RATE_LIMIT_ENABLED is True
        assert settings.RATE_LIMIT_MAX_REQUESTS == 60
        assert settings.RATE_LIMIT_WINDOW_SECONDS == 60

    def test_rate_limit_redis_defaults_point_to_local_shared_store(self, monkeypatch):
        """El backend compartido debe apuntar al Valkey local por defecto."""
        monkeypatch.delenv("RATE_LIMIT_REDIS_URL", raising=False)
        monkeypatch.delenv("RATE_LIMIT_REDIS_KEY_PREFIX", raising=False)

        settings = Settings(_env_file=None)

        assert settings.RATE_LIMIT_REDIS_URL == (
            "redis://:gemerotic-rate-limit-password@localhost:6380/0"
        )
        assert settings.RATE_LIMIT_REDIS_KEY_PREFIX == "gemerotic:rate-limit"

    def test_settings_ignore_non_api_operational_variables(self, monkeypatch):
        """Variables de despliegue ajenas al API no deben romper el arranque."""
        monkeypatch.setenv("SERVER_IP", "127.0.0.1")
        monkeypatch.setenv("SERVER_USER", "operator")
        monkeypatch.setenv("GITHUB_TOKEN", "dummy-token")

        settings = Settings(_env_file=None)

        assert settings.APP_NAME == "GEMEROTIC"
