"""
Tests del endpoint GET /api/v1/health.

Cubre:
- Código de respuesta HTTP 200
- Estructura completa del JSON de respuesta
- Valores esperados (app_name, version, status)
- Uptime positivo
- Objeto checks con netbox_connected (stub)
- Content-Type correcto
- Métodos HTTP no permitidos
"""

from fastapi.testclient import TestClient


# =============================================================================
# GET /api/v1/health — Respuesta exitosa
# =============================================================================

class TestHealthEndpoint:
    """Tests para el endpoint de health check."""

    def test_health_returns_200(self, client: TestClient):
        """El endpoint debe responder con HTTP 200."""
        response = client.get("/api/v1/health")
        assert response.status_code == 200

    def test_health_response_content_type(self, client: TestClient):
        """La respuesta debe ser JSON."""
        response = client.get("/api/v1/health")
        assert response.headers["content-type"] == "application/json"

    def test_health_response_structure(self, client: TestClient):
        """La respuesta debe contener todos los campos esperados."""
        data = client.get("/api/v1/health").json()
        expected_keys = {"status", "app_name", "version", "uptime_seconds", "checks"}
        assert set(data.keys()) == expected_keys

    def test_health_status_is_healthy(self, client: TestClient):
        """El campo status debe ser 'healthy'."""
        data = client.get("/api/v1/health").json()
        assert data["status"] == "healthy"

    def test_health_app_name(self, client: TestClient):
        """El campo app_name debe coincidir con la configuración."""
        data = client.get("/api/v1/health").json()
        assert data["app_name"] == "GEMEROTIC"

    def test_health_version_format(self, client: TestClient):
        """El campo version debe ser un string semver válido."""
        data = client.get("/api/v1/health").json()
        version = data["version"]
        assert isinstance(version, str)
        # Verificar formato básico X.Y.Z
        parts = version.split(".")
        assert len(parts) == 3
        assert all(part.isdigit() for part in parts)

    def test_health_uptime_is_positive(self, client: TestClient):
        """El uptime debe ser un número positivo (el servicio ya está corriendo)."""
        data = client.get("/api/v1/health").json()
        assert isinstance(data["uptime_seconds"], float)
        assert data["uptime_seconds"] >= 0

    def test_health_checks_structure(self, client: TestClient):
        """El objeto checks debe contener netbox_connected."""
        data = client.get("/api/v1/health").json()
        checks = data["checks"]
        assert "netbox_connected" in checks
        assert isinstance(checks["netbox_connected"], bool)

    def test_health_netbox_not_connected_in_mvp(self, client: TestClient):
        """En el MVP sin NetBox, netbox_connected debe ser False."""
        data = client.get("/api/v1/health").json()
        assert data["checks"]["netbox_connected"] is False


# =============================================================================
# Métodos HTTP no permitidos
# =============================================================================

class TestHealthMethodNotAllowed:
    """Verificar que solo GET está permitido en /health."""

    def test_post_not_allowed(self, client: TestClient):
        response = client.post("/api/v1/health")
        assert response.status_code == 405

    def test_put_not_allowed(self, client: TestClient):
        response = client.put("/api/v1/health")
        assert response.status_code == 405

    def test_delete_not_allowed(self, client: TestClient):
        response = client.delete("/api/v1/health")
        assert response.status_code == 405


# =============================================================================
# Rutas inexistentes
# =============================================================================

class TestNotFound:
    """Verificar que rutas inexistentes retornan 404."""

    def test_nonexistent_route(self, client: TestClient):
        response = client.get("/api/v1/nonexistent")
        assert response.status_code == 404

    def test_health_without_prefix(self, client: TestClient):
        """El health vive bajo /api/v1/, no en la raíz."""
        response = client.get("/health")
        assert response.status_code == 404
