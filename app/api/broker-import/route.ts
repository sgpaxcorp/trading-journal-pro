import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

/* =========================
   Utils
========================= */

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeHeader(h: any) {
  return String(h ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function headerIndex(headers: string[], ...candidates: string[]) {
  for (const c of candidates) {
    const idx = headers.findIndex((x) => x === c);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/* =========================
   Detect headers (TOS)
========================= */

type DetectedCols = {
  date: number;
  time: number;
  type: number;
  ref: number;
  desc: number;
  miscFees: number;
  commFees: number;
  amount: number;
  balance: number;
};

function findHeaderRow(rows: any[][]): { headerRowIdx: number; cols: DetectedCols } | null {
  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    const r = rows[i] || [];
    const headers = r.map(normalizeHeader);

    const date = headerIndex(headers, "DATE");
    const time = headerIndex(headers, "TIME");
    const type = headerIndex(headers, "TYPE");
    const ref = headerIndex(headers, "REF #", "REF#", "REF", "REFERENCE", "REFERENCE #");
    const desc = headerIndex(headers, "DESCRIPTION");
    const miscFees = headerIndex(headers, "MISC FEES", "MISC. FEES", "MISC FEES (USD)");
    const commFees = headerIndex(headers, "COMMISSIONS & FEES", "COMMISSIONS AND FEES", "COMMISSION & FEES");
    const amount = headerIndex(headers, "AMOUNT", "NET AMOUNT", "AMOUNT (USD)");
    const balance = headerIndex(headers, "BALANCE", "CASH BALANCE");

    if (date >= 0 && time >= 0 && type >= 0 && desc >= 0 && amount >= 0) {
      return {
        headerRowIdx: i,
        cols: { date, time, type, ref, desc, miscFees, commFees, amount, balance },
      };
    }
  }
  return null;
}

/* =========================
   Parse Date+Time to ISO (UTC)
========================= */
function parseDateTime(dateVal: any, timeVal: any): string {
  // date
  let yyyy: number | null = null;
  let mm: number | null = null;
  let dd: number | null = null;

  if (typeof dateVal === "number" && Number.isFinite(dateVal)) {
    const dc = (XLSX as any).SSF?.parse_date_code?.(dateVal);
    if (dc?.y && dc?.m && dc?.d) {
      yyyy = dc.y;
      mm = dc.m;
      dd = dc.d;
    }
  }

  if (yyyy === null && dateVal instanceof Date && !Number.isNaN(dateVal.getTime())) {
    yyyy = dateVal.getFullYear();
    mm = dateVal.getMonth() + 1;
    dd = dateVal.getDate();
  }

  if (yyyy === null) {
    const s = String(dateVal ?? "").trim();
    const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m2) {
      mm = Number(m2[1]);
      dd = Number(m2[2]);
      const yRaw = m2[3];
      const yNum = Number(yRaw);
      yyyy = yRaw.length === 2 ? (yNum >= 70 ? 1900 + yNum : 2000 + yNum) : yNum;
    }
  }

  if (yyyy === null || mm === null || dd === null) {
    throw new Error(`Invalid date value in file: "${String(dateVal)}"`);
  }

  // time
  let hh = 0,
    mi = 0,
    ss = 0;

  if (typeof timeVal === "number" && Number.isFinite(timeVal)) {
    const totalSeconds = Math.round(timeVal * 24 * 60 * 60);
    hh = Math.floor(totalSeconds / 3600);
    mi = Math.floor((totalSeconds % 3600) / 60);
    ss = totalSeconds % 60;
  } else {
    const t = String(timeVal ?? "").trim();
    const mt = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (mt) {
      hh = Number(mt[1]);
      mi = Number(mt[2]);
      ss = mt[3] ? Number(mt[3]) : 0;
    }
  }

  return new Date(Date.UTC(yyyy, mm - 1, dd, hh, mi, ss)).toISOString();
}

/* =========================
   Instrument formatting
========================= */

// "YYYY-MM-DD" -> "yymmdd"
function toYYMMDD(expiration: string | null): string | null {
  if (!expiration) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) return null;
  return expiration.slice(2, 4) + expiration.slice(5, 7) + expiration.slice(8, 10);
}

// strike to compact: 470 -> "470", 470.5 -> "4705"
function strikeCompact(strike: number | null): string | null {
  if (strike == null || !Number.isFinite(strike)) return null;
  const s = String(strike);
  if (!s.includes(".")) return s;
  const [a, b] = s.split(".");
  return `${a}${b}`;
}

// SPX stays SPX unless "(Weeklys)" appears, then SPXW.
// (No forcing SPXW for non-weekly.)
function inferOptionRoot(underlying: string | null, desc: string): string | null {
  if (!underlying) return null;
  const u = underlying.toUpperCase();

  const isWeeklys =
    /\(WEEKLYS\)/i.test(desc) ||
    /\bWEEKLYS\b/i.test(desc) ||
    /\bWEEKLY\b/i.test(desc);

  if (u === "SPX" && isWeeklys) return "SPXW";
  return u;
}

/* =========================
   Parse TOS Description (PRO)
   - Options: ROOTyymmddC/Pstrike  (SPXW251219C6782)
   - Stocks:  TSLA
========================= */
type ParsedInstrument = {
  instrument_type: "option" | "stock" | "unknown";
  side: "buy" | "sell" | null;
  qty: number | null;

  // Always keep underlying_symbol for both stock/option
  underlying_symbol: string | null;

  // Desired normalized ID (options: ROOTyymmddCstrike; stocks: ticker)
  instrument_symbol: string | null;

  // option details (if option)
  option_root: string | null;
  expiration: string | null; // YYYY-MM-DD
  strike: number | null;
  option_right: "CALL" | "PUT" | null;

  // pricing / venue
  price: number | null;
  exchange: string | null;
};

function parseTOSDescription(descRaw: string): ParsedInstrument {
  const s = String(descRaw ?? "").trim();

  const side = s.startsWith("BOT") ? "buy" : s.startsWith("SOLD") ? "sell" : null;

  const qtyMatch = s.match(/\b(BOT|SOLD)\s+([+-]?\d+)\b/i);
  const qty = qtyMatch ? Math.abs(Number(qtyMatch[2])) : null;

  const tokens = s.split(/\s+/).filter(Boolean);
  const exchange = tokens.length ? tokens[tokens.length - 1] : null;

  const priceMatch = s.match(/@(\d+(?:\.\d+)?)/);
  const price = priceMatch ? Number(priceMatch[1]) : null;

  const hasRight = /\b(CALL|PUT)\b/i.test(s);
  const hasMonth = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i.test(s);

  // OPTION parse
  if (hasRight && hasMonth) {
    const underlying = tokens.length >= 3 ? tokens[2]?.toUpperCase() : null;

    const expMatch = s.match(
      /\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{2})\b/i
    );

    let expiration: string | null = null;
    if (expMatch) {
      const day = expMatch[1].padStart(2, "0");
      const mon = expMatch[2].toUpperCase();
      const yy = expMatch[3];
      const monthMap: Record<string, string> = {
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
      expiration = `20${yy}-${monthMap[mon]}-${day}`;
    }

    const rightMatch = s.match(/\b(\d+(?:\.\d+)?)\s+(CALL|PUT)\b/i);
    const strike = rightMatch ? Number(rightMatch[1]) : null;
    const option_right = rightMatch ? (rightMatch[2].toUpperCase() as "CALL" | "PUT") : null;

    const root = inferOptionRoot(underlying, s);
    const yymmdd = toYYMMDD(expiration);
    const cp = option_right === "CALL" ? "C" : option_right === "PUT" ? "P" : null;
    const k = strikeCompact(strike);

    const instrument_symbol = root && yymmdd && cp && k ? `${root}${yymmdd}${cp}${k}` : null;

    return {
      instrument_type: "option",
      side,
      qty,
      underlying_symbol: underlying,
      instrument_symbol,
      option_root: root,
      expiration,
      strike,
      option_right,
      price,
      exchange,
    };
  }

  // STOCK fallback
  const maybeSym = tokens.length >= 3 ? tokens[2] : null;
  if (maybeSym && /^[A-Z.\-]{1,10}$/i.test(maybeSym)) {
    const sym = maybeSym.toUpperCase();
    return {
      instrument_type: "stock",
      side,
      qty,
      underlying_symbol: sym,
      instrument_symbol: sym,
      option_root: null,
      expiration: null,
      strike: null,
      option_right: null,
      price,
      exchange,
    };
  }

  return {
    instrument_type: "unknown",
    side,
    qty,
    underlying_symbol: null,
    instrument_symbol: null,
    option_root: null,
    expiration: null,
    strike: null,
    option_right: null,
    price,
    exchange,
  };
}

/* =========================
   Read rows from file
========================= */
function rowsFromCsvText(csvText: string): any[][] {
  const wb = XLSX.read(csvText, { type: "string" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
}

function rowsFromExcelBuffer(buf: Buffer): any[][] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
}

/* =========================
   Helpers: chunk arrays
========================= */
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* =========================
   POST /api/broker-import
========================= */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  // AUTH
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = authData.user.id;

  // FormData
  const form = await req.formData();
  const broker = String(form.get("broker") ?? "").trim() || "thinkorswim";
  const comment = String(form.get("comment") ?? "").trim() || null;
  const file = form.get("file");

  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  if (broker !== "thinkorswim") {
    return NextResponse.json({ error: `Broker not implemented: ${broker}` }, { status: 400 });
  }

  // Create batch
  const { data: batch, error: batchErr } = await supabaseAdmin
    .from("trade_import_batches")
    .insert({
      user_id: userId,
      broker,
      filename: file.name ?? null,
      comment,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (batchErr || !batch?.id) {
    return NextResponse.json({ error: batchErr?.message ?? "Failed to create batch" }, { status: 500 });
  }

  const batchId = batch.id as string;

  try {
    // file type
    const name = (file.name ?? "").toLowerCase();
    const isCsv = name.endsWith(".csv");
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

    if (!isCsv && !isExcel) {
      throw new Error("Unsupported file type. Please upload CSV / XLS / XLSX.");
    }

    // read rows
    let rows: any[][];
    if (isCsv) rows = rowsFromCsvText(await file.text());
    else rows = rowsFromExcelBuffer(Buffer.from(await file.arrayBuffer()));

    const detected = findHeaderRow(rows);
    if (!detected) throw new Error("Could not detect Thinkorswim statement headers in this file.");

    const { headerRowIdx, cols } = detected;
    const dataRows = rows.slice(headerRowIdx + 1);

    const txnRowsAll: any[] = [];
    const tradeRowsAll: any[] = [];

    for (const r of dataRows) {
      const txnType = String(r[cols.type] ?? "").trim().toUpperCase();
      if (txnType !== "TRD") continue;

      const description = String(r[cols.desc] ?? "").trim();
      if (!description) continue;

      const executed_at = parseDateTime(r[cols.date], r[cols.time]);

      const misc_fees = cols.miscFees >= 0 ? parseNumber(r[cols.miscFees]) : null;
      const commissions_fees = cols.commFees >= 0 ? parseNumber(r[cols.commFees]) : null;
      const amount = parseNumber(r[cols.amount]);
      const balance = cols.balance >= 0 ? parseNumber(r[cols.balance]) : null;
      const ref_num = cols.ref >= 0 ? String(r[cols.ref] ?? "").trim() : null;

      // hashes
      const row_hash = sha256(
        [
          broker,
          userId,
          String(r[cols.date] ?? ""),
          String(r[cols.time] ?? ""),
          ref_num ?? "",
          description,
          String(amount ?? ""),
          String(balance ?? ""),
        ].join("|")
      );

      const det = parseTOSDescription(description);

      // IMPORTANT: use instrument_symbol when possible (SPXW251219C6782),
      // but keep underlying_symbol as "symbol"
      const trade_hash = sha256(
        [
          userId,
          broker,
          det.instrument_type,
          det.underlying_symbol ?? "",
          det.instrument_symbol ?? "",
          det.expiration ?? "",
          String(det.strike ?? ""),
          det.option_right ?? "",
          det.side ?? "",
          String(det.qty ?? ""),
          String(det.price ?? ""),
          executed_at,
        ].join("|")
      );

      // ledger row
      txnRowsAll.push({
        user_id: userId,
        broker,
        txn_type: txnType,
        ref_num: ref_num || null,
        description,
        misc_fees,
        commissions_fees,
        amount,
        balance,
        executed_at,
        row_hash,
        raw: { row: r, detectedHeadersAtRow: headerRowIdx },
        import_batch_id: batchId,
      });

      // trade row (normalized)
      tradeRowsAll.push({
        user_id: userId,
        broker,

        // if you have asset_type, keep it compatible
        asset_type: det.instrument_type === "option" ? "option" : det.instrument_type,

        // ✅ ALWAYS underlying here (what you asked)
        symbol: det.underlying_symbol,

        // ✅ NEW normalized identifiers
        instrument_type: det.instrument_type,
        underlying_symbol: det.underlying_symbol,
        instrument_symbol: det.instrument_symbol,

        // option fields
        option_root: det.option_root,
        option_expiration: det.expiration, // date column can accept "YYYY-MM-DD"
        option_strike: det.strike,
        option_right: det.option_right,

        side: det.side,
        qty: det.qty,
        price: det.price,
        executed_at,

        exchange: det.exchange,
        commissions: commissions_fees,
        fees: misc_fees,

        trade_hash,
        raw: { description, parsed: det, sourceRow: r },
        import_batch_id: batchId,
      });
    }

    /* =========================================================
       DEDUPE LEDGER: pre-check existing row_hash
    ========================================================= */
    const rowHashes = Array.from(new Set(txnRowsAll.map((x) => x.row_hash).filter(Boolean)));
    const existingRowHash = new Set<string>();

    for (const part of chunk(rowHashes, 800)) {
      const { data, error } = await supabaseAdmin
        .from("broker_transactions")
        .select("row_hash")
        .eq("user_id", userId)
        .in("row_hash", part);

      if (error) throw error;
      for (const it of data ?? []) existingRowHash.add(it.row_hash);
    }

    const txnRowsNew = txnRowsAll.filter((x) => !existingRowHash.has(x.row_hash));
    const txnDuplicates = txnRowsAll.length - txnRowsNew.length;

    if (txnRowsNew.length) {
      const { error } = await supabaseAdmin.from("broker_transactions").insert(txnRowsNew);
      if (error) throw error;
    }

    /* =========================================================
       DEDUPE TRADES: pre-check existing trade_hash
    ========================================================= */
    const tradeHashes = Array.from(new Set(tradeRowsAll.map((x) => x.trade_hash).filter(Boolean)));
    const existingTradeHash = new Set<string>();

    for (const part of chunk(tradeHashes, 800)) {
      const { data, error } = await supabaseAdmin
        .from("trades")
        .select("trade_hash")
        .eq("user_id", userId)
        .in("trade_hash", part);

      if (error) throw error;
      for (const it of data ?? []) existingTradeHash.add(it.trade_hash);
    }

    const tradeRowsNew = tradeRowsAll.filter((x) => !existingTradeHash.has(x.trade_hash));
    const tradeDuplicates = tradeRowsAll.length - tradeRowsNew.length;

    if (tradeRowsNew.length) {
      const { error } = await supabaseAdmin.from("trades").insert(tradeRowsNew);
      if (error) throw error;
    }

    const durationMs = Date.now() - startedAt;

    await supabaseAdmin
      .from("trade_import_batches")
      .update({
        status: "success",
        imported_rows: tradeRowsNew.length,
        duplicates: txnDuplicates + tradeDuplicates,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", batchId);

    return NextResponse.json({
      batchId,
      count: tradeRowsNew.length,
      duplicates: txnDuplicates + tradeDuplicates,
      duplicates_breakdown: { ledger: txnDuplicates, trades: tradeDuplicates },
    });
  } catch (e: any) {
    const durationMs = Date.now() - startedAt;

    await supabaseAdmin
      .from("trade_import_batches")
      .update({
        status: "failed",
        error: e?.message ?? "Import failed",
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", batchId);

    return NextResponse.json({ error: e?.message ?? "Import failed", batchId }, { status: 400 });
  }
}
