from app.services.parser import parse_csv_bytes


def test_parse_csv_basic():
    csv = """symbol,expiry,strike,type,side,price,size,premium\nSPXW,2026-02-04,6900,C,ASK,3.2,10,3200\nSPXW,2026-02-04,6900,P,BID,2.8,5,1400\n"""
    table = parse_csv_bytes(csv.encode("utf-8"))
    assert len(table.rows) == 2
    assert table.rows[0].option_type == "C"
    assert table.rows[0].side == "ASK"
