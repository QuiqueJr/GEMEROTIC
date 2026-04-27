# UI GEMEROTIC

Frontend del constructor visual OT/IT de GEMEROTIC.

## Stack

- React
- TypeScript
- Vite
- React Flow (`@xyflow/react`)
- Lucide React
- Vitest
- Bun

## Comandos

```bash
bun install
bun run dev -- --host 127.0.0.1 --port 5173
bun run lint
bun run test:run
bun run build
```

La UI debe emitir payloads compatibles con `TopologyCreate` y persistirlos
mediante `POST /api/v1/topology`.

## Conexion con el backend

El entorno de desarrollo esperado es:

- Backend FastAPI en `http://localhost:8000`.
- NetBox en `http://localhost:8080`.
- UI de Vite en `http://localhost:5173`.

La interfaz permite configurar la `Base URL` del API y la cabecera
`X-API-Key` desde el panel lateral. Esa clave debe coincidir con la variable
`API_KEY` usada al arrancar FastAPI. La clave no se versiona en git.

Las acciones protegidas de la toolbar (`Bootstrap`, `Artefactos`, `Deploy`,
`Compliance`, `Persistir`, runtime del lab) verifican primero esa conectividad.
Si falta `Base URL` o `X-API-Key`, la UI lo informa en la barra de estado del
workflow y en la consola inferior sin cambiar de herramienta ni abrir modales
automaticamente. El modal `Proyecto` se abre desde el menu superior o el boton
de configuracion.

## Vistas del builder

- `Fisica`: configura sitio, sala, rack, activos, puertos, RU y cableado.
- `Logica`: configura VLANs, direcciones IPv4/IPv6, MAC, estado de interfaz y
  gestion.
- `Seguridad`: configura zonas IEC 62443, niveles Purdue, Security Level,
  criticidad y protocolos permitidos en conductos.

El panel `Payload TopologyCreate` muestra el JSON exacto que se enviara al
backend. Esa vista debe mantenerse como contrato visible entre React Flow,
FastAPI y NetBox.

Flujo minimo para validar la UI contra el pipeline actual:

1. Levantar NetBox y el backend siguiendo `START.md`.
2. Ejecutar `bun run dev -- --host 127.0.0.1 --port 5173` dentro de `ui/`.
3. Pulsar `Health` y comprobar que NetBox aparece conectado.
4. Pulsar `Bootstrap` para preparar NetBox.
5. Ajustar la topologia visual y pulsar `Artefactos` para revisar el bundle
   Containerlab/Ansible/OPA/Batfish.
6. Pulsar `Deploy` para ejecutar Containerlab y Ansible si las herramientas
   estan instaladas.
7. Pulsar `Inspeccionar lab` para descubrir nodos activos del runtime.
8. Abrir una consola de equipo y lanzar comandos allowlistados como
   `hostname`, `ip link show` o `ip link set dev eth1 down`.
9. Pulsar `Persistir en NetBox`.

`Deploy` pre-valida el endpoint `GET /api/v1/pipeline/tools` y bloquea la
ejecucion si faltan herramientas del workflow.

La pestaña `Puertos` del editor por doble clic permite:

- activar o desactivar cada puerto
- marcar puertos de gestión
- asignar IPv4, IPv6, MAC y descripción por interfaz

La consola actual es la del runtime Linux del Step 10. No representa todavía
una CLI vendor de router, switch o firewall.

## Validacion local

Antes de commitear cambios del frontend se deben ejecutar:

```bash
bun run lint
bun run test:run
bun run build
```
