# GEMEROTIC - Plataforma Digital Twin para Redes OT/IT

## Descripción del Proyecto

GEMEROTIC es un orquestador web que permite diseñar una topología de red, almacenarla en una Fuente Unica de Verdad (SSoT) y desplegarla como un Digital Twin funcional.

### Flujo Arquitectónico Completo (objetivo final)

```
UI (React Flow) -> Core API (FastAPI) -> SSoT (NetBox) -> Generador de Configuracion (Jinja2)
-> Despliegue de Infraestructura (Containerlab + Ansible) -> Validacion (Batfish)
-> Observabilidad (LibreNMS/Oxidized) -> Auditoria de Cumplimiento (OPA)
```

> **Nota:** El proyecto se construye fase por fase. El frontend esta fuera de alcance por ahora. Toda interaccion con el API se realiza mediante payloads JSON directos.

---

## Estado Actual: Step 1 - Scaffolding del Proyecto

### Que se construyó en este paso

Se creó la estructura base completa del proyecto FastAPI, siguiendo principios de escalabilidad y separacion de responsabilidades.

### Estructura de Carpetas

```
RyoukAI/
├── app/
│   ├── __init__.py
│   ├── main.py                  # Punto de entrada FastAPI (patron factory)
│   ├── config.py                # Configuración centralizada via pydantic-settings
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
│   │   ├── topology.py          # (pendiente) Modelos Pydantic para topología
│   │   └── responses.py         # (pendiente) Modelos de respuesta estandarizados
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
│   └── conftest.py              # Fixtures compartidos para pytest
│
├── .env.example                 # Plantilla de variables de entorno
├── .gitignore
├── requirements.txt
└── pyproject.toml
```

### Decisiones Arquitectónicas

| Decision | Justificación |
|---|---|
| **Patron Factory (`create_app`)** | Permite crear múltiples instancias de la app para testing sin estado compartido |
| **API versionado (`/api/v1/`)** | Preparado para cambios incompatibles futuros sin romper clientes existentes |
| **`schemas/` en lugar de `models/`** | Evita confusión con modelos ORM de base de datos (NetBox es nuestro SSoT, no tenemos ORM propio) |
| **`pydantic-settings`** | Validación y tipado de variables de entorno al arrancar, con soporte nativo para `.env` |
| **Directorios placeholder** | `templates/` e `integrations/` estan listos para fases futuras (Jinja2, Containerlab, Ansible) |

### Dependencias Instaladas

| Paquete | Version | Proposito |
|---|---|---|
| `fastapi` | >=0.115.0 | Framework web principal |
| `uvicorn[standard]` | >=0.30.0 | Servidor ASGI |
| `pydantic` | >=2.9.0 | Validación de datos |
| `pydantic-settings` | >=2.5.0 | Configuración vía entorno |
| `pynetbox` | >=7.4.0 | Cliente para API de NetBox |
| `httpx` | >=0.27.0 | Cliente HTTP async + TestClient |
| `pytest` | >=8.3.0 | Framework de testing |
| `pytest-asyncio` | >=0.24.0 | Soporte async en tests |
| `ruff` | >=0.6.0 | Linter y formateador |

### Como Ejecutar (estado actual)

```bash
# Crear entorno virtual
python -m venv .venv

# Activar entorno (Windows)
.venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Verificar que la app carga correctamente
python -c "from app.main import app; print(f'{app.title} - OK')"
```

> La app aún no tiene endpoints funcionales. Se implementaran en los siguientes pasos.

---

## Roadmap de Implementacion

| Paso | Descripcion | Estado |
|---|---|---|
| **Step 1** | Scaffolding del proyecto + dependencias | Completado |
| **Step 2** | Schemas Pydantic + tests unitarios | Pendiente |
| **Step 3** | Endpoint health + wiring básico de FastAPI | Pendiente |
| **Step 4** | Docker Compose de NetBox + guía de conexion | Pendiente |
| **Step 5** | Servicio NetBox + endpoint bootstrap | Pendiente |
| **Step 6** | Endpoint de topologia (POST /api/v1/topology) | Pendiente |
| **Step 7** | Seguridad transversal (rate limiting, error handlers) | Pendiente |

---

## Topología MVP Base

La topologia mínima que maneja el sistema consiste en:
- 1 Router
- 1 Switch
- 2 Dispositivos genéricos (Hosts/PCs)
- Enlaces físicos básicos entre ellos

```
[host-01] ── eth0 ──── eth1 ── [switch-01] ── eth0 ──── eth0 ── [router-01]
[host-02] ── eth0 ──── eth2 ──┘
```
