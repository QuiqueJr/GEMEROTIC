"""
Cliente mínimo para respuestas estructuradas con Ollama.

El modelo no decide el cumplimiento por sí solo. Solo explica y prioriza a
partir del informe determinista ya calculado por GEMEROTIC.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx
from pydantic import BaseModel, Field


class OllamaComplianceOutput(BaseModel):
    """Respuesta estructurada esperada del modelo."""

    in_scope: bool = Field(default=True)
    answer: str = Field(..., min_length=1, max_length=2400)
    cited_controls: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list)


OLLAMA_COMPLIANCE_FORMAT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "in_scope": {"type": "boolean"},
        "answer": {"type": "string"},
        "cited_controls": {
            "type": "array",
            "items": {"type": "string"},
        },
        "suggested_actions": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["answer"],
}


class OllamaComplianceClient:
    """Cliente HTTP sencillo contra `/api/chat` de Ollama."""

    def __init__(
        self,
        base_url: str,
        model: str,
        timeout_seconds: float = 30.0,
        api_key: str = "",
        request_func: Callable[..., httpx.Response] = httpx.post,
    ):
        self._base_url = base_url.rstrip("/")
        self._model = model.strip()
        self._timeout_seconds = timeout_seconds
        self._api_key = api_key.strip()
        self._request_func = request_func

    @property
    def configured(self) -> bool:
        """Indicar si el cliente tiene un modelo configurado."""
        return bool(self._model)

    def answer(
        self,
        messages: list[dict[str, str]],
        context: dict[str, Any],
    ) -> OllamaComplianceOutput:
        """Solicitar una respuesta JSON estricta al modelo."""
        if not self.configured:
            raise RuntimeError("Ollama model is not configured")

        # Inyectar el contexto de la topología en el primer mensaje
        # de usuario o como sistema
        full_messages = [
            {
                "role": "system",
                "content": (
                    "You are GEMEROTIC OT compliance assistant. "
                    "You can only answer OT topology and compliance questions "
                    "using the provided report and topology context. "
                    "Never claim legal certification. "
                    "Never mark not assessed controls as compliant. "
                    "If the question is outside scope, set in_scope=false and "
                    "briefly refuse. "
                    f"Topology Context:\n{context}"
                ),
            },
            *messages,
        ]

        payload = {
            "model": self._model,
            "stream": False,
            "format": OLLAMA_COMPLIANCE_FORMAT_SCHEMA,
            "options": {"temperature": 0},
            "messages": full_messages,
        }
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        response = self._request_func(
            f"{self._base_url}/api/chat",
            json=payload,
            headers=headers,
            timeout=self._timeout_seconds,
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("message", {}).get("content", "")
        if not content:
            raise RuntimeError("Ollama returned an empty message")
        return OllamaComplianceOutput.model_validate_json(content)
