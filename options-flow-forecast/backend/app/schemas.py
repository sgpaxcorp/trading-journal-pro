from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field


class FlowRow(BaseModel):
    symbol: str
    underlying: Optional[str] = None
    expiry: Optional[str] = None  # YYYY-MM-DD
    strike: float
    option_type: Literal["C", "P"]
    side: Optional[Literal["ASK", "BID", "MID", "UNKNOWN"]] = "UNKNOWN"
    price: Optional[float] = None
    size: Optional[float] = None
    premium: Optional[float] = None
    open_interest: Optional[float] = None
    iv: Optional[float] = None
    delta: Optional[float] = None
    timestamp: Optional[str] = None


class FlowTable(BaseModel):
    rows: List[FlowRow]
    provider: Optional[str] = None


class EngineeredFeatures(BaseModel):
    net_call_premium: float
    net_put_premium: float
    call_put_ratio: float
    aggressiveness: float
    top_strikes_by_premium: List[Dict[str, Any]]
    concentration_hhi: float
    delta_notional: Optional[float] = None
    skew_proxy: Optional[float] = None


class Scenario(BaseModel):
    name: Literal["bull", "bear", "neutral"]
    probability: float
    description: str


class Forecast(BaseModel):
    scenarios: List[Scenario]


class KeyLevel(BaseModel):
    strike: float
    reason: str
    side: Optional[str] = None


class AnalyzeRequest(BaseModel):
    symbol: str
    date: str
    flow_upload_id: str
    chart_upload_id: Optional[str] = None


class AnalyzeResponse(BaseModel):
    status: Literal["ok", "needs_more_data"]
    missing: Optional[List[str]] = None
    parsed_flow_table: Optional[FlowTable] = None
    engineered_features: Optional[EngineeredFeatures] = None
    forecast: Optional[Forecast] = None
    key_levels: Optional[List[KeyLevel]] = None
    rationale: Optional[str] = None
    confidence: Optional[float] = None
    disclaimer: str

    observed: Optional[Dict[str, Any]] = None
    inferences: Optional[Dict[str, Any]] = None


class FeedbackRequest(BaseModel):
    analysis_id: str
    correct: Optional[bool] = None
    notes: Optional[str] = None
