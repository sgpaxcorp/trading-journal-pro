import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError, snaptradeGetActivities } from "@/lib/snaptradeClient";
import { createHash } from "crypto";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";

export const runtime = "nodejs";

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function safeNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSide(typeRaw: string): "BUY" | "SELL" | null {
  const t = typeRaw.toUpperCase();
  if (t.includes("BUY")) return "BUY";
  if (t.includes("SELL")) return "SELL";
  return null;
}

function normalizeInstrumentType(activity: any): string {
  if (activity?.option_symbol || activity?.option_type) return "option";
  return "stock";
}

function toSafeIso(input?: string | null): string {
  if (!input) return new Date().toISOString();
  // accept YYYY-MM-DD or full ISO
  const d = input.length === 10 ? new Date(`${input}T00:00:00Z`) : new Date(input);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function buildTradeHash(parts: Array<string | number | null | undefined>) {
  return sha256(parts.map((p) => (p == null ? "" : String(p))).join("|"));
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = authData.user.id;
  const brokerSyncFree =
    process.env.BROKER_SYNC_FREE === "true" || process.env.NEXT_PUBLIC_BROKER_SYNC_FREE === "true";
  if (!brokerSyncFree) {
    const brokerGate = await requireBrokerSyncAddon(userId);
    if (brokerGate) return brokerGate;
  }

  const body = await req.json().catch(() => ({} as any));
  const accountId = String(body?.accountId ?? "").trim();
  const brokerLabel = String(body?.broker ?? "snaptrade").trim() || "snaptrade";

  if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

  const startDate = String(body?.startDate ?? "").trim() || toISODate(new Date(Date.now() - 30 * 86400000));
  const endDate = String(body?.endDate ?? "").trim() || toISODate(new Date());
  const previewOnly = Boolean(body?.previewOnly);
  const previewLimitRaw = Number(body?.previewLimit ?? 200);
  const previewLimit = Number.isFinite(previewLimitRaw)
    ? Math.max(1, Math.min(previewLimitRaw, 500))
    : 200;
  const includeTradeHashes = Array.isArray(body?.includeTradeHashes)
    ? body.includeTradeHashes.map((h: any) => String(h))
    : null;

  let batchId: string | null = null;
  if (!previewOnly) {
    // 1) Create batch
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("trade_import_batches")
      .insert({
        user_id: userId,
        broker: brokerLabel,
        filename: `snaptrade:${accountId}`,
        comment: body?.comment ?? null,
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
    batchId = String(batch.id);
  }

  try {
    const snaptradeUser = await getSnaptradeUser(userId);
    if (!snaptradeUser) {
      throw new Error("SnapTrade not connected");
    }

    const data = await snaptradeGetActivities(
      snaptradeUser.snaptrade_user_id,
      snaptradeUser.snaptrade_user_secret,
      accountId,
      startDate,
      endDate,
      { limit: 1000, offset: 0 }
    );

    const activities: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.activities)
          ? data.activities
          : [];

    let tradeRowsAll: any[] = [];
    const inFileHashes = new Set<string>();
    let tradeDuplicatesInFile = 0;

    for (const a of activities) {
      const type = String(a?.type ?? "").trim();
      const side = normalizeSide(type);
      if (!side) continue;

      const symbolRaw = String(a?.option_symbol || a?.symbol || "").trim().toUpperCase();
      if (!symbolRaw) continue;

      const units = Math.abs(safeNum(a?.units));
      if (!units) continue;

      let price = Number(a?.price);
      if (!Number.isFinite(price) || price === 0) {
        const amt = Math.abs(safeNum(a?.amount));
        if (amt && units) price = amt / units;
      }
      if (!Number.isFinite(price) || price === 0) continue;

      const tradeDate = String(a?.trade_date || a?.settlement_date || a?.created_at || a?.timestamp || "").trim();
      const executed_at = toSafeIso(tradeDate);

      const instrument_type = normalizeInstrumentType(a);
      const contract_code = symbolRaw;

      const trade_hash = buildTradeHash([
        userId,
        brokerLabel,
        accountId,
        a?.id ?? "",
        tradeDate,
        symbolRaw,
        type,
        units,
        price,
      ]);

      if (inFileHashes.has(trade_hash)) {
        tradeDuplicatesInFile++;
        continue;
      }
      inFileHashes.add(trade_hash);

      tradeRowsAll.push({
        user_id: userId,
        account_id: accountId,
        broker: brokerLabel,
        asset_type: instrument_type,
        symbol: symbolRaw,
        instrument_type,
        underlying_symbol: symbolRaw,
        instrument_symbol: contract_code,
        contract_code,
        option_root: null,
        option_expiration: null,
        option_strike: null,
        option_right: a?.option_type ? String(a.option_type).toUpperCase() : null,
        option_dte: null,
        side,
        qty: units,
        price,
        executed_at,
        exchange: null,
        commissions: a?.fee != null ? Math.abs(safeNum(a.fee)) : null,
        fees: null,
        trade_hash,
        raw: { activity: a, accountId, source: "snaptrade" },
        import_batch_id: batchId,
      });
    }

    if (includeTradeHashes && includeTradeHashes.length) {
      const allow = new Set(includeTradeHashes);
      tradeRowsAll = tradeRowsAll.filter((row) => allow.has(row.trade_hash));
    }

    const tradeHashes = tradeRowsAll.map((x) => x.trade_hash).filter(Boolean);
    const existingTradeHash = new Set<string>();
    if (tradeHashes.length) {
      for (let i = 0; i < tradeHashes.length; i += 800) {
        const part = tradeHashes.slice(i, i + 800);
        const { data: existing, error } = await supabaseAdmin
          .from("trades")
          .select("trade_hash")
          .eq("user_id", userId)
          .in("trade_hash", part);
        if (error) throw new Error(error.message ?? "Failed to query existing trade_hash");
        for (const it of existing ?? []) existingTradeHash.add((it as any).trade_hash);
      }
    }

    const tradeInserted = tradeRowsAll.filter((x) => !existingTradeHash.has(x.trade_hash)).length;
    const tradeUpdated = tradeRowsAll.length - tradeInserted;

    if (previewOnly) {
      const preview = tradeRowsAll.slice(0, previewLimit).map((row) => ({
        ...row,
        is_duplicate: existingTradeHash.has(row.trade_hash),
      }));
      return NextResponse.json(
        {
          ok: true,
          broker: brokerLabel,
          preview,
          total: tradeRowsAll.length,
          inserted: tradeInserted,
          updated: tradeUpdated,
          duplicates: tradeDuplicatesInFile,
          activities: activities.length,
        },
        { status: 200 }
      );
    }

    if (tradeRowsAll.length) {
      const { error } = await supabaseAdmin.from("trades").upsert(tradeRowsAll, {
        onConflict: "trade_hash",
        ignoreDuplicates: false,
      });
      if (error) throw new Error(error.message ?? "Trades upsert failed");
    }

    const durationMs = Date.now() - startedAt;
    const duplicates = tradeDuplicatesInFile;

    if (batchId) {
      const { error: updErr } = await supabaseAdmin
        .from("trade_import_batches")
        .update({
          status: "success",
          imported_rows: tradeInserted,
          updated_rows: tradeUpdated,
          duplicates,
          finished_at: new Date().toISOString(),
          duration_ms: durationMs,
        })
        .eq("id", batchId);

      if (updErr) throw new Error(updErr.message ?? "Failed to finalize batch");
    }

    return NextResponse.json(
      {
        ok: true,
        broker: brokerLabel,
        inserted: tradeInserted,
        updated: tradeUpdated,
        duplicates,
        activities: activities.length,
      },
      { status: 200 }
    );
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    if (batchId) {
      await supabaseAdmin
        .from("trade_import_batches")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          duration_ms: durationMs,
          error: err?.message ?? "SnapTrade import failed",
        })
        .eq("id", batchId);
    }

    return NextResponse.json(formatSnaptradeError(err), { status: 500 });
  }
}
