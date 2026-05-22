"""
Endpoints de generación de artefactos del pipeline.
"""

import asyncio
from collections.abc import Iterator
from contextlib import suppress

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import (
    create_terminal_session_token,
    is_api_key_configured,
    is_valid_terminal_session_token,
    require_api_key,
)
from app.dependencies import (
    get_database_session,
    get_pipeline_runner,
    get_topology_store,
)
from app.persistence.models import (
    ProjectEntityRecord,
    ProjectRecord,
    RuntimeNodeRecord,
)
from app.schemas.pipeline import (
    PipelineConsoleRequest,
    PipelineLabStatus,
    PipelineTerminalSessionResponse,
)
from app.schemas.project_commands import RuntimePowerRequest
from app.schemas.responses import APIResponse
from app.schemas.topology import TopologyCreate
from app.services.pipeline_artifacts import PipelineArtifactGenerator
from app.services.pipeline_runner import (
    PipelineExecutionError,
    PipelineLabNotFoundError,
    PipelineNodeNotFoundError,
    PipelineRunner,
    PipelineRuntimeCommandError,
    PipelineToolError,
)
from app.services.topology_store import (
    TopologyNotFoundError,
    TopologyStore,
    TopologyStoreError,
)

router = APIRouter(prefix="/pipeline")


@router.post(
    "/artifacts",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Generar artefactos del pipeline",
    description=(
        "Renderizar artefactos declarativos para Containerlab, Ansible, "
        "Batfish y OPA desde un payload TopologyCreate validado."
    ),
)
async def generate_pipeline_artifacts(
    topology: TopologyCreate,
    _: None = Depends(require_api_key),
) -> APIResponse:
    """Generar archivos reproducibles sin ejecutar herramientas externas."""
    artifacts = PipelineArtifactGenerator().generate(topology)
    return APIResponse(
        message="Pipeline artifacts generated successfully",
        data=artifacts.model_dump(),
    )


@router.post(
    "/artifacts/{topology_name}",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Generar artefactos desde la última topología guardada",
)
async def generate_saved_pipeline_artifacts(
    topology_name: str,
    _: None = Depends(require_api_key),
    topology_store: TopologyStore = Depends(get_topology_store),
) -> APIResponse:
    """Generar artefactos desde el estado guardado, no desde NetBox."""
    topology = _load_saved_topology(topology_name, topology_store)
    artifacts = PipelineArtifactGenerator().generate(topology)
    return APIResponse(
        message="Pipeline artifacts generated from saved topology",
        data=artifacts.model_dump(),
    )


@router.get(
    "/tools",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Comprobar herramientas locales del pipeline",
)
async def check_pipeline_tools(
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Reportar disponibilidad local de Docker, Containerlab, Ansible y OPA."""
    report = runner.check_tools()
    return APIResponse(
        message="Pipeline tool status collected",
        data=report.model_dump(),
    )


@router.post(
    "/deploy",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Desplegar topología con Containerlab y Ansible",
)
async def deploy_pipeline(
    topology: TopologyCreate,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Ejecutar despliegue local controlado desde un payload validado."""
    try:
        result = runner.deploy(topology)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="Pipeline deployed successfully",
        data=result.model_dump(),
    )


@router.post(
    "/deploy/{topology_name}",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Desplegar la última topología guardada",
)
async def deploy_saved_pipeline(
    topology_name: str,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
    topology_store: TopologyStore = Depends(get_topology_store),
) -> APIResponse:
    """Ejecutar despliegue controlado desde el último guardado local."""
    topology = _load_saved_topology(topology_name, topology_store)
    try:
        result = runner.deploy(topology)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="Pipeline deployed from saved topology",
        data=result.model_dump(),
    )


@router.get(
    "/labs/{topology_name}",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Inspeccionar lab desplegado",
)
async def inspect_pipeline_lab(
    topology_name: str,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Consultar el estado resumido de un lab activo en Containerlab."""
    try:
        result = runner.inspect_lab(topology_name)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineLabNotFoundError as exc:
        result = PipelineLabStatus(
            topology_name=topology_name,
            deployed=False,
            detail=str(exc),
        )
        return APIResponse(
            message="Pipeline lab is not deployed",
            data=result.model_dump(),
        )
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="Pipeline lab status collected",
        data=result.model_dump(),
    )


@router.post(
    "/labs/{topology_name}/nodes/{node_id}/console",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Ejecutar comando controlado sobre un nodo del lab",
)
async def run_pipeline_node_console(
    topology_name: str,
    node_id: str,
    request: PipelineConsoleRequest,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Ejecutar comandos allowlistados de consola sobre el runtime Linux del lab."""
    try:
        result = runner.run_node_command(
            topology_name=topology_name,
            node_id=node_id,
            command_text=request.command,
        )
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineLabNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineNodeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineRuntimeCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return APIResponse(
        message="Pipeline console command executed",
        data=result.model_dump(),
    )


@router.post(
    "/labs/{topology_name}/nodes/{node_id}/terminal/session",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Crear sesión efímera de terminal interactiva",
)
async def create_pipeline_node_terminal_session(
    topology_name: str,
    node_id: str,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Emitir token corto para WebSocket tras validar nodo FRR desplegado."""
    try:
        runner.resolve_terminal_target(topology_name, node_id)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineLabNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineRuntimeCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    try:
        token, expires_at, ttl_seconds = create_terminal_session_token(
            topology_name=topology_name,
            node_id=node_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    session = PipelineTerminalSessionResponse(
        topology_name=topology_name,
        node_id=node_id,
        token=token,
        expires_at=expires_at,
        ttl_seconds=ttl_seconds,
    )
    return APIResponse(
        message="Pipeline terminal session created",
        data=session.model_dump(),
    )


@router.websocket("/labs/{topology_name}/nodes/{node_id}/terminal")
async def open_pipeline_node_terminal(
    websocket: WebSocket,
    topology_name: str,
    node_id: str,
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> None:
    """Abrir terminal interactiva controlada contra el contenedor del nodo."""
    if settings.API_KEY_REQUIRED:
        if not is_api_key_configured():
            await websocket.close(code=1011)
            return
        if not is_valid_terminal_session_token(
            websocket.query_params.get("terminal_token"),
            topology_name,
            node_id,
        ):
            await websocket.close(code=1008)
            return

    try:
        target = runner.resolve_terminal_target(topology_name, node_id)
    except (PipelineToolError, PipelineLabNotFoundError, PipelineRuntimeCommandError):
        await websocket.close(code=1008)
        return
    except PipelineExecutionError:
        await websocket.close(code=1011)
        return

    await websocket.accept()
    process = await asyncio.create_subprocess_exec(
        *target.command,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    # Limitación conocida: este puente usa pipes sin PTY real. vtysh/sh funcionan
    # para E/S básica, pero no ofrecen edición de línea o señales de terminal.
    stdout_task = asyncio.create_task(_pipe_process_to_websocket(process, websocket))
    stdin_task = asyncio.create_task(_pipe_websocket_to_process(websocket, process))
    try:
        done, pending = await asyncio.wait(
            {stdout_task, stdin_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in done:
            task.result()
        for task in pending:
            task.cancel()
    except WebSocketDisconnect:
        pass
    finally:
        await _terminate_process(process)
        for task in (stdout_task, stdin_task):
            if not task.done():
                task.cancel()
            with suppress(asyncio.CancelledError):
                await task


def _get_optional_database_session() -> Iterator[Session | None]:
    """Entregar sesión granular solo cuando la persistencia está activa."""
    if not settings.GRANULAR_STORE_ENABLED:
        yield None
        return
    try:
        yield from get_database_session()
    except SQLAlchemyError:
        yield None


@router.post(
    "/labs/{topology_name}/nodes/{node_id}/running-config/sync",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Sincronizar running-config FRR desde un nodo del lab",
)
async def sync_pipeline_node_running_config(
    topology_name: str,
    node_id: str,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
    session: Session | None = Depends(_get_optional_database_session),
) -> APIResponse:
    """Leer running-config FRR y persistirlo si hay sesión granular disponible."""
    try:
        result = runner.sync_node_running_config(topology_name, node_id)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineLabNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineRuntimeCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    if session is not None:
        try:
            result.database_updated = _update_runtime_running_config(
                session,
                result.topology_name,
                result.node_id,
                result.container_name,
                result.running_config,
            )
        except SQLAlchemyError:
            session.rollback()

    return APIResponse(
        message="Pipeline running config synchronized",
        data=result.model_dump(),
    )


@router.post(
    "/labs/{topology_name}/nodes/{node_id}/power",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Encender, apagar o reiniciar un nodo del lab",
)
async def control_pipeline_node_power(
    topology_name: str,
    node_id: str,
    request: RuntimePowerRequest,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Controlar el ciclo de vida de un activo desplegado."""
    try:
        result = runner.control_node_power(topology_name, node_id, request.action)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineLabNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineNodeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineRuntimeCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return APIResponse(
        message="Pipeline node power action executed",
        data=result,
    )


@router.post(
    "/labs/{topology_name}/power",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Encender, apagar o reiniciar todos los nodos del lab",
)
async def control_pipeline_lab_power(
    topology_name: str,
    request: RuntimePowerRequest,
    _: None = Depends(require_api_key),
    runner: PipelineRunner = Depends(get_pipeline_runner),
) -> APIResponse:
    """Controlar el ciclo de vida global del gemelo desplegado."""
    try:
        result = runner.control_lab_power(topology_name, request.action)
    except PipelineToolError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PipelineLabNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PipelineRuntimeCommandError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except PipelineExecutionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return APIResponse(
        message="Pipeline lab power action executed",
        data=result,
    )


def _load_saved_topology(
    topology_name: str,
    topology_store: TopologyStore,
) -> TopologyCreate:
    """Cargar una topología guardada y mapear errores HTTP."""
    try:
        return topology_store.load(topology_name)
    except TopologyNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except TopologyStoreError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


async def _pipe_process_to_websocket(
    process: asyncio.subprocess.Process,
    websocket: WebSocket,
) -> None:
    """Enviar salida del proceso hacia el WebSocket."""
    if process.stdout is None:
        return
    while True:
        chunk = await process.stdout.read(1024)
        if not chunk:
            return
        await websocket.send_text(chunk.decode("utf-8", errors="replace"))


async def _pipe_websocket_to_process(
    websocket: WebSocket,
    process: asyncio.subprocess.Process,
) -> None:
    """Enviar entrada de texto del WebSocket hacia stdin del proceso."""
    if process.stdin is None:
        return
    while True:
        message = await websocket.receive_text()
        # Sin PTY, Enter llega como CR desde xterm y los shells esperan LF.
        process.stdin.write(message.replace("\r", "\n").encode("utf-8"))
        await process.stdin.drain()


async def _terminate_process(process: asyncio.subprocess.Process) -> None:
    """Cerrar el proceso hijo al terminar la sesión WebSocket."""
    if process.returncode is not None:
        return
    process.terminate()
    try:
        await asyncio.wait_for(process.wait(), timeout=2)
    except TimeoutError:
        process.kill()
        await process.wait()


def _update_runtime_running_config(
    session: Session,
    topology_name: str,
    node_id: str,
    container_name: str,
    running_config: str,
) -> bool:
    """Actualizar el registro runtime si existe o crearlo de forma mínima."""
    row = session.scalar(
        select(RuntimeNodeRecord).where(
            RuntimeNodeRecord.project_name == topology_name,
            RuntimeNodeRecord.node_id == node_id,
        )
    )
    if row is None:
        row = RuntimeNodeRecord(
            project_name=topology_name,
            node_id=node_id,
            container_name=container_name,
        )
        session.add(row)
    row.container_name = container_name
    row.running_config = running_config
    revision = _update_project_running_config_snapshot(
        session,
        topology_name,
        node_id,
        running_config,
    )
    _upsert_asset_config_running_config(
        session,
        topology_name,
        node_id,
        running_config,
        revision,
    )
    session.commit()
    return True


def _update_project_running_config_snapshot(
    session: Session,
    topology_name: str,
    node_id: str,
    running_config: str,
) -> int:
    """Actualizar snapshots granulares para que la UI recupere la config."""
    project = session.get(ProjectRecord, topology_name)
    if project is None:
        return 1

    project.revision += 1
    project.state_snapshot = _patch_state_snapshot_running_config(
        project.state_snapshot,
        node_id,
        running_config,
    )
    project.topology_payload = _patch_topology_payload_running_config(
        project.topology_payload,
        node_id,
        running_config,
    )
    return project.revision


def _upsert_asset_config_running_config(
    session: Session,
    topology_name: str,
    node_id: str,
    running_config: str,
    revision: int,
) -> None:
    """Persistir running-config como asset.config granular."""
    row = session.scalar(
        select(ProjectEntityRecord).where(
            ProjectEntityRecord.project_name == topology_name,
            ProjectEntityRecord.entity_type == "asset.config",
            ProjectEntityRecord.entity_id == node_id,
        )
    )
    if row is None:
        session.add(
            ProjectEntityRecord(
                project_name=topology_name,
                entity_type="asset.config",
                entity_id=node_id,
                revision=revision,
                payload={"runningConfig": running_config},
            )
        )
        return
    payload = row.payload if isinstance(row.payload, dict) else {}
    row.payload = {**payload, "runningConfig": running_config}
    row.revision = revision


def _patch_state_snapshot_running_config(
    snapshot: dict | None,
    node_id: str,
    running_config: str,
) -> dict | None:
    """Inyectar running-config en el nodo visual guardado."""
    if not isinstance(snapshot, dict):
        return snapshot
    patched = {**snapshot}
    nodes = patched.get("nodes")
    if isinstance(nodes, list):
        patched["nodes"] = [
            _patch_node_running_config(node, node_id, running_config)
            for node in nodes
        ]
    return patched


def _patch_node_running_config(
    node: object,
    node_id: str,
    running_config: str,
) -> object:
    if not isinstance(node, dict) or node.get("id") != node_id:
        return node
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    return {
        **node,
        "data": {
            **data,
            "runningConfig": running_config,
        },
    }


def _patch_topology_payload_running_config(
    topology_payload: dict | None,
    node_id: str,
    running_config: str,
) -> dict | None:
    """Inyectar running-config en el payload operativo si existe."""
    if not isinstance(topology_payload, dict):
        return topology_payload
    patched = {**topology_payload}
    devices = patched.get("devices")
    if isinstance(devices, list):
        patched["devices"] = [
            _patch_device_running_config(device, node_id, running_config)
            for device in devices
        ]
    return patched


def _patch_device_running_config(
    device: object,
    node_id: str,
    running_config: str,
) -> object:
    if not isinstance(device, dict) or device.get("id") != node_id:
        return device
    config = device.get("config") if isinstance(device.get("config"), dict) else {}
    return {
        **device,
        "config": {
            **config,
            "runningConfig": running_config,
        },
    }
