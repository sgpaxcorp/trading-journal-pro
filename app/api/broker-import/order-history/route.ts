import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { auditOrderEvents } from "@/lib/audit/auditEngine";
import { parseTosOrderHistory } from "@/lib/brokers/tos/parseTosOrderHistory";
import type { NormalizedOrderEvent } from "@/lib/brokers/types";
import { createHash } from "crypto";
import { requireAdvancedPlan } from "@/lib/serverFeatureAccess";

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

function normalizeChecklistItems(items: any): Array<{ text: string; done: boolean }> {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      if (typeof it === "string") {
        const text = it.trim();
        return text ? { text, done: false } : null;
      }
      if (it && typeof it === "object") {
        const text = String((it as any).text ?? "").trim();
        if (!text) return null;
        return { text, done: !!(it as any).done };
      }
      return null;
    })
    .filter((x): x is { text: string; done: boolean } => !!x);
}

function normalizeRuleLabel(label: any): string {
  return String(label ?? "").trim();
}

function buildExecutionDiscipline(audit: any) {
  const checks = [
    {
      label: "Protective stop present",
      status: audit?.stop_present === true ? "pass" : audit?.stop_present === false ? "fail" : "unknown",
      reason:
        audit?.stop_present === true
          ? "A protective stop event was detected in broker order history."
          : audit?.stop_present === false
          ? "No protective stop event was detected in broker order history."
          : "Not enough broker evidence to determine stop protection.",
    },
    {
      label: "OCO protection used",
      status: audit?.oco_used === true ? "pass" : audit?.oco_used === false ? "fail" : "unknown",
      reason:
        audit?.oco_used === true
          ? "An OCO structure was detected."
          : audit?.oco_used === false
          ? "No OCO structure was detected."
          : "Not enough broker evidence to determine OCO usage.",
    },
    {
      label: "Manual market exit discipline",
      status:
        audit?.manual_market_exit === true
          ? "fail"
          : audit?.manual_market_exit === false
          ? "pass"
          : "unknown",
      reason:
        audit?.manual_market_exit === true
          ? "A manual market exit was detected in broker events."
          : audit?.manual_market_exit === false
          ? "No manual market exit was detected."
          : "Not enough broker evidence to determine whether a manual market exit occurred.",
    },
  ];

  const evaluable = checks.filter((c) => c.status !== "unknown");
  const score =
    evaluable.length > 0
      ? Math.round((evaluable.filter((c) => c.status === "pass").length / evaluable.length) * 100)
      : null;

  return {
    score,
    checks,
    metrics: {
      stop_present: audit?.stop_present ?? null,
      oco_used: audit?.oco_used ?? null,
      stop_mod_count: audit?.stop_mod_count ?? 0,
      cancel_count: audit?.cancel_count ?? 0,
      replace_count: audit?.replace_count ?? 0,
      manual_market_exit: audit?.manual_market_exit ?? null,
      stop_market_filled: audit?.stop_market_filled ?? null,
      time_to_first_stop_sec: audit?.time_to_first_stop_sec ?? null,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = authData.user.id;
    const advancedGate = await requireAdvancedPlan(userId);
    if (advancedGate) return advancedGate;

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

    // ---- Growth plan + checklist compliance ----
    let growthPlan: any | null = null;
    let journalEntry: any | null = null;
    let checklistRow: any | null = null;

    const { data: planRows } = await supabaseAdmin
      .from("growth_plans")
      .select("rules, steps, max_daily_loss_percent, starting_balance, max_risk_per_trade_percent, max_risk_per_trade_usd")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1);

    growthPlan = (planRows ?? [])[0] ?? null;

    const { data: journalRow } = await supabaseAdmin
      .from("journal_entries")
      .select("pnl, respected_plan")
      .eq("user_id", userId)
      .eq("date", date)
      .eq("account_id", accountId)
      .maybeSingle();

    journalEntry = journalRow ?? null;

    const { data: checklistData } = await supabaseAdmin
      .from("daily_checklists")
      .select("items, notes")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();

    checklistRow = checklistData ?? null;

    const checklistItems = normalizeChecklistItems(checklistRow?.items);
    const checklistTotal = checklistItems.length;
    const checklistDone = checklistItems.filter((i) => i.done).length;
    const checklistPct =
      checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : null;
    const checklistMissing = checklistItems
      .filter((i) => !i.done)
      .map((i) => i.text)
      .filter(Boolean);

    const rulesRaw: any[] = Array.isArray(growthPlan?.rules) ? growthPlan.rules : [];
    const activeRules = rulesRaw.filter((r) => (r as any)?.isActive !== false);

    const maxDailyLossPct = Number(growthPlan?.max_daily_loss_percent ?? 0);
    const startingBalance = Number(growthPlan?.starting_balance ?? 0);
    const dailyLossLimit =
      Number.isFinite(maxDailyLossPct) && Number.isFinite(startingBalance) && maxDailyLossPct > 0 && startingBalance > 0
        ? (startingBalance * maxDailyLossPct) / 100
        : null;

    const ruleEvaluations = activeRules.map((r) => {
      const label = normalizeRuleLabel((r as any)?.label ?? (r as any)?.text ?? "Rule");
      const labelLower = label.toLowerCase();
      let status: "pass" | "fail" | "unknown" = "unknown";
      let reason = "No evaluable con los datos actuales.";

      if (labelLower.includes("max daily loss") || labelLower.includes("pérdida diaria") || labelLower.includes("daily loss")) {
        const pnl = Number(journalEntry?.pnl);
        if (!Number.isFinite(pnl) || dailyLossLimit == null) {
          status = "unknown";
          reason = "Falta P&L diario o límite de pérdida diaria.";
        } else if (pnl < -dailyLossLimit) {
          status = "fail";
          reason = `P&L ${pnl.toFixed(2)} excede el límite diario ${dailyLossLimit.toFixed(2)}.`;
        } else {
          status = "pass";
          reason = `P&L ${pnl.toFixed(2)} dentro del límite diario ${dailyLossLimit.toFixed(2)}.`;
        }
      } else if (labelLower.includes("risk") || labelLower.includes("riesgo")) {
        status = "unknown";
        reason = "No hay datos de riesgo por trade en el audit.";
      } else if (labelLower.includes("revenge")) {
        status = "unknown";
        reason = "No hay señal objetiva de revenge trading en los datos del audit.";
      } else if (labelLower.includes("proceso") || labelLower.includes("process")) {
        status = "unknown";
        reason = "Regla cualitativa. Requiere evaluación manual.";
      }

      return { label, status, reason };
    });

    const evaluable = ruleEvaluations.filter((r) => r.status !== "unknown");
    const rulesScore =
      evaluable.length > 0
        ? Math.round(
            (evaluable.filter((r) => r.status === "pass").length / evaluable.length) * 100
          )
        : null;

    let complianceScore: number | null = null;
    if (checklistPct != null && rulesScore != null) {
      complianceScore = Math.round(checklistPct * 0.6 + rulesScore * 0.4);
    } else if (checklistPct != null) {
      complianceScore = checklistPct;
    } else if (rulesScore != null) {
      complianceScore = rulesScore;
    }

    const processReview = {
      score: complianceScore,
      weights: { checklist: 0.6, rules: 0.4 },
      checklist: {
        total: checklistTotal,
        completed: checklistDone,
        completion_pct: checklistPct,
        missing_items: checklistMissing.slice(0, 12),
      },
      rules: ruleEvaluations,
      respected_plan: typeof journalEntry?.respected_plan === "boolean" ? journalEntry.respected_plan : null,
      plan_present: !!growthPlan,
    };
    const executionDiscipline = buildExecutionDiscipline(audit);

    return NextResponse.json({
      date,
      accountId,
      instrument_key: instrumentKey || null,
      symbol: symbol || null,
      events: deduped,
      audit,
      process_review: processReview,
      execution_discipline: executionDiscipline,
      plan_compliance: processReview,
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
    const advancedGate = await requireAdvancedPlan(userId);
    if (advancedGate) return advancedGate;

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
