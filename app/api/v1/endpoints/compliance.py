"""
Endpoints de informe y asistente de cumplimiento OT.
"""

from fastapi import APIRouter, Depends, status

from app.core.security import require_api_key
from app.schemas.compliance import ComplianceChatRequest
from app.schemas.responses import APIResponse
from app.schemas.topology import TopologyCreate
from app.services.compliance_assistant import ComplianceAssistant
from app.services.compliance_engine import ComplianceEngine

router = APIRouter(prefix="/compliance")


def get_compliance_engine() -> ComplianceEngine:
    """Crear motor de cumplimiento para cada petición."""
    return ComplianceEngine()


def get_compliance_assistant() -> ComplianceAssistant:
    """Crear asistente conversacional local."""
    return ComplianceAssistant()


@router.post(
    "/report",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluar cumplimiento OT",
)
async def generate_compliance_report(
    topology: TopologyCreate,
    _: None = Depends(require_api_key),
    engine: ComplianceEngine = Depends(get_compliance_engine),
) -> APIResponse:
    """Evaluar la topología frente a la baseline configurada."""
    report = engine.evaluate(topology)
    return APIResponse(
        message="Compliance report generated successfully",
        data=report.model_dump(),
    )


@router.post(
    "/chat",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
    summary="Conversar con el asistente de cumplimiento",
)
async def chat_with_compliance_assistant(
    request: ComplianceChatRequest,
    _: None = Depends(require_api_key),
    assistant: ComplianceAssistant = Depends(get_compliance_assistant),
) -> APIResponse:
    """Responder preguntas sobre la topología y sus findings."""
    response = assistant.answer(request.topology, request.messages)
    return APIResponse(
        message="Compliance assistant response generated successfully",
        data=response.model_dump(),
    )
