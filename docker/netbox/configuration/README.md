# Configuracion adicional de NetBox

Este directorio queda reservado para extensiones futuras de NetBox.

En Step 4 no se monta dentro del contenedor porque una carpeta vacia en
`/etc/netbox/config` sobrescribe la configuracion oficial incluida por la
imagen y rompe el arranque.

Cuando GEMEROTIC necesite configuracion avanzada (`extra.py`, scripts,
reports o plugins), este sera el punto natural para añadirla junto con el
montaje explicito correspondiente en Docker Compose.
