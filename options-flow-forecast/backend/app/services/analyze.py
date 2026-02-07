from typing import Dict, List
from ..schemas import FlowTable, EngineeredFeatures, KeyLevel, Forecast
from .features import compute_features
from .model import predict_proba


def build_key_levels(flow: FlowTable) -> List[KeyLevel]:
    levels: Dict[float, float] = {}
    for r in flow.rows:
        prem = r.premium or 0.0
        levels[r.strike] = levels.get(r.strike, 0.0) + prem

    top = sorted(levels.items(), key=lambda kv: kv[1], reverse=True)[:6]
    out: List[KeyLevel] = []
    for strike, prem in top:
        out.append(KeyLevel(strike=strike, reason=f"High premium concentration (~{prem:,.0f})"))
    return out


def build_rationale(features: EngineeredFeatures) -> str:
    parts = []
    parts.append(f"Net call premium: {features.net_call_premium:,.0f}")
    parts.append(f"Net put premium: {features.net_put_premium:,.0f}")
    parts.append(f"Call/Put ratio: {features.call_put_ratio:.2f}")
    parts.append(f"Aggressiveness (ask vs bid): {features.aggressiveness:.2f}")
    if features.skew_proxy is not None:
        parts.append(f"Skew proxy: {features.skew_proxy:.2f}")
    return " | ".join(parts)


def build_forecast(features: EngineeredFeatures) -> Forecast:
    proba = predict_proba(features.model_dump())
    scenarios = [
        {"name": "bull", "probability": proba.get("bull", 0.0), "description": "Upside continuation if flows are confirmed"},
        {"name": "bear", "probability": proba.get("bear", 0.0), "description": "Downside scenario if puts dominate"},
        {"name": "neutral", "probability": proba.get("neutral", 0.0), "description": "Range/mean-reversion if flow is mixed"},
    ]
    return Forecast(scenarios=scenarios)


def analyze_flow(flow: FlowTable):
    features = compute_features(flow)
    forecast = build_forecast(features)
    key_levels = build_key_levels(flow)
    rationale = build_rationale(features)
    return features, forecast, key_levels, rationale
