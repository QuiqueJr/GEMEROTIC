# GEMEROTIC - Plataforma Digital Twin para Redes OT/IT

## Descripcion del Proyecto

GEMEROTIC es un orquestador web que permite disenar una topologia de red, almacenarla en una Fuente Unica de Verdad (SSoT) y desplegarla como un Digital Twin funcional.

### Flujo Arquitectonico Completo (objetivo final)

```
UI (React Flow) -> Core API (FastAPI) -> SSoT (NetBox) -> Generador de Configuracion (Jinja2)
-> Despliegue de Infraestructura (Containerlab + Ansible) -> Validacion (Batfish)
-> Observabilidad (LibreNMS/Oxidized) -> Auditoria de Cumplimiento (OPA)
```

> **Nota:** El proyecto se construye fase por fase. El frontend esta fuera de alcance por ahora. Toda interaccion con el API se realiza mediante payloads JSON directos.

---

## Estado Actual: Step 2 (Refactor) - Modelo de Datos de 3 Capas

### Que se construyo en este paso

Se refactorizo completamente el modelo de datos original (schemas planos) hacia una **arquitectura de 3 capas** alineada con estandares industriales OT:

- **IEC 62443** - Zonas y conductos de seguridad
- **Modelo Purdue (ISA-95)** - Niveles 0-5 de segmentacion OT/IT
- **NIS2** - Niveles de criticidad para analisis de riesgo
- **ISO 11801 / TIA-606-C** - Cableado estructurado y patch panels
- **TIA-568** - Categorias de cable

El modelo soporta tanto topologias MVP simples como despliegues enterprise completos, manteniendo todos los campos OT/compliance como opcionales.

### Archivos modificados/creados

| Archivo | Descripcion |
|---|---|
| `app/schemas/validators.py` | **NUEVO** - Validadores compartidos: regex slug, label, MAC, interface name, deteccion de duplicados |
| `app/schemas/physical.py` | **NUEVO** - Layer 1: Sites, Rooms, Racks, Devices, Ports, Patch Panels, Cables |
| `app/schemas/logical.py` | **NUEVO** - Layer 2: Interfaces logicas (MAC, IPv4, IPv6), VLANs |
| `app/schemas/ot_security.py` | **NUEVO** - Layer 3: Zonas IEC 62443, Conductos, Purdue Levels, Security Levels |
| `app/schemas/topology.py` | **REESCRITO** - Schema raiz TopologyCreate uniendo las 3 capas con validacion referencial cruzada |
| `tests/test_schemas.py` | **REESCRITO** - 108 tests cubriendo las 3 capas, integridad referencial y seguridad |

### Modelo de Datos: Arquitectura de 3 Capas

```
TopologyCreate
├── name: str (slug, lowercase)
├── description: Optional[str]
│
├── === LAYER 1: Infraestructura Fisica ===
├── sites: list[SiteSchema]              (min 1 - plantas, edificios)
├── rooms: list[RoomSchema]              (salas dentro de sitios)
├── racks: list[RackSchema]              (gabinetes 19", tipo: network/server/ot/patch/mixed)
├── devices: list[DeviceSchema]          (min 1 - con AssetType: router/switch/firewall/host/
│   │                                      server/plc/hmi/rtu/scada_server/patch_panel/wireless_ap)
│   ├── ports: list[DevicePortSchema]    (min 1 - ID formato device_id:port_name)
│   ├── criticality: Criticality         (critical/high/medium/low - NIS2)
│   └── rack_id, rack_position, manufacturer, model, firmware, serial (opcionales)
├── patch_panels: list[PatchPanelSchema] (front_port / rear_port - TIA-606-C)
├── cables: list[CableSchema]           (2 terminaciones, medio: copper/fiber/serial/coaxial)
│
├── === LAYER 2: Conectividad Logica ===
├── interfaces: list[InterfaceLogicalSchema]  (MAC, IPv4/CIDR, IPv6/CIDR, mgmt_only, enabled)
├── vlans: list[VLANSchema]                   (vlan_id 1-4094, interfaces asignadas)
│
└── === LAYER 3: Seguridad OT ===
    ├── security_zones: list[SecurityZoneSchema]  (Purdue 0-5, SL-0 a SL-4, device_ids)
    └── conduits: list[ConduitSchema]             (zona origen/destino, protocolos permitidos)
```

### Validaciones de Integridad Referencial (TopologyCreate)

| Validacion | Descripcion |
|---|---|
| IDs unicos por coleccion | No permite duplicados de Site, Room, Rack, Device, Cable, VLAN, Zone, Conduit |
| Rooms -> Sites | Cada sala debe referenciar un sitio existente |
| Racks -> Rooms | Cada rack debe referenciar una sala existente |
| Devices -> Racks | Dispositivos con rack_id deben referenciar un rack existente |
| Panels -> Racks | Patch panels deben referenciar un rack existente |
| Cable terminations -> Ports | Cada terminacion de cable referencia un puerto valido (device o panel) |
| Cables duplicados | Detecta duplicados bidireccionales (A-B = B-A) |
| Interfaces -> Ports | Cada interfaz logica referencia un puerto fisico existente |
| VLANs -> Ports | Interfaces asignadas a VLANs deben ser puertos existentes |
| Zones -> Devices | Dispositivos en zonas de seguridad deben existir |
| Conduits -> Zones | Conductos deben referenciar zonas existentes |

### Validaciones de Seguridad Implementadas

| Validacion | Ubicacion | Descripcion |
|---|---|---|
| Regex slug | IDs de todos los modelos | Solo alfanumericos, guiones y guiones bajos |
| Regex label | Nombres descriptivos | Alfanumericos + espacios, guiones, guiones bajos |
| Regex interface | Nombres de puertos | Alfanumericos + `/._-` (Cisco, Linux, etc.) |
| Regex MAC | InterfaceLogicalSchema | Formato IEEE 802 (AA:BB:CC:DD:EE:FF) |
| IPv4/IPv6 CIDR | InterfaceLogicalSchema | Validacion via `ipaddress` stdlib |
| Normalizacion lowercase | Todos los IDs | Previene duplicados por diferencia de mayusculas |
| Longitud maxima | Todos los campos str | Previene abuso de payload |
| Anti self-loop | CableSchema, ConduitSchema | Impide conexiones consigo mismo |
| Anti inyeccion SQL | Regex en IDs y nombres | Rechaza `'; DROP TABLE` etc. |
| Anti XSS | Regex en IDs y nombres | Rechaza `<script>` etc. |
| Anti command injection | Regex en puertos | Rechaza `$(whoami)` etc. |

### Ejemplo de Payload JSON Valido (MVP con 3 Capas)

```json
{
  "name": "mvp-lab-01",
  "sites": [{"id": "site-main", "name": "Planta Principal"}],
  "rooms": [{"id": "room-srv-01", "name": "Cuarto Servidores", "site_id": "site-main"}],
  "racks": [{"id": "rack-net-01", "name": "Rack Red 01", "room_id": "room-srv-01"}],
  "devices": [
    {
      "id": "router-01", "name": "Router Core", "asset_type": "router",
      "rack_id": "rack-net-01",
      "ports": [
        {"id": "router-01:eth0", "name": "eth0"},
        {"id": "router-01:eth1", "name": "eth1"}
      ]
    },
    {
      "id": "switch-01", "name": "Switch Acceso", "asset_type": "switch",
      "rack_id": "rack-net-01",
      "ports": [
        {"id": "switch-01:eth0", "name": "eth0"},
        {"id": "switch-01:eth1", "name": "eth1"},
        {"id": "switch-01:eth2", "name": "eth2"}
      ]
    },
    {
      "id": "host-01", "name": "Host 01", "asset_type": "host",
      "ports": [{"id": "host-01:eth0", "name": "eth0"}]
    },
    {
      "id": "host-02", "name": "Host 02", "asset_type": "host",
      "ports": [{"id": "host-02:eth0", "name": "eth0"}]
    }
  ],
  "cables": [
    {"id": "cable-001", "terminations": [{"port_id": "router-01:eth0"}, {"port_id": "switch-01:eth0"}]},
    {"id": "cable-002", "terminations": [{"port_id": "switch-01:eth1"}, {"port_id": "host-01:eth0"}]},
    {"id": "cable-003", "terminations": [{"port_id": "switch-01:eth2"}, {"port_id": "host-02:eth0"}]}
  ],
  "interfaces": [
    {"port_id": "router-01:eth0", "ipv4_address": "10.0.0.1/30", "mac_address": "00:1A:2B:3C:4D:01"}
  ],
  "vlans": [
    {"id": "vlan-100-corp", "vlan_id": 100, "name": "Corporativa",
     "assigned_interfaces": ["switch-01:eth1", "switch-01:eth2"]}
  ],
  "security_zones": [
    {"id": "zone-it", "name": "Zona IT", "purdue_level": 4, "security_level": "SL-2",
     "device_ids": ["router-01", "switch-01"]},
    {"id": "zone-endpoints", "name": "Zona Endpoints", "purdue_level": 5, "security_level": "SL-1",
     "device_ids": ["host-01", "host-02"]}
  ],
  "conduits": [
    {"id": "conduit-it-endpoints", "name": "Conducto IT a Endpoints",
     "source_zone_id": "zone-it", "target_zone_id": "zone-endpoints",
     "allowed_protocols": ["HTTPS", "SSH"]}
  ]
}
```

### Resultados de Tests

```
tests/test_schemas.py - 108 passed in 0.36s

TestValidators                         (15 tests)  - slugs, labels, MAC, interfaces, duplicados
TestSiteSchema                          (6 tests)  - IDs, nombres, XSS
TestRoomSchema                          (2 tests)  - referencias a sitios
TestRackSchema                          (4 tests)  - tipos, alturas, limites
TestDevicePortSchema                    (4 tests)  - formato ID, inyeccion
TestDeviceSchema                       (12 tests)  - asset types IT/OT, puertos, criticidad, prefijos
TestPatchPanelSchema                    (5 tests)  - port types, prefijos, limites
TestCableSchema                         (7 tests)  - terminaciones, medios, self-loop
TestInterfaceLogicalSchema              (8 tests)  - MAC, IPv4, IPv6, CIDR
TestVLANSchema                          (8 tests)  - rangos 1-4094, duplicados, referencias
TestSecurityZoneSchema                  (6 tests)  - Purdue 0-5, SL-0 a SL-4, duplicados
TestConduitSchema                       (4 tests)  - zonas distintas, defaults
TestTopologyCreateMVP                   (3 tests)  - payload completo, minimal, normalizacion
TestTopologyReferentialIntegrityL1      (5 tests)  - jerarquia sites>rooms>racks>devices>panels
TestTopologyReferentialCables           (3 tests)  - puertos inexistentes, duplicados
TestTopologyReferentialIntegrityL2      (2 tests)  - interfaces y VLANs a puertos
TestTopologyReferentialIntegrityL3      (2 tests)  - zonas a devices, conductos a zonas
TestTopologyDuplicateIDs                (3 tests)  - IDs duplicados por coleccion
TestSecurityInjection                   (5 tests)  - SQL, XSS, command injection, oversized
TestAPIResponse                         (3 tests)  - respuestas exitosas y de error
```

---

## Historial de Pasos

### Step 1 - Scaffolding del Proyecto

Se creo la estructura base completa del proyecto FastAPI, siguiendo principios de escalabilidad y separacion de responsabilidades.

**Decisiones arquitectonicas:**

| Decision | Justificacion |
|---|---|
| **Patron Factory (`create_app`)** | Permite crear multiples instancias de la app para testing sin estado compartido |
| **API versionado (`/api/v1/`)** | Preparado para cambios incompatibles futuros sin romper clientes existentes |
| **`schemas/` en lugar de `models/`** | Evita confusion con modelos ORM de base de datos (NetBox es nuestro SSoT, no tenemos ORM propio) |
| **`pydantic-settings`** | Validacion y tipado de variables de entorno al arrancar, con soporte nativo para `.env` |
| **Directorios placeholder** | `templates/` e `integrations/` estan listos para fases futuras (Jinja2, Containerlab, Ansible) |

### Step 2 (Original) - Schemas Planos + 35 Tests

Se implementaron schemas Pydantic simples (`DeviceRole`, `InterfaceSchema`, `DeviceSchema`, `LinkSchema`, `TopologyCreate`) con 35 tests unitarios. **Reemplazado por el refactor a continuacion.**

### Step 2 (Refactor) - Modelo de Datos de 3 Capas OT (paso actual)

Se refactorizo completamente el modelo de datos hacia una arquitectura de 3 capas alineada con estandares industriales. Los schemas planos fueron reemplazados por un sistema modular con validacion referencial cruzada entre capas.

**Decisiones arquitectonicas del refactor:**

| Decision | Justificacion |
|---|---|
| **3 capas (fisico, logico, seguridad)** | Mapeo directo a estandares IEC 62443 / Purdue / NIS2 |
| **Schemas en modulos separados** | `physical.py`, `logical.py`, `ot_security.py`, `topology.py` para mantenibilidad |
| **String IDs con regex** | Mapea a slugs de NetBox, validacion estricta contra inyeccion |
| **Campos OT opcionales (None default)** | Mantiene MVP limpio pero soporta payloads enterprise |
| **Port ID formato `device:port`** | Identificacion global unica sin UUIDs, legible y compatible con NetBox |
| **Validadores centralizados** | `validators.py` con funciones reutilizables evita duplicacion de regex |
| **model_validator para referencias cruzadas** | 11 validadores en TopologyCreate verifican integridad entre las 3 capas |
| **AssetType con tipos OT** | PLC, HMI, RTU, SCADA_SERVER como ciudadanos de primera clase |
| **CableSchema con terminaciones** | Modelo punto-a-punto con 2 terminaciones, soporta rutas Device->Panel->Device |

---

## Estructura de Carpetas

```
GEMEROTIC/
├── app/
│   ├── __init__.py
│   ├── main.py                  # Punto de entrada FastAPI (patron factory)
│   ├── config.py                # Configuracion centralizada via pydantic-settings
│   ├── dependencies.py          # Dependencias compartidas (inyeccion)
│   │
│   ├── api/
│   │   └── v1/
│   │       ├── router.py        # Router agregado v1
│   │       └── endpoints/
│   │           ├── health.py    # (pendiente) GET /health
│   │           └── topology.py  # (pendiente) POST /topology
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── validators.py        # Validadores compartidos (regex, sanitizacion)
│   │   ├── physical.py          # Layer 1: Sites, Rooms, Racks, Devices, Panels, Cables
│   │   ├── logical.py           # Layer 2: Interfaces logicas, VLANs
│   │   ├── ot_security.py       # Layer 3: Zonas IEC 62443, Conductos, Purdue
│   │   ├── topology.py          # Schema raiz TopologyCreate (une las 3 capas)
│   │   └── responses.py         # Modelos de respuesta estandarizados
│   │
│   ├── services/
│   │   └── netbox_client.py     # (pendiente) Wrapper de pynetbox
│   │
│   ├── core/
│   │   ├── security.py          # (pendiente) Rate limiting, API key
│   │   └── exceptions.py        # (pendiente) Manejadores de excepciones
│   │
│   ├── templates/               # (futuro) Plantillas Jinja2
│   └── integrations/            # (futuro) Containerlab, Ansible, Batfish
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py              # Fixtures compartidos para pytest
│   └── test_schemas.py          # 108 tests unitarios (3 capas + seguridad)
│
├── .env.example                 # Plantilla de variables de entorno
├── .gitignore
├── README.md
├── requirements.txt
└── pyproject.toml
```

## Dependencias Instaladas

| Paquete | Version | Proposito |
|---|---|---|
| `fastapi` | >=0.115.0 | Framework web principal |
| `uvicorn[standard]` | >=0.30.0 | Servidor ASGI |
| `pydantic` | >=2.9.0 | Validacion de datos |
| `pydantic-settings` | >=2.5.0 | Configuracion via entorno |
| `pynetbox` | >=7.4.0 | Cliente para API de NetBox |
| `httpx` | >=0.27.0 | Cliente HTTP async + TestClient |
| `pytest` | >=8.3.0 | Framework de testing |
| `pytest-asyncio` | >=0.24.0 | Soporte async en tests |
| `ruff` | >=0.6.0 | Linter y formateador |

## Como Ejecutar

```bash
# Crear entorno virtual
python -m venv .venv

# Activar entorno (Windows)
.venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Verificar que la app carga correctamente
python -c "from app.main import app; print(f'{app.title} - OK')"

# Ejecutar tests
python -m pytest tests/ -v
```

---

## Roadmap de Implementacion

| Paso | Descripcion | Estado |
|---|---|---|
| **Step 1** | Scaffolding del proyecto + dependencias | Completado |
| **Step 2** | Schemas Pydantic planos + 35 tests | Completado (reemplazado) |
| **Step 2 Refactor** | Modelo de 3 capas OT + 108 tests | Completado |
| **Step 3** | Endpoint health + wiring basico de FastAPI | Pendiente |
| **Step 4** | Docker Compose de NetBox + guia de conexion | Pendiente |
| **Step 5** | Servicio NetBox + endpoint bootstrap | Pendiente |
| **Step 6** | Endpoint de topologia (POST /api/v1/topology) | Pendiente |
| **Step 7** | Seguridad transversal (rate limiting, error handlers) | Pendiente |

---

## Topologia MVP Base

La topologia minima que maneja el sistema consiste en:
- 1 Router
- 1 Switch
- 2 Dispositivos genericos (Hosts/PCs)
- Enlaces fisicos (cables) entre ellos
- Opcionalmente: interfaces logicas, VLANs, zonas de seguridad, conductos

```
[host-01] ── eth0 ──── eth1 ── [switch-01] ── eth0 ──── eth0 ── [router-01]
[host-02] ── eth0 ──── eth2 ──┘
```
