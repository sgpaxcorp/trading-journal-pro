import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { financialNumberOrFallback, financialNumberOrNull } from "@/lib/neuroFinancialDataIntegrity";
import {
  buildNeuroAnalysisEngine,
  normalizeNeuroTicker,
  type NeuroHoldingInput,
} from "@/lib/neuroAnalysisEngine";
import {
  buildNeuroPerformanceAttribution,
  type PerformanceAttributionInput,
} from "@/lib/neuroPerformanceAttribution";
import { getLatestNeuroInvestmentPolicy } from "@/lib/neuroAnalysisStorage";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

function finiteNumber(value: unknown, fallback = 0) {
  return financialNumberOrFallback(value, fallback);
}

function sanitizeHoldings(value: unknown): NeuroHoldingInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 500)
    .map((holding: any) => ({
      ticker: normalizeNeuroTicker(holding?.ticker),
      shares: Math.max(0, finiteNumber(holding?.shares)),
      averageCost:
        financialNumberOrNull(holding?.averageCost) == null
          ? null
          : Math.max(0, financialNumberOrNull(holding?.averageCost)!),
      currentPrice:
        holding?.currentPrice == null ? null : Math.max(0, finiteNumber(holding.currentPrice)),
      openedAt: String(holding?.openedAt ?? "").slice(0, 10) || null,
      researchOnly: Boolean(holding?.researchOnly),
    }))
    .filter((holding) => holding.ticker && holding.shares > 0);
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const rate = await rateLimit(`neuro-performance:user:${authUser.userId}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(rate),
          },
        }
      );
    }

    const body = (await req.json()) as {
      language?: "en" | "es";
      holdings?: unknown;
      marketData?: unknown;
      performanceAttributionInput?: PerformanceAttributionInput | null;
    };
    const holdings = sanitizeHoldings(body.holdings);
    if (!holdings.length && !body.performanceAttributionInput) {
      return NextResponse.json(
        { error: "Holdings or a performance attribution input ledger is required." },
        { status: 400 }
      );
    }

    const engine = holdings.length
      ? buildNeuroAnalysisEngine({
          language: body.language,
          holdings,
          marketData: body.marketData,
        })
      : null;
    const investmentPolicy = await getLatestNeuroInvestmentPolicy(authUser.userId);
    const performanceAttribution = buildNeuroPerformanceAttribution({
      engine,
      marketData: body.marketData,
      investmentPolicy,
      performanceInput: body.performanceAttributionInput,
    });

    return NextResponse.json(
      {
        performanceAttribution,
        investmentPolicy: investmentPolicy
          ? {
              id: investmentPolicy.id ?? null,
              version: investmentPolicy.version ?? null,
              baseCurrency: investmentPolicy.baseCurrency,
              benchmark: investmentPolicy.benchmark,
              maxPositionPct: investmentPolicy.limits.maxPositionPct,
            }
          : null,
      },
      { headers: rateLimitHeaders(rate) }
    );
  } catch (error: any) {
    console.error("[neuro-analysis/performance-attribution] error:", error);
    return NextResponse.json(
      { error: error?.message || "Performance attribution failed." },
      { status: 500 }
    );
  }
}
