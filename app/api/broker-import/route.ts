// app/api/broker-import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import * as XLSX from "xlsx";
import { createHash } from "crypto";

export const runtime = "nodejs";

/**
 * Thinkorswim Broker Import — v12.4 (Option A / consistent history)
 * - Writes to: trades
 * - Uses: qty (NOT quantity)
 * - ALWAYS finalizes batch row:
 *    status: "success" | "failed"
 *    imported_rows, updated_rows, duplicates, finished_at, duration_ms, error (optional)
 * - Dedupe:
 *    * In-memory dedupe by trade_hash (prevents ON CONFLICT affecting same row twice)
 *    * DB-level upsert by trade_hash
 */

type AnyRow = any[];
type Broker = "thinkorswim";

/* -------------------- helpers -------------------- */
function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function safeStr(v: unknown) {
  return String(v ?? "").trim();
}
function normalizeRefNum(v: unknown): string {
  const s0 = String(v ?? "").trim();
  if (!s0) return "";
  const m = s0.match(/^=\"?([^\"]+)\"?$/); // handles ="123"
  const core = (m?.[1] ?? s0).trim();
  return core.replace(/^=/, "").trim();
}
function parseNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[(),$]/g, "").replace(/\s+/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

/* -------------------- CSV / Excel -------------------- */
function parseCsvLine(line: string): string[] {
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
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
function rowsFromCsvText(csv: string): AnyRow[] {
  const lines = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: AnyRow[] = [];
  for (const ln of lines) {
    if (!ln || !ln.trim()) continue;
    out.push(parseCsvLine(ln));
  }
  return out;
}
function rowsFromExcelBuffer(buf: Buffer): AnyRow[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as AnyRow[];
}

/* -------------------- datetime -------------------- */
function parseDateTime(dateRaw: unknown, timeRaw: unknown): string {
  const ds = String(dateRaw ?? "").trim();
  const ts = String(timeRaw ?? "").trim();

  const md = ds.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  const mt = ts.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!md) return new Date().toISOString();
  const mm = Number(md[1]);
  const dd = Number(md[2]);
  const yy = 2000 + Number(md[3]);

  const hh = mt ? Number(mt[1]) : 0;
  const mi = mt ? Number(mt[2]) : 0;
  const ss = mt && mt[3] ? Number(mt[3]) : 0;

  return new Date(Date.UTC(yy, mm - 1, dd, hh, mi, ss)).toISOString();
}

/* -------------------- header detection -------------------- */
function findHeaderRow(rows: AnyRow[]) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const header = r.map((x) => String(x ?? "").trim().toUpperCase());
    if (!header.length) continue;

    const idx = (name: string) => header.indexOf(name.toUpperCase());

    const date = idx("DATE");
    const time = idx("TIME");
    const type = idx("TYPE");
    const desc = idx("DESCRIPTION");
    const amount = idx("AMOUNT");

    if (date >= 0 && time >= 0 && type >= 0 && desc >= 0 && amount >= 0) {
      return {
        headerRowIdx: i,
        cols: {
          date,
          time,
          type,
          desc,
          amount,
          ref: idx("REF #"),
          balance: idx("BALANCE"),
          miscFees: idx("MISC FEES"),
          commFees: idx("COMMISSIONS & FEES"),
        },
      };
    }
  }
  return null;
}

/* -------------------- concurrency helper -------------------- */
async function parallelLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<void>
) {
  let i = 0;
  const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

/* ============================================================
   CONTRACT CODE helpers (your exact format expectation)
============================================================ */
function tosYYMMDDCompact(expiryISO: string) {
  const yy = expiryISO.slice(2, 4);
  const mm = expiryISO.slice(5, 7);
  const dd = expiryISO.slice(8, 10);
  return `${yy}${mm}${dd}`;
}

function formatContractCodeSimple(opts: {
  root: string;        // SPX o SPXW
  expiryISO: string;   // YYYY-MM-DD
  right: "C" | "P";
  strike: number;      // 6985
}) {
  const datePart = tosYYMMDDCompact(opts.expiryISO);
  const strikePart = Number.isInteger(opts.strike)
    ? String(opts.strike)
    : String(opts.strike).replace(/\.0+$/, "");
  return `${opts.root}${datePart}${opts.right}${strikePart}`;
}

/* ============================================================
   Thinkorswim parsing
============================================================ */
function parseTosExpiryToISO(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{2})$/i);
  if (!m) return null;

  const day = m[1].padStart(2, "0");
  const monthMap: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04",
    MAY: "05", JUN: "06", JUL: "07", AUG: "08",
    SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const mm = monthMap[m[2].toUpperCase()];
  if (!mm) return null;

  const yyyy = `20${m[3]}`;
  return `${yyyy}-${mm}-${day}`;
}
function normalizeOptionRoot(root: string, description: string): string {
  if (root.toUpperCase() === "SPX" && /(WEEKLY|WEEKLYS)/i.test(description)) return "SPXW";
  return root.toUpperCase();
}
function normalizeSideFromDesc(desc: string): "BOT" | "SOLD" | "BUY" | "SELL" | null {
  const d = desc.toUpperCase();
  if (d.includes("BOT")) return "BOT";
  if (d.includes("SOLD")) return "SOLD";
  if (/\bBUY\b/.test(d)) return "BUY";
  if (/\bSELL\b/.test(d)) return "SELL";
  return null;
}
function parseQtyFromDesc(desc: string): number | null {
  const d = desc.toUpperCase();
  const m = d.match(/\b(BOT|SOLD|BUY|SELL)\s+([+-]?\d+)\b/);
  if (!m) return null;
  const q = Number(m[2]);
  if (!Number.isFinite(q)) return null;
  const qty = Math.abs(q);
  if (qty === 100) return null;
  return qty;
}
function parsePriceFromDesc(desc: string): number | null {
  const m = desc.match(/@\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const p = Number(m[1]);
  return Number.isFinite(p) ? p : null;
}
function parseOptionFromDesc(desc: string) {
  const U = desc.toUpperCase();

  const rootMatch = U.match(/\b(SPXW|SPX|NDX|RUT|QQQ|SPY)\b/);
  const rawRoot = rootMatch?.[1] ?? null;
  if (!rawRoot) return null;

  const right: "C" | "P" | null = U.includes("PUT") ? "P" : U.includes("CALL") ? "C" : null;
  if (!right) return null;

  const strikeCandidates = (U.match(/\b\d{3,5}(?:\.\d+)?\b/g) ?? [])
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n !== 100);

  if (!strikeCandidates.length) return null;
  const strike = [...strikeCandidates].sort((a, b) => b - a)[0];
  if (strike == null) return null;

  const mdy = U.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/);
  let expiryISO: string | null = null;
  if (mdy) {
    const mm = mdy[1].padStart(2, "0");
    const dd = mdy[2].padStart(2, "0");
    const yyyy = `20${mdy[3]}`;
    expiryISO = `${yyyy}-${mm}-${dd}`;
  } else {
    const dmy = U.match(/\b(\d{1,2}\s+[A-Z]{3}\s+\d{2})\b/);
    if (dmy) expiryISO = parseTosExpiryToISO(dmy[1]);
  }
  if (!expiryISO) return null;

  const root = normalizeOptionRoot(rawRoot, desc);
  const contract_code = formatContractCodeSimple({ root, expiryISO, right, strike });

  return { root, expiryISO, right, strike, contract_code, underlying: root };
}

/* ============================================================
   ROUTE
============================================================ */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authData.user.id;

  const form = await req.formData();
  const brokerRaw = String(form.get("broker") ?? "").trim() || "thinkorswim";
  const broker: Broker = brokerRaw.toLowerCase() === "thinkorswim" ? "thinkorswim" : "thinkorswim";
  const comment = String(form.get("comment") ?? "").trim() || null;

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  // 1) Create batch
  const { data: batch, error: batchErr } = await supabaseAdmin
    .from("trade_import_batches")
    .insert({
      user_id: userId,
      broker,
      filename: file.name ?? null,
      comment,
      status: "processing",
      started_at: new Date().toISOString(),
      imported_rows: 0,
      updated_rows: 0,
      duplicates: 0,
    })
    .select("id")
    .single();

  if (batchErr || !batch?.id) {
    return NextResponse.json({ error: batchErr?.message ?? "Failed to create batch" }, { status: 500 });
  }
  const batchId = batch.id as string;

  // counters (for product UX)
  let rowsRead = 0;
  let trdSeen = 0;
  let trdParsed = 0;
  let trdSkipped = 0;

  let tradeDuplicatesInFile = 0;
  let ledgerDuplicatesInFile = 0;

  // final counters
  let tradeInserted = 0;
  let tradeUpdated = 0;
  let ledgerInserted = 0;
  let ledgerUpdated = 0;
  let ledgerDuplicates = 0;

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

    // Build ledger rows + trade rows
    const txnRowsAll: any[] = [];
    const tradeByHash = new Map<string, any>();

    for (const r of dataRows) {
      rowsRead++;

      const dateCell = safeStr(r[cols.date]);
      if (!/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(dateCell)) continue;

      const txnType = safeStr(r[cols.type]).toUpperCase();
      const description = safeStr(r[cols.desc]);
      const executed_at = parseDateTime(r[cols.date], r[cols.time]);

      const misc_fees_raw = cols.miscFees >= 0 ? parseNumber(r[cols.miscFees]) : null;
      const commissions_fees_raw = cols.commFees >= 0 ? parseNumber(r[cols.commFees]) : null;

      // store costs as positive
      const misc_fees = misc_fees_raw == null ? null : Math.abs(misc_fees_raw);
      const commissions_fees = commissions_fees_raw == null ? null : Math.abs(commissions_fees_raw);

      const amount = parseNumber(r[cols.amount]);
      const balance = cols.balance >= 0 ? parseNumber(r[cols.balance]) : null;

      const ref_num_raw = cols.ref >= 0 ? r[cols.ref] : null;
      const ref_num_norm = normalizeRefNum(ref_num_raw);
      const ref_num = ref_num_norm ? ref_num_norm : null;

      const row_hash = sha256(
        [broker, userId, dateCell, safeStr(r[cols.time]), ref_num ?? "", txnType, description.slice(0, 240), String(amount)].join("|")
      );

      txnRowsAll.push({
        user_id: userId,
        broker,
        txn_type: txnType || null,
        ref_num,
        description: description || null,
        misc_fees,
        commissions_fees,
        amount: Number.isFinite(amount) ? amount : 0,
        balance: Number.isFinite(balance) ? balance : null,
        executed_at,
        row_hash,
        raw: { row: r, detectedHeadersAtRow: headerRowIdx },
        import_batch_id: batchId,
      });

      if (txnType === "TRD") {
        trdSeen++;

        const side = normalizeSideFromDesc(description);
        const qty = parseQtyFromDesc(description);
        const price = parsePriceFromDesc(description);

        if (!side || !qty || !price) {
          trdSkipped++;
          continue;
        }

        const opt = parseOptionFromDesc(description);
        const instrument_type = opt ? "option" : "stock";
        const symbol = opt?.underlying ?? (description.toUpperCase().match(/\b[A-Z]{1,6}\b/)?.[0] ?? "UNKNOWN");
        const contract_code = opt?.contract_code ?? symbol;

        const trade_hash = ref_num
          ? sha256([userId, broker, "REF", ref_num].join("|"))
          : sha256([userId, broker, "NREF", contract_code, executed_at, side, String(qty), String(price)].join("|"));

        if (tradeByHash.has(trade_hash)) {
          tradeDuplicatesInFile++;
          continue;
        }

        trdParsed++;

        tradeByHash.set(trade_hash, {
          user_id: userId,
          broker,

          asset_type: instrument_type === "option" ? "option" : instrument_type,
          symbol,

          instrument_type,
          underlying_symbol: symbol,
          instrument_symbol: contract_code,
          contract_code,

          option_root: opt?.root ?? null,
          option_expiration: opt?.expiryISO ?? null,
          option_strike: opt?.strike ?? null,
          option_right: opt?.right ?? null,
          option_dte: null,

          side,
          qty,
          price,
          executed_at,

          exchange: null,
          commissions: commissions_fees,
          fees: misc_fees,

          trade_hash,
          raw: { description, parsed: opt, sourceRow: r, ref_num },
          import_batch_id: batchId,
        });
      }
    }

    /* broker_transactions upsert-like */
    const refMap = new Map<string, any>();
    const noRefRows: any[] = [];

    for (const row of txnRowsAll) {
      const rn = String(row.ref_num ?? "").trim();
      if (rn) {
        if (refMap.has(rn)) ledgerDuplicatesInFile++;
        refMap.set(rn, row);
      } else {
        noRefRows.push(row);
      }
    }

    const refRows = Array.from(refMap.values());
    const refNums = refRows.map((x) => String(x.ref_num)).filter(Boolean);

    const existingRefSet = new Set<string>();
    if (refNums.length) {
      for (const part of chunk(refNums, 800)) {
        const { data, error } = await supabaseAdmin
          .from("broker_transactions")
          .select("ref_num")
          .eq("user_id", userId)
          .eq("broker", broker)
          .in("ref_num", part);

        if (error) throw new Error(error.message ?? "Failed to query existing ref_num");
        for (const it of data ?? []) {
          const rn = String((it as any).ref_num ?? "").trim();
          if (rn) existingRefSet.add(rn);
        }
      }
    }

    const toInsertRef = refRows.filter((r) => !existingRefSet.has(String(r.ref_num)));
    const toUpdateRef = refRows.filter((r) => existingRefSet.has(String(r.ref_num)));

    if (toInsertRef.length) {
      for (const part of chunk(toInsertRef, 500)) {
        const { error } = await supabaseAdmin.from("broker_transactions").insert(part);
        if (error) throw new Error(error.message ?? "Insert failed (broker_transactions ref)");
        ledgerInserted += part.length;
      }
    }

    if (toUpdateRef.length) {
      await parallelLimit(toUpdateRef, 12, async (row) => {
        const rn = String(row.ref_num ?? "").trim();
        if (!rn) return;

        const patch = {
          txn_type: row.txn_type,
          description: row.description,
          misc_fees: row.misc_fees,
          commissions_fees: row.commissions_fees,
          amount: row.amount,
          balance: row.balance,
          executed_at: row.executed_at,
          row_hash: row.row_hash,
          raw: row.raw,
          import_batch_id: row.import_batch_id,
        };

        const { error } = await supabaseAdmin
          .from("broker_transactions")
          .update(patch)
          .eq("user_id", userId)
          .eq("broker", broker)
          .eq("ref_num", rn);

        if (error) throw new Error(error.message ?? "Update failed (broker_transactions ref)");
        ledgerUpdated += 1;
      });
    }

    let ledgerDuplicatesNoRef = 0;
    if (noRefRows.length) {
      const rowHashes = Array.from(new Set(noRefRows.map((x) => x.row_hash).filter(Boolean)));
      const existingHashSet = new Set<string>();

      for (const part of chunk(rowHashes, 800)) {
        const { data, error } = await supabaseAdmin
          .from("broker_transactions")
          .select("row_hash")
          .eq("user_id", userId)
          .eq("broker", broker)
          .in("row_hash", part);

        if (error) throw new Error(error.message ?? "Failed to query existing row_hash");
        for (const it of data ?? []) {
          const h = String((it as any).row_hash ?? "").trim();
          if (h) existingHashSet.add(h);
        }
      }

      const toInsert = noRefRows.filter((x) => !existingHashSet.has(String(x.row_hash)));
      ledgerDuplicatesNoRef = noRefRows.length - toInsert.length;

      for (const part of chunk(toInsert, 500)) {
        const { error } = await supabaseAdmin.from("broker_transactions").insert(part);
        if (error) throw new Error(error.message ?? "Insert failed (broker_transactions no-ref)");
        ledgerInserted += part.length;
      }
    }

    ledgerDuplicates = ledgerDuplicatesInFile + ledgerDuplicatesNoRef;

    /* trades upsert with counts */
    const tradeRowsAll = Array.from(tradeByHash.values());
    const tradeHashes = tradeRowsAll.map((x) => x.trade_hash).filter(Boolean);

    const existingTradeHash = new Set<string>();
    if (tradeHashes.length) {
      for (const part of chunk(tradeHashes, 800)) {
        const { data, error } = await supabaseAdmin
          .from("trades")
          .select("trade_hash")
          .eq("user_id", userId)
          .in("trade_hash", part);

        if (error) throw new Error(error.message ?? "Failed to query existing trade_hash");
        for (const it of data ?? []) existingTradeHash.add((it as any).trade_hash);
      }
    }

    tradeInserted = tradeRowsAll.filter((x) => !existingTradeHash.has(x.trade_hash)).length;
    tradeUpdated = tradeRowsAll.length - tradeInserted;

    if (tradeRowsAll.length) {
      const { error } = await supabaseAdmin.from("trades").upsert(tradeRowsAll, {
        onConflict: "trade_hash",
        ignoreDuplicates: false,
      });
      if (error) throw new Error(error.message ?? "Trades upsert failed");
    }

    const durationMs = Date.now() - startedAt;
    const duplicatesForHistory = tradeDuplicatesInFile + ledgerDuplicates;

    // 2) Finalize batch — SUCCESS
    const { error: updErr } = await supabaseAdmin
      .from("trade_import_batches")
      .update({
        status: "success",
        imported_rows: tradeInserted,
        updated_rows: tradeUpdated,
        duplicates: duplicatesForHistory,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", batchId);

    if (updErr) {
      return NextResponse.json(
        {
          ok: true,
          batchId,
          broker,
          warning: `Import done but failed to finalize batch: ${updErr.message}`,
          message: `Import complete — ${tradeInserted} new, ${tradeUpdated} updated, ${tradeDuplicatesInFile} duplicates skipped.`,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        batchId,
        broker,
        message:
          `Import complete — ${tradeInserted} new, ${tradeUpdated} updated, ` +
          `${tradeDuplicatesInFile} duplicates skipped. Ledger: ${ledgerInserted} new, ${ledgerUpdated} updated, ${ledgerDuplicates} duplicates skipped.`,
      },
      { status: 200 }
    );
  } catch (e: any) {
    const durationMs = Date.now() - startedAt;

    await supabaseAdmin
      .from("trade_import_batches")
      .update({
        status: "failed",
        imported_rows: tradeInserted || 0,
        updated_rows: tradeUpdated || 0,
        duplicates: (tradeDuplicatesInFile || 0) + (ledgerDuplicates || 0),
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        error: e?.message ?? "Import failed",
      })
      .eq("id", batchId);

    return NextResponse.json({ ok: false, error: e?.message ?? "Import failed", batchId }, { status: 400 });
  }
}
