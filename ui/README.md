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
bun run dev
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

Flujo minimo para validar la UI contra el pipeline actual:

1. Levantar NetBox y el backend siguiendo `START.md`.
2. Ejecutar `bun run dev` dentro de `ui/`.
3. Pulsar `Health` y comprobar que NetBox aparece conectado.
4. Pulsar `Bootstrap` para preparar NetBox.
5. Ajustar la topologia visual y pulsar `Persistir en NetBox`.

## Validacion local

Antes de commitear cambios del frontend se deben ejecutar:

```bash
bun run lint
bun run test:run
bun run build
```
