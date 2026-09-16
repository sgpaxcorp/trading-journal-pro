import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requireInvestorTransactionProcessingAccess } from "@/lib/emergencyPortfolioControls";
import {
  calculateCapitalPoolAccounts,
  type CapitalAccountEventInput,
  type CapitalAccountEventType,
  type CapitalAccountInput,
  type CapitalExpenseTreatment,
  type CapitalNavPointInput,
} from "@/lib/neuroCapitalAccounts";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_TYPES = new Set<CapitalAccountEventType>([
  "initial_contribution",
  "contribution",
  "withdrawal",
  "distribution",
  "allocated_expense",
]);

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanDate(value: unknown, label: string) {
  const date = cleanText(value, 10);
  if (!ISO_DATE.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`))) {
    throw new Error(`${label} must be a valid ISO date.`);
  }
  if (date > new Date().toISOString().slice(0, 10)) {
    throw new Error(`${label} cannot be in the future.`);
  }
  return date;
}

function positiveNumber(value: unknown, label: string, required = true) {
  if ((value === null || value === undefined || value === "") && !required) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be greater than zero.`);
  return parsed;
}

function nonNegativeNumber(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} cannot be negative.`);
  return parsed;
}

function isCapitalEventType(value: string): value is CapitalAccountEventType {
  return EVENT_TYPES.has(value as CapitalAccountEventType);
}

function isSchemaMissing(error: any) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "42883";
}

function apiError(error: any, fallback: string) {
  if (isSchemaMissing(error)) {
    return NextResponse.json(
      { error: "Capital Accounts is not installed in this environment. Apply the latest Supabase migration." },
      { status: 503 }
    );
  }
  if (error?.code === "23505") {
    return NextResponse.json({ error: "This capital-account record already exists." }, { status: 409 });
  }
  if (error?.code === "P0001" || error?.code === "23514" || error?.message?.includes("must be")) {
    return NextResponse.json({ error: error?.message || fallback }, { status: 400 });
  }
  console.error("[neuro-analysis/capital-accounts] error:", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

async function ownedPool(userId: string, poolId: string) {
  const { data, error } = await supabaseAdmin
    .from("neuro_capital_pools")
    .select("id,user_id,name,base_currency,status,created_at,updated_at")
    .eq("id", poolId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadCapitalAccounts(userId: string, requestedPoolId?: string | null) {
  const { data: pools, error: poolsError } = await supabaseAdmin
    .from("neuro_capital_pools")
    .select("id,name,base_currency,status,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (poolsError) throw poolsError;

  const poolRows = pools ?? [];
  const selectedPool = requestedPoolId
    ? poolRows.find((pool: any) => String(pool.id) === requestedPoolId) ?? null
    : poolRows[0] ?? null;
  if (requestedPoolId && !selectedPool) throw Object.assign(new Error("Capital pool not found."), { status: 404 });
  if (!selectedPool) {
    return { pools: poolRows, selectedPoolId: null, accounts: [], events: [], navHistory: [], report: null };
  }

  const [accountsResult, eventsResult, navResult] = await Promise.all([
    supabaseAdmin
      .from("neuro_capital_accounts")
      .select("id,pool_id,investor_name,investor_reference,opened_on,status,created_at,updated_at")
      .eq("user_id", userId)
      .eq("pool_id", selectedPool.id)
      .order("opened_on", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("neuro_capital_account_events")
      .select("id,sequence_no,pool_id,account_id,event_date,event_type,amount,nav_per_unit,units_delta,external_cash_flow,expense_treatment,source,notes,created_at")
      .eq("user_id", userId)
      .eq("pool_id", selectedPool.id)
      .order("sequence_no", { ascending: true }),
    supabaseAdmin
      .from("neuro_capital_nav_history")
      .select("id,pool_id,nav_date,total_net_assets,total_units,nav_per_unit,event_sequence_cutoff,source,notes,calculation_version,created_at")
      .eq("user_id", userId)
      .eq("pool_id", selectedPool.id)
      .order("nav_date", { ascending: true }),
  ]);
  if (accountsResult.error) throw accountsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (navResult.error) throw navResult.error;

  const eventRows = eventsResult.data ?? [];
  const accountInputs: CapitalAccountInput[] = (accountsResult.data ?? []).map((account: any) => ({
    id: String(account.id),
    investorName: String(account.investor_name ?? "Investor"),
    investorReference: account.investor_reference == null ? null : String(account.investor_reference),
    openedOn: String(account.opened_on),
    status: account.status === "closed" ? "closed" : "active",
    events: eventRows
      .filter((event: any) => String(event.account_id) === String(account.id))
      .map((event: any): CapitalAccountEventInput => ({
        id: String(event.id),
        accountId: String(event.account_id),
        sequenceNo: Number(event.sequence_no),
        eventDate: String(event.event_date),
        eventType: event.event_type as CapitalAccountEventType,
        amount: Number(event.amount),
        navPerUnit: event.nav_per_unit == null ? null : Number(event.nav_per_unit),
        unitsDelta: Number(event.units_delta),
        externalCashFlow: Boolean(event.external_cash_flow),
        expenseTreatment: event.expense_treatment as CapitalExpenseTreatment | null,
        notes: event.notes == null ? null : String(event.notes),
      })),
  }));
  const navInputs: CapitalNavPointInput[] = (navResult.data ?? []).map((point: any) => ({
    id: String(point.id),
    navDate: String(point.nav_date),
    totalNetAssets: Number(point.total_net_assets),
    totalUnits: Number(point.total_units),
    navPerUnit: point.nav_per_unit == null ? null : Number(point.nav_per_unit),
    eventSequenceCutoff: Number(point.event_sequence_cutoff),
  }));
  const report = calculateCapitalPoolAccounts({
    id: String(selectedPool.id),
    name: String(selectedPool.name),
    baseCurrency: String(selectedPool.base_currency),
    asOfDate: new Date().toISOString().slice(0, 10),
    accounts: accountInputs,
    navHistory: navInputs,
  });

  return {
    pools: poolRows,
    selectedPoolId: selectedPool.id,
    accounts: accountsResult.data ?? [],
    events: eventRows,
    navHistory: navResult.data ?? [],
    report,
  };
}

async function authorize(req: Request) {
  const authUser = await getAuthUser(req);
  if (!authUser) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const smartToolsGate = await requireSmartToolsOwner(authUser);
  if (smartToolsGate) return { response: smartToolsGate } as const;
  return { authUser } as const;
}

export async function GET(req: Request) {
  try {
    const access = await authorize(req);
    if ("response" in access) return access.response;
    const rate = await rateLimit(`neuro-capital-accounts:read:${access.authUser.userId}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(rate) }
      );
    }
    const poolId = cleanText(new URL(req.url).searchParams.get("poolId"), 80) || null;
    return NextResponse.json(
      await loadCapitalAccounts(access.authUser.userId, poolId),
      { headers: rateLimitHeaders(rate) }
    );
  } catch (error: any) {
    if (error?.status === 404) return NextResponse.json({ error: error.message }, { status: 404 });
    return apiError(error, "Could not load Capital Accounts.");
  }
}

export async function POST(req: Request) {
  try {
    const access = await authorize(req);
    if ("response" in access) return access.response;
    const emergencyGate = await requireInvestorTransactionProcessingAccess();
    if (emergencyGate) return emergencyGate;
    const rate = await rateLimit(`neuro-capital-accounts:write:${access.authUser.userId}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(rate) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = cleanText(body?.action, 40);
    let poolId = cleanText(body?.poolId, 80);

    if (action === "create_pool") {
      const name = cleanText(body?.name, 160);
      const baseCurrency = cleanText(body?.baseCurrency, 3).toUpperCase() || "USD";
      if (!name) return NextResponse.json({ error: "Capital pool name is required." }, { status: 400 });
      if (!/^[A-Z]{3}$/.test(baseCurrency)) {
        return NextResponse.json({ error: "Base currency must be a three-letter code." }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin
        .from("neuro_capital_pools")
        .insert({ user_id: access.authUser.userId, name, base_currency: baseCurrency })
        .select("id")
        .single();
      if (error) throw error;
      poolId = String(data.id);
    } else {
      if (!poolId) return NextResponse.json({ error: "Capital pool is required." }, { status: 400 });
      const pool = await ownedPool(access.authUser.userId, poolId);
      if (!pool) return NextResponse.json({ error: "Capital pool not found." }, { status: 404 });

      if (action === "create_account") {
        const investorName = cleanText(body?.investorName, 160);
        const investorReference = cleanText(body?.investorReference, 160) || null;
        const openedOn = cleanDate(body?.openedOn, "Opening date");
        const initialContribution = positiveNumber(body?.initialContribution, "Initial contribution", false);
        const initialNavPerUnit = initialContribution == null
          ? null
          : positiveNumber(body?.initialNavPerUnit, "Initial NAV per unit", false);
        if (!investorName) {
          return NextResponse.json({ error: "Investor name is required." }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin.rpc("create_neuro_capital_account", {
          p_user_id: access.authUser.userId,
          p_pool_id: poolId,
          p_investor_name: investorName,
          p_investor_reference: investorReference,
          p_opened_on: openedOn,
          p_initial_contribution: initialContribution,
          p_initial_nav_per_unit: initialNavPerUnit,
          p_notes: cleanText(body?.notes, 2_000) || null,
          p_idempotency_key: cleanText(body?.idempotencyKey, 120) || randomUUID(),
        });
        if (error) throw error;
        void data;
      } else if (action === "record_event") {
        const accountId = cleanText(body?.accountId, 80);
        const eventType = cleanText(body?.eventType, 40);
        const eventDate = cleanDate(body?.eventDate, "Event date");
        const amount = positiveNumber(body?.amount, "Event amount") as number;
        if (!accountId || !isCapitalEventType(eventType)) {
          return NextResponse.json({ error: "A valid capital account and event type are required." }, { status: 400 });
        }
        const { data: account, error: accountError } = await supabaseAdmin
          .from("neuro_capital_accounts")
          .select("id")
          .eq("id", accountId)
          .eq("pool_id", poolId)
          .eq("user_id", access.authUser.userId)
          .maybeSingle();
        if (accountError) throw accountError;
        if (!account) return NextResponse.json({ error: "Capital account not found." }, { status: 404 });

        const expenseTreatment: CapitalExpenseTreatment | null = eventType === "allocated_expense"
          ? body?.expenseTreatment === "investor_paid" ? "investor_paid" : "included_in_nav"
          : null;
        const { error } = await supabaseAdmin.from("neuro_capital_account_events").insert({
          user_id: access.authUser.userId,
          pool_id: poolId,
          account_id: accountId,
          event_date: eventDate,
          event_type: eventType,
          amount,
          nav_per_unit: eventType === "initial_contribution"
            ? positiveNumber(body?.initialNavPerUnit, "Initial NAV per unit", false)
            : eventType === "contribution" || eventType === "withdrawal" ? 1 : null,
          units_delta: eventType === "withdrawal" ? -1 : eventType === "contribution" || eventType === "initial_contribution" ? 1 : 0,
          external_cash_flow: eventType !== "allocated_expense" || expenseTreatment === "investor_paid",
          expense_treatment: expenseTreatment,
          source: "manual",
          notes: cleanText(body?.notes, 2_000) || null,
          idempotency_key: cleanText(body?.idempotencyKey, 120) || randomUUID(),
        });
        if (error) throw error;
      } else if (action === "record_nav") {
        const navDate = cleanDate(body?.navDate, "NAV date");
        const totalNetAssets = nonNegativeNumber(body?.totalNetAssets, "Total net assets");
        const { error } = await supabaseAdmin.from("neuro_capital_nav_history").insert({
          user_id: access.authUser.userId,
          pool_id: poolId,
          nav_date: navDate,
          total_net_assets: totalNetAssets,
          total_units: 0,
          nav_per_unit: null,
          event_sequence_cutoff: 0,
          source: "manual",
          notes: cleanText(body?.notes, 2_000) || null,
        });
        if (error) throw error;
      } else {
        return NextResponse.json({ error: "Unsupported Capital Accounts action." }, { status: 400 });
      }
    }

    return NextResponse.json(
      await loadCapitalAccounts(access.authUser.userId, poolId),
      { headers: rateLimitHeaders(rate) }
    );
  } catch (error: any) {
    return apiError(error, "Could not update Capital Accounts.");
  }
}
