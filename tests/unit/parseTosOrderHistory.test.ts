import { describe, it, expect } from "vitest";
import { parseTosOrderHistory } from "@/lib/brokers/tos/parseTosOrderHistory";

const SAMPLE = `Account Order History
Notes,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,Order Type,TIF,Status
,2/13/26 14:29:00,,BUY,1,TO OPEN,SPX,02/13/26,7000,CALL,5.70,LMT,DAY,FILLED
,OCO #123456 RE #98765 5.20 STP STD,,,,,,,,,,,,
,2/13/26 15:01:00,,SELL,1,TO CLOSE,SPX,02/13/26,7000,CALL,5.10,MKT,DAY,CANCELED
`;

describe("parseTosOrderHistory", () => {
  it("parses events, note lines, and stop price", () => {
    const result = parseTosOrderHistory(SAMPLE, { sourceTz: "America/New_York" });
    expect(result.events.length).toBe(2);

    const first = result.events[0];
    expect(first.event_type).toBe("ORDER_FILLED");
    expect(first.oco_id).toBe("123456");
    expect(first.replace_id).toBe("98765");
    expect(first.stop_price).toBe(5.2);
    expect(first.instrument_key).toBe("SPX|2026-02-13|C|7000");

    const second = result.events[1];
    expect(second.event_type).toBe("ORDER_CANCELED");
  });

  it("parses the current Schwab blank order-type header and named option expiry", () => {
    const currentExport = `Account Order History
Notes,,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,,TIF,Status
,,9/8/26 10:14:31,SINGLE,SELL,-1,TO CLOSE,SPY,8 SEP 26,769,PUT,2.70,LMT,DAY,FILLED
,,9/8/26 10:14:26,SINGLE,SELL,-1,TO CLOSE,SPY,8 SEP 26,769,PUT,~,MKT,DAY,CANCELED
,,,,,,,,,,,2.34,STP,STD,
,,9/8/26 10:13:31,SINGLE,BUY,+1,TO OPEN,SPY,8 SEP 26,769,PUT,2.50,LMT,DAY,FILLED

Account Trade History
,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type
,9/8/26 10:14:31,SINGLE,SELL,-1,TO CLOSE,SPY,8 SEP 26,769,PUT,2.71,2.71,LMT`;

    const result = parseTosOrderHistory(currentExport, { sourceTz: "America/New_York" });

    expect(result.events).toHaveLength(3);
    expect(result.events.every((event) => event.instrument_key === "SPY|2026-09-08|P|769")).toBe(true);
    expect(result.events.every((event) => event.asset_kind === "option")).toBe(true);
    expect(result.events[0].order_type).toBe("LMT");
    expect(result.events[1].order_type).toBe("STP MKT");
    expect(result.events[1].stop_price).toBe(2.34);
    expect(result.events[2].order_type).toBe("LMT");
    expect(result.warnings).toEqual([]);
  });
});
