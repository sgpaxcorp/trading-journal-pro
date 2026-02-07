from typing import Dict
import math
import numpy as np
from sklearn.linear_model import LogisticRegression
import joblib


MODEL_PATH = "./storage/model.joblib"


def heuristic_forecast(features: Dict[str, float]) -> Dict[str, float]:
    # Simple heuristic: net call vs put, aggressiveness
    net_call = features.get("net_call_premium", 0.0)
    net_put = features.get("net_put_premium", 0.0)
    aggr = features.get("aggressiveness", 0.0)

    score = 0.0
    score += math.tanh(net_call / 1_000_000) * 0.8
    score -= math.tanh(net_put / 1_000_000) * 0.8
    score += aggr * 0.5

    bull = 1 / (1 + math.exp(-score))
    bear = 1 - bull
    neutral = 0.15

    # renormalize
    total = bull + bear + neutral
    return {
        "bull": bull / total,
        "bear": bear / total,
        "neutral": neutral / total,
    }


def load_model():
    try:
        return joblib.load(MODEL_PATH)
    except Exception:
        return None


def predict_proba(features: Dict[str, float]) -> Dict[str, float]:
    model = load_model()
    if model is None:
        return heuristic_forecast(features)

    cols = [
        "net_call_premium",
        "net_put_premium",
        "call_put_ratio",
        "aggressiveness",
        "concentration_hhi",
    ]
    X = np.array([[features.get(c, 0.0) for c in cols]])
    proba = model.predict_proba(X)[0]
    # assuming classes order: [bear, neutral, bull]
    return {
        "bear": float(proba[0]),
        "neutral": float(proba[1]),
        "bull": float(proba[2]),
    }


def train_baseline(X: np.ndarray, y: np.ndarray) -> LogisticRegression:
    model = LogisticRegression(max_iter=200)
    model.fit(X, y)
    joblib.dump(model, MODEL_PATH)
    return model
