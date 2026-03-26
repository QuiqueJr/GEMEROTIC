"""
Configuración centralizada vía variables de entorno.
Usa pydantic-settings para validar y tipar las variables al iniciar.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # No fallar si .env no existe (CI, Docker, etc.)
        env_ignore_empty=True,
    )

    # --- FastAPI ---
    APP_NAME: str = "GEMEROTIC"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # --- NetBox ---
    NETBOX_URL: str = "http://localhost:8080"
    NETBOX_TOKEN: str = ""
    NETBOX_TIMEOUT_SECONDS: float = 10.0
    NETBOX_VERIFY_SSL: bool = True

    # --- Seguridad MVP: API key estática ---
    # FUTURO: reemplazar con autenticación por usuario (JWT / OAuth2)
    #         para soportar multi-tenancy y tokens individuales de NetBox.
    API_KEY: str = ""
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_MAX_REQUESTS: int = 60
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    CORS_ALLOWED_ORIGINS: tuple[str, ...] = (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )


# Instancia única — se importa donde se necesite
settings = Settings()
