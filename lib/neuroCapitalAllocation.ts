import type { NeuroInvestmentPolicy } from "@/lib/neuroInvestmentGovernance";
import type { PortfolioExposureMap } from "@/lib/neuroPortfolioExposure";
import {
  createFinancialIntegrityManifest,
  financialCalculation,
  financialFact,
  financialNumberOrNull,
  financialTraceId,
  type FinancialDataIntegrityManifest,
  type FinancialTraceRecord,
} from "@/lib/neuroFinancialDataIntegrity";

export const CAPITAL_ALLOCATION_ALTERNATIVE_KINDS = [
  "existing_position",
  "new_candidate",
  "cash",
  "treasury_cash_management",
] as const;

export type CapitalAllocationAlternativeKind =
  (typeof CAPITAL_ALLOCATION_ALTERNATIVE_KINDS)[number];

export type CapitalAllocationAlternative = {
  id: string;
  kind: CapitalAllocationAlternativeKind;
  label: string;
  ticker: string | null;
  currentAllocation: {
    amount: number | null;
    weightPct: number | null;
  };
  comparisonUnit: {
    amount: 1;
    incrementalPortfolioWeightPct: number | null;
  };
  currentValuation: {
    status: "available" | "partial" | "unavailable" | "not_applicable";
    marketPrice: number | null;
    marketCapitalization: number | null;
    valuationStatus: string;
    marginOfSafetyPct: number | null;
    referenceYieldPct: number | null;
    referenceDate: string | null;
    basis: string;
  };
  expectedFundamentalDrivers: string[];
  downsideScenarios: string[];
  liquidity: {
    level: "high" | "medium" | "low" | "unknown";
    marketVolume: number | null;
    basis: string;
  };
  portfolioExposure: {
    dependencies: Array<{
      driver: string;
      dependencyName: string;
      direction: string;
      magnitude: string;
    }>;
    summary: string;
  };
  existingConcentration: {
    currentWeightPct: number | null;
    hypotheticalWeightIfAllAvailableCapitalAllocatedPct: number | null;
    calculationBasis: string;
  };
  majorUncertainties: string[];
  evidenceStatus: "ready" | "partial" | "insufficient";
};

export type CapitalAllocationDashboard = {
  schemaVersion: "1.0";
  language: "en" | "es";
  generatedAt: string;
  availableCapital: number | null;
  investedPortfolioValue: number | null;
  totalCapitalUnderReview: number | null;
  comparisonUnitAmount: 1;
  summary: string;
  alternatives: CapitalAllocationAlternative[];
  cashState: {
    validPortfolioState: true;
    currentAmount: number | null;
    currentWeightPct: number | null;
    deploymentRequired: false;
  };
  treasuryCashManagement: {
    supportedByConfiguredUniverse: boolean;
    included: boolean;
    reason: string;
  };
  methodology: {
    automaticRanking: false;
    automaticAllocation: false;
    forceCapitalDeployment: false;
    cashIsResidualError: false;
    expectedReturnsGuaranteed: false;
    concentrationBasis: string;
  };
  humanReviewRequired: true;
  financialDataIntegrity: FinancialDataIntegrityManifest;
};

function cleanText(value: unknown, fallback = "", maxLength = 2_000) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanTicker(value: unknown) {
  return cleanText(value, "", 12).toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function finiteNumber(value: unknown): number | null {
  return financialNumberOrNull(value);
}

function nonNegative(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed == null ? null : Math.max(0, parsed);
}

function uniqueText(values: unknown[], limit = 8) {
  return Array.from(
    new Set(values.map((value) => cleanText(value)).filter(Boolean))
  ).slice(0, limit);
}

function percentText(value: number | null, digits = 1) {
  return value == null ? "unavailable" : `${value.toFixed(digits)}%`;
}

function marketItemForTicker(marketData: any, ticker: string) {
  if (!marketData || !ticker) return null;
  if (marketData.items && typeof marketData.items === "object") {
    return marketData.items[ticker] ?? marketData.items[ticker.toUpperCase()] ?? null;
  }
  return cleanTicker(marketData.ticker) === ticker ? marketData : null;
}

function treasuryContext(marketData: any) {
  const items = marketData?.items && typeof marketData.items === "object"
    ? Object.values(marketData.items)
    : [marketData];
  for (const item of items as any[]) {
    const rate = finiteNumber(item?.macro?.treasury?.averageInterestRate);
    if (rate != null) {
      return {
        rate,
        date: cleanText(item?.macro?.treasury?.recordDate, "", 40) || null,
      };
    }
  }
  return { rate: null, date: null };
}

export function policySupportsTreasuryCashManagement(policy?: NeuroInvestmentPolicy | null) {
  if (!policy) return false;
  const configuredText = [
    policy.universe,
    ...policy.limits.allowedInstruments,
  ]
    .join(" ")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return /\b(treasur(?:y|ies)|t-?bill|government bond|money market|cash[- ]management|cash equivalent|short[- ]term government)\b/i.test(
    configuredText
  );
}

function exposureForTicker(map: PortfolioExposureMap | null | undefined, ticker: string) {
  return (map?.holdingExposures ?? [])
    .filter((exposure) => exposure.ticker === ticker)
    .map((exposure) => ({
      driver: exposure.driver,
      dependencyName: exposure.dependencyName,
      direction: exposure.direction,
      magnitude: exposure.magnitude,
    }))
    .slice(0, 8);
}

function liquidityForPosition(marketItem: any, language: "en" | "es") {
  const es = language === "es";
  const volume = finiteNumber(marketItem?.market?.regularMarketVolume);
  if (volume == null || volume <= 0) {
    return {
      level: "unknown" as const,
      marketVolume: null,
      basis: es
        ? "No hay volumen actual verificable; la liquidez no debe inferirse del ticker o del tamaño de la compañía."
        : "Current trading volume is unavailable; liquidity should not be inferred from ticker or company size.",
    };
  }
  const level = volume >= 1_000_000 ? "high" : volume >= 100_000 ? "medium" : "low";
  return {
    level,
    marketVolume: volume,
    basis: es
      ? `Clasificación descriptiva basada en volumen actual de ${Math.round(volume).toLocaleString("en-US")} acciones; no garantiza ejecución futura.`
      : `Descriptive classification based on current volume of ${Math.round(volume).toLocaleString("en-US")} shares; it does not guarantee future execution.`,
  } as const;
}

function positionValuation(position: any, language: "en" | "es") {
  const es = language === "es";
  const marketPrice = finiteNumber(position?.currentPrice);
  const marketCapitalization = finiteNumber(position?.marketCap);
  const margin = finiteNumber(position?.derived?.marginOfSafety);
  const valuationStatus = cleanText(position?.derived?.valuationStatus, "unknown", 80);
  const available = Boolean(
    (marketPrice != null && marketPrice > 0) ||
      (marketCapitalization != null && marketCapitalization > 0)
  );
  return {
    status: available ? (margin == null ? "partial" as const : "available" as const) : "unavailable" as const,
    marketPrice: marketPrice != null && marketPrice > 0 ? marketPrice : null,
    marketCapitalization:
      marketCapitalization != null && marketCapitalization > 0 ? marketCapitalization : null,
    valuationStatus,
    marginOfSafetyPct: margin == null ? null : margin * 100,
    referenceYieldPct: null,
    referenceDate: null,
    basis: available
      ? es
        ? `Precio actual y modelo determinístico; margen de seguridad ${percentText(margin == null ? null : margin * 100)}.`
        : `Current price and deterministic valuation model; margin of safety ${percentText(margin == null ? null : margin * 100)}.`
      : es
        ? "No hay precio o capitalización actual suficiente para una comparación de valoración."
        : "Current price or market capitalization is insufficient for a valuation comparison.",
  };
}

function positionDrivers(input: {
  position: any;
  exposures: ReturnType<typeof exposureForTicker>;
  focusTicker: string;
  businessQualityAnalysis?: any;
  language: "en" | "es";
}) {
  const es = input.language === "es";
  const ticker = cleanTicker(input.position?.ticker);
  const growth = finiteNumber(input.position?.derived?.baseGrowth);
  const fcfMargin = finiteNumber(
    input.position?.latestFundamentals?.fcfMargin ?? input.position?.derived?.fcfMargin
  );
  const evidenceDrivers = input.exposures.map(
    (exposure) => `${exposure.dependencyName}: ${exposure.direction}/${exposure.magnitude}`
  );
  const focusConditions =
    ticker === input.focusTicker
      ? (Array.isArray(input.businessQualityAnalysis?.whatMustBeTrue)
          ? input.businessQualityAnalysis.whatMustBeTrue
          : [])
          .map((condition: any) => cleanText(condition?.condition))
          .filter(Boolean)
      : [];
  return uniqueText([
    ...(growth == null
      ? []
      : [
          es
            ? `Supuesto base de crecimiento: ${(growth * 100).toFixed(1)}%.`
            : `Base growth assumption: ${(growth * 100).toFixed(1)}%.`,
        ]),
    ...(fcfMargin == null
      ? []
      : [
          es
            ? `Margen de flujo de caja libre más reciente: ${(fcfMargin * 100).toFixed(1)}%.`
            : `Latest free-cash-flow margin: ${(fcfMargin * 100).toFixed(1)}%.`,
        ]),
    ...evidenceDrivers,
    ...focusConditions,
  ]);
}

function downsideForPosition(input: {
  position: any;
  ticker: string;
  focusTicker: string;
  independentBearCaseAnalysis?: any;
  language: "en" | "es";
}) {
  const es = input.language === "es";
  const bear = input.position?.scenarios?.bear ?? null;
  const bearGrowth = finiteNumber(bear?.growth);
  const bearUpside = finiteNumber(bear?.upsideToMarket);
  const focusBear = input.ticker === input.focusTicker ? input.independentBearCaseAnalysis : null;
  return uniqueText([
    ...(bearGrowth == null && bearUpside == null
      ? []
      : [
          es
            ? `Escenario bajista modelado: crecimiento ${percentText(bearGrowth == null ? null : bearGrowth * 100)}; diferencia frente al mercado ${percentText(bearUpside == null ? null : bearUpside * 100)}.`
            : `Modeled downside case: growth ${percentText(bearGrowth == null ? null : bearGrowth * 100)}; value gap to market ${percentText(bearUpside == null ? null : bearUpside * 100)}.`,
        ]),
    focusBear?.strongestBearArgument,
    focusBear?.potentialFinancialImpact,
  ]);
}

function positionUncertainties(input: {
  ticker: string;
  focusTicker: string;
  position: any;
  exposures: ReturnType<typeof exposureForTicker>;
  businessQualityAnalysis?: any;
  independentBearCaseAnalysis?: any;
  language: "en" | "es";
}) {
  const es = input.language === "es";
  const focusQualityUncertainty =
    input.ticker === input.focusTicker
      ? (Array.isArray(input.businessQualityAnalysis?.dimensions)
          ? input.businessQualityAnalysis.dimensions
          : [])
          .flatMap((dimension: any) => (Array.isArray(dimension?.uncertainty) ? dimension.uncertainty : []))
      : [];
  const missingBearEvidence =
    input.ticker === input.focusTicker && Array.isArray(input.independentBearCaseAnalysis?.missingInformation)
      ? input.independentBearCaseAnalysis.missingInformation
      : [];
  return uniqueText([
    ...focusQualityUncertainty,
    ...missingBearEvidence,
    ...(input.exposures.length
      ? []
      : [
          es
            ? "No se establecieron dependencias económicas verificadas para esta alternativa."
            : "Verified economic dependencies were not established for this alternative.",
        ]),
    ...(!input.position?.documentReadiness?.ready
      ? [
          es
            ? "La evidencia documental actual está incompleta."
            : "Current company-document evidence is incomplete.",
        ]
      : []),
  ]);
}

function buildPositionAlternative(input: {
  position: any;
  kind: "existing_position" | "new_candidate";
  availableCapital: number | null;
  totalCapital: number | null;
  focusTicker: string;
  marketData: any;
  portfolioExposureMap?: PortfolioExposureMap | null;
  businessQualityAnalysis?: any;
  independentBearCaseAnalysis?: any;
  language: "en" | "es";
}): CapitalAllocationAlternative {
  const es = input.language === "es";
  const ticker = cleanTicker(input.position?.ticker);
  const marketItem = marketItemForTicker(input.marketData, ticker);
  const currentAmount = input.kind === "existing_position" ? nonNegative(input.position?.currentValue) : 0;
  const currentWeightPct =
    input.totalCapital != null && input.totalCapital > 0 && currentAmount != null
      ? (currentAmount / input.totalCapital) * 100
      : null;
  const fullDeploymentWeightPct =
    input.totalCapital != null && input.totalCapital > 0 && currentAmount != null && input.availableCapital != null
      ? ((currentAmount + input.availableCapital) / input.totalCapital) * 100
      : null;
  const exposures = exposureForTicker(input.portfolioExposureMap, ticker);
  const drivers = positionDrivers({
    position: input.position,
    exposures,
    focusTicker: input.focusTicker,
    businessQualityAnalysis: input.businessQualityAnalysis,
    language: input.language,
  });
  const downside = downsideForPosition({
    position: input.position,
    ticker,
    focusTicker: input.focusTicker,
    independentBearCaseAnalysis: input.independentBearCaseAnalysis,
    language: input.language,
  });
  const uncertainties = positionUncertainties({
    ticker,
    focusTicker: input.focusTicker,
    position: input.position,
    exposures,
    businessQualityAnalysis: input.businessQualityAnalysis,
    independentBearCaseAnalysis: input.independentBearCaseAnalysis,
    language: input.language,
  });
  const valuation = positionValuation(input.position, input.language);
  return {
    id: `${input.kind}:${ticker}`,
    kind: input.kind,
    label:
      cleanText(input.position?.company?.name) ||
      (input.kind === "existing_position"
        ? `${ticker} ${es ? "posición existente" : "existing position"}`
        : `${ticker} ${es ? "candidato nuevo" : "new candidate"}`),
    ticker,
    currentAllocation: {
      amount: currentAmount,
      weightPct: currentWeightPct,
    },
    comparisonUnit: {
      amount: 1,
      incrementalPortfolioWeightPct:
        input.totalCapital != null && input.totalCapital > 0 ? (1 / input.totalCapital) * 100 : null,
    },
    currentValuation: valuation,
    expectedFundamentalDrivers: drivers.length
      ? drivers
      : [es ? "No hay suficientes motores fundamentales verificados." : "Verified fundamental drivers are insufficient."],
    downsideScenarios: downside.length
      ? downside
      : [es ? "No hay un escenario bajista verificable completo." : "A complete, verifiable downside case is unavailable."],
    liquidity: liquidityForPosition(marketItem, input.language),
    portfolioExposure: {
      dependencies: exposures,
      summary: exposures.length
        ? es
          ? `${exposures.length} dependencia(s) económica(s) verificadas; revisar el mapa de exposición para los vínculos compartidos.`
          : `${exposures.length} verified economic dependency link(s); review the exposure map for shared connections.`
        : es
          ? "No se estableció una exposición económica verificable."
          : "No verified economic exposure was established.",
    },
    existingConcentration: {
      currentWeightPct,
      hypotheticalWeightIfAllAvailableCapitalAllocatedPct: fullDeploymentWeightPct,
      calculationBasis: es
        ? "Escenario matemático de asignar todo el capital disponible a esta alternativa; no es una recomendación."
        : "Mathematical scenario allocating all available capital to this alternative; it is not a recommendation.",
    },
    majorUncertainties: uncertainties,
    evidenceStatus:
      valuation.status === "unavailable"
        ? "insufficient"
        : uncertainties.length > 0 || exposures.length === 0
          ? "partial"
          : "ready",
  };
}

export function buildCapitalAllocationDashboard(input: {
  language?: "en" | "es";
  availableCapital?: number | null;
  focusTicker?: string | null;
  engine?: any;
  marketData?: any;
  investmentPolicy?: NeuroInvestmentPolicy | null;
  portfolioExposureMap?: PortfolioExposureMap | null;
  businessQualityAnalysis?: any;
  independentBearCaseAnalysis?: any;
  generatedAt?: string;
}): CapitalAllocationDashboard {
  const language = input.language === "es" ? "es" : "en";
  const es = language === "es";
  const availableCapital = nonNegative(input.availableCapital);
  const focusTicker = cleanTicker(input.focusTicker);
  const allPositions = Array.isArray(input.engine?.positions) ? input.engine.positions : [];
  const existingPositions = allPositions.filter((position: any) => !position?.researchOnly);
  const candidatePositions = allPositions.filter((position: any) => Boolean(position?.researchOnly));
  const existingValues: Array<number | null> = existingPositions.map((position: any) => nonNegative(position?.currentValue));
  const investedPortfolioValue = existingValues.some((value: number | null) => value == null)
    ? null
    : existingValues.reduce((sum: number, value: number | null) => sum + (value ?? 0), 0);
  const totalCapital =
    investedPortfolioValue == null || availableCapital == null
      ? null
      : investedPortfolioValue + availableCapital;

  const positionAlternatives = [
    ...existingPositions.map((position: any) =>
      buildPositionAlternative({
        position,
        kind: "existing_position",
        availableCapital,
        totalCapital,
        focusTicker,
        marketData: input.marketData,
        portfolioExposureMap: input.portfolioExposureMap,
        businessQualityAnalysis: input.businessQualityAnalysis,
        independentBearCaseAnalysis: input.independentBearCaseAnalysis,
        language,
      })
    ),
    ...candidatePositions.map((position: any) =>
      buildPositionAlternative({
        position,
        kind: "new_candidate",
        availableCapital,
        totalCapital,
        focusTicker,
        marketData: input.marketData,
        portfolioExposureMap: input.portfolioExposureMap,
        businessQualityAnalysis: input.businessQualityAnalysis,
        independentBearCaseAnalysis: input.independentBearCaseAnalysis,
        language,
      })
    ),
  ];

  const cashWeight =
    totalCapital != null && totalCapital > 0 && availableCapital != null
      ? (availableCapital / totalCapital) * 100
      : null;
  const cashAlternative: CapitalAllocationAlternative = {
    id: "cash:base_currency",
    kind: "cash",
    label: es ? "Efectivo disponible" : "Available cash",
    ticker: null,
    currentAllocation: { amount: availableCapital, weightPct: cashWeight },
    comparisonUnit: {
      amount: 1,
      incrementalPortfolioWeightPct: totalCapital != null && totalCapital > 0 ? (1 / totalCapital) * 100 : null,
    },
    currentValuation: {
      status: "not_applicable",
      marketPrice: 1,
      marketCapitalization: null,
      valuationStatus: "nominal_value",
      marginOfSafetyPct: null,
      referenceYieldPct: null,
      referenceDate: null,
      basis: es
        ? "Un dólar de efectivo equivale a un dólar nominal en la moneda base; esto no mide poder adquisitivo real."
        : "One dollar of cash equals one nominal dollar in the base currency; this does not measure real purchasing power.",
    },
    expectedFundamentalDrivers: uniqueText([
      input.investmentPolicy?.liquidityNeeds,
      es
        ? "La inflación, las tasas de corto plazo y la moneda base determinan el resultado económico real."
        : "Inflation, short-term rates, and the base currency determine the real economic outcome.",
    ]),
    downsideScenarios: [
      es
        ? "Pérdida de poder adquisitivo por inflación o depreciación de la moneda base."
        : "Loss of purchasing power through inflation or base-currency depreciation.",
      es
        ? "Riesgo operativo, de custodia o acceso depende de dónde se mantenga el efectivo."
        : "Operational, custody, and access risk depend on where cash is held.",
      es
        ? "El costo de oportunidad solo puede evaluarse contra alternativas suficientemente investigadas."
        : "Opportunity cost can only be assessed against sufficiently researched alternatives.",
    ],
    liquidity: {
      level: "high",
      marketVolume: null,
      basis: es
        ? "Liquidez nominal alta, sujeta a las reglas de retiro, liquidación y custodia de la cuenta."
        : "High nominal liquidity, subject to the account's withdrawal, settlement, and custody rules.",
    },
    portfolioExposure: {
      dependencies: [],
      summary: es
        ? "Exposición principal a inflación, moneda base y proveedor de custodia; no a un negocio operativo."
        : "Primary exposure is to inflation, base currency, and custody provider rather than an operating business.",
    },
    existingConcentration: {
      currentWeightPct: cashWeight,
      hypotheticalWeightIfAllAvailableCapitalAllocatedPct: cashWeight,
      calculationBasis: es
        ? "Mantener el efectivo conserva el peso actual del capital disponible."
        : "Keeping cash preserves the current weight of available capital.",
    },
    majorUncertainties: [
      es ? "Inflación futura y retorno real." : "Future inflation and real return.",
      es ? "Interés pagado por la cuenta, si alguno." : "Account interest, if any.",
      es ? "Términos de custodia, seguro y acceso." : "Custody, insurance, and access terms.",
    ],
    evidenceStatus: availableCapital != null && availableCapital > 0 ? "partial" : "insufficient",
  };

  const treasurySupported = policySupportsTreasuryCashManagement(input.investmentPolicy);
  const treasury = treasuryContext(input.marketData);
  const treasuryAlternative: CapitalAllocationAlternative | null = treasurySupported
    ? {
        id: "treasury_cash_management:configured_universe",
        kind: "treasury_cash_management",
        label: es
          ? "Treasury de corto plazo / manejo de efectivo"
          : "Short-term Treasury / cash management",
        ticker: null,
        currentAllocation: { amount: 0, weightPct: 0 },
        comparisonUnit: {
          amount: 1,
          incrementalPortfolioWeightPct: totalCapital != null && totalCapital > 0 ? (1 / totalCapital) * 100 : null,
        },
        currentValuation: {
          status: treasury.rate == null ? "unavailable" : "partial",
          marketPrice: null,
          marketCapitalization: null,
          valuationStatus: "specific_instrument_required",
          marginOfSafetyPct: null,
          referenceYieldPct: treasury.rate,
          referenceDate: treasury.date,
          basis: treasury.rate == null
            ? es
              ? "La política permite esta categoría, pero falta un instrumento, vencimiento, precio y rendimiento verificables."
              : "The policy permits this category, but a specific instrument, maturity, price, and verified yield are missing."
            : es
              ? "La tasa mostrada es contexto amplio de Treasury, no el yield ni el precio de un instrumento específico."
              : "The displayed rate is broad Treasury context, not the yield or price of a specific instrument.",
        },
        expectedFundamentalDrivers: [
          es ? "Tasas de política monetaria y curva de corto plazo." : "Policy rates and the short end of the yield curve.",
          es ? "Vencimiento, reinversión y estructura del instrumento seleccionado." : "Maturity, reinvestment, and structure of the selected instrument.",
          es ? "Gastos y tracking si se utiliza un ETF o fondo." : "Fees and tracking if an ETF or fund is used.",
        ],
        downsideScenarios: [
          es ? "Riesgo de reinversión cuando bajan las tasas." : "Reinvestment risk when rates decline.",
          es ? "Riesgo de precio si se vende antes del vencimiento." : "Price risk if sold before maturity.",
          es ? "Riesgo de tracking, gastos o liquidez para vehículos equivalentes." : "Tracking, fee, or liquidity risk for equivalent vehicles.",
        ],
        liquidity: {
          level: "unknown",
          marketVolume: null,
          basis: es
            ? "La liquidez depende del instrumento y vencimiento específico; la categoría por sí sola no la establece."
            : "Liquidity depends on the specific instrument and maturity; the category alone does not establish it.",
        },
        portfolioExposure: {
          dependencies: [
            {
              driver: "INTEREST_RATES",
              dependencyName: es ? "Tasas de corto plazo" : "Short-term interest rates",
              direction: "positive",
              magnitude: "unknown",
            },
          ],
          summary: es
            ? "Exposición directa a tasas de corto plazo, vencimiento y reinversión."
            : "Direct exposure to short-term rates, maturity, and reinvestment.",
        },
        existingConcentration: {
          currentWeightPct: 0,
          hypotheticalWeightIfAllAvailableCapitalAllocatedPct:
            totalCapital != null && totalCapital > 0 && availableCapital != null
              ? (availableCapital / totalCapital) * 100
              : null,
          calculationBasis: es
            ? "Escenario matemático de asignar todo el capital disponible a la categoría; no es una recomendación."
            : "Mathematical scenario allocating all available capital to the category; it is not a recommendation.",
        },
        majorUncertainties: [
          es ? "Instrumento y vencimiento todavía no configurados." : "Specific instrument and maturity are not configured.",
          es ? "Yield, precio, gastos, impuestos y términos de liquidación no verificados." : "Yield, price, fees, taxes, and settlement terms are unverified.",
        ],
        evidenceStatus: treasury.rate == null ? "insufficient" : "partial",
      }
    : null;

  const alternatives = [
    ...positionAlternatives,
    cashAlternative,
    ...(treasuryAlternative ? [treasuryAlternative] : []),
  ];
  const generatedAt = cleanText(input.generatedAt, new Date().toISOString(), 80);
  const traceRecords: FinancialTraceRecord[] = [
    financialFact({
      id: financialTraceId("capital-allocation", "availableCapital"),
      path: "capitalAllocation.availableCapital",
      label: "Available investment capital",
      value: availableCapital,
      source: "User research input",
      document: "Capital allocation request",
      reportingPeriod: generatedAt,
      publicationDate: generatedAt,
      currency: "USD",
      units: "USD",
    }),
    financialCalculation({
      id: financialTraceId("capital-allocation", "investedPortfolioValue"),
      path: "capitalAllocation.investedPortfolioValue",
      label: "Invested portfolio value",
      value: investedPortfolioValue,
      formula: "sum(existing position current values)",
      inputs: existingValues.length
        ? existingValues.map((value, index) => ({ name: `position_${index + 1}_currentValue`, value }))
        : [{ name: "existingPositionCount", value: 0 }],
      calculationTimestamp: generatedAt,
      reportingPeriod: generatedAt,
      currency: "USD",
      units: "USD",
    }),
    financialCalculation({
      id: financialTraceId("capital-allocation", "totalCapitalUnderReview"),
      path: "capitalAllocation.totalCapitalUnderReview",
      label: "Total capital under review",
      value: totalCapital,
      formula: "investedPortfolioValue + availableCapital",
      inputs: [
        { name: "investedPortfolioValue", value: investedPortfolioValue },
        { name: "availableCapital", value: availableCapital, traceId: financialTraceId("capital-allocation", "availableCapital") },
      ],
      calculationTimestamp: generatedAt,
      reportingPeriod: generatedAt,
      currency: "USD",
      units: "USD",
    }),
  ];
  alternatives.forEach((alternative, index) => {
    const scope = `capital-allocation.alternatives.${index}`;
    traceRecords.push(
      financialCalculation({
        id: financialTraceId(scope, "currentAllocation.amount"),
        path: `capitalAllocation.alternatives.${index}.currentAllocation.amount`,
        label: `${alternative.label} current allocation`,
        value: alternative.currentAllocation.amount,
        formula: alternative.kind === "existing_position" ? "current position market value" : "current allocated amount",
        inputs: [{ name: "currentAmount", value: alternative.currentAllocation.amount }],
        calculationTimestamp: generatedAt,
        reportingPeriod: generatedAt,
        currency: "USD",
        units: "USD",
      }),
      financialCalculation({
        id: financialTraceId(scope, "currentAllocation.weightPct"),
        path: `capitalAllocation.alternatives.${index}.currentAllocation.weightPct`,
        label: `${alternative.label} current allocation weight`,
        value: alternative.currentAllocation.weightPct,
        formula: "currentAllocationAmount / totalCapitalUnderReview * 100",
        inputs: [
          { name: "currentAllocationAmount", value: alternative.currentAllocation.amount },
          { name: "totalCapitalUnderReview", value: totalCapital },
        ],
        calculationTimestamp: generatedAt,
        reportingPeriod: generatedAt,
        currency: "N/A",
        units: "percent",
      }),
      financialCalculation({
        id: financialTraceId(scope, "hypotheticalWeightPct"),
        path: `capitalAllocation.alternatives.${index}.existingConcentration.hypotheticalWeightIfAllAvailableCapitalAllocatedPct`,
        label: `${alternative.label} full-deployment hypothetical weight`,
        value: alternative.existingConcentration.hypotheticalWeightIfAllAvailableCapitalAllocatedPct,
        classification: "ESTIMATE",
        formula: "(currentAllocationAmount + availableCapital) / totalCapitalUnderReview * 100",
        inputs: [
          { name: "currentAllocationAmount", value: alternative.currentAllocation.amount },
          { name: "availableCapital", value: availableCapital },
          { name: "totalCapitalUnderReview", value: totalCapital },
        ],
        calculationTimestamp: generatedAt,
        reportingPeriod: generatedAt,
        currency: "N/A",
        units: "percent",
      })
    );
  });
  const financialDataIntegrity = createFinancialIntegrityManifest(traceRecords, generatedAt);
  return {
    schemaVersion: "1.0",
    language,
    generatedAt,
    availableCapital,
    investedPortfolioValue,
    totalCapitalUnderReview: totalCapital,
    comparisonUnitAmount: 1,
    summary: es
      ? `Cada fila compara el mismo $1 de capital disponible. El efectivo permanece como una alternativa válida y ninguna fila es una asignación automática.`
      : `Each row compares the same $1 of available capital. Cash remains a valid alternative and no row is an automatic allocation.`,
    alternatives,
    cashState: {
      validPortfolioState: true,
      currentAmount: availableCapital,
      currentWeightPct: cashWeight,
      deploymentRequired: false,
    },
    treasuryCashManagement: {
      supportedByConfiguredUniverse: treasurySupported,
      included: Boolean(treasuryAlternative),
      reason: treasurySupported
        ? es
          ? "La política configurada permite explícitamente Treasury o instrumentos de manejo de efectivo."
          : "The configured policy explicitly permits Treasury or cash-management instruments."
        : es
          ? "No se incluyó: la política configurada no autoriza explícitamente esta categoría."
          : "Not included: the configured policy does not explicitly authorize this category.",
    },
    methodology: {
      automaticRanking: false,
      automaticAllocation: false,
      forceCapitalDeployment: false,
      cashIsResidualError: false,
      expectedReturnsGuaranteed: false,
      concentrationBasis: es
        ? "Valor actual de posiciones existentes más el efectivo disponible ingresado por el usuario."
        : "Current value of existing positions plus user-entered available cash.",
    },
    humanReviewRequired: true,
    financialDataIntegrity,
  };
}
