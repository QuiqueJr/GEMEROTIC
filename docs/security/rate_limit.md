# Rate Limiting Compartido en GEMEROTIC

## Objetivo

El rate limiting del backend ya no vive en memoria dentro del proceso de
FastAPI. Ahora usa un backend compartido sobre Valkey para que el control sea:

- consistente entre múltiples réplicas
- resistente a reinicios del proceso
- válido para despliegues reales más allá de `localhost`

## Arquitectura

```text
Cliente -> Reverse Proxy / Gateway -> FastAPI -> Valkey dedicado de rate limiting
                                      |
                                      -> NetBox
```

### Decisiones tomadas

- Se usa una **ventana deslizante** sobre `sorted sets`.
- El tiempo de referencia se toma desde Valkey, no desde el reloj local del
  proceso Python.
- El backend opera en **modo fail-closed**:
  si Valkey no responde, los endpoints mutantes devuelven `503`.
- La clave de bucket combina:
  - fingerprint del `X-API-Key` válido configurado, o bucket anónimo si la
    cabecera no coincide
  - IP cliente efectiva
  - método HTTP
  - ruta

## Variables de entorno

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_REDIS_URL=redis://:gemerotic-rate-limit-password@localhost:6380/0
RATE_LIMIT_REDIS_KEY_PREFIX=gemerotic:rate-limit
RATE_LIMIT_REDIS_CONNECT_TIMEOUT_SECONDS=0.5
RATE_LIMIT_REDIS_OPERATION_TIMEOUT_SECONDS=1.0
```

## Servicio local dedicado

El stack local levanta un Valkey específico para GEMEROTIC:

- servicio Docker: `rate-limit-store`
- contenedor: `gemerotic-rate-limit-store`
- puerto host: `6380`

Este servicio es **independiente** de los Redis/Valkey usados por NetBox.

## Comportamiento operativo

### Si todo está bien

- `GET /api/v1/health` reporta
  `checks.rate_limit_backend_connected=true`
- la primera petición mutante permitida responde normalmente
- al superar el umbral:
  - el API devuelve `429`
  - expone `Retry-After`
  - expone `X-RateLimit-Limit`
  - expone `X-RateLimit-Remaining`

### Si el backend compartido cae

- `GET /api/v1/health` reporta
  `checks.rate_limit_backend_connected=false`
- los endpoints mutantes devuelven `503`
- el mensaje de error es `Rate limit backend unavailable`

## Prueba manual rápida

1. Regenerar envs locales del stack:

```bash
./scripts/render_netbox_env.sh --force
```

2. Levantar el stack:

```bash
docker compose -f docker/netbox/docker-compose.yml up -d --build
```

3. Configurar `.env` del API con:

```env
API_KEY=tu_clave
NETBOX_URL=http://localhost:8080
NETBOX_TOKEN=nbt_<key>.<token>
RATE_LIMIT_REDIS_URL=redis://:gemerotic-rate-limit-password@localhost:6380/0
```

4. Levantar FastAPI:

```bash
uvicorn app.main:app --reload --port 8000
```

5. Validar salud:

```bash
curl http://localhost:8000/api/v1/health
```

6. Probar limitación con umbral bajo:

```bash
RATE_LIMIT_MAX_REQUESTS=1 RATE_LIMIT_WINDOW_SECONDS=60 uvicorn app.main:app --reload --port 8000
```

```bash
curl -X POST http://localhost:8000/api/v1/netbox/bootstrap \
  -H "X-API-Key: tu_clave" \
  -H "Content-Type: application/json"
```

```bash
curl -X POST http://localhost:8000/api/v1/netbox/bootstrap \
  -H "X-API-Key: tu_clave" \
  -H "Content-Type: application/json"
```

La primera debe responder `200`; la segunda, `429`.

## Siguiente endurecimiento recomendado

Este diseño ya resuelve el problema del backend en memoria, pero el siguiente
paso natural para producción es mover el límite grueso al borde:

- NGINX / Traefik / Envoy / API Gateway
- IP allowlists
- TLS
- body size limits
- request timeouts
- rate limiting primario antes de llegar a Python
