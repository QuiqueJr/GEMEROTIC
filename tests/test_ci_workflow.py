"""
Tests de contrato minimo para GitHub Actions.
"""

from pathlib import Path


class TestNetBoxStackWorkflow:
    """Tests para evitar regresiones en el smoke real de NetBox."""

    def test_netbox_stack_installs_python_dependencies_before_fastapi_smoke(self):
        """El smoke de FastAPI debe ejecutarse con dependencias instaladas."""
        workflow = Path(".github/workflows/ci.yml").read_text(encoding="utf-8")
        netbox_stack = workflow[workflow.index("  netbox-stack:") :]

        setup_index = netbox_stack.index("      - name: Setup Python")
        install_index = netbox_stack.index("      - name: Install dependencies")
        smoke_index = netbox_stack.index(
            "      - name: Smoke shared rate limit through FastAPI"
        )

        assert setup_index < smoke_index
        assert install_index < smoke_index
        assert "python -m pip install -e .[dev]" in netbox_stack

    def test_netbox_token_provisioning_avoids_invalid_python_f_string(self):
        """El parser de token no debe usar escapes dentro de f-strings."""
        workflow = Path(".github/workflows/ci.yml").read_text(encoding="utf-8")
        netbox_stack = workflow[workflow.index("  netbox-stack:") :]

        assert 'print(f"nbt_' not in netbox_stack
        assert 'print("nbt_" + payload["key"] + "." + payload["token"])' in netbox_stack

    def test_netbox_stack_always_emits_logs_for_postgres_and_netbox(self):
        """El smoke debe dejar logs del stack para diagnosticar fallos de salud."""
        workflow = Path(".github/workflows/ci.yml").read_text(encoding="utf-8")
        netbox_stack = workflow[workflow.index("  netbox-stack:") :]

        assert "docker compose logs postgres netbox netbox-worker" in netbox_stack


class TestNetBoxComposeDefinition:
    """Tests de contrato para la definicion del stack local de NetBox."""

    def test_postgres_volume_matches_postgres_18_layout(self):
        """PostgreSQL 18 debe montar el volumen en /var/lib/postgresql."""
        compose = Path("docker/netbox/docker-compose.yml").read_text(encoding="utf-8")

        assert "image: docker.io/postgres:18-alpine" in compose
        assert "- netbox-postgres:/var/lib/postgresql:rw" in compose

    def test_postgres_healthcheck_timeout_is_not_too_aggressive(self):
        """El healthcheck no debe marcar unhealthy por timeouts demasiado cortos."""
        compose = Path("docker/netbox/docker-compose.yml").read_text(encoding="utf-8")
        postgres = compose[
            compose.index("\n  postgres:\n") + 1 : compose.index("\n  redis:\n")
        ]

        assert "timeout: 30s" in postgres


class TestFrontendWorkflow:
    """Tests para mantener Bun como gestor del frontend."""

    def test_frontend_job_uses_bun(self):
        """El frontend debe instalar y ejecutar scripts con Bun."""
        workflow = Path(".github/workflows/ci.yml").read_text(encoding="utf-8")
        frontend = workflow[
            workflow.index("  frontend:") : workflow.index("  netbox-compose:")
        ]

        assert "oven-sh/setup-bun@v2" in frontend
        assert "bun ci" in frontend
        assert "bun run lint" in frontend
        assert "bun run test:run" in frontend
        assert "bun run build" in frontend
        assert "npm " not in frontend


class TestRuntimeRequirements:
    """Tests para dependencias runtime documentadas."""

    def test_requirements_include_redis_runtime_dependency(self):
        """El rate limiter necesita redis al instalar via requirements.txt."""
        requirements = Path("requirements.txt").read_text(encoding="utf-8")

        assert "redis>=5.2.0" in requirements
