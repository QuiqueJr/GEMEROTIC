"""
Tests del store local de topologías guardadas.
"""

import pytest

from app.schemas.topology import TopologyCreate
from app.services.topology_store import TopologyNotFoundError, TopologyStore
from tests.test_schemas import _mvp_topology_payload


class TestTopologyStore:
    """Tests de persistencia local del gemelo digital."""

    def test_save_persists_topology_and_artifacts(self, tmp_path):
        topology = TopologyCreate(**_mvp_topology_payload())
        store = TopologyStore(root=tmp_path)

        result = store.save(topology)
        loaded = store.load("mvp-lab-01")

        assert result["topology_name"] == "mvp-lab-01"
        assert loaded.name == topology.name
        assert (tmp_path / "mvp-lab-01" / "topology.json").exists()
        assert (
            tmp_path
            / "mvp-lab-01"
            / "artifacts"
            / "containerlab"
            / "topology.clab.yml"
        ).exists()

    def test_update_netbox_sync_writes_metadata(self, tmp_path):
        topology = TopologyCreate(**_mvp_topology_payload())
        store = TopologyStore(root=tmp_path)

        store.save(topology)
        store.update_netbox_sync(
            "mvp-lab-01",
            {"status": "failed", "detail": "NetBox unavailable"},
        )

        metadata = (tmp_path / "mvp-lab-01" / "metadata.json").read_text(
            encoding="utf-8"
        )
        assert "NetBox unavailable" in metadata

    def test_load_missing_topology_raises_clear_error(self, tmp_path):
        store = TopologyStore(root=tmp_path)

        with pytest.raises(TopologyNotFoundError, match="Saved topology not found"):
            store.load("missing-lab")
