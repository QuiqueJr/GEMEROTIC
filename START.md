# START.md - Guia de Arranque y Secretos Locales

Esta guia explica como generar las claves, tokens y passwords necesarios para
levantar GEMEROTIC completo en local: NetBox, PostgreSQL, Valkey, el plugin OT y
el API FastAPI.

> Nunca commitear secretos reales. El repositorio ignora `.env` y
> `docker/netbox/env/*.local.env`.

---

## 1. Requisitos

- Python 3.11+
- Docker con Docker Compose
- Git Bash o WSL si se usa `scripts/render_netbox_env.sh`
- Entorno virtual Python instalado con las dependencias del proyecto

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e .[dev]
```

---

## 2. Secretos que necesita el proyecto

| Variable | Donde se usa | Proposito |
|---|---|---|
| `NETBOX_SECRET_KEY` | Genera `SECRET_KEY` para NetBox | Firma criptografica interna de NetBox |
| `API_TOKEN_PEPPER` | Genera `API_TOKEN_PEPPER_1` para NetBox | Pepper para tokens de API de NetBox |
| `POSTGRES_PASSWORD` | PostgreSQL | Password de la base de datos de NetBox |
| `REDIS_PASSWORD` | Valkey cola NetBox | Password del Redis/Valkey principal de NetBox |
| `REDIS_CACHE_PASSWORD` | Valkey cache NetBox | Password del Redis/Valkey de cache |
| `RATE_LIMIT_REDIS_PASSWORD` | Valkey rate limit | Password del backend compartido de rate limiting |
| `SUPERUSER_PASSWORD` | NetBox | Password del usuario admin local |
| `SUPERUSER_API_TOKEN` | NetBox | Token inicial legacy del superusuario |
| `API_KEY` | FastAPI GEMEROTIC | Clave requerida por endpoints mutantes |
| `NETBOX_TOKEN` | FastAPI GEMEROTIC | Token con el que el API habla con NetBox |
| `OLLAMA_MODEL` | FastAPI GEMEROTIC | Modelo local usado como capa opcional de explicacion |
| `OLLAMA_BASE_URL` | FastAPI GEMEROTIC | URL del API local de Ollama |

---

## 3. Generar secretos fuertes

En PowerShell:

```powershell
$env:NETBOX_SECRET_KEY = python -c "import secrets; print(secrets.token_urlsafe(64))"
$env:API_TOKEN_PEPPER = python -c "import secrets; print(secrets.token_hex(32))"
$env:POSTGRES_PASSWORD = python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:REDIS_PASSWORD = python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:REDIS_CACHE_PASSWORD = python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:RATE_LIMIT_REDIS_PASSWORD = python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:SUPERUSER_PASSWORD = python -c "import secrets; print(secrets.token_urlsafe(24))"
$env:SUPERUSER_API_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(40))"
$env:API_KEY = python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Guarda esos valores en un gestor de secretos o en un fichero local fuera de git.
Los necesitaras para regenerar el entorno.

---

## 4. Crear los env files de NetBox

El script `scripts/render_netbox_env.sh` lee las variables anteriores y genera:

- `docker/netbox/env/netbox.local.env`
- `docker/netbox/env/postgres.local.env`
- `docker/netbox/env/redis.local.env`
- `docker/netbox/env/redis-cache.local.env`
- `docker/netbox/env/rate-limit.local.env`

Desde Git Bash o WSL:

```bash
./scripts/render_netbox_env.sh --force
```

Si no exportas secretos antes de ejecutar el script, se usaran valores locales
por defecto. Sirven para CI o pruebas efimeras, pero no son recomendables para un
entorno persistente.

---

## 5. Levantar NetBox y Valkey

```powershell
docker compose -f docker/netbox/docker-compose.yml up -d --build
```

Verificar estado:

```powershell
docker compose -f docker/netbox/docker-compose.yml ps
curl http://localhost:8080/login/
```

Acceso web local:

- URL: `http://localhost:8080`
- Usuario: `gemerotic-admin`
- Password: valor de `SUPERUSER_PASSWORD`

---

## 6. Obtener el token de NetBox para FastAPI

Forma reproducible usada por CI:

```powershell
$netboxPassword = "<SUPERUSER_PASSWORD>"
$tokenPayload = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8080/api/users/tokens/provision/" `
  -ContentType "application/json" `
  -Body (@{
    username = "gemerotic-admin"
    password = $netboxPassword
  } | ConvertTo-Json)

$env:NETBOX_TOKEN = "nbt_$($tokenPayload.key).$($tokenPayload.token)"
$env:NETBOX_TOKEN
```

Ese valor `nbt_...` es el que debe guardarse como `NETBOX_TOKEN` en el `.env` de
FastAPI.

---

## 7. Crear `.env` para el API GEMEROTIC

Crear un fichero `.env` en la raiz del repo:

```env
API_KEY=<API_KEY_GENERADA>
NETBOX_URL=http://localhost:8080
NETBOX_TOKEN=<NETBOX_TOKEN_NBT>
NETBOX_TIMEOUT_SECONDS=10.0
NETBOX_VERIFY_SSL=true

RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_REDIS_URL=redis://:<RATE_LIMIT_REDIS_PASSWORD>@localhost:6380/0
RATE_LIMIT_REDIS_KEY_PREFIX=gemerotic:rate-limit
RATE_LIMIT_REDIS_CONNECT_TIMEOUT_SECONDS=0.5
RATE_LIMIT_REDIS_OPERATION_TIMEOUT_SECONDS=1.0

CORS_ALLOWED_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","http://localhost:5173","http://127.0.0.1:5173"]
```

`API_KEY` protege endpoints mutantes como:

- `POST /api/v1/netbox/bootstrap`
- `POST /api/v1/topology`

En peticiones HTTP debe enviarse como header:

```text
X-API-Key: <API_KEY_GENERADA>
```

Si quieres activar el asistente con Ollama local, añade también:

```env
COMPLIANCE_ASSISTANT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3
OLLAMA_TIMEOUT_SECONDS=30.0
OLLAMA_API_KEY=
```

`OLLAMA_API_KEY` puede quedar vacío cuando usas `http://localhost:11434`. La
documentación oficial de Ollama indica que el API local no requiere
autenticación; la API key solo aplica a accesos contra `ollama.com/api`.

---

## 8. Verificar el API

Arrancar FastAPI:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Health check:

```powershell
curl http://localhost:8000/api/v1/health
```

Respuesta esperada cuando NetBox y Valkey estan disponibles:

```json
{
  "status": "healthy",
  "app_name": "GEMEROTIC",
  "version": "0.1.0",
  "uptime_seconds": 1.23,
  "checks": {
    "netbox_connected": true,
    "rate_limit_backend_connected": true
  }
}
```

Bootstrap de NetBox:

```powershell
curl -X POST http://localhost:8000/api/v1/netbox/bootstrap `
  -H "X-API-Key: <API_KEY_GENERADA>" `
  -H "Content-Type: application/json"
```

---

## 9. Despliegue en servidor Linux

En servidor Linux se recomienda ejecutar NetBox/Valkey con el compose de
NetBox y el API con `docker-compose.api.yml`. El contenedor del API se ejecuta
con red host, socket Docker y `/run/netns` porque el Step 10 necesita lanzar
Containerlab y Ansible desde el runtime del API.

> No guardar `SERVER_PASS`, `GITHUB_TOKEN` ni credenciales SSH dentro de `.env`.
> Ese fichero solo debe contener configuracion consumida por GEMEROTIC.

Crear `.env` en la raiz del repo en el servidor:

```env
API_KEY=<API_KEY_GENERADA>
NETBOX_URL=http://127.0.0.1:8080
NETBOX_TOKEN=<NETBOX_TOKEN_NBT>
NETBOX_TIMEOUT_SECONDS=10.0
NETBOX_VERIFY_SSL=true

RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_REDIS_URL=redis://:<RATE_LIMIT_REDIS_PASSWORD>@127.0.0.1:6380/0
RATE_LIMIT_REDIS_KEY_PREFIX=gemerotic:rate-limit
RATE_LIMIT_REDIS_CONNECT_TIMEOUT_SECONDS=0.5
RATE_LIMIT_REDIS_OPERATION_TIMEOUT_SECONDS=1.0

CORS_ALLOWED_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","http://212.128.44.220:3000"]
```

Levantar o reconstruir el API y la UI:

```bash
docker compose -f docker-compose.api.yml up -d --build
```

Verificar:

```bash
curl http://127.0.0.1:8000/api/v1/health
curl -H "X-API-Key: <API_KEY_GENERADA>" http://127.0.0.1:8000/api/v1/pipeline/tools
curl -I http://127.0.0.1:3000
```

Accesos esperados:

- UI: `http://212.128.44.220:3000`
- API docs: `http://212.128.44.220:8000/docs`
- NetBox: `http://212.128.44.220:8080`

---

## 9. Probar la UI con Bun

El frontend se ejecuta con Bun, no con npm. Desde otra terminal:

```powershell
cd ui
bun install
bun run dev -- --host 127.0.0.1 --port 5173
```

Abrir la UI en:

```text
http://127.0.0.1:5173
```

En el panel derecho de la UI:

- `Base URL`: `http://localhost:8000`
- `X-API-Key`: el mismo valor de `API_KEY` usado por FastAPI

Flujo esperado:

1. Pulsar `Health` para confirmar API, NetBox y Valkey.
2. Pulsar `Bootstrap` para crear roles y custom fields base en NetBox.
3. Configurar la topologia en las vistas `Fisica`, `Logica` y `Seguridad`.
4. Pulsar `Persistir en NetBox` para enviar el payload `TopologyCreate`.

La vista `Fisica` configura activos, rack, puertos y cableado. La vista
`Logica` configura VLANs, direcciones e interfaces. La vista `Seguridad`
configura zonas IEC 62443, Purdue, Security Level y conductos.

El boton `Artefactos` genera el bundle declarativo del pipeline desde el mismo
payload:

- `containerlab/topology.clab.yml`
- `ansible/inventory.yml`
- `ansible/site.yml`
- `opa/input.json`
- `opa/policies/gemerotic_baseline.rego`
- `batfish/README.md`
- `manifest.json`

Equivale a llamar:

```powershell
curl -X POST http://localhost:8000/api/v1/pipeline/artifacts `
  -H "X-API-Key: <API_KEY_GENERADA>" `
  -H "Content-Type: application/json" `
  --data-binary "@topology.json"
```

El boton `Deploy` ejecuta el despliegue local controlado. Antes de usarlo,
verifica herramientas:

```powershell
curl http://localhost:8000/api/v1/pipeline/tools `
  -H "X-API-Key: <API_KEY_GENERADA>"
```

Para que `Deploy` funcione deben existir en el `PATH`:

- `docker`
- `containerlab`
- `ansible-playbook`

El endpoint escribira artefactos bajo `var/pipeline/<topology_name>` y ejecutara:

```powershell
containerlab deploy --topo containerlab/topology.clab.yml
ansible-playbook -i ansible/inventory.yml ansible/site.yml
```

Si falta una herramienta, el API devuelve `503` y no escribe el bundle.

Adicionalmente, la UI ya puede inspeccionar el runtime del lab y abrir una
consola controlada por nodo usando:

```powershell
curl http://localhost:8000/api/v1/pipeline/labs/<topology_name> `
  -H "X-API-Key: <API_KEY_GENERADA>"

curl -X POST http://localhost:8000/api/v1/pipeline/labs/<topology_name>/nodes/<node_id>/console `
  -H "X-API-Key: <API_KEY_GENERADA>" `
  -H "Content-Type: application/json" `
  -d '{"command":"ip link show"}'
```

En Step 10 esa consola opera sobre el runtime Linux desplegado por
Containerlab. No es todavía una CLI vendor de router, switch o firewall.

---

## 10. Activar Ollama local para el asistente de compliance

Instala y arranca Ollama en la misma máquina o servidor donde corre FastAPI. El
CLI oficial expone:

- `ollama serve` para arrancar el servicio local
- `ollama pull <modelo>` para descargar un modelo

Flujo mínimo:

```powershell
ollama serve
ollama pull gemma3
```

Después arranca FastAPI con `COMPLIANCE_ASSISTANT_PROVIDER=ollama` y
`OLLAMA_MODEL=gemma3`.

El asistente seguirá respetando estas limitaciones:

- no certifica cumplimiento legal por sí solo
- no sustituye una auditoría formal
- no evalúa controles organizativos u operativos no evidenciados en la topología

---

## 11. Mapa rapido de puertos

| Servicio | URL local |
|---|---|
| FastAPI GEMEROTIC | `http://localhost:8000` |
| Swagger/OpenAPI | `http://localhost:8000/docs` |
| NetBox | `http://localhost:8080` |
| Valkey rate limit | `localhost:6380` |
| UI GEMEROTIC | `http://127.0.0.1:5173` |

---

## 12. Checklist de problemas comunes

- Si `NETBOX_TOKEN` esta vacio, `health.checks.netbox_connected` sera `false`.
- Si `RATE_LIMIT_REDIS_URL` no usa el password correcto,
  `health.checks.rate_limit_backend_connected` sera `false`.
- Si falta `API_KEY`, los endpoints mutantes devuelven `503`.
- Si el header `X-API-Key` no coincide con `API_KEY`, los endpoints mutantes
  devuelven `401`.
- Si la UI no puede llamar al API, revisa que `CORS_ALLOWED_ORIGINS` incluya
  `http://127.0.0.1:5173`.
- Si cambias `RATE_LIMIT_REDIS_PASSWORD`, actualiza tambien
  `RATE_LIMIT_REDIS_URL` en `.env`.
- Si regeneras `docker/netbox/env/*.local.env`, reinicia el stack Docker para que
  los contenedores lean los nuevos valores.
- Si activas `COMPLIANCE_ASSISTANT_PROVIDER=ollama` pero `OLLAMA_MODEL` está
  vacío o el servicio no responde, el asistente vuelve al modo local.
