from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session, select
import uuid
import json
import os

from .core.config import settings
from .core.logging import configure_logging
from .db import init_db, get_session
from .models import Upload as UploadModel, Analysis as AnalysisModel, Feedback as FeedbackModel
from .schemas import AnalyzeRequest, AnalyzeResponse, FeedbackRequest, FlowTable
from .services.storage import get_storage
from .services.parser import parse_csv_bytes
from .services.ocr import extract_flow_from_image
from .services.analyze import analyze_flow

configure_logging()
init_db()

app = FastAPI(title="options-flow-forecast")


def parse_cors_origins(raw: str) -> list[str]:
    if not raw:
        return []
    return [o.strip() for o in raw.split(",") if o.strip()]


cors_origins = parse_cors_origins(settings.cors_allow_origins)
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["POST"],
        allow_headers=["*"],
    )


def require_api_key(x_api_key: str = Header(default="")):
    expected = settings.options_flow_api_key
    if expected and x_api_key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def enforce_upload_size(data: bytes):
    max_bytes = int(settings.max_upload_mb) * 1024 * 1024
    if max_bytes > 0 and len(data) > max_bytes:
        raise HTTPException(status_code=413, detail="File too large")


def load_prompt() -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "prompts", "flow_extract.md")
    with open(prompt_path, "r", encoding="utf-8") as f:
        return f.read()


@app.post("/ingest/flow")
async def ingest_flow(
    file: UploadFile = File(...),
    provider: str | None = None,
    symbol: str | None = None,
    _: None = Depends(require_api_key),
    session: Session = Depends(get_session),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    enforce_upload_size(data)

    storage = get_storage()
    upload_id, path = storage.save(file.filename, data)

    parsed_table: FlowTable | None = None
    if file.content_type and file.content_type.startswith("image/"):
        prompt = load_prompt()
        parsed_table = extract_flow_from_image(data, prompt)
    else:
        parsed_table = parse_csv_bytes(data, provider)

    upload = UploadModel(
        id=upload_id,
        upload_type="flow",
        filename=file.filename,
        storage_path=path,
        content_type=file.content_type or "application/octet-stream",
        provider=provider,
        symbol=symbol,
        metadata_json=json.dumps(parsed_table.model_dump()) if parsed_table else None,
    )
    session.add(upload)
    session.commit()

    return {"upload_id": upload_id, "rows": len(parsed_table.rows) if parsed_table else 0}


@app.post("/ingest/chart")
async def ingest_chart(
    file: UploadFile = File(...),
    symbol: str | None = None,
    _: None = Depends(require_api_key),
    session: Session = Depends(get_session),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    enforce_upload_size(data)

    storage = get_storage()
    upload_id, path = storage.save(file.filename, data)

    upload = UploadModel(
        id=upload_id,
        upload_type="chart",
        filename=file.filename,
        storage_path=path,
        content_type=file.content_type or "application/octet-stream",
        symbol=symbol,
    )
    session.add(upload)
    session.commit()

    return {"upload_id": upload_id}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    req: AnalyzeRequest,
    _: None = Depends(require_api_key),
    session: Session = Depends(get_session),
):
    flow_upload = session.exec(select(UploadModel).where(UploadModel.id == req.flow_upload_id)).first()
    if not flow_upload:
        return AnalyzeResponse(
            status="needs_more_data",
            missing=["flow_upload"],
            disclaimer=DISCLAIMER,
        )

    parsed: FlowTable | None = None
    if flow_upload.metadata_json:
        try:
            parsed = FlowTable.model_validate(json.loads(flow_upload.metadata_json))
        except Exception:
            parsed = None

    if parsed is None:
        # attempt to parse from file path
        with open(flow_upload.storage_path, "rb") as f:
            data = f.read()
        if flow_upload.content_type and flow_upload.content_type.startswith("image/"):
            prompt = load_prompt()
            parsed = extract_flow_from_image(data, prompt)
        else:
            parsed = parse_csv_bytes(data, flow_upload.provider)

    if parsed is None or not parsed.rows:
        return AnalyzeResponse(
            status="needs_more_data",
            missing=["flow_rows"],
            disclaimer=DISCLAIMER,
        )

    features, forecast, key_levels, rationale = analyze_flow(parsed)

    response = AnalyzeResponse(
        status="ok",
        parsed_flow_table=parsed,
        engineered_features=features,
        forecast=forecast,
        key_levels=key_levels,
        rationale=rationale,
        confidence=0.55,
        disclaimer=DISCLAIMER,
        observed={"rows": len(parsed.rows)},
        inferences={"key_levels": [k.model_dump() for k in key_levels]},
    )

    analysis_id = str(uuid.uuid4())
    analysis = AnalysisModel(
        id=analysis_id,
        symbol=req.symbol,
        date=req.date,
        flow_upload_id=req.flow_upload_id,
        chart_upload_id=req.chart_upload_id,
        result_json=response.model_dump_json(),
    )
    session.add(analysis)
    session.commit()

    return response


@app.post("/feedback")
async def feedback(
    req: FeedbackRequest,
    _: None = Depends(require_api_key),
    session: Session = Depends(get_session),
):
    fb = FeedbackModel(
        id=str(uuid.uuid4()),
        analysis_id=req.analysis_id,
        correct=req.correct,
        notes=req.notes,
    )
    session.add(fb)
    session.commit()
    return {"status": "ok"}


DISCLAIMER = (
    "Educational use only. This report is not financial advice,"
    " not a recommendation, and not an invitation to trade."
)
