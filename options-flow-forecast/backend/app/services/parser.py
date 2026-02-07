from __future__ import annotations
import re
from typing import Dict, List, Optional, Tuple
import pandas as pd
from ..schemas import FlowRow, FlowTable


COLUMN_CANDIDATES = {
    "symbol": ["symbol", "ticker", "underlying", "root", "stock"],
    "underlying": ["underlying", "root", "ticker"],
    "expiry": ["expiry", "expiration", "exp", "expiration_date", "exp_date"],
    "strike": ["strike", "strike_price", "strikeprice", "k"],
    "option_type": ["type", "call_put", "cp", "option_type"],
    "side": ["side", "bidask", "bid_ask", "aggressor", "at", "tick"],
    "price": ["price", "trade_price", "fill_price", "avg_price"],
    "size": ["size", "qty", "quantity", "volume", "contracts"],
    "premium": ["premium", "notional", "value", "amount"],
    "open_interest": ["oi", "open_interest"],
    "iv": ["iv", "implied_vol", "implied_volatility"],
    "delta": ["delta"],
    "timestamp": ["time", "timestamp", "ts", "date_time"],
}


def _normalize_columns(df: pd.DataFrame) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    cols = {c.lower().strip(): c for c in df.columns}

    for key, candidates in COLUMN_CANDIDATES.items():
        for cand in candidates:
            if cand in cols:
                mapping[key] = cols[cand]
                break
    return mapping


def _to_float(val: object) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip()
    if s == "" or s.lower() in {"nan", "none"}:
        return None
    s = s.replace(",", "")
    s = re.sub(r"[$%]", "", s)
    try:
        return float(s)
    except ValueError:
        return None


def _normalize_side(val: object) -> str:
    if val is None:
        return "UNKNOWN"
    s = str(val).lower()
    if "ask" in s or "offer" in s:
        return "ASK"
    if "bid" in s:
        return "BID"
    if "mid" in s or "between" in s:
        return "MID"
    return "UNKNOWN"


def _normalize_option_type(val: object) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip().lower()
    if s in {"c", "call", "calls"}:
        return "C"
    if s in {"p", "put", "puts"}:
        return "P"
    return None


def parse_csv_bytes(data: bytes, provider: Optional[str] = None) -> FlowTable:
    df = pd.read_csv(pd.io.common.BytesIO(data))
    mapping = _normalize_columns(df)

    rows: List[FlowRow] = []
    for _, r in df.iterrows():
        symbol = None
        if mapping.get("symbol"):
            symbol = str(r[mapping["symbol"]]).strip()
        underlying = None
        if mapping.get("underlying"):
            underlying = str(r[mapping["underlying"]]).strip()

        expiry = str(r[mapping["expiry"]]).strip() if mapping.get("expiry") else None
        strike = _to_float(r[mapping["strike"]]) if mapping.get("strike") else None
        opt_type = _normalize_option_type(r[mapping["option_type"]]) if mapping.get("option_type") else None
        side = _normalize_side(r[mapping["side"]]) if mapping.get("side") else "UNKNOWN"
        price = _to_float(r[mapping["price"]]) if mapping.get("price") else None
        size = _to_float(r[mapping["size"]]) if mapping.get("size") else None
        premium = _to_float(r[mapping["premium"]]) if mapping.get("premium") else None
        open_interest = _to_float(r[mapping["open_interest"]]) if mapping.get("open_interest") else None
        iv = _to_float(r[mapping["iv"]]) if mapping.get("iv") else None
        delta = _to_float(r[mapping["delta"]]) if mapping.get("delta") else None
        timestamp = str(r[mapping["timestamp"]]).strip() if mapping.get("timestamp") else None

        if premium is None and price is not None and size is not None:
            premium = price * size * 100

        if strike is None or opt_type is None:
            # skip malformed rows
            continue

        row = FlowRow(
            symbol=symbol or underlying or "",
            underlying=underlying or symbol,
            expiry=expiry,
            strike=float(strike),
            option_type=opt_type,
            side=side,
            price=price,
            size=size,
            premium=premium,
            open_interest=open_interest,
            iv=iv,
            delta=delta,
            timestamp=timestamp,
        )
        rows.append(row)

    return FlowTable(rows=rows, provider=provider)
