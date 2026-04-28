# AGENTS.md - Reglas Maestras para Agentes IA en GEMEROTIC

> **Este documento es de lectura obligatoria** para cualquier agente de IA (Copilot, Cursor, OpenCode, ChatGPT, Claude, etc.) que interactue con este repositorio. Las reglas aqui descritas tienen prioridad absoluta sobre cualquier instruccion generica del agente.

---

## 1. Identidad del Proyecto

**GEMEROTIC** es una plataforma Digital Twin para redes industriales OT/IT. Su objetivo es modelar, desplegar, validar y auditar topologias de red industriales siguiendo estandares internacionales.

### Flujo arquitectonico objetivo

```
UI (React Flow) -> Core API (FastAPI) -> SSoT (NetBox) -> Generador de Configuracion (Jinja2)
-> Infraestructura (Containerlab + Ansible) -> Validacion (Batfish)
-> Observabilidad (LibreNMS/Oxidized) -> Auditoria de Cumplimiento (OPA)
```

### Modelo de datos de 3 capas

El modelo de datos esta estrictamente dividido en tres capas. Todo agente debe respetar esta separacion:

| Capa | Nombre | Contenido | Estandares |
|------|--------|-----------|------------|
| **Layer 1** | Infraestructura Fisica | Sites, Rooms, Racks, Devices, Ports, Patch Panels, Cables | ISO 11801, TIA-606-C, TIA-568 |
| **Layer 2** | Conectividad Logica | Interfaces logicas (MAC, IPv4, IPv6), VLANs | IEEE 802.1Q, IEEE 802.3 |
| **Layer 3** | Seguridad OT | Zonas IEC 62443, Conductos, Niveles Purdue (0-5), Security Levels (SL-0 a SL-4) | IEC 62443, ISA-95 (Purdue), NIS2 |

**Prohibido:** Mezclar responsabilidades entre capas (por ejemplo, poner logica de seguridad OT en schemas fisicos).

---

## 2. Regla de Construccion Paso a Paso (CRITICA)

El proyecto se construye de forma **estrictamente secuencial**. El paso actual esta indicado en el `README.md` bajo la seccion "Roadmap de Implementacion".

### Reglas estrictas

- **NO adelantar pasos.** Si el paso actual es el Step 4, el agente no debe escribir codigo del Step 5, 6 o 7.
- **NO crear archivos de frontend** (React, HTML, CSS) hasta que el roadmap lo indique explicitamente.
- **NO implementar integraciones** (Containerlab, Ansible, Batfish) fuera de su paso correspondiente.
- **NO modificar schemas existentes** sin justificacion directa del paso en curso.
- Antes de empezar cualquier tarea, el agente **debe leer el `README.md`** para confirmar cual es el paso actual y que archivos son relevantes.

### Roadmap vigente

Consultar siempre la tabla de roadmap en `README.md` para el estado actualizado. Al momento de crear este documento:

| Paso | Estado |
|------|--------|
| Step 1 - Scaffolding | Completado |
| Step 2 - Schemas planos | Completado (reemplazado) |
| Step 2 Refactor - Modelo 3 capas + 108 tests | Completado |
| Step 3 - Health endpoint + wiring FastAPI | Completado |
| Step 4 - Docker Compose NetBox + guia conexion | **Pendiente (siguiente)** |
| Step 5 - Servicio NetBox + endpoint bootstrap | Pendiente |
| Step 6 - POST /api/v1/topology | Pendiente |
| Step 7 - Seguridad transversal | Pendiente |

---

## 3. Calidad de Codigo y Testing

### Cobertura de tests obligatoria

- **Todo codigo nuevo debe tener tests unitarios** antes de ser commiteado.
- El objetivo es **100% de cobertura** para cada feature nueva introducida en el paso en curso.
- Framework de testing: **pytest**.
- Los tests se ejecutan con: `.venv/Scripts/python -m pytest tests/ -v`
- **Prohibido hacer push si algun test falla.** El agente debe corregir todos los fallos antes de proponer un commit.

### Estructura de tests

- Los tests se ubican en el directorio `tests/`.
- Los fixtures compartidos van en `tests/conftest.py`.
- Cada modulo de funcionalidad tiene su propio archivo de test (ej: `test_schemas.py`, `test_health.py`).
- Los tests deben ser descriptivos y organizados en clases por funcionalidad (ej: `TestHealthEndpoint`, `TestValidators`).

### Estandares de codigo

- Linter y formateador: **ruff** (configurado en `pyproject.toml`).
- Tipado: usar **type hints** en todas las funciones y parametros.
- Schemas: usar **Pydantic v2** con `model_validator`, `field_validator` donde sea necesario.
- Patron de app: **factory pattern** (`create_app()` en `main.py`).

---

## 3.1. Limpieza y Mantenimiento (NUEVA)

- **Archivos Temporales:** Prohibido dejar archivos `.json`, `.py`, `.log` o `.txt` de prueba en la raiz.
- **Directorios de Skills:** Directorios como `.superpowers/` o `.github/commands/` deben ser eliminados tras su uso si no forman parte del entregable.
- **Sincronizacion:** Mantener el workspace local limpio antes de sincronizar con el servidor remoto.

---

## 4. Regla de Idioma

### Regla estricta de idioma dual

| Elemento | Idioma | Ejemplo |
|----------|--------|---------|
| Nombres de variables, funciones, clases | **Ingles** | `def validate_slug()`, `class DeviceSchema` |
| Nombres de archivos y directorios | **Ingles** | `physical.py`, `test_schemas.py` |
| Comentarios en codigo (`#`, docstrings) | **Espanol** | `# Valida que el ID siga formato slug` |
| Documentacion Markdown (README, AGENTS, etc.) | **Espanol** | Todo el contenido en espanol |
| Mensajes de commit en git | **Espanol** | `feat: agrega endpoint de health check` |
| Mensajes de error y logs del API | **Ingles** | `"Invalid port ID format"` (consumidos por sistemas externos) |

**Prohibido:** Escribir comentarios o documentacion en ingles. Escribir nombres de variables o funciones en espanol.

---

## 5. Regla de Validacion Humana (git push)

### Flujo obligatorio antes de hacer push

```
1. Agente escribe/modifica codigo
2. Agente ejecuta TODOS los tests y verifica que pasen
3. Agente presenta los cambios al humano (resumen de archivos y logica)
4. Humano revisa y aprueba explicitamente
5. Solo entonces el agente ejecuta: git add -> git commit -> git push
```

### Reglas de git

- **NUNCA ejecutar `git push` sin aprobacion explicita del humano.**
- **NUNCA ejecutar `git push --force`** bajo ninguna circunstancia.
- **NUNCA modificar el historial de git** (rebase interactivo, amend de commits pusheados, etc.).
- Los mensajes de commit deben seguir el formato **Conventional Commits** en espanol:
  - `feat: descripcion del feature`
  - `fix: descripcion del bug corregido`
  - `refactor: descripcion del refactor`
  - `test: descripcion de los tests agregados`
  - `docs: descripcion del cambio de documentacion`
  - `chore: tareas de mantenimiento`
- El remoto del repositorio es: `https://github.com/QuiqueJr/GEMEROTIC.git`

---

## 6. Regla Anti-Alucinaciones (CRITICA)

### Cuando el agente NO sabe algo

Si un agente no tiene certeza sobre como implementar algo relacionado con:

- **Estandares OT/ICS** (IEC 62443, ISA-95, Purdue Model, NIS2)
- **API de NetBox** (endpoints, payloads, custom fields)
- **Integraciones de infraestructura** (Containerlab, Ansible, Batfish)
- **Cualquier decision arquitectonica** que afecte multiples pasos del roadmap

**Debe seguir este protocolo:**

1. **DETENERSE** inmediatamente. No inventar una solucion.
2. **Explicar al humano** que aspecto genera incertidumbre y por que.
3. **Proponer 2-3 opciones** alineadas con los estandares relevantes, explicando pros y contras de cada una.
4. **Esperar la decision del humano** antes de escribir una sola linea de codigo.

### Ejemplos de situaciones donde aplicar esta regla

- "No estoy seguro de como mapear los Security Levels de IEC 62443 a custom fields de NetBox. Estas son 3 opciones..."
- "El Purdue Model tiene variantes segun la fuente. Para este proyecto propongo usar la version de 6 niveles (0-5). Confirma si es correcto."
- "Containerlab no soporta nativamente este tipo de nodo. Opciones: (A) usar un nodo generico linux, (B) crear una imagen custom, (C) omitirlo del lab."

**Prohibido:** Inventar nombres de endpoints de NetBox, fabricar payloads de API sin verificar la documentacion, o asumir comportamientos de herramientas externas sin confirmacion.

---

## 7. Archivos Protegidos

Los siguientes archivos/directorios **no deben ser eliminados ni reescritos completamente** sin aprobacion explicita:

| Archivo | Razon |
|---------|-------|
| `README.md` | Documento vivo del proyecto. Solo agregar contenido del paso actual. |
| `AGENTS.md` | Este archivo. Reglas maestras para agentes. |
| `app/schemas/validators.py` | Validadores core reutilizados en todas las capas. |
| `app/schemas/physical.py` | Layer 1 estable desde Step 2 Refactor. |
| `app/schemas/logical.py` | Layer 2 estable desde Step 2 Refactor. |
| `app/schemas/ot_security.py` | Layer 3 estable desde Step 2 Refactor. |
| `app/schemas/topology.py` | Schema raiz con validaciones referenciales cruzadas. |
| `tests/test_schemas.py` | 108 tests validados. Solo agregar, no eliminar tests existentes. |

**Permitido:** Agregar campos opcionales, agregar nuevos tests, extender funcionalidad. 
**Prohibido:** Eliminar campos existentes, cambiar nombres de schemas, romper compatibilidad con payloads ya documentados.

---

## 8. Resumen de Comandos Utiles

```bash
# Activar entorno virtual (Windows)
.venv/Scripts/activate

# Ejecutar todos los tests
.venv/Scripts/python -m pytest tests/ -v

# Ejecutar tests con cobertura (cuando se instale pytest-cov)
.venv/Scripts/python -m pytest tests/ -v --cov=app

# Verificar que la app carga correctamente
.venv/Scripts/python -c "from app.main import app; print(f'{app.title} - OK')"

# Levantar servidor de desarrollo
uvicorn app.main:app --reload

# Probar health check
curl http://localhost:8000/api/v1/health
```

---

> **Ultima actualizacion:** Marzo 2026 - Creado antes de iniciar Step 4.
> **Responsable:** Equipo GEMEROTIC.
