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

## Estado Actual: Step 2 - Schemas Pydantic y Tests Unitarios

### Que se construyo en este paso

Se implementaron los modelos Pydantic que definen la estructura estricta del payload JSON para topologias de red, junto con modelos de respuesta estandarizados y una suite completa de 35 tests unitarios.

### Archivos modificados/creados

| Archivo | Descripcion |
|---|---|
| `app/schemas/topology.py` | Schemas: `DeviceRole`, `InterfaceSchema`, `DeviceSchema`, `LinkSchema`, `TopologyCreate` |
| `app/schemas/responses.py` | Schemas: `APIResponse`, `APIError` (respuestas estandarizadas) |
| `tests/test_schemas.py` | 35 tests unitarios cubriendo validaciones, seguridad y casos limite |

### Modelo de Datos de la Topologia

```
TopologyCreate
├── name: str (sanitizado, lowercase, regex)
├── devices: list[DeviceSchema] (min 1)
│   ├── name: str (sanitizado, lowercase, regex)
│   ├── role: DeviceRole (enum: router | switch | host)
│   └── interfaces: list[InterfaceSchema] (min 1)
│       └── name: str (regex: alfanumericos, guiones, barras, puntos)
└── links: list[LinkSchema] (puede estar vacio)
    ├── source_device: str
    ├── source_interface: str
    ├── target_device: str
    └── target_interface: str
```

### Validaciones de Seguridad Implementadas

| Validacion | Ubicacion | Descripcion |
|---|---|---|
| Regex de nombres | `DeviceSchema`, `TopologyCreate` | Solo alfanumericos, guiones y guiones bajos |
| Regex de interfaces | `InterfaceSchema` | Alfanumericos + `/._-` (Cisco, Linux, etc.) |
| Normalizacion lowercase | `DeviceSchema`, `TopologyCreate` | Previene duplicados por diferencia de mayusculas |
| Enum estricto | `DeviceRole` | Solo acepta `router`, `switch`, `host` |
| Longitud maxima | Todos los campos `str` | Previene abuso de payload |
| Interfaces unicas | `DeviceSchema` | Rechaza interfaces duplicadas por dispositivo |
| Dispositivos unicos | `TopologyCreate` | Rechaza nombres de dispositivos duplicados |
| Enlaces referenciales | `TopologyCreate` | Verifica que dispositivos e interfaces existen |
| Enlaces unicos | `TopologyCreate` | Detecta duplicados bidireccionales (A->B = B->A) |
| Anti self-loop | `LinkSchema` | Impide enlace de una interfaz consigo misma |
| Anti inyeccion SQL | Regex de nombres | Rechaza `'; DROP TABLE` etc. |
| Anti XSS | Regex de nombres | Rechaza `<script>` etc. |

### Ejemplo de Payload JSON Valido (MVP)

```json
{
  "name": "mvp-lab-01",
  "devices": [
    {
      "name": "router-01",
      "role": "router",
      "interfaces": [{"name": "eth0"}, {"name": "eth1"}]
    },
    {
      "name": "switch-01",
      "role": "switch",
      "interfaces": [{"name": "eth0"}, {"name": "eth1"}, {"name": "eth2"}]
    },
    {
      "name": "host-01",
      "role": "host",
      "interfaces": [{"name": "eth0"}]
    },
    {
      "name": "host-02",
      "role": "host",
      "interfaces": [{"name": "eth0"}]
    }
  ],
  "links": [
    {
      "source_device": "router-01",
      "source_interface": "eth0",
      "target_device": "switch-01",
      "target_interface": "eth0"
    },
    {
      "source_device": "switch-01",
      "source_interface": "eth1",
      "target_device": "host-01",
      "target_interface": "eth0"
    },
    {
      "source_device": "switch-01",
      "source_interface": "eth2",
      "target_device": "host-02",
      "target_interface": "eth0"
    }
  ]
}
```

### Resultados de Tests

```
tests/test_schemas.py - 35 passed in 0.21s

TestInterfaceSchema       (7 tests)  - nombres validos, regex, limites
TestDeviceSchema          (9 tests)  - roles, normalizacion, duplicados
TestLinkSchema            (4 tests)  - self-loops, campos requeridos
TestTopologyCreate       (12 tests)  - MVP completo, inyeccion, referencias
TestAPIResponse           (3 tests)  - respuestas exitosas y de error
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

### Step 2 - Schemas Pydantic y Tests (paso actual)

**Decisiones arquitectonicas adicionales:**

| Decision | Justificacion |
|---|---|
| **`model_validator` para cross-field** | Validaciones que dependen de multiples campos (referencias de links, duplicados) usan `model_validator` en lugar de `field_validator` |
| **Respuestas estandarizadas** | `APIResponse` y `APIError` garantizan formato uniforme para cualquier cliente |
| **Validacion bidireccional de links** | A->B y B->A se detectan como duplicados normalizando la direccion |

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
│   │   ├── topology.py          # Modelos Pydantic para topologia
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
│   └── test_schemas.py          # 35 tests unitarios de schemas
│
├── .env.example                 # Plantilla de variables de entorno
├── .gitignore
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
| **Step 2** | Schemas Pydantic + tests unitarios | Completado |
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
- Enlaces fisicos basicos entre ellos

```
[host-01] ── eth0 ──── eth1 ── [switch-01] ── eth0 ──── eth0 ── [router-01]
[host-02] ── eth0 ──── eth2 ──┘
```
