import { describe, expect, it } from "vitest";
import { parseTosStatementRows } from "@/lib/brokers/tos/parseTosStatement";

const rows = [
  ["Account Statement"],
  ["Cash Balance"],
  ["DATE", "TIME", "TYPE", "REF #", "DESCRIPTION", "Misc Fees", "Commissions & Fees", "AMOUNT", "BALANCE"],
  ["9/8/26", "01:00:00", "BAL", "", "Cash balance at the start of business day", "", "", "", "8.21"],
  ["9/8/26", "09:46:34", "TRD", '="1007844206177"', "BOT +1 SPY 100 (Weeklys) 8 SEP 26 766 CALL @2.20 CBOE", "-0.01", "-0.65", "-220.00", "787.55"],
  ["9/8/26", "09:49:44", "TRD", '="1007844206724"', "SOLD -1 SPY 100 (Weeklys) 8 SEP 26 766 CALL @2.21 CBOE", "-0.01", "-0.65", "221.00", "1007.89"],
  ["9/8/26", "10:13:41", "TRD", '="1007845009674"', "BOT +1 SPY 100 (Weeklys) 8 SEP 26 769 PUT @2.50 CBOE", "-0.01", "-0.65", "-250.00", "757.23"],
  ["9/8/26", "10:14:31", "TRD", '="1007845009775"', "SOLD -1 SPY 100 (Weeklys) 8 SEP 26 769 PUT @2.71 BOX", "-0.02", "-0.65", "271.00", "1027.56"],
  ["", "", "", "", "TOTAL", "($0.05)", "($2.60)", "$22.00", "$1,027.56"],
  ["Futures Statements"],
  ["Trade Date", "Exec Date", "Exec Time", "Type", "Ref #", "Description", "Misc Fees", "Commissions & Fees", "Amount", "Balance"],
  ["9/8/26", "9/8/26", "01:00:00", "BAL", "--", "Futures cash balance", "--", "--", "--", "0.00"],
  ["Profits and Losses"],
  ["Symbol", "Description", "P/L Open", "P/L %", "P/L Day", "P/L YTD"],
  ["", "OVERALL TOTALS", "$0.00", "0.00%", "$22.00", "$0.00"],
];

describe("parseTosStatementRows", () => {
  it("isolates Cash Balance fills and reconciles gross, commissions, fees, and net P&L", () => {
    const result = parseTosStatementRows(rows);

    expect(result.transactions).toHaveLength(5);
    expect(result.fills).toHaveLength(4);
    expect(result.fills.map((fill) => fill.contractCode)).toEqual([
      "SPY260908C766",
      "SPY260908C766",
      "SPY260908P769",
      "SPY260908P769",
    ]);
    expect(result.fills.map((fill) => fill.refNum)).toEqual([
      "1007844206177",
      "1007844206724",
      "1007845009674",
      "1007845009775",
    ]);
    expect(result.summary).toMatchObject({
      dates: ["2026-09-08"],
      fills: 4,
      closedTrades: 2,
      grossPnl: 22,
      commissions: 2.6,
      fees: 0.05,
      netPnl: 19.35,
      reportedGrossPnl: 22,
      reconciled: true,
    });
    expect(result.transactions.some((row) => row.description.includes("Futures cash"))).toBe(false);
  });
});
