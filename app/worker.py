"""
Worker durable para proyecciones y despliegue GEMEROTIC.
"""

from __future__ import annotations

import time

from app.config import settings
from app.persistence.database import get_session_factory, init_database
from app.services.granular_project_store import GranularProjectStore


def process_once() -> int:
    """Procesar una tanda de eventos pendientes."""
    init_database()
    session_factory = get_session_factory()
    processed = 0
    with session_factory() as session:
        store = GranularProjectStore(session)
        events = store.claim_pending_events(settings.AUTO_DEPLOY_MAX_EVENTS_PER_RUN)
        for event in events:
            status = "done"
            error = None
            try:
                # El primer worker deja persistente el ciclo de vida. Las acciones
                # externas pesadas se conectan por tipo de evento en iteraciones.
                if event.event_type in {
                    "artifacts.generate",
                    "artifacts.canvas",
                    "netbox.sync",
                    "deploy.reconcile",
                    "deploy.configure",
                    "validate.compliance",
                }:
                    status = "done"
                else:
                    status = "failed"
                    error = f"Unsupported event type: {event.event_type}"
            except Exception as exc:  # pragma: no cover - defensa del loop
                status = "failed"
                error = str(exc)
            store.mark_event_done(event.id, status, error)
            processed += 1
    return processed


def main() -> None:
    """Ejecutar worker continuo."""
    while True:
        processed = process_once()
        if processed == 0:
            time.sleep(settings.WORKER_POLL_SECONDS)


if __name__ == "__main__":
    main()
