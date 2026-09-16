import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requirePortfolioWriteAccess } from "@/lib/emergencyPortfolioControls";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

function cleanTicker(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 20);
}

function cleanText(value: unknown, max = 2_000) {
  return String(value ?? "").trim().slice(0, max);
}

function stringList(value: unknown, maxItems = 30) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, maxItems)
    : [];
}

async function companyIdForTicker(ticker: string) {
  const { data: identifier, error: identifierError } = await supabaseAdmin
    .from("investment_security_identifiers")
    .select("security_id")
    .eq("identifier_type", "ticker")
    .eq("identifier_value", ticker)
    .is("valid_to", null)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (identifierError) throw new Error(identifierError.message);
  if (!identifier) return null;
  const { data: security, error: securityError } = await supabaseAdmin
    .from("investment_securities")
    .select("company_id")
    .eq("id", identifier.security_id)
    .maybeSingle();
  if (securityError) throw new Error(securityError.message);
  return security?.company_id ?? null;
}

async function audit(input: {
  userId: string;
  action: string;
  entityId: string;
  previousState: unknown;
  newState: unknown;
}) {
  const { error } = await supabaseAdmin.rpc("append_investment_audit_event", {
    p_user_id: input.userId,
    p_actor_user_id: input.userId,
    p_action: input.action,
    p_entity_type: "investment_watchlist_entry",
    p_entity_id: input.entityId,
    p_previous_state: input.previousState,
    p_new_state: input.newState,
    p_source_data_version: null,
    p_calculation_version: null,
    p_ai_model_version: null,
    p_approval_state: null,
  });
  if (error) throw new Error(error.message);
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gate = await requireSmartToolsOwner(authUser);
    if (gate) return gate;
    const { data: entries, error } = await supabaseAdmin
      .from("investment_watchlist_entries")
      .select("id,company_id,status,reason,target_research_questions,valuation_ranges,important_metrics,upcoming_events,thesis_conditions,last_reviewed_at,created_at,updated_at")
      .eq("user_id", authUser.userId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const companyIds = Array.from(new Set((entries ?? []).map((entry) => entry.company_id)));
    const { data: companies, error: companyError } = companyIds.length
      ? await supabaseAdmin.from("investment_companies").select("id,cik,legal_name,sector,industry,status").in("id", companyIds)
      : { data: [], error: null };
    if (companyError) throw new Error(companyError.message);
    const companyById = new Map((companies ?? []).map((company) => [company.id, company]));
    return NextResponse.json({ entries: (entries ?? []).map((entry) => ({ ...entry, company: companyById.get(entry.company_id) ?? null })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Watchlist could not be loaded." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gate = await requireSmartToolsOwner(authUser);
    if (gate) return gate;
    const writeGate = await requirePortfolioWriteAccess();
    if (writeGate) return writeGate;
    const limiter = await rateLimit(`investment-watchlist:write:${authUser.userId}`, { limit: 30, windowMs: 60_000 });
    if (!limiter.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(limiter) });
    const body = await req.json().catch(() => ({}));
    const ticker = cleanTicker(body?.ticker);
    const companyId = cleanText(body?.companyId, 50) || (ticker ? await companyIdForTicker(ticker) : null);
    const reason = cleanText(body?.reason);
    if (!companyId) return NextResponse.json({ error: "Ingest the company before adding it to the watchlist." }, { status: 409 });
    if (!reason) return NextResponse.json({ error: "Watchlist reason is required." }, { status: 400 });
    const row = {
      user_id: authUser.userId,
      company_id: companyId,
      status: body?.status === "paused" ? "paused" : "active",
      reason,
      target_research_questions: stringList(body?.targetResearchQuestions),
      valuation_ranges: Array.isArray(body?.valuationRanges) ? body.valuationRanges.slice(0, 20) : [],
      important_metrics: stringList(body?.importantMetrics),
      upcoming_events: Array.isArray(body?.upcomingEvents) ? body.upcomingEvents.slice(0, 30) : [],
      thesis_conditions: stringList(body?.thesisConditions),
      last_reviewed_at: new Date().toISOString(),
    };
    const { data: previous } = await supabaseAdmin.from("investment_watchlist_entries").select("*").eq("user_id", authUser.userId).eq("company_id", companyId).maybeSingle();
    const { data, error } = await supabaseAdmin
      .from("investment_watchlist_entries")
      .upsert(row, { onConflict: "user_id,company_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await audit({ userId: authUser.userId, action: previous ? "watchlist_updated" : "watchlist_added", entityId: data.id, previousState: previous, newState: data });
    return NextResponse.json({ entry: data }, { status: previous ? 200 : 201, headers: rateLimitHeaders(limiter) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Watchlist could not be updated." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const gate = await requireSmartToolsOwner(authUser);
    if (gate) return gate;
    const writeGate = await requirePortfolioWriteAccess();
    if (writeGate) return writeGate;
    const id = cleanText(new URL(req.url).searchParams.get("id"), 50);
    if (!id) return NextResponse.json({ error: "Watchlist entry id is required." }, { status: 400 });
    const { data: previous, error: previousError } = await supabaseAdmin.from("investment_watchlist_entries").select("*").eq("id", id).eq("user_id", authUser.userId).maybeSingle();
    if (previousError) throw new Error(previousError.message);
    if (!previous) return NextResponse.json({ error: "Watchlist entry not found." }, { status: 404 });
    const { data, error } = await supabaseAdmin.from("investment_watchlist_entries").update({ status: "archived" }).eq("id", id).eq("user_id", authUser.userId).select("*").single();
    if (error) throw new Error(error.message);
    await audit({ userId: authUser.userId, action: "watchlist_archived", entityId: id, previousState: previous, newState: data });
    return NextResponse.json({ entry: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Watchlist entry could not be archived." }, { status: 500 });
  }
}
