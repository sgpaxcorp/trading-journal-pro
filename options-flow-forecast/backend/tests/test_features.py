from app.schemas import FlowRow, FlowTable
from app.services.features import compute_features


def test_features_net_premium():
    rows = [
        FlowRow(symbol="SPX", underlying="SPX", expiry="2026-02-04", strike=6900, option_type="C", side="ASK", premium=1000),
        FlowRow(symbol="SPX", underlying="SPX", expiry="2026-02-04", strike=6900, option_type="P", side="BID", premium=500),
    ]
    flow = FlowTable(rows=rows)
    feats = compute_features(flow)
    assert feats.net_call_premium == 1000
    assert feats.net_put_premium == -500
