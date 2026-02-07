from typing import List, Dict, Any
from ..schemas import FlowTable, EngineeredFeatures


def _premium_signed(row) -> float:
    premium = row.premium or 0.0
    side = (row.side or "UNKNOWN").upper()
    if side == "ASK":
        return premium
    if side == "BID":
        return -premium
    return 0.0


def compute_features(flow: FlowTable) -> EngineeredFeatures:
    rows = flow.rows
    call_rows = [r for r in rows if r.option_type == "C"]
    put_rows = [r for r in rows if r.option_type == "P"]

    net_call = sum(_premium_signed(r) for r in call_rows)
    net_put = sum(_premium_signed(r) for r in put_rows)

    total_call_prem = sum((r.premium or 0.0) for r in call_rows)
    total_put_prem = sum((r.premium or 0.0) for r in put_rows)
    call_put_ratio = (total_call_prem / total_put_prem) if total_put_prem else 0.0

    ask_prem = sum((r.premium or 0.0) for r in rows if (r.side or "") == "ASK")
    bid_prem = sum((r.premium or 0.0) for r in rows if (r.side or "") == "BID")
    aggressiveness = (ask_prem - bid_prem) / max(ask_prem + bid_prem, 1e-6)

    by_strike: Dict[float, float] = {}
    total_premium = 0.0
    for r in rows:
        prem = r.premium or 0.0
        by_strike[r.strike] = by_strike.get(r.strike, 0.0) + prem
        total_premium += prem

    top_strikes = sorted(by_strike.items(), key=lambda kv: kv[1], reverse=True)[:8]
    top_strikes_by_premium: List[Dict[str, Any]] = [
        {"strike": k, "premium": v} for k, v in top_strikes
    ]

    concentration_hhi = 0.0
    if total_premium > 0:
        for _, v in by_strike.items():
            share = v / total_premium
            concentration_hhi += share * share

    # delta notional & skew proxies (optional)
    delta_notional = 0.0
    has_delta = False
    iv_calls = []
    iv_puts = []
    for r in rows:
        if r.delta is not None and r.premium is not None:
            has_delta = True
            delta_notional += r.delta * (r.premium or 0.0)
        if r.iv is not None:
            if r.option_type == "C":
                iv_calls.append(r.iv)
            else:
                iv_puts.append(r.iv)

    skew_proxy = None
    if iv_calls and iv_puts:
        skew_proxy = (sum(iv_puts) / len(iv_puts)) - (sum(iv_calls) / len(iv_calls))

    return EngineeredFeatures(
        net_call_premium=net_call,
        net_put_premium=net_put,
        call_put_ratio=call_put_ratio,
        aggressiveness=aggressiveness,
        top_strikes_by_premium=top_strikes_by_premium,
        concentration_hhi=concentration_hhi,
        delta_notional=delta_notional if has_delta else None,
        skew_proxy=skew_proxy,
    )
