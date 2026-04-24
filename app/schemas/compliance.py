"""
Schemas de cumplimiento OT para informe y asistente conversacional.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.topology import TopologyCreate

ComplianceStatus = Literal["pass", "fail", "warn", "not_assessed"]
ComplianceSeverity = Literal["critical", "high", "medium", "low", "info"]
CompliancePosture = Literal[
    "strong",
    "attention_required",
    "non_compliant",
    "partial",
]
ComplianceStandard = Literal["IEC 62443", "NIS2", "ISO/IEC 27001"]
ChatRole = Literal["user", "assistant"]


class ComplianceReference(BaseModel):
    """Referencia pública asociada a un control evaluado."""

    standard: ComplianceStandard = Field(...)
    reference: str = Field(..., min_length=1, max_length=128)
    url: str = Field(..., min_length=1, max_length=512)


class ComplianceFinding(BaseModel):
    """Resultado de un control de cumplimiento concreto."""

    control_id: str = Field(..., min_length=1, max_length=64)
    standard: ComplianceStandard = Field(...)
    title: str = Field(..., min_length=1, max_length=160)
    status: ComplianceStatus = Field(...)
    severity: ComplianceSeverity = Field(...)
    summary: str = Field(..., min_length=1, max_length=512)
    rationale: str = Field(..., min_length=1, max_length=1200)
    affected_assets: list[str] = Field(default_factory=list)
    affected_zones: list[str] = Field(default_factory=list)
    evidence: dict[str, object] = Field(default_factory=dict)
    remediation: list[str] = Field(default_factory=list)
    references: list[ComplianceReference] = Field(default_factory=list)


class ComplianceSummary(BaseModel):
    """Resumen ejecutivo del informe de cumplimiento."""

    overall_posture: CompliancePosture = Field(...)
    assessed_controls: int = Field(..., ge=0)
    not_assessed_controls: int = Field(..., ge=0)
    passed_controls: int = Field(..., ge=0)
    warned_controls: int = Field(..., ge=0)
    failed_controls: int = Field(..., ge=0)
    coverage_percent: float = Field(..., ge=0, le=100)


class ComplianceReport(BaseModel):
    """Informe de cumplimiento generado a partir de la topología."""

    topology_name: str = Field(..., min_length=1, max_length=128)
    baseline: list[ComplianceStandard] = Field(
        default_factory=lambda: ["NIS2", "IEC 62443", "ISO/IEC 27001"],
    )
    generated_at: datetime = Field(...)
    summary: ComplianceSummary = Field(...)
    findings: list[ComplianceFinding] = Field(default_factory=list)


class ComplianceChatMessage(BaseModel):
    """Mensaje de conversación con el asistente de cumplimiento."""

    role: ChatRole = Field(...)
    content: str = Field(..., min_length=1, max_length=2000)


class ComplianceChatRequest(BaseModel):
    """Petición de respuesta conversacional basada en la topología."""

    topology: TopologyCreate = Field(...)
    messages: list[ComplianceChatMessage] = Field(..., min_length=1)


class ComplianceChatResponse(BaseModel):
    """Respuesta del asistente de cumplimiento."""

    mode: Literal["local_advisor"] = Field(default="local_advisor")
    answer: str = Field(..., min_length=1)
    cited_controls: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)
    report: ComplianceReport = Field(...)
