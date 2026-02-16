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
});
