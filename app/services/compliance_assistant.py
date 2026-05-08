"""
Asistente conversacional local para cumplimiento OT.

No emite certificaciones legales. Resume findings evaluados, explica riesgos
y propone acciones a partir del informe determinista.
"""

from __future__ import annotations

from app.config import settings
from app.schemas.compliance import (
    ComplianceChatMessage,
    ComplianceChatResponse,
    ComplianceFinding,
)
from app.schemas.topology import TopologyCreate
from app.services.compliance_engine import ComplianceEngine
from app.services.ollama_client import OllamaComplianceClient

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

    def __init__(
        self,
        engine: ComplianceEngine | None = None,
        ollama_client: OllamaComplianceClient | None = None,
    ):
        self._engine = engine or ComplianceEngine()
        self._ollama_client = ollama_client or OllamaComplianceClient(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            timeout_seconds=settings.OLLAMA_TIMEOUT_SECONDS,
            api_key=settings.OLLAMA_API_KEY.get_secret_value(),
        )

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
        if not _question_is_in_scope(topology, normalized_question):
            return ComplianceChatResponse(
                mode="scope_guard",
                scope_allowed=False,
                answer=(
                    "Solo puedo responder sobre la topologia OT cargada y sobre "
                    "la baseline GEMEROTIC trazable a IEC 62443, NIS2 e "
                    "ISO/IEC 27001. No doy certificaciones legales ni cubro "
                    "controles no evidenciados en la topologia."
                ),
                cited_controls=[],
                suggested_actions=[
                    (
                        "Pregunta por zonas, conduits, niveles Purdue, "
                        "interfaces, activos criticos o findings del informe."
                    ),
                    (
                        "Formula dudas sobre IEC 62443, NIS2 o ISO/IEC 27001 "
                        "aplicadas a esta topologia."
                    ),
                ],
                limitations=_default_limitations(),
                report=report,
            )

        if (
            settings.COMPLIANCE_ASSISTANT_PROVIDER == "ollama"
            and self._ollama_client.configured
        ):
            ollama_response = self._answer_with_ollama(
                topology=topology,
                report=report,
                messages=messages,
                latest_question=latest_question,
            )
            if ollama_response is not None:
                return ollama_response

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
            mode="local_advisor",
            scope_allowed=True,
            answer="\n\n".join(part for part in answer_parts if part),
            cited_controls=[finding.control_id for finding in cited_findings],
            suggested_actions=suggested_actions[:5],
            limitations=_default_limitations(),
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

    def _answer_with_ollama(
        self,
        topology: TopologyCreate,
        report,
        messages: list[ComplianceChatMessage],
        latest_question: str,
    ) -> ComplianceChatResponse | None:
        """Usar Ollama como capa de explicación, no como fuente de verdad."""
        try:
            llm_output = self._ollama_client.answer(
                messages=_build_ollama_messages(messages, latest_question),
                context=_build_ollama_context(topology, report),
            )
        except Exception:
            return None

        return ComplianceChatResponse(
            mode="ollama_advisor",
            scope_allowed=llm_output.in_scope,
            answer=llm_output.answer,
            cited_controls=_filter_control_ids(
                report.findings,
                llm_output.cited_controls,
            ),
            suggested_actions=llm_output.suggested_actions[:5],
            limitations=_default_limitations(),
            report=report,
        )


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


def _question_is_in_scope(
    topology: TopologyCreate,
    normalized_question: str,
) -> bool:
    scope_keywords = {
        "topologia",
        "topology",
        "red",
        "network",
        "ot",
        "ics",
        "iec",
        "62443",
        "nis2",
        "iso",
        "27001",
        "zona",
        "zone",
        "conduit",
        "purdue",
        "security level",
        "sl-",
        "activo",
        "asset",
        "plc",
        "hmi",
        "rtu",
        "scada",
        "vlan",
        "interface",
        "interfaz",
        "cable",
        "firewall",
        "router",
        "switch",
        "server",
        "cumple",
        "compliance",
    }
    if any(keyword in normalized_question for keyword in scope_keywords):
        return True

    dynamic_keywords = {
        topology.name.casefold(),
        *(device.id.casefold() for device in topology.devices),
        *(device.name.casefold() for device in topology.devices),
        *(zone.id.casefold() for zone in topology.security_zones),
        *(zone.name.casefold() for zone in topology.security_zones),
    }
    return any(
        keyword and keyword in normalized_question
        for keyword in dynamic_keywords
    )


def _build_ollama_messages(
    messages: list[ComplianceChatMessage],
    latest_question: str,
) -> list[dict[str, str]]:
    """Convertir historial a formato nativo de Ollama para evitar inyección."""
    formatted = [
        {"role": message.role, "content": message.content}
        for message in messages[-6:]
    ]
    # Si el último mensaje no es la pregunta actual (poco común en este flujo),
    # nos aseguramos de que esté presente.
    if not formatted or formatted[-1]["content"] != latest_question:
        formatted.append({"role": "user", "content": latest_question})
    return formatted


def _build_ollama_context(topology: TopologyCreate, report) -> dict[str, object]:
    return {
        "topology_name": topology.name,
        "devices": [
            {
                "id": device.id,
                "name": device.name,
                "asset_type": device.asset_type.value,
                "criticality": device.criticality.value,
            }
            for device in topology.devices
        ],
        "zones": [
            {
                "id": zone.id,
                "name": zone.name,
                "purdue_level": zone.purdue_level.value,
                "security_level": zone.security_level.value,
                "device_ids": zone.device_ids,
            }
            for zone in topology.security_zones
        ],
        "conduits": [
            {
                "id": conduit.id,
                "source_zone_id": conduit.source_zone_id,
                "target_zone_id": conduit.target_zone_id,
                "security_level": conduit.security_level.value,
                "allowed_protocols": conduit.allowed_protocols,
            }
            for conduit in topology.conduits
        ],
        "summary": report.summary.model_dump(),
        "findings": [
            {
                "control_id": finding.control_id,
                "standard": finding.standard,
                "status": finding.status,
                "summary": finding.summary,
                "rationale": finding.rationale,
                "remediation": finding.remediation,
                "affected_assets": finding.affected_assets,
                "affected_zones": finding.affected_zones,
            }
            for finding in report.findings
        ],
    }


def _filter_control_ids(
    findings: list[ComplianceFinding],
    control_ids: list[str],
) -> list[str]:
    known_controls = {finding.control_id for finding in findings}
    return [
        control_id
        for control_id in control_ids
        if control_id in known_controls
    ]


def _default_limitations() -> list[str]:
    return [
        "No certifica cumplimiento legal por sí solo.",
        "No sustituye una auditoría formal.",
        (
            "No evalúa controles organizativos u operativos no evidenciados "
            "en la topología."
        ),
    ]
