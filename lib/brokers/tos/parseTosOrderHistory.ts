import type { NormalizedOrderEvent, ParseResult, ParserOptions } from "@/lib/brokers/types";

const MONTH_CODES = "FGHJKMNQUVXZ";

function normalizeCell(v: unknown): string {
  return String(v ?? "").replace(/\u00A0/g, " ").trim();
}

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).replace(/[,$]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatStrike(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  const rounded = Math.round(n * 1000000) / 1000000;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function normalizeRight(raw: string): "C" | "P" | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s === "C" || s.includes("CALL")) return "C";
  if (s === "P" || s.includes("PUT")) return "P";
  return null;
}

function normalizePosEffect(raw: string): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s.includes("OPEN")) return "TO_OPEN";
  if (s.includes("CLOSE")) return "TO_CLOSE";
  return s.replace(/\s+/g, "_");
}

function normalizeSide(raw: string): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s === "BUY" || s === "BOT" || s === "B") return "BUY";
  if (s === "SELL" || s === "SOLD" || s === "S") return "SELL";
  if (s.includes("BUY")) return "BUY";
  if (s.includes("SELL")) return "SELL";
  return null;
}

function normalizeOrderType(raw: string, fallbackLine: string): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  const line = `${s} ${String(fallbackLine ?? "").toUpperCase()}`;
  if (/\bLMT\b/.test(line)) return "LMT";
  if (/\bMKT\b/.test(line)) return "MKT";
  if (/\bSTP\b/.test(line)) return "STP";
  return s || null;
}

function normalizeExpiry(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const mm = Number(m1[1]);
    const dd = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy = 2000 + yy;
    return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return null;
}

function isFutureSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (s.startsWith("/")) return true;
  return new RegExp(`^[A-Z0-9]{1,6}[${MONTH_CODES}]\d{1,4}$`).test(s);
}

function instrumentKeyForRow(params: {
  symbol: string;
  expiry?: string | null;
  right?: "C" | "P" | null;
  strike?: number | null;
}): { key: string; asset: "option" | "stock" | "future" | "other" } {
  const symbol = params.symbol.trim().toUpperCase();
  const expiry = params.expiry;
  const right = params.right;
  const strike = params.strike;

  if (expiry && right && strike != null) {
    const strikeKey = formatStrike(strike);
    return {
      key: `${symbol}|${expiry}|${right}|${strikeKey}`,
      asset: "option",
    };
  }

  if (isFutureSymbol(symbol)) return { key: symbol, asset: "future" };
  if (symbol) return { key: symbol, asset: "stock" };
  return { key: "UNKNOWN", asset: "other" };
}

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const lookup = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const y = lookup("year");
  const m = lookup("month");
  const d = lookup("day");
  const h = lookup("hour");
  const min = lookup("minute");
  const s = lookup("second");
  const asUTC = Date.UTC(y, m - 1, d, h, min, s);
  return asUTC - date.getTime();
}

function formatDateInTz(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

function parseTimePlaced(raw: string, sourceTz: string): { tsUtc: string; dateLocal: string; tsSource: string } | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy = 2000 + yy;
  const hh = Number(m[4]);
  const mi = Number(m[5]);
  const ss = m[6] ? Number(m[6]) : 0;

  const baseUtc = new Date(Date.UTC(yy, mm - 1, dd, hh, mi, ss));
  const offsetMs = getTimezoneOffsetMs(baseUtc, sourceTz);
  const utc = new Date(baseUtc.getTime() - offsetMs);

  return {
    tsUtc: utc.toISOString(),
    dateLocal: formatDateInTz(utc, sourceTz),
    tsSource: s,
  };
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter === "\t") return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (ch === delimiter && !inQ) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function rowsFromText(rawText: string): string[][] {
  const lines = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[][] = [];
  const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    out.push(parseDelimitedLine(line, delimiter));
  }
  return out;
}

type HeaderMatch = {
  headerRowIdx: number;
  cols: {
    notes: number;
    timePlaced: number;
    spread: number;
    side: number;
    qty: number;
    posEffect: number;
    symbol: number;
    exp: number;
    strike: number;
    type: number;
    price: number;
    orderType: number;
    tif: number;
    status: number;
  };
};

function findHeaderIndex(header: string[], patterns: Array<string | RegExp>): number {
  for (const p of patterns) {
    if (typeof p === "string") {
      const idx = header.indexOf(p);
      if (idx >= 0) return idx;
    } else {
      for (let i = 0; i < header.length; i++) {
        if (p.test(header[i])) return i;
      }
    }
  }
  return -1;
}

function detectHeader(rows: string[][]): HeaderMatch | null {
  for (let i = 0; i < rows.length; i++) {
    const header = rows[i].map((c) => normalizeCell(c).toUpperCase().replace(/\s+/g, " "));
    if (!header.length) continue;

    const timePlaced = findHeaderIndex(header, ["TIME PLACED", /TIME\s*PLACED/i]);
    const side = findHeaderIndex(header, ["SIDE"]);
    const qty = findHeaderIndex(header, ["QTY", "QUANTITY"]);
    const posEffect = findHeaderIndex(header, ["POS EFFECT", "POSITION EFFECT"]);
    const symbol = findHeaderIndex(header, ["SYMBOL"]);
    const status = findHeaderIndex(header, ["STATUS"]);
    const price = findHeaderIndex(header, ["PRICE", "LIMIT"]);

    if (timePlaced >= 0 && side >= 0 && qty >= 0 && posEffect >= 0 && symbol >= 0 && status >= 0) {
      return {
        headerRowIdx: i,
        cols: {
          notes: findHeaderIndex(header, ["NOTES", /NOTE/i]),
          timePlaced,
          spread: findHeaderIndex(header, ["SPREAD"]),
          side,
          qty,
          posEffect,
          symbol,
          exp: findHeaderIndex(header, ["EXP", "EXPIRATION", /EXP/]),
          strike: findHeaderIndex(header, ["STRIKE"]),
          type: findHeaderIndex(header, ["TYPE", "RIGHT", "CALL/PUT"]),
          price,
          orderType: findHeaderIndex(header, ["ORDER TYPE", "ORDER", "ORD TYPE", /ORDER\s*TYPE/]),
          tif: findHeaderIndex(header, ["TIF", "TIME IN FORCE"]),
          status,
        },
      };
    }
  }
  return null;
}

export function detectTosOrderHistoryFromRows(rows: string[][]): HeaderMatch | null {
  return detectHeader(rows);
}

export function parseTosOrderHistoryFromRows(rows: string[][], opts: ParserOptions): ParseResult {
  const warnings: string[] = [];
  const header = detectHeader(rows);
  if (!header) {
    return {
      events: [],
      warnings: ["Could not find Account Order History headers."],
      stats: { rows_found: rows.length, rows_parsed: 0, events_saved: 0, header_row: null },
    };
  }

  const events: NormalizedOrderEvent[] = [];
  const dataRows = rows.slice(header.headerRowIdx + 1);

  let lastEvent: NormalizedOrderEvent | null = null;
  let lastRawNotes: string[] = [];

  const getCell = (r: string[], idx: number) => (idx >= 0 ? normalizeCell(r[idx]) : "");

  dataRows.forEach((r, idx) => {
    const rowIndex = header.headerRowIdx + 1 + idx;
    const noteLine = r.map((c) => normalizeCell(c)).join(" ").trim();
    const timePlaced = getCell(r, header.cols.timePlaced);
    const side = getCell(r, header.cols.side);
    const qtyRaw = getCell(r, header.cols.qty);
    const symbolRaw = getCell(r, header.cols.symbol);

    const hasMain = !!timePlaced || !!side || !!qtyRaw || !!symbolRaw;
    const isAttachedNote =
      !side &&
      !qtyRaw &&
      !symbolRaw &&
      /\b(OCO\s*#|RE\s*#|\d+(?:\.\d+)?\s*STP)\b/i.test(noteLine);

    if (!hasMain || isAttachedNote) {
      if (!noteLine) return;
      if (!lastEvent) return;

      const ocoMatch = noteLine.match(/OCO\s*#\s*([A-Za-z0-9-]+)/i);
      if (ocoMatch) lastEvent.oco_id = ocoMatch[1];

      const reMatch = noteLine.match(/RE\s*#\s*([A-Za-z0-9-]+)/i);
      if (reMatch) lastEvent.replace_id = reMatch[1];

      const stopMatch = noteLine.match(/(\d+(?:\.\d+)?)\s*STP/i);
      if (stopMatch) lastEvent.stop_price = parseNumber(stopMatch[1]);

      lastRawNotes.push(noteLine);
      if (lastEvent.raw) {
        lastEvent.raw.notes = lastRawNotes;
      }
      return;
    }

    const parsedTime = parseTimePlaced(timePlaced, opts.sourceTz);
    if (!parsedTime) {
      warnings.push(`Row ${rowIndex}: invalid Time Placed`);
      return;
    }

    const posEffect = normalizePosEffect(getCell(r, header.cols.posEffect));
    const sideNorm = normalizeSide(side);
    const qty = parseNumber(qtyRaw);
    const symbol = symbolRaw.toUpperCase();

    const expiry = normalizeExpiry(getCell(r, header.cols.exp));
    const strike = parseNumber(getCell(r, header.cols.strike));
    const right = normalizeRight(getCell(r, header.cols.type));
    const { key, asset } = instrumentKeyForRow({ symbol, expiry, right, strike });

    const status = getCell(r, header.cols.status).toUpperCase();
    let event_type: NormalizedOrderEvent["event_type"] = "ORDER_PLACED";
    if (status.includes("FILL")) event_type = "ORDER_FILLED";
    else if (status.includes("CANCEL")) event_type = "ORDER_CANCELED";
    else if (status.includes("REPLACE")) event_type = "ORDER_REPLACED";

    const priceRaw = getCell(r, header.cols.price);
    const orderTypeRaw = getCell(r, header.cols.orderType);
    const orderType = normalizeOrderType(orderTypeRaw, priceRaw);

    const priceVal = parseNumber(priceRaw);

    const event: NormalizedOrderEvent = {
      date: parsedTime.dateLocal,
      ts_utc: parsedTime.tsUtc,
      ts_source: parsedTime.tsSource,
      source_tz: opts.sourceTz,
      event_type,
      status: status || null,
      side: sideNorm,
      pos_effect: posEffect,
      qty: qty ?? null,
      symbol: symbol || null,
      instrument_key: key,
      asset_kind: asset,
      order_type: orderType,
      limit_price: orderType === "LMT" ? priceVal : null,
      stop_price: orderType === "STP" ? priceVal : null,
      oco_id: null,
      replace_id: null,
      raw: { row: r },
    };

    lastEvent = event;
    lastRawNotes = [];
    events.push(event);
  });

  return {
    events,
    warnings,
    stats: {
      rows_found: rows.length,
      rows_parsed: dataRows.length,
      events_saved: events.length,
      header_row: header.headerRowIdx,
    },
  };
}

export function parseTosOrderHistory(rawText: string, opts: ParserOptions): ParseResult {
  const rows = rowsFromText(rawText || "");
  return parseTosOrderHistoryFromRows(rows, opts);
}
