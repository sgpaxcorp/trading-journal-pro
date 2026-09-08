export type TosStatementRow = Array<unknown>;

export type TosStatementOption = {
  root: string;
  expiryISO: string;
  right: "C" | "P";
  strike: number;
  contractCode: string;
};

export type TosStatementTransaction = {
  date: string;
  time: string;
  executedAt: string;
  type: string;
  refNum: string | null;
  description: string;
  miscFees: number;
  commissions: number;
  amount: number;
  balance: number | null;
  sourceRow: TosStatementRow;
};

export type TosStatementFill = TosStatementTransaction & {
  side: "BOT" | "SOLD" | "BUY" | "SELL";
  qty: number;
  price: number;
  instrumentType: "option" | "stock";
  symbol: string;
  contractCode: string;
  option: TosStatementOption | null;
};

export type TosStatementSummary = {
  dates: string[];
  fills: number;
  closedTrades: number;
  grossPnl: number;
  commissions: number;
  fees: number;
  netPnl: number;
  reportedGrossPnl: number | null;
  reconciled: boolean | null;
};

export type TosStatementParseResult = {
  headerRow: number | null;
  transactions: TosStatementTransaction[];
  fills: TosStatementFill[];
  summary: TosStatementSummary;
  warnings: string[];
};

type DetectedHeader = {
  headerRowIdx: number;
  cols: {
    date: number;
    time: number;
    type: number;
    ref: number;
    description: number;
    miscFees: number;
    commissions: number;
    amount: number;
    balance: number;
  };
};

const MONTHS: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

function cell(value: unknown): string {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function headerCell(value: unknown): string {
  return cell(value).toUpperCase().replace(/\s+/g, " ");
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = cell(value);
  if (!raw || raw === "--" || raw === "N/A" || raw === "~") return 0;
  const negative = /^\(.*\)$/.test(raw);
  const parsed = Number(raw.replace(/[(),$%]/g, "").replace(/\s+/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

function normalizeRefNum(value: unknown): string | null {
  const raw = cell(value);
  if (!raw || raw === "--") return null;
  const formula = raw.match(/^=\"?([^\"]+)\"?$/);
  const normalized = (formula?.[1] ?? raw).replace(/^=/, "").trim();
  return normalized || null;
}

function isoDate(raw: string): string | null {
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function executedAt(date: string, time: string): string {
  const ymd = isoDate(date);
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!ymd) return new Date(0).toISOString();
  const hh = timeMatch?.[1]?.padStart(2, "0") ?? "00";
  const mm = timeMatch?.[2] ?? "00";
  const ss = timeMatch?.[3] ?? "00";
  // Keep the broker's wall-clock value stable. The journal stores/display these
  // statement times as UTC-shaped values and uses the date portion for syncing.
  return `${ymd}T${hh}:${mm}:${ss}.000Z`;
}

function findIndex(header: string[], values: Array<string | RegExp>): number {
  for (const value of values) {
    if (typeof value === "string") {
      const index = header.indexOf(value);
      if (index >= 0) return index;
    } else {
      const index = header.findIndex((candidate) => value.test(candidate));
      if (index >= 0) return index;
    }
  }
  return -1;
}

function detectCashBalanceHeader(rows: TosStatementRow[]): DetectedHeader | null {
  for (let index = 0; index < rows.length; index += 1) {
    const header = rows[index].map(headerCell);
    const date = findIndex(header, ["DATE"]);
    const time = findIndex(header, ["TIME"]);
    const type = findIndex(header, ["TYPE"]);
    const description = findIndex(header, ["DESCRIPTION"]);
    const amount = findIndex(header, ["AMOUNT"]);
    if (date < 0 || time < 0 || type < 0 || description < 0 || amount < 0) continue;

    return {
      headerRowIdx: index,
      cols: {
        date,
        time,
        type,
        description,
        amount,
        ref: findIndex(header, ["REF #", "REF#", "REFERENCE #", /\bREF\b/]),
        miscFees: findIndex(header, ["MISC FEES", "MISC. FEES", /MISC.*FEE/]),
        commissions: findIndex(header, [
          "COMMISSIONS & FEES",
          "COMMISSION & FEES",
          "COMMISSIONS AND FEES",
          /COMM.*FEE/,
        ]),
        balance: findIndex(header, ["BALANCE", "CASH BALANCE", /\bBALANCE\b/]),
      },
    };
  }
  return null;
}

function isNextStatementSection(row: TosStatementRow): boolean {
  const first = headerCell(row[0]);
  return (
    first === "FUTURES STATEMENTS" ||
    first === "FOREX STATEMENTS" ||
    first.startsWith("CRYPTO #") ||
    first === "ACCOUNT ORDER HISTORY" ||
    first === "ACCOUNT TRADE HISTORY" ||
    first === "PROFITS AND LOSSES" ||
    first === "ACCOUNT SUMMARY"
  );
}

function parseExpiry(raw: string): string | null {
  const numeric = isoDate(raw);
  if (numeric) return numeric;
  const match = raw.toUpperCase().match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{2,4})$/);
  if (!match) return null;
  const month = MONTHS[match[2]];
  if (!month) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return `${year}-${month}-${match[1].padStart(2, "0")}`;
}

function optionFromDescription(description: string): TosStatementOption | null {
  const normalized = description.toUpperCase().replace(/\s+/g, " ");
  const match = normalized.match(
    /\b([A-Z]{1,8})\s+100(?:\s+\([^)]*\))?\s+(\d{1,2}\s+[A-Z]{3}\s+\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d+(?:\.\d+)?)\s+(CALL|PUT)\b/
  );
  if (!match) return null;
  const expiryISO = parseExpiry(match[2]);
  const strike = Number(match[3]);
  if (!expiryISO || !Number.isFinite(strike)) return null;
  const rawRoot = match[1];
  const root = rawRoot === "SPX" && /\(WEEKLYS?\)/.test(normalized) ? "SPXW" : rawRoot;
  const right = match[4] === "CALL" ? "C" : "P";
  const strikeCode = Number.isInteger(strike) ? String(strike) : String(strike).replace(/\.0+$/, "");
  return {
    root,
    expiryISO,
    right,
    strike,
    contractCode: `${root}${expiryISO.slice(2).replace(/-/g, "")}${right}${strikeCode}`,
  };
}

function fillFromTransaction(transaction: TosStatementTransaction): TosStatementFill | null {
  if (transaction.type !== "TRD") return null;
  const sideMatch = transaction.description.toUpperCase().match(/\b(BOT|SOLD|BUY|SELL)\s+([+-]?\d+(?:\.\d+)?)\b/);
  const priceMatch = transaction.description.match(/@\s*(\d+(?:\.\d+)?|\.\d+)/i);
  if (!sideMatch || !priceMatch) return null;
  const qty = Math.abs(Number(sideMatch[2]));
  const price = Number(priceMatch[1]);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) return null;

  const option = optionFromDescription(transaction.description);
  const fallbackSymbol =
    transaction.description
      .toUpperCase()
      .match(/\b(?:BOT|SOLD|BUY|SELL)\s+[+-]?\d+(?:\.\d+)?\s+([A-Z][A-Z0-9.]{0,9})\b/)?.[1] ??
    "UNKNOWN";

  return {
    ...transaction,
    side: sideMatch[1] as TosStatementFill["side"],
    qty,
    price,
    instrumentType: option ? "option" : "stock",
    symbol: option?.root ?? fallbackSymbol,
    contractCode: option?.contractCode ?? fallbackSymbol,
    option,
  };
}

function reportedGrossPnl(rows: TosStatementRow[]): number | null {
  const headerIndex = rows.findIndex((row) => headerCell(row[0]) === "PROFITS AND LOSSES");
  if (headerIndex < 0) return null;
  const columnHeader = rows[headerIndex + 1]?.map(headerCell) ?? [];
  const pnlDay = findIndex(columnHeader, ["P/L DAY", "P&L DAY"]);
  if (pnlDay < 0) return null;
  for (let index = headerIndex + 2; index < rows.length; index += 1) {
    const row = rows[index];
    if (headerCell(row[0]) === "ACCOUNT SUMMARY") break;
    if (row.some((value) => headerCell(value) === "OVERALL TOTALS")) {
      return parseNumber(row[pnlDay]);
    }
  }
  return null;
}

function calculateRealizedGross(fills: TosStatementFill[]): { gross: number; closedTrades: number } {
  const positions = new Map<string, Array<{ qty: number; price: number }>>();
  let gross = 0;
  let closedTrades = 0;

  for (const fill of fills) {
    const lots = positions.get(fill.contractCode) ?? [];
    const signed = fill.side === "BOT" || fill.side === "BUY" ? fill.qty : -fill.qty;
    let remaining = Math.abs(signed);
    const incomingSign = Math.sign(signed);
    const multiplier = fill.instrumentType === "option" ? 100 : 1;

    while (remaining > 1e-9 && lots.length && Math.sign(lots[0].qty) !== incomingSign) {
      const lot = lots[0];
      const used = Math.min(Math.abs(lot.qty), remaining);
      gross += (fill.price - lot.price) * used * multiplier * Math.sign(lot.qty);
      remaining -= used;
      const lotRemaining = Math.abs(lot.qty) - used;
      if (lotRemaining <= 1e-9) lots.shift();
      else lot.qty = Math.sign(lot.qty) * lotRemaining;
    }

    if (remaining > 1e-9) lots.push({ qty: incomingSign * remaining, price: fill.price });
    if (!lots.length) closedTrades += 1;
    positions.set(fill.contractCode, lots);
  }

  return { gross: Number(gross.toFixed(2)), closedTrades };
}

export function parseTosStatementRows(rows: TosStatementRow[]): TosStatementParseResult {
  const detected = detectCashBalanceHeader(rows);
  const emptySummary: TosStatementSummary = {
    dates: [],
    fills: 0,
    closedTrades: 0,
    grossPnl: 0,
    commissions: 0,
    fees: 0,
    netPnl: 0,
    reportedGrossPnl: reportedGrossPnl(rows),
    reconciled: null,
  };
  if (!detected) {
    return {
      headerRow: null,
      transactions: [],
      fills: [],
      summary: emptySummary,
      warnings: ["Could not detect the Thinkorswim Cash Balance statement headers."],
    };
  }

  const transactions: TosStatementTransaction[] = [];
  const warnings: string[] = [];
  const { cols } = detected;

  for (let index = detected.headerRowIdx + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (isNextStatementSection(row)) break;
    const date = cell(row[cols.date]);
    if (!isoDate(date)) continue;
    const time = cell(row[cols.time]);
    const type = headerCell(row[cols.type]);
    const description = cell(row[cols.description]);
    transactions.push({
      date,
      time,
      executedAt: executedAt(date, time),
      type,
      refNum: cols.ref >= 0 ? normalizeRefNum(row[cols.ref]) : null,
      description,
      miscFees: cols.miscFees >= 0 ? Math.abs(parseNumber(row[cols.miscFees])) : 0,
      commissions: cols.commissions >= 0 ? Math.abs(parseNumber(row[cols.commissions])) : 0,
      amount: parseNumber(row[cols.amount]),
      balance: cols.balance >= 0 && cell(row[cols.balance]) ? parseNumber(row[cols.balance]) : null,
      sourceRow: row,
    });
  }

  const fills = transactions.map(fillFromTransaction).filter((fill): fill is TosStatementFill => !!fill);
  const unparsedTradeRows = transactions.filter((row) => row.type === "TRD").length - fills.length;
  if (unparsedTradeRows > 0) warnings.push(`${unparsedTradeRows} trade row(s) could not be normalized.`);

  const { gross, closedTrades } = calculateRealizedGross(fills);
  const commissions = Number(fills.reduce((sum, fill) => sum + fill.commissions, 0).toFixed(2));
  const fees = Number(fills.reduce((sum, fill) => sum + fill.miscFees, 0).toFixed(2));
  const netPnl = Number((gross - commissions - fees).toFixed(2));
  const dates = Array.from(new Set(fills.map((fill) => isoDate(fill.date)).filter((date): date is string => !!date))).sort();
  const reported = reportedGrossPnl(rows);
  const reconciled = reported == null ? null : Math.abs(reported - gross) <= 0.01;
  if (reconciled === false) {
    warnings.push(`Calculated gross P&L ${gross.toFixed(2)} does not match reported P/L Day ${reported?.toFixed(2)}.`);
  }

  return {
    headerRow: detected.headerRowIdx,
    transactions,
    fills,
    summary: {
      dates,
      fills: fills.length,
      closedTrades,
      grossPnl: gross,
      commissions,
      fees,
      netPnl,
      reportedGrossPnl: reported,
      reconciled,
    },
    warnings,
  };
}
