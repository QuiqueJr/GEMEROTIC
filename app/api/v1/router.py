"""
Router agregado para la versión 1 del API.
Aquí se registran todos los sub-routers de v1.
"""

from fastapi import APIRouter

v1_router = APIRouter()

# Se registrarán endpoints conforme se implementen:
# from app.api.v1.endpoints.health import router as health_router
# from app.api.v1.endpoints.topology import router as topology_router
# v1_router.include_router(health_router, tags=["health"])
# v1_router.include_router(topology_router, tags=["topology"])
