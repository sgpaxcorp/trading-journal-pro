import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { auditOrderEvents } from "@/lib/audit/auditEngine";
import { parseTosOrderHistory } from "@/lib/brokers/tos/parseTosOrderHistory";
import type { NormalizedOrderEvent } from "@/lib/brokers/types";
import { createHash } from "crypto";

export const runtime = "nodejs";

async function resolveActiveAccountId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.active_account_id ?? null;
}

function normalizeSymbol(raw: string | null): string {
  return String(raw ?? "").trim().toUpperCase();
}
function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
function eventHashBase(parts: Array<string | number | null | undefined>) {
  return sha256(
    parts
      .map((p) => (p == null ? "" : String(p)))
      .join("|")
  );
}
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = authData.user.id;
    const { searchParams } = new URL(req.url);

    const date = String(searchParams.get("date") ?? "").trim();
    if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

    const accountId =
      String(searchParams.get("accountId") ?? "").trim() || (await resolveActiveAccountId(userId));
    if (!accountId) return NextResponse.json({ error: "Missing account" }, { status: 400 });

    const instrumentKey = String(searchParams.get("instrument_key") ?? "").trim();
    const symbol = normalizeSymbol(searchParams.get("symbol"));

    let q = supabaseAdmin
      .from("broker_order_events")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .eq("date", date)
      .order("ts_utc", { ascending: true });

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    let events = (data ?? []) as any[];

    if (instrumentKey) {
      events = events.filter((e) => String(e.instrument_key) === instrumentKey);
    } else if (symbol) {
      events = events.filter((e) => {
        const sym = normalizeSymbol(e.symbol);
        const key = String(e.instrument_key || "").toUpperCase();
        return sym === symbol || key.startsWith(`${symbol}|`);
      });
    }

    const deduped: any[] = [];
    const seen = new Set<string>();
    for (const e of events) {
      const h =
        String(e.event_hash || "").trim() ||
        eventHashBase([
          userId,
          accountId,
          e.broker ?? "thinkorswim",
          e.event_type,
          e.ts_utc,
          e.status ?? "",
          e.side ?? "",
          e.pos_effect ?? "",
          e.qty ?? "",
          e.symbol ?? "",
          e.instrument_key ?? "",
          e.order_type ?? "",
          e.limit_price ?? "",
          e.stop_price ?? "",
          e.oco_id ?? "",
          e.replace_id ?? "",
        ]);
      if (seen.has(h)) continue;
      seen.add(h);
      deduped.push(e);
    }

    const audit = auditOrderEvents(deduped as NormalizedOrderEvent[]);

    return NextResponse.json({
      date,
      accountId,
      instrument_key: instrumentKey || null,
      symbol: symbol || null,
      events: deduped,
      audit,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = authData.user.id;
    const body = await req.json();
    const rawText = String(body?.rawText ?? "");
    const sourceTz = String(body?.sourceTz ?? "America/New_York");
    const broker = String(body?.broker ?? "thinkorswim");
    const filename = body?.filename ? String(body.filename) : null;

    const accountId = body?.accountId
      ? String(body.accountId)
      : await resolveActiveAccountId(userId);
    if (!accountId) return NextResponse.json({ error: "Missing account" }, { status: 400 });

    if (!rawText.trim()) {
      return NextResponse.json({ error: "Missing rawText" }, { status: 400 });
    }

    const parsed = parseTosOrderHistory(rawText, { sourceTz });

    const { data: importRow, error: importErr } = await supabaseAdmin
      .from("broker_imports")
      .insert({
        user_id: userId,
        account_id: accountId,
        broker,
        import_type: "order_history",
        source_tz: sourceTz,
        filename,
        meta: {
          rows_found: parsed.stats.rows_found,
          rows_parsed: parsed.stats.rows_parsed,
          events_saved: parsed.events.length,
          warnings: parsed.warnings.slice(0, 12),
        },
      })
      .select("id")
      .single();

    if (importErr || !importRow?.id) {
      return NextResponse.json({ error: importErr?.message ?? "Import insert failed" }, { status: 500 });
    }

    const importId = importRow.id as string;

    const rowsWithHash = parsed.events.map((e: NormalizedOrderEvent) => ({
      user_id: userId,
      account_id: accountId,
      broker,
      import_id: importId,
      date: e.date,
      ts_utc: e.ts_utc,
      ts_source: e.ts_source ?? null,
      source_tz: e.source_tz ?? null,
      event_type: e.event_type,
      status: e.status ?? null,
      side: e.side ?? null,
      pos_effect: e.pos_effect ?? null,
      qty: e.qty ?? null,
      symbol: e.symbol ?? null,
      instrument_key: e.instrument_key,
      asset_kind: e.asset_kind ?? null,
      order_type: e.order_type ?? null,
      limit_price: e.limit_price ?? null,
      stop_price: e.stop_price ?? null,
      oco_id: e.oco_id ?? null,
      replace_id: e.replace_id ?? null,
      event_hash: eventHashBase([
        userId,
        accountId,
        broker,
        e.event_type,
        e.ts_utc,
        e.status ?? "",
        e.side ?? "",
        e.pos_effect ?? "",
        e.qty ?? "",
        e.symbol ?? "",
        e.instrument_key ?? "",
        e.order_type ?? "",
        e.limit_price ?? "",
        e.stop_price ?? "",
        e.oco_id ?? "",
        e.replace_id ?? "",
      ]),
      raw: e.raw ?? {},
    }));

    const uniqueMap = new Map<string, any>();
    let duplicatesInFile = 0;
    for (const row of rowsWithHash) {
      if (!row.event_hash) continue;
      if (uniqueMap.has(row.event_hash)) {
        duplicatesInFile += 1;
        continue;
      }
      uniqueMap.set(row.event_hash, row);
    }

    const uniqueRows = Array.from(uniqueMap.values());
    const existingHashSet = new Set<string>();
    const hashes = uniqueRows.map((r) => r.event_hash).filter(Boolean);

    for (const part of chunk(hashes, 800)) {
      const { data, error } = await supabaseAdmin
        .from("broker_order_events")
        .select("event_hash")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .eq("broker", broker)
        .in("event_hash", part);
      if (error) throw new Error(error.message ?? "Failed to query existing order events");
      for (const it of data ?? []) {
        const h = String((it as any).event_hash ?? "").trim();
        if (h) existingHashSet.add(h);
      }
    }

    const toInsert = uniqueRows.filter((r) => !existingHashSet.has(String(r.event_hash)));
    const duplicatesCount = duplicatesInFile + (uniqueRows.length - toInsert.length);

    if (toInsert.length) {
      const { error } = await supabaseAdmin.from("broker_order_events").insert(toInsert);
      if (error) throw new Error(error.message ?? "Failed to insert events");
    }

    await supabaseAdmin
      .from("broker_imports")
      .update({
        meta: {
          rows_found: parsed.stats.rows_found,
          rows_parsed: parsed.stats.rows_parsed,
          events_saved: toInsert.length,
          events_skipped: duplicatesCount,
          warnings: parsed.warnings.slice(0, 12),
        },
      })
      .eq("id", importId);

    return NextResponse.json({
      ok: true,
      importId,
      eventsSaved: toInsert.length,
      duplicates: duplicatesCount,
      warnings: parsed.warnings,
      stats: parsed.stats,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
