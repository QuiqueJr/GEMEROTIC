# RyoukAI - Plataforma Digital Twin para Redes OT/IT

## Descripcion del Proyecto

RyoukAI es un orquestador web que permite disenar una topologia de red, almacenarla en una Fuente Unica de Verdad (SSoT) y desplegarla como un Digital Twin funcional.

### Flujo Arquitectonico Completo (objetivo final)

```
UI (React Flow) -> Core API (FastAPI) -> SSoT (NetBox) -> Generador de Configuracion (Jinja2)
-> Despliegue de Infraestructura (Containerlab + Ansible) -> Validacion (Batfish)
-> Observabilidad (LibreNMS/Oxidized) -> Auditoria de Cumplimiento (OPA)
```

> **Nota:** El proyecto se construye fase por fase. El frontend esta fuera de alcance por ahora. Toda interaccion con el API se realiza mediante payloads JSON directos.

---

## Estado Actual: Step 1 - Scaffolding del Proyecto

### Que se construyo en este paso

Se creo la estructura base completa del proyecto FastAPI, siguiendo principios de escalabilidad y separacion de responsabilidades.

### Estructura de Carpetas

```
RyoukAI/
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
│   │   ├── topology.py          # (pendiente) Modelos Pydantic para topologia
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

### Decisiones Arquitectonicas

| Decision | Justificacion |
|---|---|
| **Patron Factory (`create_app`)** | Permite crear multiples instancias de la app para testing sin estado compartido |
| **API versionado (`/api/v1/`)** | Preparado para cambios incompatibles futuros sin romper clientes existentes |
| **`schemas/` en lugar de `models/`** | Evita confusion con modelos ORM de base de datos (NetBox es nuestro SSoT, no tenemos ORM propio) |
| **`pydantic-settings`** | Validacion y tipado de variables de entorno al arrancar, con soporte nativo para `.env` |
| **Directorios placeholder** | `templates/` e `integrations/` estan listos para fases futuras (Jinja2, Containerlab, Ansible) |

### Dependencias Instaladas

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

> La app aun no tiene endpoints funcionales. Se implementaran en los siguientes pasos.

---

## Roadmap de Implementacion

| Paso | Descripcion | Estado |
|---|---|---|
| **Step 1** | Scaffolding del proyecto + dependencias | Completado |
| **Step 2** | Schemas Pydantic + tests unitarios | Pendiente |
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
