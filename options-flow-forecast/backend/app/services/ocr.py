import base64
import json
from typing import Optional
from openai import OpenAI
from ..core.config import settings
from ..schemas import FlowTable


def extract_flow_from_image(image_bytes: bytes, prompt_text: str) -> FlowTable:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY not set")

    client = OpenAI(api_key=settings.openai_api_key)
    b64 = base64.b64encode(image_bytes).decode("utf-8")

    resp = client.responses.create(
        model="gpt-4.1-mini",
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt_text},
                    {"type": "input_image", "image_url": f"data:image/png;base64,{b64}"},
                ],
            }
        ],
    )

    text = resp.output_text
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Vision extraction did not return valid JSON") from exc

    return FlowTable.model_validate(data)
