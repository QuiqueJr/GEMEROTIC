"""
Asistente conversacional local para cumplimiento OT.

No emite certificaciones legales. Resume findings evaluados, explica riesgos
y propone acciones a partir del informe determinista.
"""

from __future__ import annotations

from app.schemas.compliance import (
    ComplianceChatMessage,
    ComplianceChatResponse,
    ComplianceFinding,
)
from app.schemas.topology import TopologyCreate
from app.services.compliance_engine import ComplianceEngine

ASSET_GUIDANCE = {
    "plc": (
        "Ubica PLCs en Purdue 1, dentro de una zona de control OT bien "
        "definida, y evita exponerlos directamente a niveles IT altos."
    ),
    "hmi": (
        "Ubica HMIs en Purdue 2 y conéctalas hacia PLCs o SCADA mediante "
        "conduits con protocolos explícitos y límites de zona claros."
    ),
    "rtu": (
        "Las RTUs suelen operar en Purdue 1; conviene proteger sus cruces "
        "con IT mediante frontera filtrada y protocolos mínimos."
    ),
    "scada": (
        "Los servidores SCADA encajan mejor en Purdue 2 o 3 y no deberían "
        "tener conectividad directa amplia con Purdue 4/5 sin firewall o DMZ."
    ),
    "server": (
        "Los servidores OT o de soporte deben tener metadata completa, zona "
        "definida y, si son críticos, un nivel de seguridad de zona al menos "
        "SL-2."
    ),
    "firewall": (
        "Usa firewalls para representar fronteras filtradas cuando el conduit "
        "cruza varios niveles Purdue o separa OT de IT."
    ),
    "switch": (
        "Los switches no sustituyen un control de seguridad: documenta sus "
        "VLANs, su zona y los conduits que autorizan tráfico inter-zona."
    ),
    "router": (
        "Los routers deben quedar dentro de una zona concreta y no servir "
        "como by-pass implícito entre zonas sin conduit declarado."
    ),
    "wireless": (
        "Los puntos de acceso inalámbricos deben revisarse con cautela en "
        "entornos OT y quedar siempre en una zona explícita."
    ),
}


class ComplianceAssistant:
    """Responder preguntas apoyándose en findings y contexto topológico."""

    def __init__(self, engine: ComplianceEngine | None = None):
        self._engine = engine or ComplianceEngine()

    def answer(
        self,
        topology: TopologyCreate,
        messages: list[ComplianceChatMessage],
    ) -> ComplianceChatResponse:
        """Construir respuesta local basada en el último mensaje del usuario."""
        report = self._engine.evaluate(topology)
        latest_question = next(
            (
                message.content
                for message in reversed(messages)
                if message.role == "user"
            ),
            "",
        )
        normalized_question = latest_question.casefold()
        cited_findings = self._match_findings(
            report.findings,
            topology,
            normalized_question,
        )
        suggested_actions = _collect_actions(cited_findings)

        answer_parts = [
            _build_posture_line(
                report.summary.overall_posture,
                report.summary.failed_controls,
                report.summary.warned_controls,
            ),
            _build_findings_line(cited_findings),
        ]

        topology_hint = self._build_topology_hint(topology, normalized_question)
        if topology_hint:
            answer_parts.append(topology_hint)

        if suggested_actions:
            answer_parts.append(
                "Acciones recomendadas: " + " | ".join(suggested_actions[:3])
            )

        return ComplianceChatResponse(
            answer="\n\n".join(part for part in answer_parts if part),
            cited_controls=[finding.control_id for finding in cited_findings],
            suggested_actions=suggested_actions[:5],
            report=report,
        )

    def _match_findings(
        self,
        findings: list[ComplianceFinding],
        topology: TopologyCreate,
        normalized_question: str,
    ) -> list[ComplianceFinding]:
        """Seleccionar findings relevantes a la pregunta del usuario."""
        device_hits = [
            device.id
            for device in topology.devices
            if device.id.casefold() in normalized_question
            or device.name.casefold() in normalized_question
        ]
        zone_hits = [
            zone.id
            for zone in topology.security_zones
            if zone.id.casefold() in normalized_question
            or zone.name.casefold() in normalized_question
        ]
        asset_type_hits = [
            asset_type
            for asset_type in ASSET_GUIDANCE
            if asset_type in normalized_question
        ]

        matched = [
            finding
            for finding in findings
            if any(
                device_id in finding.affected_assets for device_id in device_hits
            )
            or any(zone_id in finding.affected_zones for zone_id in zone_hits)
            or any(
                asset_type in finding.summary.casefold()
                for asset_type in asset_type_hits
            )
            or finding.control_id.casefold() in normalized_question
            or finding.standard.casefold() in normalized_question
            or any(
                keyword in finding.title.casefold()
                for keyword in normalized_question.split()
            )
        ]

        if matched:
            return matched[:4]

        return sorted(
            findings,
            key=lambda finding: _finding_priority(finding.status),
            reverse=True,
        )[:4]

    def _build_topology_hint(
        self,
        topology: TopologyCreate,
        normalized_question: str,
    ) -> str:
        """Aportar guía contextual sobre tipos de activo consultados."""
        hints: list[str] = []

        for asset_type, guidance in ASSET_GUIDANCE.items():
            if asset_type in normalized_question:
                hints.append(guidance)

        if "conduit" in normalized_question or "zona" in normalized_question:
            hints.append(
                "Para este baseline, toda comunicación entre zonas debe tener "
                "conduit declarado, protocolos permitidos y un nivel de "
                "seguridad coherente con las zonas extremas."
            )

        if "cumple" in normalized_question or "compliance" in normalized_question:
            hints.append(
                f"El informe cubre {len(topology.devices)} activos y "
                f"{len(topology.conduits)} conduits, pero deja fuera "
                "controles organizativos y operativos que requieren "
                "evidencia adicional."
            )

        return " ".join(dict.fromkeys(hints))


def _collect_actions(findings: list[ComplianceFinding]) -> list[str]:
    actions: list[str] = []
    for finding in findings:
        actions.extend(finding.remediation)
    return list(dict.fromkeys(actions))


def _build_posture_line(
    posture: str,
    failed_controls: int,
    warned_controls: int,
) -> str:
    if posture == "non_compliant":
        return (
            "Postura actual: no conforme en esta baseline. "
            f"Hay {failed_controls} controles fallidos y "
            f"{warned_controls} controles en warning."
        )
    if posture == "attention_required":
        return (
            "Postura actual: requiere atencion. No hay fallos "
            "bloqueantes, pero hay "
            f"{warned_controls} controles con warning."
        )
    if posture == "partial":
        return (
            "Postura actual: favorable en lo evaluable, con "
            "cobertura parcial del baseline."
        )
    return "Postura actual: solida para los controles topologicos evaluados."


def _build_findings_line(findings: list[ComplianceFinding]) -> str:
    if not findings:
        return "No hay findings relevantes para la pregunta."

    fragments = [
        f"{finding.control_id} [{finding.status}] {finding.summary}"
        for finding in findings
    ]
    return "Findings relevantes: " + " | ".join(fragments)


def _finding_priority(status: str) -> int:
    return {
        "fail": 4,
        "warn": 3,
        "not_assessed": 2,
        "pass": 1,
    }.get(status, 0)
