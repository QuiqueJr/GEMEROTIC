# GEMEROTIC - Plataforma Digital Twin para Redes OT/IT

## Descripcion del Proyecto

GEMEROTIC es un orquestador web que permite disenar una topologia de red, almacenarla en una Fuente Unica de Verdad (SSoT) y desplegarla como un Digital Twin funcional.

### Flujo Arquitectonico Completo (objetivo final)

```
UI (React Flow) -> Core API (FastAPI) -> SSoT (NetBox) -> Generador de Configuracion (Jinja2)
-> Despliegue de Infraestructura (Containerlab + Ansible) -> Validacion (Batfish)
-> Observabilidad (LibreNMS/Oxidized) -> Auditoria de Cumplimiento (OPA)
```

> **Nota:** El proyecto se construye fase por fase. Desde Step 10, el pipeline
> puede escribir un bundle local controlado y ejecutar Containerlab + Ansible
> mediante comandos allowlistados, sin shell y protegidos por `X-API-Key`.

---

## Estado Actual: Step 11 - Validacion Batfish con Perfiles Mixtos

### Objetivo de este paso

Implementar una arquitectura de validacion hibrida en Batfish que permita analizar
redes industriales con planos de control mixtos (Network OS y Linux/Host):

```
TopologyCreate -> Mixed Pipeline -> NOS Configs + Linux JSONs -> Batfish Analysis
```

### Alcance inicial permitido

- Diferenciar generacion de artefactos por tipo de activo (`NOS` vs `Linux`).
- Plantillas Jinja2 para Arista cEOS (`nos.cfg.j2`).
- Plantillas Jinja2 para hosts Linux (`host.json.j2`, `host.iptables.j2`).
- Traduccion de `Conduits` (Capa 3) a reglas de filtrado persistentes.
- Verificacion de sintaxis y conectividad logica en Batfish.

### Avance actual dentro de Step 11

- `pipeline_artifacts.py` actualizado para manejar `ProfileType.NOS` y `ProfileType.LINUX`.
- Mapeo automatico: `ROUTER`, `SWITCH`, `FIREWALL` -> `NOS`. Resto -> `LINUX`.
- Los `Conduits` entre zonas se traducen a reglas de firewall en los hosts para validacion de segmentacion.
- Artefactos generados bajo `batfish/configs/` y `batfish/hosts/`.

### Fuera de alcance de Step 11

- No ejecutar el servidor de Batfish desde el API (solo generacion de configs).
- No implementar auditoria OPA (Step 13).
- No integrar observabilidad (Step 12).

---

## Estado Anterior: Step 10 - Ejecucion Controlada de Containerlab y Ansible

### Objetivo de este paso

Tomar los artefactos generados en Step 9 y ejecutar el despliegue local de forma
controlada:

```
TopologyCreate -> Jinja2 bundle -> Containerlab deploy -> Ansible apply
```

### Alcance inicial permitido

- Escribir bundles bajo `var/pipeline/<topology_name>`.
- Guardar el último estado validado del gemelo bajo
  `var/topologies/<topology_name>` para que el pipeline IaC no dependa de
  NetBox en tiempo de edición.
- Comprobar herramientas locales con `GET /api/v1/pipeline/tools`.
- Ejecutar `POST /api/v1/pipeline/deploy` protegido por `X-API-Key`.
- Ejecutar `POST /api/v1/pipeline/deploy/{topology_name}` desde la última
  topología guardada.
- Consultar labs desplegados con `GET /api/v1/pipeline/labs/{topology_name}`.
- Ejecutar consola controlada por nodo con
  `POST /api/v1/pipeline/labs/{topology_name}/nodes/{node_id}/console`.
- Usar comandos allowlistados con `shell=False`:
  - `containerlab deploy --topo containerlab/topology.clab.yml`
  - `ansible-playbook -i ansible/inventory.yml ansible/site.yml`
- Fallar de forma segura si falta `docker`, `containerlab` o
  `ansible-playbook`.

### Avance actual dentro de Step 10

- El smoke de NetBox en CI queda alineado con PostgreSQL 18:
  - volumen en `/var/lib/postgresql`
  - `timeout` del healthcheck ampliado a `30s`
  - logs automáticos de `postgres`, `netbox` y `netbox-worker` al finalizar el job
- La UI del builder se refinó para uso operativo:
  - workspace reorganizado al patrón de GNS3 documentado: toolbar superior,
    devices toolbar a la izquierda, canvas central, topology/server summary a
    la derecha y consola inferior
  - biblioteca OT/IT por dominio con inserción por clic y por drag and drop
  - iconografía 2D más limpia y coherente por tipo de activo: router, switch,
    firewall, PLC, HMI, RTU, servidor SCADA, patch panel y AP, basada en
    iconos Lucide reales con chasis/puertos propios del builder
  - nodos del canvas reducidos a símbolo + etiqueta para evitar ruido visual,
    con configuración por doble clic
  - herramienta de enlace tipo GNS3: selección de origen, destino, puertos,
    nombre de cable y edición posterior por doble clic
  - edición de cables con nombre propio y puertos explícitos por extremo
  - cables directos estilo GNS3, sin flechas por defecto, con etiquetas de
    interfaz opcionales y separación visual automática de enlaces paralelos
    entre los mismos equipos por puertos distintos
  - atajos de productividad (`Supr`, `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`,
    `Ctrl/Cmd+Shift+Z`, `Escape`)
  - etiquetas de interfaz ocultas por defecto, alineadas con el comportamiento
    base de GNS3
  - configuraciones del proyecto, conectividad y navegador de datos movidos a
    modales para no saturar el canvas
  - dibujo editable tipo GNS3 para la vista física y de seguridad: zonas,
    rectángulos, círculos y texto movibles, redimensionables desde el propio
    canvas, duplicables y enviados siempre al fondo frente a equipos/enlaces,
    con color, tamaño y capa visual por vista, sin contaminar el payload
    `TopologyCreate`
  - controles de zoom/fit integrados en el workspace para navegar topologías
    grandes sin depender del navegador
  - pestaña `Puertos` por equipo para activar o desactivar interfaces,
    marcarlas como gestión y asignar direccionamiento/MAC por puerto
  - consola inferior por pestañas: `Workspace` más una pestaña por equipo
    abierto, con acciones rápidas de inspección de red y envío de comandos
    allowlistados al runtime del lab
  - catálogo lateral con altura estable por tarjeta para que la distribución
    visual no cambie según el número de dispositivos de cada grupo
  - comprobación visual del entorno de despliegue desde la propia UI
  - vistas diferenciadas por capa: dibujo libre de planta/sala/rack en
    `Fisica`, conectividad y puertos en `Logica`, y zonas Purdue/SL en
    `Seguridad`
  - política de iconografía: Lucide para interfaz general y para los símbolos
    base de equipos de red/OT; Equinor Engineering Symbols y FUXA quedan como
    referencias permisivas, mientras que Cisco o packs sin licencia clara solo
    se usan como referencia visual
- Se corrige el flujo de guardado para que el editor no pierda trabajo por un
  fallo operativo de NetBox:
  - `PUT /api/v1/topology/state/{project_name}` guarda primero el estado
    visual completo del builder (`settings`, `nodes`, `edges`, `drawings`,
    vista activa y `topology` derivada) en
    `var/topologies/<project_name>/state.json`
  - `GET /api/v1/topology/state/{project_name}` recupera ese estado visual para
    rehidratar el canvas tras recargar el navegador
  - la UI guarda además un draft local inmediato antes de llamar al API; si el
    servidor devuelve un estado más antiguo o la red falla, el navegador no pisa
    la topología recién editada
  - el estado visual se guarda aunque la topología esté incompleta o totalmente
    vacía; en ese caso no se generan artefactos desplegables hasta que exista
    un `TopologyCreate` válido
  - `POST /api/v1/topology` guarda primero el `TopologyCreate` validado en el
    store local del proyecto (`var/topologies/<topology_name>`)
  - NetBox pasa a ser una sincronización derivada de mejor esfuerzo: si falla,
    el guardado sigue devolviendo `201` y la respuesta incluye
    `netbox_sync.status = failed` con el detalle del error
  - si el canvas se guarda vacío, el backend limpia en NetBox los objetos
    gestionados bajo ese `project_name` para evitar que reaparezcan dispositivos
    o cables de pruebas anteriores
  - los artefactos de Containerlab y Ansible se generan desde el último
    guardado, no desde el estado efímero del navegador
  - `POST /api/v1/pipeline/artifacts/{topology_name}` renderiza los artefactos
    desde la última topología guardada
  - `POST /api/v1/pipeline/deploy/{topology_name}` despliega con
    Containerlab + Ansible desde la última topología guardada
  - la UI ejecuta el flujo `guardar -> generar/desplegar desde guardado` para
    que Ansible y Containerlab siempre trabajen con el último cambio persistido
- Se elimina la fricción de `X-API-Key` durante el MVP:
  - `API_KEY_REQUIRED=false` permite operar endpoints mutantes sin header en
    entornos de prueba
  - si en el futuro se reactiva `API_KEY_REQUIRED=true`, la validación de
    `X-API-Key` se mantiene disponible
- Se endurece la validación de cables y recableados:
  - la UI reasigna automáticamente puertos repetidos cuando se crean varios
    enlaces sin configuración completa de puertos
  - el schema rechaza payloads externos donde un puerto físico aparece en más
    de un cable, devolviendo `422` antes de llegar a NetBox
  - el importador de NetBox elimina cables, dispositivos, interfaces y objetos
    físicos/OT obsoletos dentro del namespace de la topología, y recrea cables
    cuando cambian sus extremos
- Se separan los artefactos JSON para escalar el pipeline:
  - `topology/topology.json`
  - `topology/canvas.json`
  - `inventory/netbox_inventory.json`
  - `runtime/containerlab_nodes.json`
  - `runtime/containerlab_links.json`
  - `ansible/vars.json`
- Se incorporó una capa inicial de cumplimiento OT asistida:
  - `POST /api/v1/compliance/report` evalúa la topología contra una baseline
    GEMEROTIC trazable a `NIS2 + IEC 62443 + ISO/IEC 27001`
  - el informe devuelve controles `pass/fail/warn/not_assessed`, cobertura,
    postura global y evidencia estructurada por hallazgo
  - `POST /api/v1/compliance/chat` activa un asistente que responde en
    lenguaje natural usando los findings del informe y el contexto de la
    topología
  - el asistente puede operar en modo local determinista o en modo
    `Ollama` como capa de explicación estructurada sobre el mismo informe
  - la UI añade botón de evaluación, pestaña de compliance en el navegador de
    datos y modal de chat para revisar zonas, conduits, niveles Purdue y
    activos críticos
  - el motor determinista sigue siendo la **fuente de verdad**; Ollama solo
    explica, prioriza y conversa a partir del informe ya calculado
  - el asistente aplica guardas de scope: responde exclusivamente sobre la
    topología OT cargada y sobre la baseline normativa modelada
  - el sistema **no certifica cumplimiento legal por sí solo**, **no
    sustituye una auditoría formal** y **no evalúa controles organizativos u
    operativos no evidenciados en la topología**
- Para equipos que requieran software específico de explotación o control, la
  ruta correcta no es configurar paquetes ad hoc por nodo, sino introducir una
  futura capa de **runtime profiles**:
  - `asset_type` -> `runtime profile`
  - `runtime profile` -> imagen, rol Ansible, puertos de gestión, servicios
    esperados
  - `instancia` -> overrides locales
  Esta taxonomía OT concreta queda pendiente de decisión humana antes de
  implementarla de extremo a extremo.
- La raíz del backend (`/`) redirige a `/docs` y `favicon.ico` deja de
  generar ruido `404` en desarrollo local
- Se añade despliegue Docker para servidor Linux:
  - `Dockerfile` del API con `docker` CLI, `containerlab` y `ansible-core`
    para que `GET /api/v1/pipeline/tools` funcione dentro del contenedor
  - `docker-compose.api.yml` ejecuta el API con red host, privilegios
    controlados, socket Docker y `/run/netns`, requisitos operativos de
    Containerlab
  - `ui/Dockerfile` sirve el build de React mediante nginx en el puerto `3000`
  - la UI calcula por defecto la URL del API desde el host desde el que se
    sirve, por ejemplo `http://212.128.44.220:8000` al abrir el frontend del
    servidor

### Fuera de alcance de Step 10

- No ejecutar Batfish hasta seleccionar perfiles de NOS y templates vendor.
- No presentar la consola actual como si fuera CLI vendor: en este paso la
  consola actúa sobre el runtime Linux desplegado por Containerlab.
- No integrar LibreNMS/Oxidized hasta que el lab tenga conectividad gestionable.
- No permitir comandos arbitrarios enviados por el usuario.

---

## Estado Anterior: Step 9 - Generador de Artefactos del Pipeline

### Objetivo de este paso

Renderizar artefactos declarativos desde el payload validado `TopologyCreate`
para preparar el salto desde NetBox hacia despliegue, automatizacion,
validacion y compliance:

```
UI -> FastAPI -> NetBox -> Jinja2 -> artefactos Containerlab / Ansible / OPA
```

### Alcance inicial permitido

- Agregar Jinja2 como motor de render reproducible.
- Generar un bundle desde `TopologyCreate` con:
  - `containerlab/topology.clab.yml`
  - `ansible/inventory.yml`
  - `ansible/site.yml`
  - `opa/input.json`
  - `opa/policies/gemerotic_baseline.rego`
  - `batfish/README.md`
  - `manifest.json`
- Exponer `POST /api/v1/pipeline/artifacts` protegido por `X-API-Key`.
- Conectar la UI al endpoint para que el operador pueda revisar artefactos
  antes de cualquier ejecucion.
- Mantener tests unitarios y de endpoint para el generador.

### Fuera de alcance de Step 9

- No ejecutar Docker, Containerlab, Ansible, Batfish ni OPA desde el API.
- No inventar configuraciones vendor para Batfish sin seleccionar perfiles de
  NOS, imagenes y plantillas por tipo de activo.
- No escribir artefactos persistentes en disco desde la UI o el API.

---

## Estado Anterior: Step 8 - UI Builder OT con React Flow

### Que se construyo en este paso

Se construyo una primera interfaz profesional tipo GNS3 / Packet Tracer para
disenar topologias OT/IT de forma visual, manteniendo la arquitectura:

```
UI (React Flow) -> Core API (FastAPI) -> SSoT (NetBox)
```

La UI respeta el modelo de 3 capas:

- **Layer 1:** sitios, salas, racks, dispositivos, puertos y cables.
- **Layer 2:** interfaces logicas y VLANs.
- **Layer 3:** zonas IEC 62443, niveles Purdue, Security Levels y conductos.

- Crear un frontend React con React Flow para editar nodos y enlaces.
- Mantener un mapeo explicito desde el estado visual al schema
  `TopologyCreate`.
- Conectar la UI a:
  - `GET /api/v1/health`
  - `GET /api/v1/pipeline/tools`
  - `POST /api/v1/netbox/bootstrap`
  - `POST /api/v1/topology`
  - `POST /api/v1/pipeline/artifacts`
  - `POST /api/v1/pipeline/deploy`
  - `GET /api/v1/pipeline/labs/{topology_name}`
  - `POST /api/v1/pipeline/labs/{topology_name}/nodes/{node_id}/console`
  - `POST /api/v1/compliance/report`
  - `POST /api/v1/compliance/chat`
- Enviar `X-API-Key` desde configuracion local del navegador.
- Agregar tests de frontend y CI para build/lint/test del UI.

---

## Estado Anterior: Step 7 - Seguridad transversal

### Que se construyo hasta este punto

El backend previo al frontend ya esta operativo en localhost con NetBox real,
plugin OT nativo y seguridad transversal basada en backend compartido:

- `GET /api/v1/health` valida conectividad real con NetBox.
- `POST /api/v1/netbox/bootstrap` prepara roles de dispositivo, roles de rack
  y custom fields requeridos por GEMEROTIC.
- `POST /api/v1/topology` persiste Layer 1 y Layer 2 en NetBox core, y Layer 3
  en el plugin `netbox_ot_security`.
- NetBox se levanta con una imagen custom que instala el plugin OT y expone su
  API en `/api/plugins/ot-security/...`.
- El API aplica handlers de error uniformes, rate limiting compartido sobre
  Valkey, CORS restringido a localhost, headers defensivos y proteccion
  obligatoria por `X-API-Key` en endpoints mutantes.
- GitHub Actions valida lint global, tests, `docker compose config` y un smoke
  real del stack de NetBox, del plugin OT y del backend de rate limiting.

### Componentes nuevos o extendidos

| Ruta | Descripcion |
|---|---|
| `plugins/netbox_ot_security/` | **NUEVO** - Plugin NetBox 4.5 para `SecurityZone` y `Conduit` |
| `docker/netbox/Dockerfile` | **NUEVO** - Imagen custom de NetBox con el plugin OT instalado |
| `docker/netbox/configuration/plugins.py` | **NUEVO** - Activacion declarativa del plugin en NetBox |
| `app/services/topology_importer.py` | **NUEVO** - Traduccion del schema GEMEROTIC al modelo real de NetBox |
| `app/api/v1/endpoints/topology.py` | **IMPLEMENTADO** - Endpoint `POST /api/v1/topology` |
| `app/core/rate_limit.py` | **NUEVO** - Backend compartido de rate limiting sobre Redis/Valkey |
| `app/core/security.py` | **IMPLEMENTADO** - API key obligatoria, middleware fail-closed y headers defensivos |
| `app/core/exceptions.py` | **IMPLEMENTADO** - Respuestas de error uniformes para todo el API |
| `.github/workflows/ci.yml` | **NUEVO** - CI automatico en push/pull request |
| `scripts/render_netbox_env.sh` | **NUEVO** - Generacion reproducible de `.local.env` para NetBox |
| `docs/security/rate_limit.md` | **NUEVO** - Documentacion operativa del rate limiting compartido |
| `tests/test_topology.py` | **NUEVO** - Tests del importador y endpoint de topologia |
| `tests/test_security.py` | **NUEVO** - Tests de Step 7 |
| `tests/test_rate_limit_backend.py` | **NUEVO** - Tests unitarios del backend Redis/Valkey |

### Validacion local realizada

- `docker compose -f docker/netbox/docker-compose.yml up -d --build`
  levanta `netbox`, `netbox-worker`, `postgres`, `redis`, `redis-cache` y
  `rate-limit-store` en estado `healthy`.
- `GET /api/plugins/installed-plugins/` confirma el plugin
  `netbox_ot_security`.
- `GET /api/plugins/ot-security/security-zones/` y
  `GET /api/plugins/ot-security/conduits/` responden correctamente.
- `GET /api/v1/health` responde `200` con
  `checks.netbox_connected=true` y
  `checks.rate_limit_backend_connected=true`.
- `POST /api/v1/netbox/bootstrap` responde `200` y es idempotente.
- `POST /api/v1/topology` responde `201` y devuelve resumen de objetos
  creados/existentes en las 3 capas.
- Dos llamadas mutantes consecutivas con umbral `1/60s` devuelven `200` y
  luego `429`, usando el backend compartido en `localhost:6380`.
- Suite de tests local: `159 passed`.

### Variables de entorno adicionales del API

Ademas de `NETBOX_URL`, `NETBOX_TOKEN`, `NETBOX_TIMEOUT_SECONDS` y
`NETBOX_VERIFY_SSL`, el backend ahora requiere:

- `API_KEY` para permitir `POST /api/v1/netbox/bootstrap` y
  `POST /api/v1/topology`.
- `RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX_REQUESTS` y
  `RATE_LIMIT_WINDOW_SECONDS` para controlar el rate limiting mutante.
- `RATE_LIMIT_REDIS_URL`, `RATE_LIMIT_REDIS_KEY_PREFIX`,
  `RATE_LIMIT_REDIS_CONNECT_TIMEOUT_SECONDS` y
  `RATE_LIMIT_REDIS_OPERATION_TIMEOUT_SECONDS` para el backend compartido.
- `CORS_ALLOWED_ORIGINS` para autorizar la futura UI local
  (`localhost:3000` / `localhost:5173`) sin abrir CORS globalmente.

La documentacion completa de esta capa esta en
`docs/security/rate_limit.md`.

---

## Historial de Pasos Implementados

### Step 4 - Docker Compose NetBox + guia de conexion

### Que se construyo en este paso

Se agrego una pila local de NetBox orientada a desarrollo seguro en `localhost`,
sin colisionar con FastAPI. El stack usa Docker Compose con servicios separados
para NetBox, worker, PostgreSQL y Valkey (cola, cache y rate limiting),
ademas de archivos de entorno versionados como plantillas y secretos locales
ignorados por git.

La idea de este paso es dejar lista la Fuente Unica de Verdad (SSoT) para que
los siguientes pasos puedan:

- validar conectividad real desde FastAPI
- bootstrapear objetos base en NetBox
- persistir topologias contra la API oficial
- preparar el backend que mas tarde consumira la UI con React Flow

### Archivos modificados/creados

| Archivo | Descripcion |
|---|---|
| `docker/netbox/docker-compose.yml` | **NUEVO** - Stack local de NetBox con web, worker, PostgreSQL y Valkey |
| `docker/netbox/env/netbox.env.example` | **NUEVO** - Variables de entorno seguras para NetBox y superusuario local |
| `docker/netbox/env/postgres.env.example` | **NUEVO** - Plantilla de credenciales para PostgreSQL |
| `docker/netbox/env/redis.env.example` | **NUEVO** - Plantilla de credenciales para Valkey (cola) |
| `docker/netbox/env/redis-cache.env.example` | **NUEVO** - Plantilla de credenciales para Valkey (cache) |
| `docker/netbox/env/rate-limit.env.example` | **NUEVO** - Plantilla de credenciales para Valkey de rate limiting |
| `docker/netbox/configuration/README.md` | **NUEVO** - Punto de extension para configuracion adicional de NetBox |
| `app/config.py` | **ACTUALIZADO** - `NETBOX_URL` por defecto apunta a `http://localhost:8080` |
| `tests/test_config.py` | **NUEVO** - Test del default de `NETBOX_URL` |

### Topologia local de puertos

| Servicio | Puerto host | Puerto contenedor |
|---|---|---|
| FastAPI GEMEROTIC | `8000` | `8000` |
| NetBox | `8080` | `8080` |
| Valkey Rate Limit | `6380` | `6379` |

### Preparacion del entorno local

1. Copiar cada archivo `*.example` de `docker/netbox/env/` a su variante
   `*.local.env`.
2. Generar secretos aleatorios fuertes para:
   - `SECRET_KEY`
   - `API_TOKEN_PEPPER_1`
   - `POSTGRES_PASSWORD`
   - `REDIS_PASSWORD`
   - `REDIS_CACHE_PASSWORD`
   - `RATE_LIMIT_REDIS_PASSWORD`
   - `SUPERUSER_PASSWORD`
   - `SUPERUSER_API_TOKEN`
3. Levantar NetBox:

```bash
docker compose -f docker/netbox/docker-compose.yml up -d
```

4. Verificar salud del contenedor principal:

```bash
docker compose -f docker/netbox/docker-compose.yml ps
curl http://localhost:8080/login/
```

5. Confirmar que FastAPI mantiene su puerto independiente:

```bash
uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/api/v1/health
```

### Consideraciones de seguridad del entorno local

- Los secretos operativos reales no se commitean.
- El puerto de NetBox se fija en `8080` para evitar apuntar el health check de
  GEMEROTIC a si mismo.
- `LOGIN_REQUIRED=true` se mantiene activo en NetBox.
- CORS queda preparado solo para orígenes locales esperados de desarrollo
  (`3000` y `5173`) de cara a la futura UI.

---

### Step 3 - Health Endpoint + Wiring FastAPI

### Que se construyo en este paso

Se implemento el primer endpoint funcional del API (`GET /api/v1/health`) y se conecto el sistema completo de routing de FastAPI: factory pattern -> v1 router -> endpoint. Tambien se creo el fixture `client` de TestClient para tests de endpoints.

### Archivos modificados/creados

| Archivo | Descripcion |
|---|---|
| `app/api/v1/endpoints/health.py` | **IMPLEMENTADO** - Endpoint GET /health con status, uptime, checks (NetBox stub) |
| `app/api/v1/router.py` | **ACTUALIZADO** - Registra health_router en v1 |
| `app/main.py` | **ACTUALIZADO** - Conecta v1_router con prefijo /api/v1 |
| `tests/conftest.py` | **ACTUALIZADO** - Fixture `client` con TestClient y patron factory |
| `tests/test_health.py` | **NUEVO** - 14 tests del endpoint health (respuesta, estructura, metodos HTTP, 404) |

### Respuesta del Health Check

```
GET /api/v1/health -> 200
```

```json
{
  "status": "healthy",
  "app_name": "GEMEROTIC",
  "version": "0.1.0",
  "uptime_seconds": 12.34,
  "checks": {
    "netbox_connected": false
  }
}
```

| Campo | Tipo | Descripcion |
|---|---|---|
| `status` | string | Estado general del servicio ("healthy") |
| `app_name` | string | Nombre de la aplicacion (desde config) |
| `version` | string | Version semver (desde config) |
| `uptime_seconds` | float | Segundos desde el arranque del servicio |
| `checks.netbox_connected` | boolean | Conexion a NetBox (stub false hasta Step 5) |

### Resultados de Tests

```
tests/test_health.py  - 14 passed
tests/test_schemas.py - 108 passed
Total: 122 passed in 0.30s

TestHealthEndpoint             (9 tests)  - HTTP 200, content-type, estructura, campos, uptime
TestHealthMethodNotAllowed     (3 tests)  - POST/PUT/DELETE retornan 405
TestNotFound                   (2 tests)  - rutas inexistentes retornan 404
```

---

### Step 2 (Refactor) - Modelo de Datos de 3 Capas

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

### Step 2 (Refactor) - Modelo de Datos de 3 Capas

Se refactorizo el modelo de datos hacia una arquitectura de 3 capas alineada con estandares industriales OT (IEC 62443, Purdue, NIS2, ISO 11801, TIA-606-C). Schemas modulares en `physical.py`, `logical.py`, `ot_security.py` con 11 validadores de integridad referencial cruzada en `TopologyCreate`. 108 tests unitarios.

### Step 3 - Health Endpoint + Wiring FastAPI (paso actual)

Se implemento `GET /api/v1/health` con diagnostico del servicio (app_name, version, uptime, checks). Se conecto el sistema de routing completo (main.py -> v1_router -> health_router). Se creo el fixture `client` de TestClient. 14 tests del endpoint.

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
│   │           ├── health.py    # GET /api/v1/health (implementado)
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
│   ├── conftest.py              # Fixtures compartidos (TestClient)
│   ├── test_health.py           # 14 tests del endpoint health
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

# Levantar el servidor de desarrollo
uvicorn app.main:app --reload

# Probar el health check (en otra terminal)
curl http://localhost:8000/api/v1/health
```

---

## Roadmap de Implementacion

| Paso | Descripcion | Estado |
|---|---|---|
| **Step 1** | Scaffolding del proyecto + dependencias | Completado |
| **Step 2** | Schemas Pydantic planos + 35 tests | Completado (reemplazado) |
| **Step 2 Refactor** | Modelo de 3 capas OT + 108 tests | Completado |
| **Step 3** | Endpoint health + wiring basico de FastAPI | Completado |
| **Step 4** | Docker Compose de NetBox + guia de conexion | Completado |
| **Step 5** | Servicio NetBox + endpoint bootstrap | Completado |
| **Step 6** | Endpoint de topologia (POST /api/v1/topology) | Completado |
| **Step 7** | Seguridad transversal (rate limiting, error handlers) | Completado |
| **Step 8** | UI Builder OT con React Flow | Completado |
| Step 9 | Generador Jinja2 de artefactos del pipeline | Completado |
| **Step 10** | Ejecucion controlada de Containerlab y Ansible | Completado |
| **Step 11** | Validacion Batfish con perfiles mixtos (NOS vs Linux) | Completado |
| **Step 12** | Observabilidad LibreNMS/Oxidized | Pendiente |
| **Step 13** | Auditoria de cumplimiento OPA | Pendiente |

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
