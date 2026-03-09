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
    APP_NAME: str = "RyoukAI"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # --- NetBox ---
    NETBOX_URL: str = "http://localhost:8000"
    NETBOX_TOKEN: str = ""

    # --- Seguridad MVP: API key estática ---
    # FUTURO: reemplazar con autenticación por usuario (JWT / OAuth2)
    #         para soportar multi-tenancy y tokens individuales de NetBox.
    API_KEY: str = ""


# Instancia única — se importa donde se necesite
settings = Settings()
