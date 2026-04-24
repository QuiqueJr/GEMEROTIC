"""
Motor determinista de cumplimiento OT basado en topología.

Evalúa una línea base GEMEROTIC trazable sobre NIS2, IEC 62443 e
ISO/IEC 27001 usando únicamente evidencia disponible en `TopologyCreate`.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

from app.schemas.compliance import (
    ComplianceFinding,
    ComplianceReference,
    ComplianceReport,
    ComplianceSummary,
)
from app.schemas.topology import (
    AssetType,
    Criticality,
    SecurityLevel,
    TopologyCreate,
)

TITLE_ZONE_ASSIGNMENT = "Cada activo debe pertenecer a una unica zona de seguridad"
TITLE_CONDUIT_COVERAGE = (
    "Toda comunicacion entre zonas debe estar modelada por un conduit"
)
TITLE_CONDUIT_PROTOCOLS = "Los conduits deben declarar protocolos autorizados"
TITLE_CONDUIT_SL = (
    "El conduit no debe quedar por debajo del SL de las zonas conectadas"
)
TITLE_ZONE_PURDUE = "Las zonas deben declarar nivel Purdue"
TITLE_CRITICAL_ASSETS = (
    "Los activos de alta criticidad deben tener metadata y contexto de riesgo"
)
TITLE_BOUNDARY = (
    "Los saltos amplios entre niveles Purdue deben tener frontera filtrada"
)
TITLE_MANAGEMENT = (
    "Las interfaces de gestion deben estar separadas y bien identificadas"
)

SECURITY_LEVEL_RANK = {
    SecurityLevel.SL_0: 0,
    SecurityLevel.SL_1: 1,
    SecurityLevel.SL_2: 2,
    SecurityLevel.SL_3: 3,
    SecurityLevel.SL_4: 4,
}
HIGH_CRITICALITIES = {Criticality.CRITICAL, Criticality.HIGH}

IEC62443_REFERENCES = [
    ComplianceReference(
        standard="IEC 62443",
        reference="ISA/IEC 62443 series overview",
        url=(
            "https://www.isa.org/standards-and-publications/"
            "isa-standards/isa-iec-62443-series-of-standards"
        ),
    ),
    ComplianceReference(
        standard="IEC 62443",
        reference="Zones and conduits guidance",
        url="https://gca.isa.org/blog/how-to-define-zones-and-conduits?hs_amp=true",
    ),
]
NIS2_REFERENCES = [
    ComplianceReference(
        standard="NIS2",
        reference="European Commission NIS2 overview",
        url="https://digital-strategy.ec.europa.eu/en/policies/nis2-directive",
    ),
    ComplianceReference(
        standard="NIS2",
        reference="ENISA NIS2 overview",
        url=(
            "https://www.enisa.europa.eu/topics/state-of-cybersecurity-in-the-eu/"
            "cybersecurity-policies/nis-directive-2"
        ),
    ),
]
ISO27001_REFERENCES = [
    ComplianceReference(
        standard="ISO/IEC 27001",
        reference="ISO/IEC 27001:2022 overview",
        url="https://www.iso.org/standard/27001",
    ),
]


class ComplianceEngine:
    """Generar un informe determinista a partir de una topología validada."""

    def evaluate(self, topology: TopologyCreate) -> ComplianceReport:
        """Evaluar controles soportados y devolver informe estructurado."""
        devices_by_id = {device.id: device for device in topology.devices}
        interfaces_by_port = {
            interface.port_id: interface for interface in topology.interfaces
        }
        vlans_by_port = _build_vlans_by_port(topology)
        zone_memberships = _build_zone_memberships(topology)
        zone_by_id = {zone.id: zone for zone in topology.security_zones}

        findings = [
            self._evaluate_zone_assignment(topology, zone_memberships),
            self._evaluate_cross_zone_conduits(
                topology,
                devices_by_id,
                zone_memberships,
            ),
            self._evaluate_conduit_protocols(topology),
            self._evaluate_conduit_security_levels(topology, zone_by_id),
            self._evaluate_zone_metadata(topology),
            self._evaluate_critical_asset_metadata(topology, zone_memberships),
            self._evaluate_boundary_protection(topology, zone_by_id),
            self._evaluate_management_hygiene(
                topology,
                interfaces_by_port,
                vlans_by_port,
            ),
            self._not_assessed_incident_readiness(),
            self._not_assessed_governance_controls(),
        ]
        return ComplianceReport(
            topology_name=topology.name,
            generated_at=datetime.now(tz=UTC),
            summary=_build_summary(findings),
            findings=findings,
        )

    def _evaluate_zone_assignment(
        self,
        topology: TopologyCreate,
        zone_memberships: dict[str, list[str]],
    ) -> ComplianceFinding:
        missing_assets: list[str] = []
        duplicate_assets: list[str] = []

        for device in topology.devices:
            memberships = zone_memberships.get(device.id, [])
            if not memberships:
                missing_assets.append(device.id)
            elif len(memberships) > 1:
                duplicate_assets.append(device.id)

        if missing_assets or duplicate_assets:
            return ComplianceFinding(
                control_id="IEC62443-ZONE-001",
                standard="IEC 62443",
                title=TITLE_ZONE_ASSIGNMENT,
                status="fail",
                severity="high",
                summary=(
                    f"{len(missing_assets)} activos sin zona y "
                    f"{len(duplicate_assets)} activos en multiples zonas."
                ),
                rationale=(
                    "La segmentacion por zonas solo es fiable cuando cada activo "
                    "tiene pertenencia clara. Un activo sin zona o en varias "
                    "zonas rompe la trazabilidad del modelo."
                ),
                affected_assets=sorted(missing_assets + duplicate_assets),
                affected_zones=[],
                evidence={
                    "missing_assets": missing_assets,
                    "duplicate_assets": duplicate_assets,
                },
                remediation=[
                    "Asignar cada activo exactamente a una zona IEC 62443.",
                    "Eliminar membresias duplicadas entre zonas.",
                    "Revisar activos nuevos antes de persistir en NetBox.",
                ],
                references=IEC62443_REFERENCES,
            )

        return ComplianceFinding(
            control_id="IEC62443-ZONE-001",
            standard="IEC 62443",
            title=TITLE_ZONE_ASSIGNMENT,
            status="pass",
            severity="info",
            summary="Todos los activos tienen pertenencia unica a zona.",
            rationale=(
                "La topologia mantiene una asignacion univoca de activos a "
                "zonas y permite razonar sobre segmentacion y conduits."
            ),
            evidence={"zoned_assets": len(topology.devices)},
            remediation=[],
            references=IEC62443_REFERENCES,
        )

    def _evaluate_cross_zone_conduits(
        self,
        topology: TopologyCreate,
        devices_by_id: dict[str, object],
        zone_memberships: dict[str, list[str]],
    ) -> ComplianceFinding:
        conduit_pairs = {
            frozenset((conduit.source_zone_id, conduit.target_zone_id))
            for conduit in topology.conduits
        }
        unmanaged_links: list[dict[str, str]] = []

        for cable in topology.cables:
            endpoint_devices = [
                termination.port_id.split(":", 1)[0]
                for termination in cable.terminations
            ]
            if any(device_id not in devices_by_id for device_id in endpoint_devices):
                continue

            source_memberships = zone_memberships.get(endpoint_devices[0], [])
            target_memberships = zone_memberships.get(endpoint_devices[1], [])
            if len(source_memberships) != 1 or len(target_memberships) != 1:
                continue

            source_zone = source_memberships[0]
            target_zone = target_memberships[0]
            if source_zone == target_zone:
                continue

            if frozenset((source_zone, target_zone)) not in conduit_pairs:
                unmanaged_links.append(
                    {
                        "cable_id": cable.id,
                        "source_zone": source_zone,
                        "target_zone": target_zone,
                    }
                )

        if unmanaged_links:
            return ComplianceFinding(
                control_id="IEC62443-CONDUIT-001",
                standard="IEC 62443",
                title=TITLE_CONDUIT_COVERAGE,
                status="fail",
                severity="critical",
                summary=(
                    f"Se detectaron {len(unmanaged_links)} enlaces fisicos entre "
                    "zonas sin conduit declarado."
                ),
                rationale=(
                    "Las comunicaciones inter-zona deben quedar explícitamente "
                    "gobernadas. Si existe un enlace entre zonas sin conduit, no "
                    "queda claro qué canal está autorizado."
                ),
                affected_assets=[],
                affected_zones=sorted(
                    {
                        zone_id
                        for link in unmanaged_links
                        for zone_id in (
                            link["source_zone"],
                            link["target_zone"],
                        )
                    }
                ),
                evidence={"unmanaged_links": unmanaged_links},
                remediation=[
                    "Crear un conduit para cada relacion inter-zona permitida.",
                    "Revisar enlaces fisicos que crucen zonas.",
                    "Eliminar cableado inter-zona no autorizado.",
                ],
                references=IEC62443_REFERENCES,
            )

        return ComplianceFinding(
            control_id="IEC62443-CONDUIT-001",
            standard="IEC 62443",
            title=TITLE_CONDUIT_COVERAGE,
            status="pass",
            severity="info",
            summary="Todos los cruces de zona detectados tienen un conduit asociado.",
            rationale=(
                "La topologia representa de forma explícita los canales "
                "autorizados entre zonas."
            ),
            evidence={"cross_zone_links": len(topology.conduits)},
            remediation=[],
            references=IEC62443_REFERENCES,
        )

    def _evaluate_conduit_protocols(
        self,
        topology: TopologyCreate,
    ) -> ComplianceFinding:
        empty_conduits = [
            conduit.id
            for conduit in topology.conduits
            if not conduit.allowed_protocols
        ]
        if empty_conduits:
            return ComplianceFinding(
                control_id="IEC62443-CONDUIT-002",
                standard="IEC 62443",
                title=TITLE_CONDUIT_PROTOCOLS,
                status="warn",
                severity="medium",
                summary=(
                    f"{len(empty_conduits)} conduits no declaran protocolos "
                    "permitidos."
                ),
                rationale=(
                    "Un conduit sin protocolos definidos deja la política de "
                    "comunicaciones demasiado abierta para una segmentacion OT "
                    "defendible."
                ),
                affected_zones=[],
                evidence={"conduits_without_protocols": empty_conduits},
                remediation=[
                    "Definir allowlists de protocolos por conduit.",
                    "Separar conduits con propósitos distintos.",
                ],
                references=IEC62443_REFERENCES,
            )

        return ComplianceFinding(
            control_id="IEC62443-CONDUIT-002",
            standard="IEC 62443",
            title=TITLE_CONDUIT_PROTOCOLS,
            status="pass",
            severity="info",
            summary="Todos los conduits declaran protocolos permitidos.",
            rationale=(
                "La topologia ya delimita el tipo de trafico esperado en cada "
                "conduit."
            ),
            evidence={"conduits": len(topology.conduits)},
            remediation=[],
            references=IEC62443_REFERENCES,
        )

    def _evaluate_conduit_security_levels(
        self,
        topology: TopologyCreate,
        zone_by_id: dict[str, object],
    ) -> ComplianceFinding:
        weak_conduits: list[dict[str, str]] = []
        for conduit in topology.conduits:
            source_zone = zone_by_id[conduit.source_zone_id]
            target_zone = zone_by_id[conduit.target_zone_id]
            target_rank = max(
                SECURITY_LEVEL_RANK[source_zone.security_level],
                SECURITY_LEVEL_RANK[target_zone.security_level],
            )
            conduit_rank = SECURITY_LEVEL_RANK[conduit.security_level]
            if conduit_rank < target_rank:
                weak_conduits.append(
                    {
                        "conduit_id": conduit.id,
                        "conduit_security_level": conduit.security_level.value,
                        "required_security_level": _security_level_from_rank(
                            target_rank
                        ),
                    }
                )

        if weak_conduits:
            return ComplianceFinding(
                control_id="IEC62443-SL-001",
                standard="IEC 62443",
                title=TITLE_CONDUIT_SL,
                status="warn",
                severity="high",
                summary=(
                    f"{len(weak_conduits)} conduits quedan por debajo del nivel "
                    "de seguridad de una de sus zonas."
                ),
                rationale=(
                    "Como baseline GEMEROTIC, un canal entre zonas no debería "
                    "degradar el nivel de seguridad objetivo del extremo más "
                    "exigente."
                ),
                evidence={"weak_conduits": weak_conduits},
                remediation=[
                    "Elevar el security_level del conduit al nivel más exigente.",
                    "Revisar filtrado y autenticacion de los conduits afectados.",
                ],
                references=IEC62443_REFERENCES,
            )

        return ComplianceFinding(
            control_id="IEC62443-SL-001",
            standard="IEC 62443",
            title=TITLE_CONDUIT_SL,
            status="pass",
            severity="info",
            summary="Los conduits no rebajan el nivel de seguridad entre zonas.",
            rationale=(
                "La topologia mantiene consistencia entre niveles de seguridad "
                "de zonas y canales de interconexion."
            ),
            evidence={"conduits": len(topology.conduits)},
            remediation=[],
            references=IEC62443_REFERENCES,
        )

    def _evaluate_zone_metadata(
        self,
        topology: TopologyCreate,
    ) -> ComplianceFinding:
        missing_purdue = [
            zone.id
            for zone in topology.security_zones
            if zone.purdue_level is None
        ]
        if missing_purdue:
            return ComplianceFinding(
                control_id="IEC62443-ZONE-002",
                standard="IEC 62443",
                title=TITLE_ZONE_PURDUE,
                status="warn",
                severity="medium",
                summary=f"{len(missing_purdue)} zonas no declaran nivel Purdue.",
                rationale=(
                    "Sin el nivel Purdue es más difícil razonar sobre límites "
                    "OT/IT y placement esperado de activos."
                ),
                affected_zones=missing_purdue,
                evidence={"zones_without_purdue": missing_purdue},
                remediation=[
                    "Asignar un nivel Purdue a cada zona.",
                    "Revisar la segmentacion desde la vista de seguridad.",
                ],
                references=IEC62443_REFERENCES,
            )

        return ComplianceFinding(
            control_id="IEC62443-ZONE-002",
            standard="IEC 62443",
            title=TITLE_ZONE_PURDUE,
            status="pass",
            severity="info",
            summary="Todas las zonas declaran nivel Purdue.",
            rationale=(
                "La topologia incorpora contexto operacional suficiente para "
                "evaluar segmentacion OT/IT."
            ),
            evidence={"zones": len(topology.security_zones)},
            remediation=[],
            references=IEC62443_REFERENCES,
        )

    def _evaluate_critical_asset_metadata(
        self,
        topology: TopologyCreate,
        zone_memberships: dict[str, list[str]],
    ) -> ComplianceFinding:
        incomplete_assets: list[dict[str, object]] = []
        low_security_assets: list[dict[str, object]] = []
        zone_by_id = {zone.id: zone for zone in topology.security_zones}

        for device in topology.devices:
            if device.criticality not in HIGH_CRITICALITIES:
                continue

            missing_fields = [
                field_name
                for field_name, value in (
                    ("manufacturer", device.manufacturer),
                    ("model", device.model),
                    ("firmware_version", device.firmware_version),
                )
                if not value
            ]
            if missing_fields:
                incomplete_assets.append(
                    {"device_id": device.id, "missing_fields": missing_fields}
                )

            memberships = zone_memberships.get(device.id, [])
            if len(memberships) == 1:
                zone = zone_by_id[memberships[0]]
                if (
                    SECURITY_LEVEL_RANK[zone.security_level]
                    < SECURITY_LEVEL_RANK[SecurityLevel.SL_2]
                ):
                    low_security_assets.append(
                        {
                            "device_id": device.id,
                            "zone_id": zone.id,
                            "zone_security_level": zone.security_level.value,
                        }
                    )

        if incomplete_assets or low_security_assets:
            return ComplianceFinding(
                control_id="NIS2-ASSET-001",
                standard="NIS2",
                title=TITLE_CRITICAL_ASSETS,
                status="warn",
                severity="high",
                summary=(
                    f"{len(incomplete_assets)} activos de alta criticidad con "
                    "metadata incompleta y "
                    f"{len(low_security_assets)} activos en zonas con SL bajo."
                ),
                rationale=(
                    "La gestión del riesgo exige conocer qué activos son "
                    "críticos y bajo qué contexto operativo y de seguridad se "
                    "encuentran."
                ),
                affected_assets=sorted(
                    {
                        asset["device_id"]
                        for asset in incomplete_assets + low_security_assets
                    }
                ),
                affected_zones=sorted(
                    {asset["zone_id"] for asset in low_security_assets}
                ),
                evidence={
                    "incomplete_assets": incomplete_assets,
                    "low_security_assets": low_security_assets,
                },
                remediation=[
                    "Completar fabricante, modelo y firmware de activos críticos.",
                    "Revisar si deben residir en zonas con al menos SL-2.",
                ],
                references=NIS2_REFERENCES,
            )

        high_critical_assets = sum(
            1
            for device in topology.devices
            if device.criticality in HIGH_CRITICALITIES
        )
        return ComplianceFinding(
            control_id="NIS2-ASSET-001",
            standard="NIS2",
            title=TITLE_CRITICAL_ASSETS,
            status="pass",
            severity="info",
            summary=(
                "Los activos high/critical tienen metadata y nivel de "
                "seguridad razonables."
            ),
            rationale=(
                "La topologia contiene inventario técnico suficiente para un "
                "analisis inicial sobre activos de mayor criticidad."
            ),
            evidence={"high_critical_assets": high_critical_assets},
            remediation=[],
            references=NIS2_REFERENCES,
        )

    def _evaluate_boundary_protection(
        self,
        topology: TopologyCreate,
        zone_by_id: dict[str, object],
    ) -> ComplianceFinding:
        firewall_by_zone: dict[str, bool] = defaultdict(bool)
        for zone in topology.security_zones:
            for device_id in zone.device_ids:
                device = next(
                    (
                        item
                        for item in topology.devices
                        if item.id == device_id
                    ),
                    None,
                )
                if device is not None and device.asset_type == AssetType.FIREWALL:
                    firewall_by_zone[zone.id] = True

        risky_boundaries: list[dict[str, object]] = []
        for conduit in topology.conduits:
            source_zone = zone_by_id[conduit.source_zone_id]
            target_zone = zone_by_id[conduit.target_zone_id]
            if source_zone.purdue_level is None or target_zone.purdue_level is None:
                continue

            purdue_gap = abs(
                source_zone.purdue_level.value - target_zone.purdue_level.value
            )
            if purdue_gap < 2:
                continue

            if firewall_by_zone[source_zone.id] or firewall_by_zone[target_zone.id]:
                continue

            risky_boundaries.append(
                {
                    "conduit_id": conduit.id,
                    "source_zone_id": source_zone.id,
                    "target_zone_id": target_zone.id,
                    "purdue_gap": purdue_gap,
                }
            )

        if risky_boundaries:
            return ComplianceFinding(
                control_id="NIS2-SEG-001",
                standard="NIS2",
                title=TITLE_BOUNDARY,
                status="warn",
                severity="high",
                summary=(
                    f"{len(risky_boundaries)} conduits cruzan dos o más niveles "
                    "Purdue sin firewall modelado."
                ),
                rationale=(
                    "Como baseline GEMEROTIC, un salto amplio entre dominios "
                    "Purdue debe quedar protegido por una frontera filtrada "
                    "visible en la topologia."
                ),
                affected_zones=sorted(
                    {
                        zone_id
                        for item in risky_boundaries
                        for zone_id in (
                            item["source_zone_id"],
                            item["target_zone_id"],
                        )
                    }
                ),
                evidence={"risky_boundaries": risky_boundaries},
                remediation=[
                    "Insertar un firewall o zona intermedia.",
                    "Separar conduits IT/OT y documentar protocolos permitidos.",
                ],
                references=NIS2_REFERENCES,
            )

        return ComplianceFinding(
            control_id="NIS2-SEG-001",
            standard="NIS2",
            title=TITLE_BOUNDARY,
            status="pass",
            severity="info",
            summary=(
                "No se detectaron cruces Purdue amplios sin frontera filtrada."
            ),
            rationale=(
                "La topologia no muestra boundary crossings amplios sin "
                "protección explícita en las zonas afectadas."
            ),
            evidence={"conduits": len(topology.conduits)},
            remediation=[],
            references=NIS2_REFERENCES,
        )

    def _evaluate_management_hygiene(
        self,
        topology: TopologyCreate,
        interfaces_by_port: dict[str, object],
        vlans_by_port: dict[str, list[str]],
    ) -> ComplianceFinding:
        issues: list[dict[str, object]] = []
        for interface in topology.interfaces:
            if not interface.mgmt_only:
                continue

            problems: list[str] = []
            if not interface.ipv4_address and not interface.ipv6_address:
                problems.append("missing_management_address")
            if vlans_by_port.get(interface.port_id):
                problems.append("has_workload_vlan_membership")

            if problems:
                issues.append({"port_id": interface.port_id, "problems": problems})

        if issues:
            return ComplianceFinding(
                control_id="ISO27001-NET-001",
                standard="ISO/IEC 27001",
                title=TITLE_MANAGEMENT,
                status="warn",
                severity="medium",
                summary=(
                    f"Se detectaron {len(issues)} interfaces de gestion con "
                    "higiene deficiente."
                ),
                rationale=(
                    "Una interfaz marcada como mgmt_only debería tener "
                    "direccionamiento claro y no compartir membresia VLAN de "
                    "workload."
                ),
                affected_assets=sorted(
                    {
                        issue["port_id"].split(":", 1)[0]
                        for issue in issues
                    }
                ),
                evidence={"management_interface_issues": issues},
                remediation=[
                    "Asignar direccion IP a toda interfaz mgmt_only.",
                    "Evitar mezclar gestion con VLANs de workload.",
                ],
                references=ISO27001_REFERENCES,
            )

        assessed_management_ports = sum(
            1
            for interface in interfaces_by_port.values()
            if interface.mgmt_only
        )
        return ComplianceFinding(
            control_id="ISO27001-NET-001",
            standard="ISO/IEC 27001",
            title=TITLE_MANAGEMENT,
            status="pass",
            severity="info",
            summary="No se detectaron problemas en interfaces mgmt_only.",
            rationale=(
                "La topologia no expone interfaces de gestion con señales "
                "claras de mezcla entre plano de gestion y workload."
            ),
            evidence={"management_interfaces_assessed": assessed_management_ports},
            remediation=[],
            references=ISO27001_REFERENCES,
        )

    def _not_assessed_incident_readiness(self) -> ComplianceFinding:
        return ComplianceFinding(
            control_id="NIS2-OPS-001",
            standard="NIS2",
            title="Respuesta a incidentes, continuidad y notificacion",
            status="not_assessed",
            severity="info",
            summary="No evaluable solo con la topologia.",
            rationale=(
                "La topologia no aporta evidencia suficiente sobre procesos de "
                "gestion de incidentes, continuidad o reporting."
            ),
            evidence={
                "missing_inputs": [
                    "playbooks de respuesta",
                    "runbooks",
                    "backups",
                    "monitorizacion operativa",
                    "inventario de proveedores",
                ]
            },
            remediation=[
                "Conectar observabilidad y runbooks al motor.",
                "Incorporar telemetria y resultados de despliegue.",
            ],
            references=NIS2_REFERENCES,
        )

    def _not_assessed_governance_controls(self) -> ComplianceFinding:
        return ComplianceFinding(
            control_id="ISO27001-GOV-001",
            standard="ISO/IEC 27001",
            title="Gobierno, control de acceso y operacion del ISMS",
            status="not_assessed",
            severity="info",
            summary="No evaluable solo con la topologia.",
            rationale=(
                "La topologia no demuestra por sí sola políticas, procesos de "
                "acceso, aprobaciones o auditoría organizativa."
            ),
            evidence={
                "missing_inputs": [
                    "matriz de identidades",
                    "politicas de acceso",
                    "evidencias de cambio",
                    "registros de auditoria",
                ]
            },
            remediation=[
                "Integrar futuras fuentes IAM y logs de auditoria.",
                "Conectar el informe con evidencias operativas.",
            ],
            references=ISO27001_REFERENCES,
        )


def _build_vlans_by_port(topology: TopologyCreate) -> dict[str, list[str]]:
    memberships: dict[str, list[str]] = defaultdict(list)
    for vlan in topology.vlans:
        for port_id in vlan.assigned_interfaces:
            memberships[port_id].append(vlan.id)
    return dict(memberships)


def _build_zone_memberships(topology: TopologyCreate) -> dict[str, list[str]]:
    memberships: dict[str, list[str]] = defaultdict(list)
    for zone in topology.security_zones:
        for device_id in zone.device_ids:
            memberships[device_id].append(zone.id)
    return dict(memberships)


def _security_level_from_rank(rank: int) -> str:
    for level, value in SECURITY_LEVEL_RANK.items():
        if value == rank:
            return level.value
    return SecurityLevel.SL_4.value


def _build_summary(findings: list[ComplianceFinding]) -> ComplianceSummary:
    passed_controls = sum(1 for finding in findings if finding.status == "pass")
    warned_controls = sum(1 for finding in findings if finding.status == "warn")
    failed_controls = sum(1 for finding in findings if finding.status == "fail")
    not_assessed_controls = sum(
        1 for finding in findings if finding.status == "not_assessed"
    )
    assessed_controls = len(findings) - not_assessed_controls
    coverage_percent = (
        round((assessed_controls / len(findings)) * 100, 1)
        if findings
        else 0.0
    )

    if failed_controls:
        overall_posture = "non_compliant"
    elif warned_controls:
        overall_posture = "attention_required"
    elif not_assessed_controls:
        overall_posture = "partial"
    else:
        overall_posture = "strong"

    return ComplianceSummary(
        overall_posture=overall_posture,
        assessed_controls=assessed_controls,
        not_assessed_controls=not_assessed_controls,
        passed_controls=passed_controls,
        warned_controls=warned_controls,
        failed_controls=failed_controls,
        coverage_percent=coverage_percent,
    )
