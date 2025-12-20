import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

/* =========================
   Broker config (Supabase)
========================= */

type BrokerConfig = {
  broker: string;
  timezone: string;
  weekly_keywords: string[];
  option_weekly_roots: Record<string, string>;
  contract_templates: {
    option?: string;  // "{root}{yymmdd}{cp}{strike}"
    stock?: string;   // "{symbol}"
    futures?: string; // "{contract}"
    forex?: string;   // "{base}{quote}"
    crypto?: string;  // "{base}{quote}"
  };
};

type InstrumentPattern = {
  id: string;
  name: string;
  instrument_type: "stock" | "option" | "futures" | "forex" | "crypto";
  regex: string;
  flags: string;
  priority: number;
  is_active: boolean;
};

const DEFAULT_CONFIG: BrokerConfig = {
  broker: "default",
  timezone: "UTC",
  weekly_keywords: ["(Weeklys)", "Weeklys", "Weekly", "WEEKLY"],
  option_weekly_roots: {},
  contract_templates: {
    option: "{root}{yymmdd}{cp}{strike}",
    stock: "{symbol}",
    futures: "{contract}",
    forex: "{base}{quote}",
    crypto: "{base}{quote}",
  },
};

async function loadBrokerConfig(broker: string): Promise<BrokerConfig> {
  const { data, error } = await supabaseAdmin
    .from("broker_configs")
    .select("broker, timezone, weekly_keywords, option_weekly_roots, contract_templates")
    .eq("broker", broker)
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_CONFIG, broker };

  const wk = Array.isArray(data.weekly_keywords) ? data.weekly_keywords : null;

  return {
    broker: data.broker ?? broker,
    timezone: data.timezone ?? "UTC",
    weekly_keywords: (wk ?? DEFAULT_CONFIG.weekly_keywords).map((x: any) => String(x)),
    option_weekly_roots: (data.option_weekly_roots ?? {}) as any,
    contract_templates: (data.contract_templates ?? DEFAULT_CONFIG.contract_templates) as any,
  };
}

async function loadInstrumentPatterns(broker: string): Promise<InstrumentPattern[]> {
  const { data, error } = await supabaseAdmin
    .from("broker_instrument_patterns")
    .select("id, name, instrument_type, regex, flags, priority, is_active")
    .eq("broker", broker)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) return [];
  return (data ?? []) as any;
}

function applyTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWeeklyByConfig(cfg: BrokerConfig, desc: string): boolean {
  const keywords = cfg.weekly_keywords?.length ? cfg.weekly_keywords : DEFAULT_CONFIG.weekly_keywords;
  const d = desc.toLowerCase();

  for (const kw of keywords) {
    const k = String(kw ?? "").trim();
    if (!k) continue;
    if (d.includes(k.toLowerCase())) return true;
  }

  for (const kw of keywords) {
    const k = String(kw ?? "").trim();
    if (!k) continue;
    const re = new RegExp(escapeRegExp(k), "i");
    if (re.test(desc)) return true;
  }

  return false;
}

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

function calcDTE(executedAtISO: string, expirationISO: string | null): number | null {
  if (!expirationISO) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationISO)) return null;

  const tradeDay = executedAtISO.slice(0, 10);
  const t = Date.parse(`${tradeDay}T00:00:00Z`);
  const e = Date.parse(`${expirationISO}T00:00:00Z`);
  if (!Number.isFinite(t) || !Number.isFinite(e)) return null;

  return Math.round((e - t) / (24 * 60 * 60 * 1000));
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
      return { headerRowIdx: i, cols: { date, time, type, ref, desc, miscFees, commFees, amount, balance } };
    }
  }
  return null;
}

/* =========================
   Parse Date+Time to ISO (UTC)
========================= */
function parseDateTime(dateVal: any, timeVal: any): string {
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

  let hh = 0, mi = 0, ss = 0;

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
   Instrument helpers
========================= */

function toYYMMDD(expiration: string | null): string | null {
  if (!expiration) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) return null;
  return expiration.slice(2, 4) + expiration.slice(5, 7) + expiration.slice(8, 10);
}

function strikeCompact(strike: number | null): string | null {
  if (strike == null || !Number.isFinite(strike)) return null;
  const s = String(strike);
  if (!s.includes(".")) return s;
  const [a, b] = s.split(".");
  return `${a}${b}`;
}

function inferOptionRoot(cfg: BrokerConfig, underlying: string | null, desc: string): string | null {
  if (!underlying) return null;
  const u = underlying.toUpperCase();

  if (isWeeklyByConfig(cfg, desc)) {
    const mapped = cfg.option_weekly_roots?.[u];
    if (mapped) return String(mapped).toUpperCase();
  }
  return u;
}

/* =========================
   Parsed Instrument
========================= */
type ParsedInstrument = {
  instrument_type: "option" | "stock" | "futures" | "forex" | "crypto" | "unknown";
  side: "buy" | "sell" | null;
  qty: number | null;

  underlying_symbol: string | null;   // e.g. SPX, AAPL, /ES, EURUSD, BTCUSD
  instrument_symbol: string | null;   // contract code / canonical symbol

  option_root: string | null;
  expiration: string | null;
  strike: number | null;
  option_right: "CALL" | "PUT" | null;

  base: string | null;  // forex/crypto
  quote: string | null; // forex/crypto

  price: number | null;
  exchange: string | null;
};

/* =========================
   1) Parse options (TOS)
========================= */
function parseTOSOption(cfg: BrokerConfig, descRaw: string): ParsedInstrument | null {
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

  if (!(hasRight && hasMonth)) return null;

  const optMain = s.match(
    /\b(BOT|SOLD)\s+[+-]?\d+\s+([A-Z.]+)\s+\d+\s+(?:\([^)]+\)\s+)?(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{2})\s+(\d+(?:\.\d+)?)\s+(CALL|PUT)\b/i
  );

  const optFallback = s.match(
    /\b([A-Z.]+)\s+\d+\s+(?:\([^)]+\)\s+)?(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{2})\s+(\d+(?:\.\d+)?)\s+(CALL|PUT)\b/i
  );

  const m = optMain ?? optFallback;
  if (!m) return null;

  const monthMap: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };

  const isMain = m === optMain;

  const underlying = (isMain ? m[2] : m[1])?.toUpperCase() ?? null;

  const day = (isMain ? m[3] : m[2])?.padStart(2, "0") ?? null;
  const mon = (isMain ? m[4] : m[3])?.toUpperCase() ?? null;
  const yy = (isMain ? m[5] : m[4]) ?? null;

  let expiration: string | null = null;
  if (day && mon && yy && monthMap[mon]) expiration = `20${yy}-${monthMap[mon]}-${day}`;

  let strike = Number(isMain ? m[6] : m[5]);
  if (!Number.isFinite(strike)) strike = null as any;

  const option_right = ((isMain ? m[7] : m[6])?.toUpperCase() as "CALL" | "PUT") ?? null;

  const root = inferOptionRoot(cfg, underlying, s);
  const yymmdd = toYYMMDD(expiration);
  const cp = option_right === "CALL" ? "C" : option_right === "PUT" ? "P" : null;
  const k = strikeCompact(strike);

  const optionTpl = cfg.contract_templates?.option ?? DEFAULT_CONFIG.contract_templates.option!;
  const instrument_symbol =
    root && yymmdd && cp && k ? applyTemplate(optionTpl, { root, yymmdd, cp, strike: k }) : null;

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
    base: null,
    quote: null,
    price,
    exchange,
  };
}

/* =========================
   2) Parse non-options using DB patterns
========================= */
function parseByPatterns(cfg: BrokerConfig, patterns: InstrumentPattern[], descRaw: string): ParsedInstrument | null {
  const s = String(descRaw ?? "").trim();

  const side = s.startsWith("BOT") ? "buy" : s.startsWith("SOLD") ? "sell" : null;
  const qtyMatch = s.match(/\b(BOT|SOLD)\s+([+-]?\d+)\b/i);
  const qty = qtyMatch ? Math.abs(Number(qtyMatch[2])) : null;

  const tokens = s.split(/\s+/).filter(Boolean);
  const exchange = tokens.length ? tokens[tokens.length - 1] : null;

  const priceMatch = s.match(/@(\d+(?:\.\d+)?)/);
  const price = priceMatch ? Number(priceMatch[1]) : null;

  for (const p of patterns) {
    try {
      const re = new RegExp(p.regex, p.flags || "i");
      const m = re.exec(s);
      if (!m) continue;

      const g = (m as any).groups ?? {};

      // FUTURES: root + code => canonical like "/ESZ5"
      if (p.instrument_type === "futures") {
        const root = String(g.root ?? "").toUpperCase();
        const code = String(g.code ?? "").toUpperCase();
        if (!root || !code) continue;

        const underlying_symbol = `/${root}`;
        const contract = `/${root}${code}`;

        const tpl = cfg.contract_templates?.futures ?? DEFAULT_CONFIG.contract_templates.futures!;
        const instrument_symbol = applyTemplate(tpl, { contract });

        return {
          instrument_type: "futures",
          side,
          qty,
          underlying_symbol,
          instrument_symbol,
          option_root: null,
          expiration: null,
          strike: null,
          option_right: null,
          base: null,
          quote: null,
          price,
          exchange,
        };
      }

      // FOREX / CRYPTO: base+quote => "EURUSD" / "BTCUSD"
      if (p.instrument_type === "forex" || p.instrument_type === "crypto") {
        const base = String(g.base ?? "").toUpperCase();
        const quote = String(g.quote ?? "").toUpperCase();
        if (!base || !quote) continue;

        const pair = `${base}${quote}`;
        const tpl =
          p.instrument_type === "forex"
            ? (cfg.contract_templates?.forex ?? DEFAULT_CONFIG.contract_templates.forex!)
            : (cfg.contract_templates?.crypto ?? DEFAULT_CONFIG.contract_templates.crypto!);

        const instrument_symbol = applyTemplate(tpl, { base, quote });

        return {
          instrument_type: p.instrument_type,
          side,
          qty,
          underlying_symbol: pair,
          instrument_symbol,
          option_root: null,
          expiration: null,
          strike: null,
          option_right: null,
          base,
          quote,
          price,
          exchange,
        };
      }

      // STOCK: (rarely needed here, but supported)
      if (p.instrument_type === "stock") {
        const symbol = String(g.symbol ?? "").toUpperCase();
        if (!symbol) continue;

        const tpl = cfg.contract_templates?.stock ?? DEFAULT_CONFIG.contract_templates.stock!;
        return {
          instrument_type: "stock",
          side,
          qty,
          underlying_symbol: symbol,
          instrument_symbol: applyTemplate(tpl, { symbol }),
          option_root: null,
          expiration: null,
          strike: null,
          option_right: null,
          base: null,
          quote: null,
          price,
          exchange,
        };
      }
    } catch {
      // ignore bad regex row
    }
  }

  return null;
}

/* =========================
   3) Stock fallback (simple)
========================= */
function parseStockFallback(descRaw: string): ParsedInstrument {
  const s = String(descRaw ?? "").trim();

  const side = s.startsWith("BOT") ? "buy" : s.startsWith("SOLD") ? "sell" : null;
  const qtyMatch = s.match(/\b(BOT|SOLD)\s+([+-]?\d+)\b/i);
  const qty = qtyMatch ? Math.abs(Number(qtyMatch[2])) : null;

  const tokens = s.split(/\s+/).filter(Boolean);
  const exchange = tokens.length ? tokens[tokens.length - 1] : null;

  const priceMatch = s.match(/@(\d+(?:\.\d+)?)/);
  const price = priceMatch ? Number(priceMatch[1]) : null;

  const maybeSym = tokens.length >= 3 ? tokens[2] : null;
  const sym = maybeSym && /^[A-Z.\-]{1,10}$/i.test(maybeSym) ? maybeSym.toUpperCase() : null;

  return {
    instrument_type: sym ? "stock" : "unknown",
    side,
    qty,
    underlying_symbol: sym,
    instrument_symbol: sym,
    option_root: null,
    expiration: null,
    strike: null,
    option_right: null,
    base: null,
    quote: null,
    price,
    exchange,
  };
}

/* =========================
   File readers
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

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authData.user.id;

  const form = await req.formData();
  const broker = String(form.get("broker") ?? "").trim() || "thinkorswim";
  const comment = String(form.get("comment") ?? "").trim() || null;
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const cfg = await loadBrokerConfig(broker);
  const patterns = await loadInstrumentPatterns(broker);

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
    const name = (file.name ?? "").toLowerCase();
    const isCsv = name.endsWith(".csv");
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
    if (!isCsv && !isExcel) throw new Error("Unsupported file type. Please upload CSV / XLS / XLSX.");

    const rows = isCsv
      ? rowsFromCsvText(await file.text())
      : rowsFromExcelBuffer(Buffer.from(await file.arrayBuffer()));

    const detected = findHeaderRow(rows);
    if (!detected) throw new Error("Could not detect statement headers in this file.");

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

      const row_hash = sha256(
        [broker, userId, String(r[cols.date] ?? ""), String(r[cols.time] ?? ""), ref_num ?? "", description, String(amount ?? ""), String(balance ?? "")]
          .join("|")
      );

      // ✅ instrument parse order:
      // 1) option parser
      // 2) patterns (futures/forex/crypto)
      // 3) stock fallback
      const opt = parseTOSOption(cfg, description);
      const parsed =
        opt ??
        parseByPatterns(cfg, patterns, description) ??
        parseStockFallback(description);

      const option_dte =
        parsed.instrument_type === "option" ? calcDTE(executed_at, parsed.expiration) : null;

      const trade_hash = sha256(
        [
          userId,
          broker,
          parsed.instrument_type,
          parsed.underlying_symbol ?? "",
          parsed.instrument_symbol ?? "",
          parsed.expiration ?? "",
          String(parsed.strike ?? ""),
          parsed.option_right ?? "",
          parsed.side ?? "",
          String(parsed.qty ?? ""),
          String(parsed.price ?? ""),
          executed_at,
        ].join("|")
      );

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
        raw: { row: r, detectedHeadersAtRow: headerRowIdx, broker_config: cfg, patterns },
        import_batch_id: batchId,
      });

      // ✅ contract_code: always the canonical instrument_symbol if present
      const contract_code = parsed.instrument_symbol ?? parsed.underlying_symbol;

      tradeRowsAll.push({
        user_id: userId,
        broker,

        asset_type: parsed.instrument_type === "option" ? "option" : parsed.instrument_type,
        symbol: parsed.underlying_symbol,

        instrument_type: parsed.instrument_type,
        underlying_symbol: parsed.underlying_symbol,
        instrument_symbol: parsed.instrument_symbol,
        contract_code,

        option_root: parsed.option_root,
        option_expiration: parsed.expiration,
        option_strike: parsed.strike,
        option_right: parsed.option_right,
        option_dte,

        base: parsed.base,
        quote: parsed.quote,

        side: parsed.side,
        qty: parsed.qty,
        price: parsed.price,
        executed_at,

        exchange: parsed.exchange,
        commissions: commissions_fees,
        fees: misc_fees,

        trade_hash,
        raw: { description, parsed, sourceRow: r, broker_config: cfg },
        import_batch_id: batchId,
      });
    }

    // ledger dedupe
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
    const duplicates = txnRowsAll.length - txnRowsNew.length;

    if (txnRowsNew.length) {
      const { error } = await supabaseAdmin.from("broker_transactions").insert(txnRowsNew);
      if (error) throw error;
    }

    // trades inserted vs updated + upsert
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

    const inserted = tradeRowsAll.filter((x) => !existingTradeHash.has(x.trade_hash)).length;
    const updated = tradeRowsAll.length - inserted;

    if (tradeRowsAll.length) {
      const { error } = await supabaseAdmin.from("trades").upsert(tradeRowsAll, {
        onConflict: "trade_hash",
        ignoreDuplicates: false,
      });
      if (error) throw error;
    }

    const durationMs = Date.now() - startedAt;

    await supabaseAdmin
      .from("trade_import_batches")
      .update({
        status: "success",
        imported_rows: inserted,
        updated_rows: updated,
        duplicates,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", batchId);

    return NextResponse.json({ batchId, inserted, updated, duplicates });
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
