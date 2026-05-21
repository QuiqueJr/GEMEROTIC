"""
Conexion SQL para la fuente canonica granular de GEMEROTIC.
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.config import settings

Base = declarative_base()
_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    """Crear o reutilizar el engine SQL principal."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            settings.DATABASE_URL,
            pool_pre_ping=True,
            future=True,
        )
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    """Crear o reutilizar la factoria de sesiones."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=get_engine(),
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            future=True,
        )
    return _SessionLocal


def init_database() -> None:
    """Inicializar tablas cuando la persistencia granular esta activa."""
    if not settings.GRANULAR_STORE_ENABLED:
        return
    from app.persistence import models  # noqa: F401

    Base.metadata.create_all(bind=get_engine())


def get_database_session() -> Iterator[Session]:
    """Entregar una sesion SQL para dependencias FastAPI."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


def reset_engine_for_tests() -> None:
    """Resetear singletons de SQL en tests."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None
