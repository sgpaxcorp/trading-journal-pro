import { NextRequest, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/adminAuth";
import { PLAN_PRICES } from "@/lib/planCatalog";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CostSettings = {
  monthlyAiBudgetUsd: number;
  chatgptMonthlyUsd: number;
  supabaseMonthlyUsd: number;
  vercelMonthlyUsd: number;
  internetMonthlyUsd: number;
  domainAnnualUsd: number;
  appStoreAnnualUsd: number;
  emailMonthlyUsd: number;
  monitoringMonthlyUsd: number;
  accountingMonthlyUsd: number;
  supportLaborMonthlyUsd: number;
  insuranceMonthlyUsd: number;
  otherMonthlyUsd: number;
  scenarioUsers: number;
  scenarioCorePercent: number;
};

const DEFAULT_SETTINGS: CostSettings = {
  monthlyAiBudgetUsd: 500,
  chatgptMonthlyUsd: 200,
  supabaseMonthlyUsd: 25,
  vercelMonthlyUsd: 20,
  internetMonthlyUsd: 100,
  domainAnnualUsd: 60,
  appStoreAnnualUsd: 200,
  emailMonthlyUsd: 0,
  monitoringMonthlyUsd: 0,
  accountingMonthlyUsd: 0,
  supportLaborMonthlyUsd: 0,
  insuranceMonthlyUsd: 0,
  otherMonthlyUsd: 0,
  scenarioUsers: 200,
  scenarioCorePercent: 60,
};

function safeNumber(value: unknown, fallback: number, max = 1_000_000) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(number, max);
}

function normalizeSettings(value: any): CostSettings {
  return {
    monthlyAiBudgetUsd: safeNumber(value?.monthlyAiBudgetUsd, DEFAULT_SETTINGS.monthlyAiBudgetUsd),
    chatgptMonthlyUsd: safeNumber(value?.chatgptMonthlyUsd, DEFAULT_SETTINGS.chatgptMonthlyUsd),
    supabaseMonthlyUsd: safeNumber(value?.supabaseMonthlyUsd, DEFAULT_SETTINGS.supabaseMonthlyUsd),
    vercelMonthlyUsd: safeNumber(value?.vercelMonthlyUsd, DEFAULT_SETTINGS.vercelMonthlyUsd),
    internetMonthlyUsd: safeNumber(value?.internetMonthlyUsd, DEFAULT_SETTINGS.internetMonthlyUsd),
    domainAnnualUsd: safeNumber(value?.domainAnnualUsd, DEFAULT_SETTINGS.domainAnnualUsd),
    appStoreAnnualUsd: safeNumber(value?.appStoreAnnualUsd, DEFAULT_SETTINGS.appStoreAnnualUsd),
    emailMonthlyUsd: safeNumber(value?.emailMonthlyUsd, DEFAULT_SETTINGS.emailMonthlyUsd),
    monitoringMonthlyUsd: safeNumber(value?.monitoringMonthlyUsd, DEFAULT_SETTINGS.monitoringMonthlyUsd),
    accountingMonthlyUsd: safeNumber(value?.accountingMonthlyUsd, DEFAULT_SETTINGS.accountingMonthlyUsd),
    supportLaborMonthlyUsd: safeNumber(value?.supportLaborMonthlyUsd, DEFAULT_SETTINGS.supportLaborMonthlyUsd),
    insuranceMonthlyUsd: safeNumber(value?.insuranceMonthlyUsd, DEFAULT_SETTINGS.insuranceMonthlyUsd),
    otherMonthlyUsd: safeNumber(value?.otherMonthlyUsd, DEFAULT_SETTINGS.otherMonthlyUsd),
    scenarioUsers: Math.max(1, Math.round(safeNumber(value?.scenarioUsers, DEFAULT_SETTINGS.scenarioUsers, 1_000_000))),
    scenarioCorePercent: Math.min(100, safeNumber(value?.scenarioCorePercent, DEFAULT_SETTINGS.scenarioCorePercent, 100)),
  };
}

function monthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, now };
}

async function fetchOpenAiActualCosts(start: Date, end: Date) {
  const adminKey = process.env.OPENAI_ADMIN_KEY?.trim();
  if (!adminKey) {
    return {
      configured: false,
      projectScoped: false,
      totalUsd: null,
      byDay: [] as { day: string; costUsd: number }[],
      lineItems: [] as { lineItem: string; costUsd: number }[],
      error: null,
    };
  }

  try {
    const daily = new Map<string, number>();
    const lineItems = new Map<string, number>();
    let totalUsd = 0;
    let page: string | null = null;

    do {
      const query = new URLSearchParams({
        start_time: String(Math.floor(start.getTime() / 1000)),
        end_time: String(Math.floor(end.getTime() / 1000)),
        bucket_width: "1d",
        limit: "180",
      });
      query.append("group_by[]", "line_item");
      if (process.env.OPENAI_PROJECT_ID?.trim()) {
        query.append("project_ids[]", process.env.OPENAI_PROJECT_ID.trim());
      }
      if (page) query.set("page", page);

      const response = await fetch(`https://api.openai.com/v1/organization/costs?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${adminKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error?.message ?? `OpenAI costs request failed (${response.status})`));
      }

      for (const bucket of Array.isArray(payload?.data) ? payload.data : []) {
        const day = new Date(Number(bucket?.start_time ?? 0) * 1000).toISOString().slice(0, 10);
        let dayTotal = 0;
        for (const result of Array.isArray(bucket?.results) ? bucket.results : []) {
          const amount = Number(result?.amount?.value ?? 0);
          if (!Number.isFinite(amount)) continue;
          const lineItem = String(result?.line_item || "Other OpenAI usage");
          dayTotal += amount;
          totalUsd += amount;
          lineItems.set(lineItem, (lineItems.get(lineItem) ?? 0) + amount);
        }
        daily.set(day, (daily.get(day) ?? 0) + dayTotal);
      }

      page = payload?.has_more && payload?.next_page ? String(payload.next_page) : null;
    } while (page);

    return {
      configured: true,
      projectScoped: Boolean(process.env.OPENAI_PROJECT_ID?.trim()),
      totalUsd: Number(totalUsd.toFixed(6)),
      byDay: Array.from(daily.entries()).map(([day, costUsd]) => ({ day, costUsd })),
      lineItems: Array.from(lineItems.entries())
        .map(([lineItem, costUsd]) => ({ lineItem, costUsd }))
        .sort((a, b) => b.costUsd - a.costUsd),
      error: null,
    };
  } catch (error: any) {
    return {
      configured: true,
      projectScoped: Boolean(process.env.OPENAI_PROJECT_ID?.trim()),
      totalUsd: null,
      byDay: [] as { day: string; costUsd: number }[],
      lineItems: [] as { lineItem: string; costUsd: number }[],
      error: error?.message ?? "Could not load OpenAI billed costs.",
    };
  }
}

async function loadDashboard() {
  const { start, end, now } = monthBounds();
  const [{ data: settingsRow, error: settingsError }, usageResult, providerCosts] = await Promise.all([
    supabaseAdmin
      .from("admin_settings")
      .select("value_json, updated_at")
      .eq("key", "ai_cost_control")
      .maybeSingle(),
    supabaseAdmin.rpc("admin_ai_usage_summary", {
      p_start: start.toISOString(),
      p_end: end.toISOString(),
    }),
    fetchOpenAiActualCosts(start, now),
  ]);

  if (settingsError) throw settingsError;
  const settings = normalizeSettings((settingsRow as any)?.value_json);
  const elapsedDays = Math.max(1, (now.getTime() - start.getTime()) / 86_400_000);
  const daysInMonth = (end.getTime() - start.getTime()) / 86_400_000;
  const estimatedMtd = Number((usageResult.data as any)?.totals?.estimated_cost_usd ?? 0);
  const providerMtd = Number(providerCosts.totalUsd ?? 0);
  const projectionBase = providerCosts.totalUsd != null ? providerMtd : estimatedMtd;

  return {
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      elapsedDays,
      daysInMonth,
    },
    settings,
    settingsUpdatedAt: (settingsRow as any)?.updated_at ?? null,
    usage: usageResult.error ? null : usageResult.data,
    setupRequired: Boolean(usageResult.error),
    setupError: usageResult.error?.message ?? null,
    providerCosts,
    projectedOpenAiMonthUsd: Number(((projectionBase / elapsedDays) * daysInMonth).toFixed(2)),
    publicPrices: PLAN_PRICES,
    recommendedPrices: PLAN_PRICES,
    exclusions: ["market_intelligence", "broker_sync"],
  };
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, { action: "ai-costs:read", limit: 60, windowMs: 60_000 });
    if (!admin.ok) return admin.response;
    return NextResponse.json(await loadDashboard());
  } catch (error: any) {
    console.error("[admin/ai-costs] GET error:", error);
    return NextResponse.json({ error: error?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminUser(req, { action: "ai-costs:write", limit: 20, windowMs: 10 * 60_000 });
    if (!admin.ok) return admin.response;
    const body = await req.json().catch(() => ({}));
    const settings = normalizeSettings(body?.settings);
    const { error } = await supabaseAdmin.from("admin_settings").upsert(
      {
        key: "ai_cost_control",
        value_json: settings,
        updated_by: admin.user.id,
      },
      { onConflict: "key" }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true, settings });
  } catch (error: any) {
    console.error("[admin/ai-costs] POST error:", error);
    return NextResponse.json({ error: error?.message ?? "Unexpected error" }, { status: 500 });
  }
}
