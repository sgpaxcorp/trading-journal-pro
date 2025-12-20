import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type SyncBody = {
  date: string; // YYYY-MM-DD
};

/* ---------------- helpers ---------------- */

function safeNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ✅ comisiones/fees SIEMPRE como costo positivo
function safeCost(v: any): number {
  return Math.abs(safeNum(v));
}

function dayRangeUTC(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function calcDTE(tradeDate: string, expiry: string | null): number {
  if (!expiry) return 0;
  const base = new Date(tradeDate + "T00:00:00Z");
  const exp = new Date(expiry + "T00:00:00Z");
  return Math.round((exp.getTime() - base.getTime()) / 86400000);
}

function multiplier(kind: string) {
  return kind === "option" ? 100 : 1;
}

// ✅ Fin #2: fallback para construir contract si contract_code viene vacío
function buildOptionContractCode(
  underlying: string,
  expiry: string | null,
  right: string | null,
  strike: number | null
): string | null {
  if (!underlying || !expiry || !right || strike == null) return null;

  // YYYY-MM-DD -> YYMMDD
  const yy = expiry.slice(2, 4);
  const mm = expiry.slice(5, 7);
  const dd = expiry.slice(8, 10);
  const yymmdd = `${yy}${mm}${dd}`;

  const r = right.toUpperCase().startsWith("P") ? "P" : "C";

  // strike 6885.5 -> "68855" (sin punto)
  const strikeStr = String(strike).replace(".", "");

  return `${underlying}${yymmdd}${r}${strikeStr}`;
}

function timeHHMMSSFromISO(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(11, 19);
  } catch {
    return "";
  }
}

/* ---------------- route ---------------- */

export async function POST(req: NextRequest) {
  try {
    /* ---------- auth ---------- */
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authData.user.id;

    /* ---------- body ---------- */
    const body = (await req.json()) as SyncBody;
    const date = body?.date;
    if (!date) {
      return NextResponse.json({ error: "Missing date" }, { status: 400 });
    }

    const { startISO, endISO } = dayRangeUTC(date);

    /* ---------- load trades ---------- */
    const { data: trades, error } = await supabaseAdmin
      .from("trades")
      .select(
        `
        id,
        symbol,
        instrument_type,
        contract_code,
        option_expiration,
        option_strike,
        option_right,
        qty,
        price,
        side,
        executed_at,
        commissions,
        fees
      `
      )
      .eq("user_id", userId)
      .gte("executed_at", startISO)
      .lt("executed_at", endISO)
      .order("executed_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!trades || trades.length === 0) {
      return NextResponse.json({
        date,
        trades_found: 0,
        entries: [],
        exits: [],
        pnl: 0,
        summary: [],
      });
    }

    /* ---------- aggregate ---------- */
    type Agg = {
      key: string;
      kind: string; // option/stock/...
      underlying: string; // SPX / AAPL
      contract: string | null; // contract_code for options
      expiry: string | null; // option_expiration (YYYY-MM-DD)
      strike: number | null;
      right: string | null; // C/P or null

      buyQty: number;
      buyPxQty: number;
      sellQty: number;
      sellPxQty: number;

      firstBuyTime: string | null;
      lastSellTime: string | null;

      comm: number;
      fees: number;
    };

    const map = new Map<string, Agg>();

    for (const t of trades as any[]) {
      const kind = String(t.instrument_type || "stock").toLowerCase();
      const underlying = String(t.symbol || "").toUpperCase();

      const contract =
        t.contract_code ||
        buildOptionContractCode(
          underlying,
          t.option_expiration || null,
          t.option_right ?? null,
          t.option_strike ?? null
        ) ||
        null;

      const key = kind === "option" && contract ? contract : underlying;

      if (!map.has(key)) {
        map.set(key, {
          key,
          kind,
          underlying,
          contract,
          expiry: t.option_expiration || null,
          strike: t.option_strike ?? null,
          right: t.option_right ?? null,
          buyQty: 0,
          buyPxQty: 0,
          sellQty: 0,
          sellPxQty: 0,
          firstBuyTime: null,
          lastSellTime: null,
          comm: 0,
          fees: 0,
        });
      }

      const a = map.get(key)!;
      const qty = safeNum(t.qty);
      const price = safeNum(t.price);

      // ✅ comm/fees siempre como costo positivo
      a.comm += safeCost(t.commissions);
      a.fees += safeCost(t.fees);

      const side = String(t.side ?? "").toUpperCase();

      // ✅ soporta BUY/SELL y BOT/SOLD (ToS)
      const isBuy = side.includes("BUY") || side.includes("BOT");
      const isSell = side.includes("SELL") || side.includes("SOLD");

      if (isBuy) {
        a.buyQty += qty;
        a.buyPxQty += qty * price;
        if (!a.firstBuyTime) a.firstBuyTime = t.executed_at;
      }

      if (isSell) {
        a.sellQty += qty;
        a.sellPxQty += qty * price;
        a.lastSellTime = t.executed_at;
      }
    }

    const aggs = Array.from(map.values());

    /* ---------- build entries/exits ---------- */

    const entries = aggs
      .filter((a) => a.buyQty > 0)
      .map((a) => {
        const avg = a.buyPxQty / a.buyQty;
        const dte = calcDTE(date, a.expiry);
        const symbol = a.kind === "option" && a.contract ? a.contract : a.underlying;

        return {
          id: a.key,
          symbol,
          type: a.kind,
          side: "buy",
          premium: "Debit",
          strategy: "Single / naked",
          price: Number(avg.toFixed(4)),
          qty: Number(a.buyQty.toFixed(4)),
          time: a.firstBuyTime ? timeHHMMSSFromISO(a.firstBuyTime) : "",
          dte,
          entry_price: Number(avg.toFixed(4)),
          size: Number(a.buyQty.toFixed(4)),
          underlying: a.underlying,
          contract_code: a.contract,
          expiration: a.expiry,
          strike: a.strike,
          right: a.right,
        };
      });

    const exits = aggs
      .filter((a) => a.sellQty > 0)
      .map((a) => {
        const avg = a.sellPxQty / a.sellQty;
        const dte = calcDTE(date, a.expiry);
        const symbol = a.kind === "option" && a.contract ? a.contract : a.underlying;

        return {
          id: a.key,
          symbol,
          type: a.kind,
          side: "sell",
          premium: "Credit",
          strategy: "Single / naked",
          price: Number(avg.toFixed(4)),
          qty: Number(a.sellQty.toFixed(4)),
          time: a.lastSellTime ? timeHHMMSSFromISO(a.lastSellTime) : "",
          dte,
          exit_price: Number(avg.toFixed(4)),
          size: Number(a.sellQty.toFixed(4)),
          underlying: a.underlying,
          contract_code: a.contract,
          expiration: a.expiry,
          strike: a.strike,
          right: a.right,
        };
      });

    /* ---------- summary per symbol/type (for "Average entry price per symbol/type") ---------- */
    const summary = aggs.map((a) => {
      const symbol = a.kind === "option" && a.contract ? a.contract : a.underlying;
      const avgEntry = a.buyQty > 0 ? a.buyPxQty / a.buyQty : 0;
      const avgExit = a.sellQty > 0 ? a.sellPxQty / a.sellQty : 0;

      // realized pnl per group (includes comm/fees)
      const m = multiplier(a.kind);
      const realized = a.sellPxQty * m - a.buyPxQty * m - a.comm - a.fees;

      return {
        key: a.key,
        symbol,
        kind: a.kind,
        buyQty: Number(a.buyQty.toFixed(4)),
        sellQty: Number(a.sellQty.toFixed(4)),
        avgEntry: Number(avgEntry.toFixed(4)),
        avgExit: Number(avgExit.toFixed(4)),
        commissions: Number(a.comm.toFixed(2)),
        fees: Number(a.fees.toFixed(2)),
        pnl: Number(realized.toFixed(2)),
      };
    });

    /* ---------- pnl (total) ---------- */
    let pnl = 0;
    for (const a of aggs) {
      const m = multiplier(a.kind);
      pnl += a.sellPxQty * m - a.buyPxQty * m - a.comm - a.fees;
    }
    pnl = Number(pnl.toFixed(2));

    /* ---------- preserve notes ---------- */
    const { data: existing } = await supabaseAdmin
      .from("journal_entries")
      .select("notes")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();

    let premarket = "";
    let live = "";
    let post = "";

    if (existing?.notes) {
      try {
        const parsed = JSON.parse(existing.notes);
        premarket = parsed.premarket ?? "";
        live = parsed.live ?? "";
        post = parsed.post ?? "";
      } catch {}
    }

    const notes = JSON.stringify({
      premarket,
      live,
      post,
      entries,
      exits,
      trade_summary: summary, // ✅ para el UI
      synced_at: new Date().toISOString(),
    });

    /* ---------- persist journal_trades (so UI shows entries/exits immediately) ---------- */
    // 1) delete day rows
    const { error: delJT } = await supabaseAdmin
      .from("journal_trades")
      .delete()
      .eq("user_id", userId)
      .eq("journal_date", date);

    if (delJT) {
      return NextResponse.json({ error: delJT.message }, { status: 500 });
    }

    // 2) insert from sync (entries/exits)
    const jtRows = [
      ...entries.map((r: any) => ({
        user_id: userId,
        journal_date: date,
        leg: "entry",
        symbol: String(r.symbol ?? "").trim(),
        kind: String(r.type ?? "other"),
        side: "long",
        premium: String(r.premium ?? "Debit"),
        strategy: String(r.strategy ?? "Single / naked"),
        price: Number(r.price ?? 0),
        quantity: Number(r.qty ?? 0),
        time: String(r.time ?? ""),
        dte: Number.isFinite(Number(r.dte)) ? Number(r.dte) : null,
        emotions: null,
        strategy_checklist: null,
      })),
      ...exits.map((r: any) => ({
        user_id: userId,
        journal_date: date,
        leg: "exit",
        symbol: String(r.symbol ?? "").trim(),
        kind: String(r.type ?? "other"),
        side: "long",
        premium: String(r.premium ?? "Credit"),
        strategy: String(r.strategy ?? "Single / naked"),
        price: Number(r.price ?? 0),
        quantity: Number(r.qty ?? 0),
        time: String(r.time ?? ""),
        dte: Number.isFinite(Number(r.dte)) ? Number(r.dte) : null,
        emotions: null,
        strategy_checklist: null,
      })),
    ].filter((x) => x.symbol);

    if (jtRows.length > 0) {
      const { error: insJT } = await supabaseAdmin.from("journal_trades").insert(jtRows);
      if (insJT) {
        return NextResponse.json({ error: insJT.message }, { status: 500 });
      }
    }

    /* ---------- upsert journal_entries ---------- */
    await supabaseAdmin.from("journal_entries").upsert(
      {
        user_id: userId,
        date,
        pnl,
        instrument: entries[0]?.symbol ?? "UNKNOWN",
        direction: "long",
        entry_price: entries[0]?.entry_price ?? null,
        exit_price: exits[0]?.exit_price ?? null,
        size: entries[0]?.size ?? null,
        notes,
        respected_plan: true,
      },
      { onConflict: "user_id,date" }
    );

    return NextResponse.json({
      date,
      trades_found: trades.length,
      groups: aggs.length,
      pnl,
      entries,
      exits,
      summary, // ✅
      message: "Journal synced successfully",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
