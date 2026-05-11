"""
Configuración centralizada vía variables de entorno.
Usa pydantic-settings para validar y tipar las variables al iniciar.
"""

from typing import Literal

from pydantic import RedisDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # No fallar si .env no existe (CI, Docker, etc.)
        env_ignore_empty=True,
        # Aceptar nombres de variables de entorno habituales en Linux.
        case_sensitive=False,
        # Ignorar variables operativas ajenas al API si aparecen en .env local.
        extra="ignore",
    )

    # --- FastAPI ---
    APP_NAME: str = "GEMEROTIC"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # --- NetBox ---
    NETBOX_URL: str = "http://localhost:8080"
    NETBOX_TOKEN: SecretStr = SecretStr("")
    NETBOX_TIMEOUT_SECONDS: float = 10.0
    NETBOX_VERIFY_SSL: bool = True
    NETBOX_SINGLE_PROJECT_MODE: bool = True

    # --- Seguridad MVP: API key opcional durante pruebas ---
    # FUTURO: reactivar por entorno y reemplazar con usuario (JWT / OAuth2)
    #         para soportar multi-tenancy y tokens individuales de NetBox.
    API_KEY_REQUIRED: bool = False
    API_KEY: SecretStr = SecretStr("")
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_MAX_REQUESTS: int = 60
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_REDIS_URL: RedisDsn = RedisDsn(
        "redis://:gemerotic-rate-limit-password@localhost:6380/0"
    )
    RATE_LIMIT_REDIS_KEY_PREFIX: str = "gemerotic:rate-limit"
    RATE_LIMIT_REDIS_CONNECT_TIMEOUT_SECONDS: float = 0.5
    RATE_LIMIT_REDIS_OPERATION_TIMEOUT_SECONDS: float = 1.0
    CORS_ALLOWED_ORIGINS: tuple[str, ...] = (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://212.128.44.220:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )

    # --- Proxy y Red ---
    TRUSTED_PROXIES: list[str] = []

    # --- Asistente de cumplimiento ---
    COMPLIANCE_ASSISTANT_PROVIDER: Literal["local", "ollama"] = "local"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = ""
    OLLAMA_TIMEOUT_SECONDS: float = 30.0
    OLLAMA_API_KEY: SecretStr = SecretStr("")


# Instancia única — se importa donde se necesite
settings = Settings()
