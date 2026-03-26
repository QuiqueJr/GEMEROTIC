from netbox.plugins import PluginConfig


class NetBoxOTSecurityConfig(PluginConfig):
    name = "netbox_ot_security"
    verbose_name = "GEMEROTIC OT Security"
    description = "Modelos OT para zonas y conductos IEC 62443"
    version = "0.1.0"
    author = "Equipo GEMEROTIC"
    base_url = "ot-security"
    required_settings: list[str] = []
    default_settings: dict[str, str] = {}
    min_version = "4.5.0"
    max_version = "4.5.99"


config = NetBoxOTSecurityConfig
