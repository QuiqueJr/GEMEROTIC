"""
Validadores compartidos y funciones auxiliares de sanitización.

Centraliza la lógica de validación regex para reutilizar en todas las capas
del modelo de datos. Previene inyección SQL, XSS y abuso de payload.
"""

import re

# =============================================================================
# Patrones regex reutilizables
# =============================================================================

# Identificadores: alfanuméricos, guiones y guiones bajos
# para IDs y nombres de dispositivos.
SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")

# Nombres de interfaz: incluye barras y puntos (GigabitEthernet0/0/1, eth0.100)
INTERFACE_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9/_.-]+$")

# Nombres descriptivos: permite espacios (para nombres de salas, zonas, etc.)
LABEL_PATTERN = re.compile(r"^[a-zA-Z0-9 _-]+$")

# MAC address: formato IEEE 802 (AA:BB:CC:DD:EE:FF o AA-BB-CC-DD-EE-FF)
MAC_PATTERN = re.compile(r"^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$")


# =============================================================================
# Funciones de validación reutilizables
# =============================================================================

def validate_slug(value: str, field_name: str) -> str:
    """Validar y normalizar un identificador tipo slug (lowercase, sin espacios)."""
    if not SLUG_PATTERN.match(value):
        raise ValueError(
            f"{field_name} must contain only alphanumeric characters, "
            f"hyphens, and underscores"
        )
    return value.lower()


def validate_interface_name(value: str) -> str:
    """Validar nombre de interfaz permitiendo caracteres de nomenclatura de red."""
    if not INTERFACE_NAME_PATTERN.match(value):
        raise ValueError(
            "Interface name must contain only alphanumeric characters, "
            "hyphens, underscores, forward slashes, and dots"
        )
    return value


def validate_label(value: str, field_name: str) -> str:
    """Validar nombre descriptivo permitiendo espacios (no normaliza a lowercase)."""
    if not LABEL_PATTERN.match(value):
        raise ValueError(
            f"{field_name} must contain only alphanumeric characters, "
            f"spaces, hyphens, and underscores"
        )
    return value


def validate_mac_address(value: str) -> str:
    """Validar y normalizar dirección MAC al formato uppercase con dos puntos."""
    normalized = value.upper().replace("-", ":")
    if not MAC_PATTERN.match(normalized):
        raise ValueError(
            "MAC address must be in format AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF"
        )
    return normalized


def find_duplicates(items: list[str]) -> set[str]:
    """Encontrar elementos duplicados en una lista."""
    return {item for item in items if items.count(item) > 1}
