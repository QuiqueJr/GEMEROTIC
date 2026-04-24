"""
Router agregado para la versión 1 del API.
Aquí se registran todos los sub-routers de v1.
"""

from fastapi import APIRouter

from app.api.v1.endpoints.compliance import router as compliance_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.netbox import router as netbox_router
from app.api.v1.endpoints.pipeline import router as pipeline_router
from app.api.v1.endpoints.topology import router as topology_router

v1_router = APIRouter()

# --- Endpoints activos ---
v1_router.include_router(health_router, tags=["health"])
v1_router.include_router(netbox_router, tags=["netbox"])
v1_router.include_router(topology_router, tags=["topology"])
v1_router.include_router(pipeline_router, tags=["pipeline"])
v1_router.include_router(compliance_router, tags=["compliance"])
