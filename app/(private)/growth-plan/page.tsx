// app/(private)/growth-plan/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/context/AuthContext";
import TopNav from "@/app/components/TopNav";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

import {
  calcRiskUsd,
  getDefaultSteps,
  getDefaultSuggestedRules,
  type GrowthPlan,
  type GrowthPlanRule,
  type GrowthPlanSteps,
  type GrowthPlanChecklistItem,
  type GrowthPlanStrategy,
  type GrowthPlanHistoryEntry,
  getGrowthPlanHistorySupabase,
  getGrowthPlanSupabaseByAccount,
  upsertGrowthPlanSupabase,
} from "@/lib/growthPlanSupabase";
import {
  buildPlanProjection,
  computeCommittedTradingDaysBetween,
  computeTradingDaysBetween as computeProjectedTradingDaysBetween,
  inferWithdrawalSettingsFromEvents,
  normalizeDepositSettings,
  normalizePlannedWithdrawals,
  normalizeWithdrawalSettings,
  selectTradingDaysByWeeklyAverage,
  type PlannedDepositSettings,
  type PlannedDepositEvent,
  type PlannedWithdrawalEvent,
  type PlannedWithdrawalSettings,
  type WithdrawalFrequency,
} from "@/lib/growthPlanProjection";
import {
  addTradingRunway,
  clampTradingRunwayAmount,
  getTradingCalendarProfile,
  getTradingRunwayLimit,
  inferTradingRunway,
  listTradingSessionsBetween,
  listTradingSessionsFrom,
  normalizeTradingInstrument,
  normalizeTradingRunwayUnit,
  type TradingInstrument,
  type TradingRunwayUnit,
} from "@/lib/tradingCalendar";
import {
  buildAdaptiveGrowthPlan,
  buildGrowthPlanFeasibility,
  getGrowthPlanOperatingPolicy,
  type AdaptiveGrowthPlan,
  type AdaptivePlanMilestone,
  type GrowthPlanEvidence,
  type GrowthPlanFeasibilityVerdict,
} from "@/lib/growthPlanFeasibility";

import { listCashflows, signedCashflowAmount } from "@/lib/cashflowsSupabase";
import { syncGrowthPlanProtectionRules } from "@/lib/alertsSupabase";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import {
  growthPlanDeadlineShortfallUsd,
  growthPlanDeadlineToleranceUsd,
  meetsGrowthPlanDeadlineApproximately,
  selectIdealDeadlineOption,
} from "@/lib/growthPlanIdealScenario";

/* ================= Helpers ================= */
const GROWTH_PLAN_DISCLOSURE_VERSION = "growth-plan-discipline-v1";

const toNum = (s: string, fb = 0) => {
  const v = Number(String(s ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(v) ? v : fb;
};
const clampInt = (n: number, lo = 0, hi = Number.MAX_SAFE_INTEGER) =>
  Math.max(lo, Math.min(hi, Math.floor(n)));
const currency = (n: number) => {
  const locale =
    typeof document !== "undefined"
      ? document.documentElement.lang || undefined
      : undefined;
  return n.toLocaleString(locale, { style: "currency", currency: "USD" });
};
const formatMoneyInputDraft = (value: string) => {
  const cleaned = String(value ?? "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [integerRaw = "", ...decimalParts] = cleaned.split(".");
  const integer = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (decimalParts.length === 0) return grouped;
  return `${grouped}.${decimalParts.join("").slice(0, 2)}`;
};
const formatMoneyInputValue = (value: string | number) => {
  const number = typeof value === "number" ? value : toNum(value, 0);
  if (!Number.isFinite(number)) return "0.00";
  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
const todayLong = () => {
  const locale =
    typeof document !== "undefined"
      ? document.documentElement.lang || undefined
      : undefined;
  return new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "2-digit" });
};

async function loadPdfTools() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable: autoTableModule.default };
}

const isoDate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

async function pushInboxEvent(params: {
  userId: string;
  title: string;
  message: string;
  category?: string;
}) {
  const { userId, title, message, category } = params;
  if (!userId || !message) return;
  try {
    const session = await supabaseBrowser.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) return;

    await fetch("/api/alerts/inbox", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title,
        message,
        category: category ?? "ai_coach",
      }),
    });
  } catch (err) {
    console.warn("[GrowthPlan] inbox event failed:", err);
  }
}

function toDateOnlyStr(value: unknown): string | null {
  if (!value) return null;
  const s = String(value);
  if (!s) return null;
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // If ISO datetime
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  // Try Date parse
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type PlanRow = {
  day: number;
  isoDate?: string;
  type: "goal" | "loss";
  pct: number;
  startBalance?: number;
  expectedUSD: number;
  depositUSD?: number;
  withdrawalUSD?: number;
  endBalance: number;
  cumulativeWithdrawals?: number;
};

function computeRequiredGoalPct(
  starting: number,
  target: number,
  totalDays: number,
  lossDaysPerWeek: number,
  lossPct: number
): { goalPctDecimal: number; totalLossDays: number; lossMultipliersProduct: number; goalDays: number } {
  const D = clampInt(totalDays, 0);
  if (D === 0 || starting <= 0 || target <= 0) {
    return { goalPctDecimal: 0, totalLossDays: 0, lossMultipliersProduct: 1, goalDays: 0 };
  }

  const perWeek = clampInt(lossDaysPerWeek, 0, 5);
  let totalLossDays = 0;
  let prodLoss = 1;

  for (let d = 1; d <= D; d++) {
    const dayInWeek = (d - 1) % 5;
    const isLoss = perWeek > 0 && dayInWeek < perWeek;
    if (isLoss) {
      totalLossDays++;
      prodLoss *= 1 - lossPct / 100;
    }
  }

  const goalDays = D - totalLossDays;
  const ratio = target / (starting * (prodLoss || 1));

  let g = 0;
  if (goalDays > 0 && ratio > 0) g = Math.pow(ratio, 1 / goalDays) - 1;
  if (!Number.isFinite(g) || g < 0) g = 0;

  return { goalPctDecimal: g, totalLossDays, lossMultipliersProduct: prodLoss, goalDays };
}

function buildBalancedPlanSuggested(
  starting: number,
  target: number,
  totalDays: number,
  lossDaysPerWeek: number,
  lossPct: number
): { rows: PlanRow[]; requiredGoalPct: number } {
  const { goalPctDecimal } = computeRequiredGoalPct(starting, target, totalDays, lossDaysPerWeek, lossPct);
  const goalPct = goalPctDecimal * 100;

  let bal = starting;
  const rows: PlanRow[] = [];
  const perWeek = clampInt(lossDaysPerWeek, 0, 5);

  for (let d = 1; d <= totalDays; d++) {
    const dayInWeek = (d - 1) % 5;
    const isLoss = perWeek > 0 && dayInWeek < perWeek;
    const pct = isLoss ? -lossPct : goalPct;
    const expectedUSD = bal * (pct / 100);
    const endBalance = bal + expectedUSD;
    rows.push({ day: d, type: isLoss ? "loss" : "goal", pct, expectedUSD, endBalance });
    bal = endBalance;
  }

  // drift correction to land exactly on target
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    const drift = target - last.endBalance;
    if (Math.abs(drift) > 0.01) {
      last.expectedUSD += drift;
      const prevBalance = rows.length > 1 ? rows[rows.length - 2].endBalance : starting;
      last.pct = prevBalance > 0 ? (last.expectedUSD / prevBalance) * 100 : last.pct;
      last.endBalance = target;
    }
  }

  return { rows, requiredGoalPct: goalPct };
}

type CadenceTarget = {
  targetEquity: number;
  targetDate: string | null;
  monthIndex?: number;
  weekIndex?: number;
  weeksInMonth?: number;
  monthGoal?: number;
  monthLabel?: string;
  monthStartBalance?: number;
  monthEndBalance?: number;
};

function buildWeeklyMilestonesFromMonthlyGoals(
  starting: number,
  target: number,
  startIso: string,
  targetIso: string,
  lossDaysPerWeek: number,
  maxDailyLossPercent: number
): CadenceTarget[] {
  if (starting <= 0 || target <= 0) return [];
  const tradingDays = listTradingSessionsBetween(startIso, targetIso, "stocks");
  if (tradingDays.length === 0) return [];
  const totalTradingDays = tradingDays.length;

  const plan = buildBalancedPlanSuggested(
    starting,
    target,
    totalTradingDays,
    lossDaysPerWeek,
    Math.max(0, maxDailyLossPercent)
  );
  const planRows = plan.rows;
  if (planRows.length === 0) return [];

  const monthMap = new Map<string, number[]>();
  for (let i = 0; i < tradingDays.length; i++) {
    const monthKey = tradingDays[i]?.slice(0, 7) ?? "";
    if (!monthKey) continue;
    const list = monthMap.get(monthKey) ?? [];
    list.push(i);
    monthMap.set(monthKey, list);
  }

  const milestones: CadenceTarget[] = [];
  let monthIndex = 0;
  for (const [monthKey, indices] of monthMap.entries()) {
    if (!indices.length) continue;
    monthIndex += 1;
    const startIndex = indices[0];
    const endIndex = indices[indices.length - 1];
    const monthStartBalance = startIndex > 0 ? planRows[startIndex - 1]?.endBalance ?? starting : starting;
    const monthEndBalance = planRows[endIndex]?.endBalance ?? planRows[planRows.length - 1]?.endBalance ?? target;
    const monthGoalProfit = Math.round(monthEndBalance - monthStartBalance);
    const weeksInMonth = Math.max(1, Math.ceil(indices.length / 5));

    for (let w = 1; w <= weeksInMonth; w++) {
      const weekEndIndex = Math.min(endIndex, startIndex + w * 5 - 1);
      const fraction = w / weeksInMonth;
      const targetEquity = Math.round(
        monthStartBalance + (monthEndBalance - monthStartBalance) * fraction
      );
      const targetDate = tradingDays[weekEndIndex] ?? tradingDays[tradingDays.length - 1] ?? targetIso;
      milestones.push({
        targetEquity,
        targetDate,
        monthIndex,
        weekIndex: w,
        weeksInMonth,
        monthGoal: monthGoalProfit,
        monthLabel: monthKey,
        monthStartBalance,
        monthEndBalance,
      });
    }
  }

  return milestones;
}

function formatMonthLabel(monthKey: string, lang: "en" | "es"): string {
  if (!monthKey) return "";
  const d = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return monthKey;
  const locale = lang === "es" ? "es-ES" : "en-US";
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(d);
}

async function loadLogoDataURL(src = "/neurotrader%20logo%20for%20Web.png"): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function generateAndDownloadPDF(
  rows: PlanRow[],
  meta: {
    name: string;
    startingBalance: number;
    targetBalance?: number;
    tradingDays: number;
    averageTradingDaysPerWeek: number;
    maxDailyLossPercent: number;
    lossDaysPerWeek: number;
    requiredGoalPct: number;
    explainRequired?: {
      goalDays: number;
      totalLossDays: number;
      prodLoss: number;
      totalPlannedDeposit?: number;
      plannedDepositCount?: number;
      totalPlannedWithdrawal?: number;
      plannedWithdrawalCount?: number;
    };
  },
  lang: "en" | "es"
) {
  const { jsPDF, autoTable } = await loadPdfTools();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const M = 56;
  const L = (en: string, es: string) => (lang === "es" ? es : en);

  let y = 48;
  const logo = await loadLogoDataURL();
  if (logo) {
    try {
      const props = doc.getImageProperties(logo);
      const maxW = 200;
      const maxH = 48;
      const scale = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * scale;
      const h = props.height * scale;
      doc.addImage(logo, "PNG", M, y, w, h, undefined, "FAST");
      y += h + 20;
    } catch {
      y += 8;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  const title = L("Trading Business Plan – Suggested Path", "Plan de Empresa de Trading – Ruta sugerida");
  doc.text(title, M, y);
  y += 32;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor("#334155");
  doc.text(`${L("Date", "Fecha")}: ${todayLong()}`, M, y);
  y += 26;

  doc.setTextColor("#0f172a");
  doc.text(`${L("Hello", "Hola")} ${meta.name || L("User", "Usuario")},`, M, y);
  y += 20;

  const chunks: string[] = [];
  chunks.push(
    L(
      `You start with ${currency(meta.startingBalance)} and want to reach ${currency(
        meta.targetBalance || 0
      )} in ${meta.tradingDays} trading day(s).`,
      `Comienzas con ${currency(meta.startingBalance)} y quieres llegar a ${currency(
        meta.targetBalance || 0
      )} en ${meta.tradingDays} día(s) de trading.`
    )
  );
  chunks.push(
    L(
      `The schedule below shows a suggested path based on your limits.`,
      `El calendario de abajo muestra una ruta sugerida basada en tus límites.`
    )
  );
  if (meta.explainRequired) {
    const { goalDays, totalLossDays } = meta.explainRequired;
    chunks.push(
      L(
        `Weekly pattern assumes ${meta.lossDaysPerWeek} loss day(s) inside ${meta.averageTradingDaysPerWeek} operating day(s) per week -> ${totalLossDays} loss day(s) and ${goalDays} goal-day(s).`,
        `El patrón semanal asume ${meta.lossDaysPerWeek} día(s) de pérdida dentro de ${meta.averageTradingDaysPerWeek} día(s) operativo(s) por semana -> ${totalLossDays} día(s) de pérdida y ${goalDays} día(s) de meta.`
      )
    );
    if ((meta.explainRequired.totalPlannedWithdrawal ?? 0) > 0) {
      chunks.push(
        L(
          `This projection also includes ${meta.explainRequired.plannedWithdrawalCount ?? 0} scheduled withdrawal(s) totaling ${currency(meta.explainRequired.totalPlannedWithdrawal ?? 0)}.`,
          `Esta proyección también incluye ${meta.explainRequired.plannedWithdrawalCount ?? 0} retiro(s) programado(s) por un total de ${currency(meta.explainRequired.totalPlannedWithdrawal ?? 0)}.`
        )
      );
    }
    if ((meta.explainRequired.totalPlannedDeposit ?? 0) > 0) {
      chunks.push(
        L(
          `This projection includes ${meta.explainRequired.plannedDepositCount ?? 0} scheduled contribution(s) totaling ${currency(meta.explainRequired.totalPlannedDeposit ?? 0)}. Contributions are not counted as trading return.`,
          `Esta proyección incluye ${meta.explainRequired.plannedDepositCount ?? 0} aportación(es) programada(s) por ${currency(meta.explainRequired.totalPlannedDeposit ?? 0)}. Las aportaciones no se cuentan como rendimiento de trading.`
        )
      );
    }
  }

  const paragraph = chunks.join(" ");
  const wrapped = doc.splitTextToSize(paragraph, 612 - M * 2);
  doc.text(wrapped, M, y);
  y += 18 + wrapped.length * 16;

  doc.setFontSize(10);
  doc.setTextColor("#64748b");
  const disclaimer = L(
    "Trading Business Plan projection for educational business-planning and discipline purposes only. Conditional scenarios are based on user inputs and are not forecasts, guarantees of profit, or individualized investment, trading, legal, tax, or accounting advice. Actual results may differ due to execution, market conditions, liquidity, slippage, fees, leverage, deposits, and withdrawals.",
    "Proyección del Plan de Empresa de Trading únicamente para planificación educativa del negocio y disciplina. Los escenarios condicionales se basan en los inputs del usuario y no son pronósticos, garantías de ganancias ni asesoría individualizada de inversión, trading, legal, contributiva o contable. Los resultados reales pueden diferir por ejecución, condiciones de mercado, liquidez, slippage, costos, apalancamiento, aportaciones y retiros."
  );
  const disclaimerWrapped = doc.splitTextToSize(disclaimer, 612 - M * 2);
  doc.text(disclaimerWrapped, M, y);
  y += 18 + disclaimerWrapped.length * 14;
  doc.setTextColor("#0f172a");
  doc.setFontSize(12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(L("Plan summary", "Resumen de tu plan"), M, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  const summaryBody: Array<[string, string]> = [
    [L("Starting balance", "Balance inicial"), currency(meta.startingBalance)],
    [L("Target balance", "Balance objetivo"), currency(meta.targetBalance || 0)],
    [L("Trading days", "Días de trading"), String(meta.tradingDays)],
    [L("Operating days/week", "Días operativos/sem"), String(meta.averageTradingDaysPerWeek)],
    [L("Estimated daily goal (goal-days only)", "Meta diaria estimada (solo días de meta)"), `${meta.requiredGoalPct.toFixed(3)}%`],
    [L("Max daily loss (%)", "Pérdida diaria máxima (%)"), `${meta.maxDailyLossPercent}%`],
    [L("Loss days per week", "Días de pérdida por semana"), String(meta.lossDaysPerWeek)],
  ];
  if ((meta.explainRequired?.totalPlannedWithdrawal ?? 0) > 0) {
    summaryBody.push([
      L("Planned withdrawals", "Retiros planificados"),
      `${currency(meta.explainRequired?.totalPlannedWithdrawal ?? 0)} (${meta.explainRequired?.plannedWithdrawalCount ?? 0})`,
    ]);
  }
  if ((meta.explainRequired?.totalPlannedDeposit ?? 0) > 0) {
    summaryBody.push([
      L("Planned contributions", "Aportaciones planificadas"),
      `${currency(meta.explainRequired?.totalPlannedDeposit ?? 0)} (${meta.explainRequired?.plannedDepositCount ?? 0})`,
    ]);
  }

  autoTable(doc, {
    startY: y + 6,
    margin: { left: M, right: M },
    styles: { fontSize: 12, cellPadding: 6 },
    headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42] },
    body: summaryBody,
    columns: [{ header: L("Field", "Campo") }, { header: L("Value", "Valor") }],
    theme: "grid",
  });

  y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 18 : y + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(L("How to read the table", "Cómo leer la tabla"), M, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const guide = L(
    "Each row is one trading day. Expected (USD) is the modeled trading result. Contributions and withdrawals are separate capital flows. Ending balance includes all three components.",
    "Cada fila es un día de trading. Esperado (USD) es el resultado modelado de trading. Aportaciones y retiros son flujos de capital separados. El balance final incluye los tres componentes."
  );
  const guideWrapped = doc.splitTextToSize(guide, 612 - M * 2);
  doc.text(guideWrapped, M, y);

  doc.addPage();
  const tableData = rows.map((r) => [
    r.day,
    r.type === "loss" ? L("Loss", "Pérdida") : L("Goal", "Meta"),
    `${r.pct.toFixed(3)}%`,
    currency(r.expectedUSD),
    currency(r.depositUSD ?? 0),
    currency(r.withdrawalUSD ?? 0),
    currency(r.endBalance),
  ]);

  autoTable(doc, {
    margin: { left: M, right: M, top: 56 },
    styles: { fontSize: 12, cellPadding: 6 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    head: [[L("Day", "Día"), L("Type", "Tipo de día"), L("% applied", "Meta diaria (%)"), L("Trading (USD)", "Trading (USD)"), L("Contribution", "Aportación"), L("Withdrawal", "Retiro"), L("Ending balance", "Balance final")]],
    body: tableData,
    theme: "grid",
    didDrawPage: () => {
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      const h = L(
        "Daily Schedule – Suggested Plan (Exact Target)",
        "Calendario diario – Plan sugerido (Meta exacta)"
      );
      doc.text(h, M, 40);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`${L("Page", "Página")} ${doc.getNumberOfPages()}`, 612 - M, 792 - 28, { align: "right" });
    },
  });

  doc.save("growth-plan.pdf");
}

function pushNeuroMessage(_message: string) {}

async function neuroReact(_event: string, _lang: "en" | "es", _data: any) {
  return null;
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndexZeroBased: number): number {
  return new Date(year, monthIndexZeroBased + 1, 0).getDate();
}

function buildIsoDate(year: number, monthIndexZeroBased: number, day: number): string {
  const safeMonth = Math.max(0, Math.min(11, monthIndexZeroBased));
  const safeDay = Math.max(1, Math.min(daysInMonth(year, safeMonth), day));
  return `${year}-${String(safeMonth + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function parseFlexibleDateInput(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month - 1)) {
      return buildIsoDate(year, month - 1, day);
    }
  }

  const mdy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month - 1)) {
      return buildIsoDate(year, month - 1, day);
    }
  }

  return null;
}

function prettyDateInput(value?: string | null) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function FlexibleDateField({
  id,
  label,
  value,
  onChange,
  lang,
  className,
  helperText,
  errorText,
  min,
  fallbackValue,
  onFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  lang: "en" | "es";
  className: string;
  helperText: string;
  errorText?: string | null;
  min?: string;
  fallbackValue?: string;
  onFocus?: () => void;
}) {
  const [textValue, setTextValue] = useState(prettyDateInput(value));
  const locale = lang === "es" ? "es-PR" : "en-US";

  useEffect(() => {
    setTextValue(prettyDateInput(value));
  }, [value]);

  const selectedDate = value ? new Date(`${value}T00:00:00`) : null;
  const selectedYear = selectedDate?.getFullYear() ?? new Date().getFullYear();
  const selectedMonth = selectedDate?.getMonth() ?? new Date().getMonth();
  const selectedDay = selectedDate?.getDate() ?? new Date().getDate();
  const currentYear = new Date().getFullYear();

  const yearOptions = useMemo(() => {
    const start = Math.min(currentYear - 5, selectedYear - 8);
    const end = Math.max(currentYear + 10, selectedYear + 8);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentYear, selectedYear]);

  const monthOptions = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "long" });
    return Array.from({ length: 12 }, (_, monthIndex) => ({
      value: monthIndex,
      label: formatter.format(new Date(2026, monthIndex, 1)),
    }));
  }, [locale]);

  function commitText(nextRaw: string) {
    const parsed = parseFlexibleDateInput(nextRaw);
    if (parsed) {
      onChange(parsed);
      setTextValue(prettyDateInput(parsed));
      return;
    }
    if (!nextRaw.trim()) {
      if (fallbackValue) {
        onChange(fallbackValue);
        setTextValue(prettyDateInput(fallbackValue));
      } else {
        onChange("");
        setTextValue("");
      }
      return;
    }
    setTextValue(prettyDateInput(value));
  }

  function updateMonth(monthIndex: number) {
    const nextIso = buildIsoDate(selectedYear, monthIndex, selectedDay);
    onChange(nextIso);
  }

  function updateYear(year: number) {
    const nextIso = buildIsoDate(year, selectedMonth, selectedDay);
    onChange(nextIso);
  }

  return (
    <div>
      <label className="mb-1 block text-slate-300" htmlFor={id}>
        {label}
      </label>
      <div className="grid gap-3 md:grid-cols-[1.15fr_0.9fr_0.75fr]">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={textValue}
          onFocus={onFocus}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={(e) => commitText(e.target.value)}
          placeholder={lang === "es" ? "MM/DD/AAAA o AAAA-MM-DD" : "MM/DD/YYYY or YYYY-MM-DD"}
          className={className}
        />
        <select
          value={String(selectedMonth)}
          onFocus={onFocus}
          onChange={(e) => updateMonth(Number(e.target.value))}
          className={className}
        >
          {monthOptions.map((month) => (
            <option key={month.value} value={String(month.value)}>
              {month.label}
            </option>
          ))}
        </select>
        <select
          value={String(selectedYear)}
          onFocus={onFocus}
          onChange={(e) => updateYear(Number(e.target.value))}
          className={className}
        >
          {yearOptions.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3">
        <input
          type="date"
          value={value}
          min={min}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      </div>
      {errorText ? (
        <p className="mt-1 text-xs text-rose-300">{errorText}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">{helperText}</p>
      )}
    </div>
  );
}

function addCalendarDays(startIso: string, days: number): string {
  const start = new Date(`${startIso}T00:00:00`);
  if (!Number.isFinite(start.getTime())) return startIso;
  start.setDate(start.getDate() + Math.max(0, Math.floor(days)));
  return start.toISOString().slice(0, 10);
}

function calendarDaysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0;
  const diff = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diff / 86_400_000));
}

function scaleFollowOnRisk(riskPct: number, mode: "same" | "lower" | "higher"): number {
  if (!Number.isFinite(riskPct) || riskPct <= 0) return 0;
  if (mode === "lower") return Math.max(0.25, Number((riskPct * 0.8).toFixed(2)));
  if (mode === "higher") return Math.min(10, Number((riskPct * 1.2).toFixed(2)));
  return Number(riskPct.toFixed(2));
}

function resolveAverageTradingDaysPerWeek(
  value: number | string | null | undefined,
  maximum = 5
) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return clampInt(n, 1, maximum);
}

function listCommittedTradingDaysFrom(
  startIso: string,
  count: number,
  averageTradingDaysPerWeek: number,
  tradingInstrument: TradingInstrument
): string[] {
  const sessionsPerWeek = getTradingCalendarProfile(tradingInstrument).sessionsPerWeek;
  const daysPerWeek = resolveAverageTradingDaysPerWeek(
    averageTradingDaysPerWeek,
    sessionsPerWeek
  );
  if (count <= 0) return [];
  const rawCount =
    daysPerWeek >= sessionsPerWeek
      ? count
      : Math.ceil((count * sessionsPerWeek) / Math.max(1, daysPerWeek)) + 20;
  const rawTradingDays = listTradingSessionsFrom(
    startIso,
    Math.min(5000, Math.max(count, rawCount)),
    tradingInstrument
  );
  return selectTradingDaysByWeeklyAverage(
    rawTradingDays,
    daysPerWeek,
    sessionsPerWeek
  ).slice(0, count);
}

/* ================= Wizard ================= */
type WizardStep = 0 | 1 | 2 | 3 | 4;

const STEP_ORDER: WizardStep[] = [0, 1, 2, 3, 4];

const STEP_TITLES_EN: Record<WizardStep, string> = {
  0: "Goal & Numbers",
  1: "Operating System",
  2: "Analysis",
  3: "Execution Record",
  4: "Strategy & Rules",
};

const STEP_TITLES_ES: Record<WizardStep, string> = {
  0: "Meta y números",
  1: "Sistema operativo",
  2: "Análisis",
  3: "Registro de ejecución",
  4: "Estrategia y reglas",
};

type GrowthPlanLocale = "en" | "es";

type PlannedWithdrawal = PlannedWithdrawalEvent;
type PlannedDeposit = PlannedDepositEvent;

type PlannedWithdrawalMode = "undecided" | "none" | "scheduled";

type PlannedDepositMode = PlannedWithdrawalMode;

type PlanPhase = {
  id: string;
  title?: string | null;
  targetEquity: number;
  targetDate?: string | null;
  status?: "pending" | "completed";
  completedAt?: string | null;
  monthIndex?: number;
  weekIndex?: number;
  weeksInMonth?: number;
  monthGoal?: number;
  monthLabel?: string | null;
  monthStartBalance?: number;
  monthEndBalance?: number;
  monthDeposit?: number;
  monthWithdrawal?: number;
  cumulativeDeposits?: number;
  cumulativeWithdrawals?: number;
};

type BusinessScenarioId = "conservative" | "moderate" | "aggressive";

type OperatingReturnMode = BusinessScenarioId | "manual" | "";
type FinalPlanId = Exclude<OperatingReturnMode, "">;

type BusinessScenario = {
  id: BusinessScenarioId;
  title: string;
  summary: string;
  dailyGoalPct: number;
  expectedLossDayPct: number;
  maxDailyLossPct: number;
  riskPerTradePct: number;
  lossDaysPerWeek: number;
  projectedEndBalance: number;
  chart: Array<{ label: string; value: number }>;
  recommended: boolean;
};

type PlanRealismReview = {
  verdict: GrowthPlanFeasibilityVerdict;
  shouldSurface: boolean;
  requiredGoalPct: number;
  requiredCompoundDailyPct: number;
  scenarioDailyGoalPct: number;
  scenarioProjectedBalance: number;
  scenarioGapUsd: number;
  scenarioGapPct: number;
  targetMultiple: number;
  targetReturnPct: number;
  annualizedTargetReturnPct: number | null;
  tradingDays: number;
  modeledGoalDays: number;
  modeledLossDays: number;
  modeledMaxLossPct: number;
  scenarioCoveragePct: number;
  evidenceDepth: "none" | "limited" | "developing" | "established";
  evidenceSessions: number;
  evidenceTrades: number;
  evidenceSupportsPositiveEdge: boolean | null;
  evidenceUpdatedAtIso: string | null;
  flags: string[];
  estimatedCompletionDate: string | null;
  policyBand: "aligned" | "needs_validation" | "high_risk" | "incomplete";
};

type AiPlanAdvisorPhase = {
  title: string;
  targetEquity: number;
  targetDate: string | null;
  dailyGoalPct: number;
  tradingDays: number | null;
  operatingWeeks: number | null;
  estimatedMonths: number | null;
  guardrail: string;
};

type AiPlanAdvisor = {
  shouldSurface: boolean;
  headline: string;
  body: string;
  scenarioTitle: string;
  recommendedDailyGoalPct: number;
  maxDailyLossPct: number;
  riskPerTradePct: number;
  lossDaysPerWeek: number;
  totalTradingDays: number | null;
  totalOperatingWeeks: number | null;
  totalEstimatedMonths: number | null;
  recommendedCompletionDate: string | null;
  phases: AiPlanAdvisorPhase[];
  verdict: AdaptiveGrowthPlan["verdict"];
  confidence: AdaptiveGrowthPlan["confidence"];
  isProvisional: boolean;
  requestedTargetDate: string | null;
  targetProjectionGoalDayPct: number;
  targetProjectionBalance: number;
  targetProjectionCoveragePct: number;
  requestedGrossProjectedBalance: number;
  requestedGrossTradingGrowthUsd: number;
  requestedCostDragUsd: number;
  costsConsumePercentageEdge: boolean;
  requestedProjectedBalance: number;
  requestedCoveragePct: number;
  requestedShortfallUsd: number;
  expectedLossDayPct: number;
  modeledNetReturnPerSessionPct: number;
  modeledWeeklyReturnPct: number;
  modeledAnnualCycles: number;
  modeledAnnualReturnPct: number;
  qualificationRequired: boolean;
  qualificationMinimumSessions: number;
  nextMilestone: AdaptivePlanMilestone | null;
  weeklyMilestones: AdaptivePlanMilestone[];
  monthlyMilestones: AdaptivePlanMilestone[];
  quarterlyMilestones: AdaptivePlanMilestone[];
  semiannualMilestones: AdaptivePlanMilestone[];
  annualMilestones: AdaptivePlanMilestone[];
};

type BalanceSeriesPoint = {
  date: string;
  value: number;
};

type GrowthPlanResearchReview = {
  selectedScenarioId?: string;
  selectedScenarioTitle?: string;
  verdict?: string;
  headline: string;
  summary: string;
  scenarioAnalysis?: string;
  deadlineAnalysis?: string;
  riskAnalysis?: string;
  evidenceAnalysis?: string;
  comparison?: string;
  observations: string[];
  actions: string[];
  limitations: string[];
  methodologyNote: string;
  model: string;
  usedResearchCorpus: boolean;
  generatedAt: string;
};

function buildScenarioChart(
  starting: number,
  tradingDays: number,
  dailyGoalPct: number,
  expectedLossDayPct: number,
  lossDaysPerWeek: number,
  operatingDaysPerWeek: number
) {
  const days = Math.max(20, Math.min(260, tradingDays || 60));
  const points = Math.min(12, Math.max(6, Math.ceil(days / 10)));
  const out: Array<{ label: string; value: number }> = [];
  for (let i = 0; i < points; i++) {
    const day = Math.round((days / (points - 1)) * i);
    let value = starting;
    for (let session = 0; session < day; session += 1) {
      const isLossDay =
        lossDaysPerWeek > 0 && session % Math.max(1, operatingDaysPerWeek) < lossDaysPerWeek;
      value = Math.max(
        0,
        value * (1 + (isLossDay ? -expectedLossDayPct : dailyGoalPct) / 100)
      );
    }
    out.push({ label: day === 0 ? "0" : String(day), value: Number(value.toFixed(2)) });
  }
  return out;
}

function buildBusinessScenarios(params: {
  startingBalance: number;
  tradingDays: number;
  averageTradingDaysPerWeek: number;
  isEs: boolean;
}) {
  const { startingBalance, tradingDays, averageTradingDaysPerWeek, isEs } = params;
  const scored = (["conservative", "moderate", "aggressive"] as BusinessScenarioId[]).map((id) => {
    const policy = getGrowthPlanOperatingPolicy(id);
    const dailyGoalPct = policy.goalDayReturnPct;
    const riskPerTradePct = policy.riskPerTradePct;
    const maxDailyLossPct = policy.maxDailyLossPct;
    const chart = buildScenarioChart(
      Math.max(0, startingBalance || 1000),
      tradingDays || 60,
      dailyGoalPct,
      policy.expectedLossDayPct,
      policy.lossDaysPerWeek,
      averageTradingDaysPerWeek
    );
    const projectedEndBalance = chart[chart.length - 1]?.value ?? 0;
    return {
      id,
      title:
        id === "conservative"
          ? isEs
            ? "Conservador"
            : "Conservative"
          : id === "moderate"
            ? isEs
              ? "Moderado"
              : "Moderate"
            : isEs
              ? "Agresivo"
              : "Aggressive",
      summary:
        id === "conservative"
          ? isEs
            ? "Prioriza supervivencia, baja variación y cumplimiento."
            : "Prioritizes survival, low variance, and compliance."
          : id === "moderate"
            ? isEs
              ? "Balancea crecimiento con límites claros de daño."
              : "Balances growth with clear damage limits."
            : isEs
              ? "Busca expansión más rápida con reglas estrictas."
              : "Targets faster expansion with strict rules.",
      dailyGoalPct,
      expectedLossDayPct: policy.expectedLossDayPct,
      maxDailyLossPct,
      riskPerTradePct,
      lossDaysPerWeek: policy.lossDaysPerWeek,
      projectedEndBalance,
      chart,
      recommended: false,
    } satisfies BusinessScenario;
  });

  return scored.map((item) => ({ ...item, recommended: item.id === "moderate" }));
}

function simulateScenarioToTarget(params: {
  starting: number;
  target: number;
  startIso: string;
  deadlineIso: string;
  averageTradingDaysPerWeek?: number;
  scenario: BusinessScenario;
  plannedDeposits?: PlannedDeposit[];
  plannedWithdrawals?: PlannedWithdrawal[];
  tradingInstrument: TradingInstrument;
}) {
  const {
    starting,
    target,
    startIso,
    deadlineIso,
    averageTradingDaysPerWeek = 5,
    scenario,
    plannedDeposits = [],
    plannedWithdrawals = [],
    tradingInstrument,
  } = params;
  const sessionsPerWeek = getTradingCalendarProfile(tradingInstrument).sessionsPerWeek;
  const daysPerCycle = resolveAverageTradingDaysPerWeek(
    averageTradingDaysPerWeek,
    sessionsPerWeek
  );
  const deadlineTradingDays = selectTradingDaysByWeeklyAverage(
    listTradingSessionsBetween(startIso, deadlineIso, tradingInstrument),
    daysPerCycle,
    sessionsPerWeek
  );
  const horizonDays = Math.max(deadlineTradingDays.length, 1);
  const simulationDays = listCommittedTradingDaysFrom(
    startIso,
    Math.max(horizonDays, 1300),
    daysPerCycle,
    tradingInstrument
  );
  const withdrawalByDate = new Map<string, number>();
  const depositByDate = new Map<string, number>();
  for (const deposit of plannedDeposits) {
    const date = toDateOnlyStr(deposit.plannedDate);
    const amount = Math.max(0, Number(deposit.amount ?? 0));
    if (!date || amount <= 0) continue;
    depositByDate.set(date, (depositByDate.get(date) ?? 0) + amount);
  }
  for (const withdrawal of plannedWithdrawals) {
    const date = toDateOnlyStr(withdrawal.plannedDate);
    const amount = Math.max(0, Number(withdrawal.amount ?? 0));
    if (!date || amount <= 0) continue;
    withdrawalByDate.set(date, (withdrawalByDate.get(date) ?? 0) + amount);
  }

  let balance = Math.max(0, starting);
  let projectedAtDeadline = balance;
  let completionDate: string | null = balance >= target ? startIso : null;
  let tradingDaysToTarget: number | null = balance >= target ? 0 : null;
  const perWeekLossDays = clampInt(scenario.lossDaysPerWeek, 0, daysPerCycle);

  for (let i = 0; i < simulationDays.length; i += 1) {
    const date = simulationDays[i];
    const isLossDay = perWeekLossDays > 0 && i % daysPerCycle < perWeekLossDays;
    const pct = isLossDay
      ? -Math.max(0, scenario.expectedLossDayPct)
      : Math.max(0, scenario.dailyGoalPct);
    balance = Math.max(0, balance + balance * (pct / 100));
    balance = Math.max(
      0,
      balance + (depositByDate.get(date) ?? 0) - (withdrawalByDate.get(date) ?? 0)
    );

    if (i === horizonDays - 1) projectedAtDeadline = balance;
    if (!completionDate && target > 0 && balance >= target) {
      completionDate = date;
      tradingDaysToTarget = i + 1;
      if (i >= horizonDays - 1) break;
    }
  }

  return {
    projectedAtDeadline: Number(projectedAtDeadline.toFixed(2)),
    completionDate,
    tradingDaysToTarget,
  };
}

function buildPlanRealismReview(params: {
  starting: number;
  target: number;
  startIso: string;
  targetIso: string;
  tradingDays: number;
  averageTradingDaysPerWeek: number;
  requiredGoalPct: number;
  planLossDaysPerWeek: number;
  planMaxDailyLossPct: number;
  scenario: BusinessScenario | null;
  plannedDeposits?: PlannedDeposit[];
  plannedWithdrawals?: PlannedWithdrawal[];
  tradingInstrument: TradingInstrument;
  evidence?: GrowthPlanEvidence | null;
}): PlanRealismReview {
  const {
    starting,
    target,
    startIso,
    targetIso,
    tradingDays,
    averageTradingDaysPerWeek,
    requiredGoalPct,
    planLossDaysPerWeek,
    planMaxDailyLossPct,
    scenario,
    plannedDeposits,
    plannedWithdrawals,
    tradingInstrument,
    evidence,
  } = params;
  const targetMultiple = starting > 0 && target > 0 ? target / starting : 0;
  const requiredCompoundDailyPct =
    starting > 0 && target > 0 && tradingDays > 0
      ? (Math.pow(target / starting, 1 / tradingDays) - 1) * 100
      : 0;

  if (!scenario || starting <= 0 || target <= 0 || !targetIso || tradingDays <= 0 || target <= starting) {
    return {
      verdict: "incomplete",
      shouldSurface: false,
      requiredGoalPct: Math.max(0, requiredGoalPct),
      requiredCompoundDailyPct: Math.max(0, requiredCompoundDailyPct),
      scenarioDailyGoalPct: scenario?.dailyGoalPct ?? 0,
      scenarioProjectedBalance: starting,
      scenarioGapUsd: 0,
      scenarioGapPct: 0,
      targetMultiple,
      targetReturnPct: 0,
      annualizedTargetReturnPct: null,
      tradingDays,
      modeledGoalDays: 0,
      modeledLossDays: 0,
      modeledMaxLossPct: Math.max(0, planMaxDailyLossPct),
      scenarioCoveragePct: 0,
      evidenceDepth: "none",
      evidenceSessions: 0,
      evidenceTrades: 0,
      evidenceSupportsPositiveEdge: null,
      evidenceUpdatedAtIso: null,
      flags: [],
      estimatedCompletionDate: null,
      policyBand: "incomplete",
    };
  }

  const simulation = simulateScenarioToTarget({
    starting,
    target,
    startIso,
    deadlineIso: targetIso,
    averageTradingDaysPerWeek,
    scenario,
    plannedDeposits,
    plannedWithdrawals,
    tradingInstrument,
  });
  const scenarioProjectedBalance = simulation.projectedAtDeadline;
  const scenarioGapUsd = Math.max(0, target - scenarioProjectedBalance);
  const scenarioGapPct = target > 0 ? (scenarioGapUsd / target) * 100 : 0;
  const feasibility = buildGrowthPlanFeasibility({
    starting,
    target,
    startIso,
    targetIso,
    tradingDays,
    averageTradingDaysPerWeek,
    lossDaysPerWeek: planLossDaysPerWeek,
    modeledMaxLossPct: planMaxDailyLossPct,
    requiredGoalDayPct: requiredGoalPct,
    scenarioDailyGoalPct: scenario.dailyGoalPct,
    scenarioProjectedBalance,
    evidence,
  });
  const verdict = feasibility.verdict;

  return {
    verdict,
    shouldSurface: verdict !== "incomplete",
    requiredGoalPct: Math.max(0, requiredGoalPct),
    requiredCompoundDailyPct: Math.max(0, requiredCompoundDailyPct),
    scenarioDailyGoalPct: scenario.dailyGoalPct,
    scenarioProjectedBalance,
    scenarioGapUsd,
    scenarioGapPct,
    targetMultiple,
    targetReturnPct: feasibility.targetReturnPct,
    annualizedTargetReturnPct: feasibility.annualizedTargetReturnPct,
    tradingDays,
    modeledGoalDays: feasibility.modeledGoalDays,
    modeledLossDays: feasibility.modeledLossDays,
    modeledMaxLossPct: feasibility.modeledMaxLossPct,
    scenarioCoveragePct: feasibility.scenarioCoveragePct,
    evidenceDepth: feasibility.evidenceDepth,
    evidenceSessions: feasibility.evidenceSessions,
    evidenceTrades: feasibility.evidenceTrades,
    evidenceSupportsPositiveEdge: feasibility.evidenceSupportsPositiveEdge,
    evidenceUpdatedAtIso: feasibility.evidenceUpdatedAtIso,
    flags: feasibility.flags,
    estimatedCompletionDate: simulation.completionDate,
    policyBand:
      verdict === "high_risk"
        ? "high_risk"
        : verdict === "unvalidated" || verdict === "stretch"
          ? "needs_validation"
          : "aligned",
  };
}

function buildLegacyAiPlanAdvisor(params: {
  starting: number;
  target: number;
  startIso: string;
  averageTradingDaysPerWeek: number;
  scenario: BusinessScenario | null;
  plannedWithdrawals?: PlannedWithdrawal[];
  tradingInstrument: TradingInstrument;
  isEs: boolean;
}) {
  const {
    starting,
    target,
    startIso,
    averageTradingDaysPerWeek,
    scenario,
    plannedWithdrawals,
    tradingInstrument,
    isEs,
  } = params;
  const L = (en: string, es: string) => (isEs ? es : en);

  if (!scenario || starting <= 0 || target <= 0 || target <= starting) {
    return {
      shouldSurface: false,
      headline: "",
      body: "",
      scenarioTitle: "",
      recommendedDailyGoalPct: 0,
      maxDailyLossPct: 0,
      riskPerTradePct: 0,
      lossDaysPerWeek: 0,
      totalTradingDays: null,
      totalOperatingWeeks: null,
      totalEstimatedMonths: null,
      recommendedCompletionDate: null,
      phases: [],
    };
  }

  const multiple = target / starting;
  const rawTargets =
    multiple >= 30
      ? [starting * 10, starting * 30, target]
      : multiple >= 10
        ? [starting * 3, starting * 7, target]
        : multiple >= 4
          ? [starting * 2, starting * 3, target]
          : [starting + (target - starting) * 0.5, target];

  const phaseTargets = rawTargets
    .map((value) => Number(Math.min(target, Math.max(starting, value)).toFixed(2)))
    .filter((value, index, arr) => value > starting && arr.indexOf(value) === index);

  let phaseStartIso = startIso;
  let phaseStartBalance = starting;
  const daysPerWeek = resolveAverageTradingDaysPerWeek(
    averageTradingDaysPerWeek,
    getTradingCalendarProfile(tradingInstrument).sessionsPerWeek
  );

  const phases = phaseTargets.map((targetEquity, index) => {
    const scaledScenario: BusinessScenario = {
      ...scenario,
      lossDaysPerWeek: clampInt(scenario.lossDaysPerWeek, 0, daysPerWeek),
    };
    const simulation = simulateScenarioToTarget({
      starting: phaseStartBalance,
      target: targetEquity,
      startIso: phaseStartIso,
      deadlineIso: addCalendarDays(phaseStartIso, 1200),
      averageTradingDaysPerWeek: daysPerWeek,
      scenario: scaledScenario,
      plannedWithdrawals: index === phaseTargets.length - 1 ? plannedWithdrawals : [],
      tradingInstrument,
    });
    const targetDate = simulation.completionDate;
    if (targetDate) {
      phaseStartIso = addCalendarDays(targetDate, 1);
      phaseStartBalance = targetEquity;
    }
    const tradingDays = simulation.tradingDaysToTarget;
    const operatingWeeks = tradingDays === null ? null : Math.max(1, Math.ceil(tradingDays / daysPerWeek));
    const estimatedMonths = operatingWeeks === null ? null : Number((operatingWeeks / 4.345).toFixed(1));

    return {
      title: L(`Phase ${index + 1}`, `Fase ${index + 1}`),
      targetEquity,
      targetDate,
      dailyGoalPct: scaledScenario.dailyGoalPct,
      tradingDays,
      operatingWeeks,
      estimatedMonths,
      guardrail:
        index === 0
          ? L(
              "Do not scale until rule compliance and journal consistency are stable.",
              "No escales hasta que el cumplimiento de reglas y el journal estén estables."
            )
          : index === phaseTargets.length - 1
            ? L(
                "Only push this phase after the prior checkpoint is proven with real execution.",
                "Solo empuja esta fase después de probar el checkpoint anterior con ejecución real."
              )
            : L(
                "Raise the pace only after the prior phase is complete and drawdown stayed inside policy.",
                "Sube el ritmo solo después de completar la fase previa y mantener el drawdown dentro de política."
              ),
    };
  });

  const finalPhase = phases[phases.length - 1] ?? null;
  const phasesComplete = phases.length > 0 && phases.every((phase) => phase.tradingDays !== null);
  const totalTradingDays = phasesComplete
    ? phases.reduce((sum, phase) => sum + (phase.tradingDays ?? 0), 0)
    : null;
  const totalOperatingWeeks =
    totalTradingDays === null ? null : Math.max(1, Math.ceil(totalTradingDays / daysPerWeek));
  const totalEstimatedMonths =
    totalOperatingWeeks === null ? null : Number((totalOperatingWeeks / 4.345).toFixed(1));

  return {
    shouldSurface: phases.length > 0,
    headline: L(
      `Recommended path: ${scenario.dailyGoalPct.toFixed(2)}% on goal-days, executed in phases.`,
      `Ruta recomendada: ${scenario.dailyGoalPct.toFixed(2)}% en días de meta, ejecutada por fases.`
    ),
    body: L(
      `This estimate uses ${daysPerWeek} operating day(s) per week, ${scenario.lossDaysPerWeek} planned loss day(s), a ${scenario.maxDailyLossPct.toFixed(2)}% daily-loss ceiling, and ${scenario.riskPerTradePct.toFixed(2)}% risk per trade. The percentage stays constant across phases so growth comes from compounding, not from increasing risk.`,
      `Este estimado usa ${daysPerWeek} día(s) operativos por semana, ${scenario.lossDaysPerWeek} día(s) de pérdida planificados, un límite de pérdida diaria de ${scenario.maxDailyLossPct.toFixed(2)}% y ${scenario.riskPerTradePct.toFixed(2)}% de riesgo por trade. El porcentaje se mantiene constante entre fases para que el crecimiento venga del compounding, no de aumentar el riesgo.`
    ),
    scenarioTitle: scenario.title,
    recommendedDailyGoalPct: scenario.dailyGoalPct,
    maxDailyLossPct: scenario.maxDailyLossPct,
    riskPerTradePct: scenario.riskPerTradePct,
    lossDaysPerWeek: scenario.lossDaysPerWeek,
    totalTradingDays,
    totalOperatingWeeks,
    totalEstimatedMonths,
    recommendedCompletionDate: finalPhase?.targetDate ?? null,
    phases,
  };
}

function buildAdaptivePlanAdvisor(params: {
  adaptivePlan: AdaptiveGrowthPlan;
  scenario: BusinessScenario | null;
  isEs: boolean;
}): AiPlanAdvisor {
  const { adaptivePlan, scenario, isEs } = params;
  const L = (en: string, es: string) => (isEs ? es : en);
  const completionMonths = adaptivePlan.recommendedCalendarMonths;
  const phases = adaptivePlan.quarterlyMilestones.slice(0, 6).map((milestone, index) => ({
    title: L(`Quarter ${index + 1}`, `Trimestre ${index + 1}`),
    targetEquity: milestone.targetBalance,
    targetDate: milestone.targetDate,
    dailyGoalPct: adaptivePlan.recommendedGoalDayPct,
    tradingDays: milestone.sessionCount,
    operatingWeeks: Math.max(
      1,
      Math.ceil(milestone.sessionCount / adaptivePlan.operatingDaysPerWeek)
    ),
    estimatedMonths: 3,
    guardrail: L(
      "Advance only if the prior checkpoint was reached without breaking the loss and risk rules.",
      "Avanza solo si alcanzaste el checkpoint anterior sin romper las reglas de pérdida y riesgo."
    ),
  }));

  const headline =
    adaptivePlan.verdict === "not_supported"
      ? L(
          adaptivePlan.mathematicallyPossible
            ? `The target path is mathematically defined at ${adaptivePlan.targetProjectionGoalDayPct.toFixed(3)}% on goal-days. The selected operating model does not support that pace yet.`
            : "The target cannot be resolved with the current mathematical inputs.",
          adaptivePlan.mathematicallyPossible
            ? `La trayectoria hacia la meta está matemáticamente definida en ${adaptivePlan.targetProjectionGoalDayPct.toFixed(3)}% durante los días de meta. El modelo operativo seleccionado todavía no respalda ese ritmo.`
            : "La meta no se puede resolver con los datos matemáticos actuales."
        )
      : adaptivePlan.verdict === "no_validated_edge"
        ? adaptivePlan.recommendedCompletionDate && adaptivePlan.flags.includes("planned_deposits_included")
          ? L(
              `Trading growth is not validated. Scheduled funding points to ${formatPlanDate(adaptivePlan.recommendedCompletionDate, "en")}, while trading remains in qualification.`,
              `El crecimiento por trading no está validado. El fondeo programado apunta a ${formatPlanDate(adaptivePlan.recommendedCompletionDate, "es")}, mientras el trading permanece en calificación.`
            )
          : L(
              "A completion date cannot be defended until execution shows a positive edge.",
              "No se puede defender una fecha de cumplimiento hasta que la ejecución demuestre una ventaja positiva."
            )
        : adaptivePlan.verdict === "stretch"
          ? L(
              "The requested deadline is a stretch; follow the checkpoint path before increasing pace.",
              "El plazo solicitado es exigente; sigue la ruta de checkpoints antes de aumentar el ritmo."
            )
          : adaptivePlan.verdict === "unvalidated"
            ? L(
                "The timeline is mathematically supported but remains provisional until execution validates it.",
                "El plazo está respaldado matemáticamente, pero sigue provisional hasta que la ejecución lo valide."
              )
            : L(
                "The deadline is supported by the selected operating model and available evidence.",
                "El plazo está respaldado por el modelo operativo seleccionado y la evidencia disponible."
              );

  return {
    shouldSurface: adaptivePlan.verdict !== "incomplete" && Boolean(scenario),
    headline,
    body: L(
      `Projected goals now follow the exact compound path to the requested capital and date. The selected operating baseline remains separate at ${adaptivePlan.recommendedGoalDayPct.toFixed(2)}% on goal-days against an expected ${adaptivePlan.expectedLossDayPct.toFixed(2)}% losing day, so actual execution can be measured without rewriting the goal.`,
      `Las metas proyectadas ahora siguen la trayectoria compuesta exacta hacia el capital y la fecha solicitados. La línea base operativa seleccionada permanece separada en ${adaptivePlan.recommendedGoalDayPct.toFixed(2)}% durante días de meta contra una pérdida esperada de ${adaptivePlan.expectedLossDayPct.toFixed(2)}% en días perdedores, para medir la ejecución real sin reescribir la meta.`
    ),
    scenarioTitle:
      adaptivePlan.selectedPlanId === "manual"
        ? L("Manual operating plan", "Plan operativo manual")
        : scenario?.title ?? "",
    recommendedDailyGoalPct: adaptivePlan.recommendedGoalDayPct,
    maxDailyLossPct: adaptivePlan.maxDailyLossGuardrailPct,
    riskPerTradePct: adaptivePlan.riskPerTradePct,
    lossDaysPerWeek: adaptivePlan.lossDaysPerWeek,
    totalTradingDays: adaptivePlan.recommendedTradingSessions,
    totalOperatingWeeks:
      adaptivePlan.recommendedTradingSessions == null
        ? null
        : Math.max(
            1,
            Math.ceil(adaptivePlan.recommendedTradingSessions / adaptivePlan.operatingDaysPerWeek)
          ),
    totalEstimatedMonths: completionMonths,
    recommendedCompletionDate: adaptivePlan.recommendedCompletionDate,
    phases,
    verdict: adaptivePlan.verdict,
    confidence: adaptivePlan.confidence,
    isProvisional: adaptivePlan.isProvisional,
    requestedTargetDate: adaptivePlan.requestedTargetDate,
    targetProjectionGoalDayPct: adaptivePlan.targetProjectionGoalDayPct,
    targetProjectionBalance: adaptivePlan.targetProjectionBalance,
    targetProjectionCoveragePct: adaptivePlan.targetProjectionCoveragePct,
    requestedGrossProjectedBalance: adaptivePlan.requestedGrossProjectedBalance,
    requestedGrossTradingGrowthUsd: adaptivePlan.requestedGrossTradingGrowthUsd,
    requestedCostDragUsd: adaptivePlan.requestedCostDragUsd,
    costsConsumePercentageEdge: adaptivePlan.costsConsumePercentageEdge,
    requestedProjectedBalance: adaptivePlan.requestedProjectedBalance,
    requestedCoveragePct: adaptivePlan.requestedCoveragePct,
    requestedShortfallUsd: adaptivePlan.requestedShortfallUsd,
    expectedLossDayPct: adaptivePlan.expectedLossDayPct,
    modeledNetReturnPerSessionPct: adaptivePlan.modeledNetReturnPerSessionPct,
    modeledWeeklyReturnPct: adaptivePlan.modeledWeeklyReturnPct,
    modeledAnnualCycles: adaptivePlan.modeledAnnualCycles,
    modeledAnnualReturnPct: adaptivePlan.modeledAnnualReturnPct,
    qualificationRequired: adaptivePlan.qualificationRequired,
    qualificationMinimumSessions: adaptivePlan.qualificationMinimumSessions,
    nextMilestone: adaptivePlan.nextMilestone,
    weeklyMilestones: adaptivePlan.weeklyMilestones,
    monthlyMilestones: adaptivePlan.monthlyMilestones,
    quarterlyMilestones: adaptivePlan.quarterlyMilestones,
    semiannualMilestones: adaptivePlan.semiannualMilestones,
    annualMilestones: adaptivePlan.annualMilestones,
  };
}

function formatPlanDate(value: string | null | undefined, lang: "en" | "es") {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "es" ? "es-PR" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function actualBalanceAtCheckpoint(
  series: BalanceSeriesPoint[],
  checkpointDate: string,
  todayIso: string
): BalanceSeriesPoint | null {
  if (!checkpointDate || checkpointDate > todayIso) return null;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const point = series[index];
    if (point.date <= checkpointDate) return point;
  }
  return null;
}

function formatHistoryDate(value: string | null | undefined, lang: "en" | "es") {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat(lang === "es" ? "es-PR" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function historyReasonLabel(reason: string | null | undefined, L: (en: string, es: string) => string) {
  if (reason === "plan_created") return L("Plan created", "Plan creado");
  if (reason === "next_cycle_plan") return L("Next-cycle plan", "Plan próximo ciclo");
  if (reason === "plan_updated") return L("Plan edited", "Plan editado");
  return L("Plan change", "Cambio del plan");
}

export default function GrowthPlanPage() {
  const { user, loading } = useAuth();
  const { activeAccountId, loading: accountsLoading } = useTradingAccounts();
  const router = useRouter();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale) as GrowthPlanLocale;
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const stepTitles = isEs ? STEP_TITLES_ES : STEP_TITLES_EN;
  const inputBase =
    "w-full rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none px-2.5 py-1.5 text-sm";

  const [step, setStep] = useState<WizardStep>(0);
  const [error, setError] = useState("");
  const [hasExistingPlan, setHasExistingPlan] = useState(false);
  const [planHistory, setPlanHistory] = useState<GrowthPlanHistoryEntry[]>([]);

  // Cashflows net since plan start (for correct $ conversions when editing an existing plan)
  const [cashflowNet, setCashflowNet] = useState(0);
  const [loadedStartingBalance, setLoadedStartingBalance] = useState<number | null>(null);
  const [liveCurrentBalance, setLiveCurrentBalance] = useState<number | null>(null);
  const [liveBalanceSeries, setLiveBalanceSeries] = useState<BalanceSeriesPoint[]>([]);
  const [isFollowOnDraft, setIsFollowOnDraft] = useState(false);

  // Strings for inputs
  const [startingBalanceStr, setStartingBalanceStr] = useState("");
  const [targetBalanceStr, setTargetBalanceStr] = useState("");
  const [targetDateStr, setTargetDateStr] = useState("");
  const [tradingInstrument, setTradingInstrument] = useState<TradingInstrument>("stocks");
  const [runwayAmountStr, setRunwayAmountStr] = useState("1");
  const [runwayUnit, setRunwayUnit] = useState<TradingRunwayUnit>("years");
  const [runwayHydrated, setRunwayHydrated] = useState(false);
  const planMode = "auto" as const;
  const [tradingDaysTouched, setTradingDaysTouched] = useState(false);
  const [guidedMode, setGuidedMode] = useState(false);
  const [maxDailyLossPercentStr, setMaxDailyLossPercentStr] = useState("");
  const [tradingDaysStr, setTradingDaysStr] = useState("");
  const [averageTradingDaysPerWeekStr, setAverageTradingDaysPerWeekStr] = useState("5");
  const [winningDaysPerWeekStr, setWinningDaysPerWeekStr] = useState("4");
  const [lossDaysPerWeekStr, setLossDaysPerWeekStr] = useState("");
  const [plannedDepositMode, setPlannedDepositMode] = useState<PlannedDepositMode>("none");
  const [plannedDepositFrequency, setPlannedDepositFrequency] = useState<WithdrawalFrequency>("monthly");
  const [plannedDepositAmountStr, setPlannedDepositAmountStr] = useState("");
  const [plannedDepositStartPeriodStr, setPlannedDepositStartPeriodStr] = useState("1");
  const [plannedWithdrawalMode, setPlannedWithdrawalMode] = useState<PlannedWithdrawalMode>("none");
  const [plannedWithdrawalFrequency, setPlannedWithdrawalFrequency] = useState<WithdrawalFrequency>("monthly");
  const [plannedWithdrawalAmountStr, setPlannedWithdrawalAmountStr] = useState("");
  const [plannedWithdrawalStartPeriodStr, setPlannedWithdrawalStartPeriodStr] = useState("1");
  const [plannedWithdrawals, setPlannedWithdrawals] = useState<PlannedWithdrawal[]>([]);
  const [planPhases, setPlanPhases] = useState<PlanPhase[]>([]);
  const [planStartDate, setPlanStartDate] = useState<string | null>(isoToday());
  const [autoPhasesGenerated, setAutoPhasesGenerated] = useState(false);
  const [step0Stage, setStep0Stage] = useState(0);

  // Risk
  const [riskPerTradePctStr, setRiskPerTradePctStr] = useState("");
  const [goalDayReturnPctStr, setGoalDayReturnPctStr] = useState("");
  const [expectedLossDayPctStr, setExpectedLossDayPctStr] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState<BusinessScenarioId | "">("");
  const [returnModelMode, setReturnModelMode] = useState<OperatingReturnMode>("");
  const [selectedPlanId, setSelectedPlanId] = useState<FinalPlanId | "">("");
  const [performanceEvidence, setPerformanceEvidence] = useState<GrowthPlanEvidence | null>(null);
  const [performanceEvidenceLoading, setPerformanceEvidenceLoading] = useState(false);
  const [researchReview, setResearchReview] = useState<GrowthPlanResearchReview | null>(null);
  const [researchReviewLoading, setResearchReviewLoading] = useState(false);
  const [researchReviewError, setResearchReviewError] = useState("");
  const lastAutoReviewKeyRef = useRef("");
  const currentResearchReviewKeyRef = useRef("");
  const researchReviewRequestIdRef = useRef(0);
  const [visibleForecastRows, setVisibleForecastRows] = useState(60);

  // Commit
  const [committed, setCommitted] = useState(false);
  const [committedDraftKey, setCommittedDraftKey] = useState<string | null>(null);

  // Steps + rules
  const [stepsData, setStepsData] = useState<GrowthPlanSteps>(() => getDefaultSteps());
  const [rules, setRules] = useState<GrowthPlanRule[]>(() => getDefaultSuggestedRules());
  const [newRuleText, setNewRuleText] = useState("");

  // normalized numbers
  const startingBalance = toNum(startingBalanceStr, 0);
  const targetBalance = toNum(targetBalanceStr, 0);
  const maxDailyLossPercent = toNum(maxDailyLossPercentStr, 0);
  const tradingDays = clampInt(toNum(tradingDaysStr, 0), 0);
  const tradingCalendarProfile = getTradingCalendarProfile(tradingInstrument);
  const runwayLimit = getTradingRunwayLimit(runwayUnit);
  const rawRunwayAmount = Math.max(1, clampInt(toNum(runwayAmountStr, 1), 1));
  const runwayAmount = clampTradingRunwayAmount(rawRunwayAmount, runwayUnit);
  const runwayAmountExceedsLimit = rawRunwayAmount > runwayLimit;
  const averageTradingDaysPerWeek = resolveAverageTradingDaysPerWeek(
    averageTradingDaysPerWeekStr,
    tradingCalendarProfile.sessionsPerWeek
  );
  const averageTradingDaysSet = averageTradingDaysPerWeekStr.trim().length > 0;
  const lossDaysPerWeek = clampInt(toNum(lossDaysPerWeekStr, 0), 0, averageTradingDaysPerWeek);
  const winningDaysPerWeek = clampInt(
    toNum(winningDaysPerWeekStr, Math.max(0, averageTradingDaysPerWeek - lossDaysPerWeek)),
    0,
    averageTradingDaysPerWeek
  );
  const weeklyOutcomePlanComplete =
    winningDaysPerWeekStr.trim().length > 0 &&
    lossDaysPerWeekStr.trim().length > 0 &&
    winningDaysPerWeek > 0 &&
    winningDaysPerWeek + lossDaysPerWeek === averageTradingDaysPerWeek;
  const plannedDepositAmount = Math.max(0, toNum(plannedDepositAmountStr, 0));
  const plannedDepositStartPeriod = Math.max(1, clampInt(toNum(plannedDepositStartPeriodStr, 1), 1));
  const plannedWithdrawalAmount = Math.max(0, toNum(plannedWithdrawalAmountStr, 0));
  const plannedWithdrawalStartPeriod = Math.max(1, clampInt(toNum(plannedWithdrawalStartPeriodStr, 1), 1));
  const riskPerTradePct = Math.max(0, toNum(riskPerTradePctStr, 0));
  const goalDayReturnPct = Math.max(0, toNum(goalDayReturnPctStr, 0));
  const expectedLossDayPct = Math.max(0, toNum(expectedLossDayPctStr, 0));
  const estimatedCostPerSessionUsd = 0;
  const estimatedTaxReservePct = 0;
  const accountStructure = "cash" as const;
  const maxLeverageMultiple = 1;
  const targetMultiple =
    startingBalance > 0 && targetBalance > 0 ? targetBalance / startingBalance : 0;
  const returnModelConfigured =
    !!returnModelMode &&
    !!selectedPlanId &&
    !!selectedScenarioId &&
    goalDayReturnPct > 0 &&
    expectedLossDayPct > 0 &&
    expectedLossDayPct <= maxDailyLossPercent;

  const plannedDepositSettings = useMemo<PlannedDepositSettings | null>(() => {
    if (plannedDepositMode === "scheduled" && plannedDepositAmount > 0) {
      return {
        enabled: true,
        frequency: plannedDepositFrequency,
        amount: plannedDepositAmount,
        startPeriodIndex: plannedDepositStartPeriod,
      };
    }
    if (plannedDepositMode === "none") {
      return {
        enabled: false,
        frequency: plannedDepositFrequency,
        amount: 0,
        startPeriodIndex: plannedDepositStartPeriod,
      };
    }
    return null;
  }, [
    plannedDepositAmount,
    plannedDepositFrequency,
    plannedDepositMode,
    plannedDepositStartPeriod,
  ]);

  const plannedWithdrawalSettings = useMemo<PlannedWithdrawalSettings | null>(() => {
    if (plannedWithdrawalMode === "scheduled" && plannedWithdrawalAmount > 0) {
      return {
        enabled: true,
        frequency: plannedWithdrawalFrequency,
        amount: plannedWithdrawalAmount,
        startPeriodIndex: plannedWithdrawalStartPeriod,
      };
    }
    if (plannedWithdrawalMode === "none") {
      return {
        enabled: false,
        frequency: plannedWithdrawalFrequency,
        amount: 0,
        startPeriodIndex: plannedWithdrawalStartPeriod,
      };
    }
    return null;
  }, [
    plannedWithdrawalAmount,
    plannedWithdrawalFrequency,
    plannedWithdrawalMode,
    plannedWithdrawalStartPeriod,
  ]);

  const plannedWithdrawalConfigured =
    plannedWithdrawalMode === "none" ||
    (plannedWithdrawalMode === "scheduled" && plannedWithdrawalAmount > 0);
  const plannedDepositConfigured =
    plannedDepositMode === "none" ||
    (plannedDepositMode === "scheduled" && plannedDepositAmount > 0);
  const capitalFlowAssumptionsComplete = plannedDepositConfigured && plannedWithdrawalConfigured;
  const operatingScheduleConfigured =
    averageTradingDaysSet &&
    averageTradingDaysPerWeek >= 1 &&
    lossDaysPerWeekStr.trim().length > 0 &&
    lossDaysPerWeek >= 0 &&
    lossDaysPerWeek < averageTradingDaysPerWeek &&
    maxDailyLossPercent > 0 &&
    riskPerTradePct > 0;
  const businessAnalysisComplete =
    returnModelConfigured &&
    capitalFlowAssumptionsComplete &&
    operatingScheduleConfigured &&
    weeklyOutcomePlanComplete;
  const effectivePlanStartDate = planStartDate || isoToday();
  const planDatesOrdered =
    !effectivePlanStartDate || !targetDateStr || effectivePlanStartDate <= targetDateStr;
  const disclosureDraftKey = useMemo(
    () =>
      JSON.stringify({
        startingBalanceStr,
        targetBalanceStr,
        planStartDate,
        targetDateStr,
        runwayAmountStr,
        runwayUnit,
        tradingInstrument,
        tradingDaysStr,
        averageTradingDaysPerWeekStr,
        winningDaysPerWeekStr,
        lossDaysPerWeekStr,
        maxDailyLossPercentStr,
        riskPerTradePctStr,
        goalDayReturnPctStr,
        expectedLossDayPctStr,
        selectedScenarioId,
        returnModelMode,
        selectedPlanId,
        plannedDepositSettings,
        plannedWithdrawalSettings,
        stepsData,
        rules,
      }),
    [
      averageTradingDaysPerWeekStr,
      winningDaysPerWeekStr,
      expectedLossDayPctStr,
      goalDayReturnPctStr,
      lossDaysPerWeekStr,
      maxDailyLossPercentStr,
      planStartDate,
      plannedDepositSettings,
      plannedWithdrawalSettings,
      returnModelMode,
      riskPerTradePctStr,
      rules,
      runwayAmountStr,
      runwayUnit,
      selectedPlanId,
      selectedScenarioId,
      startingBalanceStr,
      stepsData,
      targetBalanceStr,
      targetDateStr,
      tradingDaysStr,
      tradingInstrument,
    ]
  );
  const disclosureAcceptedForDraft = committed && committedDraftKey === disclosureDraftKey;

  const baseBalanceForDollars = useMemo(() => {
    // If editing an existing plan AND the user hasn't changed the starting balance from what we loaded,
    // then include net cashflows since plan start for $ conversions (risk USD, goal USD, max-loss USD).
    if (loadedStartingBalance !== null && Math.abs(startingBalance - loadedStartingBalance) < 0.01) {
      return Math.max(0, startingBalance + (cashflowNet || 0));
    }
    return Math.max(0, startingBalance);
  }, [startingBalance, loadedStartingBalance, cashflowNet]);

  useEffect(() => {
    let alive = true;

    const loadLiveBalance = async () => {
      if (loading || !user || accountsLoading || !activeAccountId) {
        if (alive) {
          setLiveCurrentBalance(null);
          setLiveBalanceSeries([]);
        }
        return;
      }

      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
          if (alive) {
            setLiveCurrentBalance(null);
            setLiveBalanceSeries([]);
          }
          return;
        }

        const res = await fetch(`/api/account/series?accountId=${encodeURIComponent(activeAccountId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (alive) {
            setLiveCurrentBalance(null);
            setLiveBalanceSeries([]);
          }
          return;
        }

        const body = (await res.json().catch(() => ({}))) as {
          series?: Array<{ date?: string | null; value?: number | string | null }>;
          totals?: { currentBalance?: number | string | null };
        };
        const series = (Array.isArray(body?.series) ? body.series : [])
          .map((point) => ({
            date: String(point?.date ?? "").slice(0, 10),
            value: Number(point?.value),
          }))
          .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value))
          .sort((a, b) => a.date.localeCompare(b.date));
        const totalsBalance = Number(body?.totals?.currentBalance);
        const latest = Number.isFinite(totalsBalance)
          ? totalsBalance
          : series[series.length - 1]?.value;

        if (alive) {
          setLiveCurrentBalance(Number.isFinite(latest) ? latest : null);
          setLiveBalanceSeries(series);
        }
      } catch {
        if (alive) {
          setLiveCurrentBalance(null);
          setLiveBalanceSeries([]);
        }
      }
    };

    loadLiveBalance();
    return () => {
      alive = false;
    };
  }, [accountsLoading, activeAccountId, loading, user]);

  useEffect(() => {
    let alive = true;

    const loadPerformanceEvidence = async () => {
      if (loading || !user || accountsLoading || !activeAccountId) {
        if (alive) setPerformanceEvidence(null);
        return;
      }

      setPerformanceEvidenceLoading(true);
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;
        const response = await fetch(
          `/api/analytics/snapshot?accountId=${encodeURIComponent(activeAccountId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) return;
        const body = (await response.json().catch(() => ({}))) as {
          snapshot?: GrowthPlanEvidence | null;
        };
        if (alive) setPerformanceEvidence(body.snapshot ?? null);
      } catch (loadError) {
        console.warn("[GrowthPlan] performance evidence load failed", loadError);
      } finally {
        if (alive) setPerformanceEvidenceLoading(false);
      }
    };

    loadPerformanceEvidence();
    return () => {
      alive = false;
    };
  }, [accountsLoading, activeAccountId, loading, user]);

  const riskUsd = useMemo(() => calcRiskUsd(baseBalanceForDollars, riskPerTradePct), [baseBalanceForDollars, riskPerTradePct]);

  const onlyNum = (s: string) => s.replace(/[^\d.]/g, "");

  useEffect(() => {
    if (!runwayHydrated || !effectivePlanStartDate) return;
    const nextTargetDate = addTradingRunway(effectivePlanStartDate, runwayAmount, runwayUnit);
    if (nextTargetDate !== targetDateStr) {
      setTargetDateStr(nextTargetDate);
      setTradingDaysTouched(false);
    }
  }, [effectivePlanStartDate, runwayAmount, runwayHydrated, runwayUnit, targetDateStr]);

  useEffect(() => {
    if (!targetDateStr) return;
    if (tradingDaysTouched) return;
    if (!planDatesOrdered) return;
    const startIso = effectivePlanStartDate;
    const count = computeCommittedTradingDaysBetween(
      startIso,
      targetDateStr,
      averageTradingDaysPerWeek,
      tradingInstrument
    );
    if (!Number.isFinite(count) || count <= 0) return;
    setTradingDaysStr(String(count));
  }, [
    averageTradingDaysPerWeek,
    effectivePlanStartDate,
    planDatesOrdered,
    targetDateStr,
    tradingDaysTouched,
    tradingInstrument,
  ]);

  useEffect(() => {
    if (!lossDaysPerWeekStr.trim()) return;
    const rawLossDays = clampInt(toNum(lossDaysPerWeekStr, 0), 0, 99);
    if (rawLossDays > averageTradingDaysPerWeek) {
      setLossDaysPerWeekStr(String(averageTradingDaysPerWeek));
      setWinningDaysPerWeekStr("0");
      return;
    }
    const rawWinningDays = clampInt(toNum(winningDaysPerWeekStr, 0), 0, 99);
    if (rawWinningDays + rawLossDays !== averageTradingDaysPerWeek) {
      setWinningDaysPerWeekStr(String(Math.max(0, averageTradingDaysPerWeek - rawLossDays)));
    }
  }, [averageTradingDaysPerWeek, lossDaysPerWeekStr, winningDaysPerWeekStr]);

  type GuidedTask = {
    id: string;
    label: string;
    done: boolean;
    anchor?: string;
    optional?: boolean;
  };

  const tradingSystemCount = useMemo(
    () => (stepsData.prepare?.checklist ?? []).filter((i) => (i.text ?? "").trim().length > 0).length,
    [stepsData.prepare]
  );
  const analysisStylesCount = useMemo(
    () => (stepsData.analysis?.styles ?? []).length,
    [stepsData.analysis]
  );
  const strategyCount = useMemo(
    () => (stepsData.strategy?.strategies ?? []).filter((s) => (s.name ?? "").trim().length > 0).length,
    [stepsData.strategy]
  );
  const journalNotesLen = useMemo(
    () => (stepsData.execution_and_journal?.notes ?? "").trim().length,
    [stepsData.execution_and_journal]
  );
  const systemDoCount = useMemo(
    () => (stepsData.execution_and_journal?.system?.doList ?? []).filter((i) => (i.text ?? "").trim().length > 0).length,
    [stepsData.execution_and_journal]
  );
  const systemDontCount = useMemo(
    () => (stepsData.execution_and_journal?.system?.dontList ?? []).filter((i) => (i.text ?? "").trim().length > 0).length,
    [stepsData.execution_and_journal]
  );
  const nonNegotiableCount = useMemo(
    () => rules.filter((r) => (r.label ?? "").trim().length > 0 && (r.isActive ?? true)).length,
    [rules]
  );
  const activeProjectionPolicy = useMemo(
    () => {
      if (!selectedScenarioId) return null;
      const base = getGrowthPlanOperatingPolicy(selectedScenarioId);
      return {
        ...base,
        goalDayReturnPct: goalDayReturnPct > 0 ? goalDayReturnPct : base.goalDayReturnPct,
        expectedLossDayPct:
          expectedLossDayPct > 0
            ? Math.min(
                base.maxDailyLossPct,
                returnModelMode === "manual"
                  ? expectedLossDayPct
                  : Math.max(base.expectedLossDayPct, expectedLossDayPct)
              )
            : base.expectedLossDayPct,
      };
    },
    [expectedLossDayPct, goalDayReturnPct, returnModelMode, selectedScenarioId]
  );

  const projection = useMemo(() => {
    if (!targetDateStr || startingBalance <= 0 || targetBalance <= 0) {
      return buildPlanProjection({
        starting: 0,
        target: 0,
        startIso: effectivePlanStartDate,
        targetIso: targetDateStr || effectivePlanStartDate,
        averageTradingDaysPerWeek,
        lossDaysPerWeek,
        maxDailyLossPercent: Math.max(0, maxDailyLossPercent),
        modeledLossDayPercent:
          activeProjectionPolicy?.expectedLossDayPct ?? Math.max(0, maxDailyLossPercent),
        depositSettings: plannedDepositSettings,
        withdrawalSettings: plannedWithdrawalSettings,
        existingWithdrawals: plannedWithdrawals,
        tradingInstrument,
        estimatedCostPerSessionUsd,
        solveSymmetricReturnPercent: !activeProjectionPolicy,
      });
    }

    return buildPlanProjection({
      starting: Math.max(0, startingBalance),
      target: Math.max(0, targetBalance),
      startIso: effectivePlanStartDate,
      targetIso: targetDateStr,
      averageTradingDaysPerWeek,
      lossDaysPerWeek,
      maxDailyLossPercent: Math.max(0, maxDailyLossPercent),
      modeledLossDayPercent:
        activeProjectionPolicy?.expectedLossDayPct ?? Math.max(0, maxDailyLossPercent),
      depositSettings: plannedDepositSettings,
      withdrawalSettings: plannedWithdrawalSettings,
      existingWithdrawals: plannedWithdrawals,
      tradingInstrument,
      estimatedCostPerSessionUsd,
      solveSymmetricReturnPercent: !activeProjectionPolicy,
    });
  }, [
    activeProjectionPolicy,
    lossDaysPerWeek,
    averageTradingDaysPerWeek,
    maxDailyLossPercent,
    effectivePlanStartDate,
    estimatedCostPerSessionUsd,
    plannedDepositSettings,
    plannedWithdrawalSettings,
    plannedWithdrawals,
    startingBalance,
    targetBalance,
    targetDateStr,
    tradingInstrument,
  ]);

  const suggestedRows = projection.rows;
  const requiredGoalPct = projection.requiredGoalPct;
  const generatedPlannedDeposits = useMemo(
    () => (plannedDepositMode === "scheduled" ? projection.deposits : []),
    [plannedDepositMode, projection.deposits]
  );
  const generatedPlannedWithdrawals = useMemo(
    () => (plannedWithdrawalMode === "scheduled" ? projection.withdrawals : []),
    [plannedWithdrawalMode, projection.withdrawals]
  );
  const autoPhases = useMemo(
    () => (autoPhasesGenerated ? projection.milestones : []),
    [autoPhasesGenerated, projection.milestones]
  );
  const explainRequired = useMemo(() => {
    const goalDays = suggestedRows.filter((row) => row.type === "goal").length;
    const totalLossDays = suggestedRows.length - goalDays;
    const modeledLossPct = Math.abs(suggestedRows.find((row) => row.type === "loss")?.pct ?? 0);
    const prodLoss =
      totalLossDays > 0
        ? Math.pow(1 - modeledLossPct / 100, totalLossDays)
        : 1;

    return {
      goalDays,
      totalLossDays,
      prodLoss,
      goalPct: requiredGoalPct,
      totalPlannedDeposit: generatedPlannedDeposits.reduce((sum, item) => sum + item.amount, 0),
      plannedDepositCount: generatedPlannedDeposits.length,
      totalPlannedWithdrawal: generatedPlannedWithdrawals.reduce((sum, item) => sum + item.amount, 0),
      plannedWithdrawalCount: generatedPlannedWithdrawals.length,
    };
  }, [generatedPlannedDeposits, generatedPlannedWithdrawals, requiredGoalPct, suggestedRows]);

  const guidedTasksByStep = useMemo<Record<WizardStep, GuidedTask[]>>(() => {
    const lossDaysSet = lossDaysPerWeekStr.trim().length > 0;
    const requiredGoalReady = suggestedRows.length > 0;
    return {
      0: [
        {
          id: "starting_balance",
          label: L("Define starting capital", "Define el capital inicial"),
          done: startingBalance > 0,
          anchor: "gp-starting-balance",
        },
        {
          id: "target_balance",
          label: L("Define the business target", "Define la meta empresarial"),
          done: targetBalance > startingBalance,
          anchor: "gp-target-balance",
        },
        {
          id: "timeline",
          label: L("Define deadline and market", "Define plazo y mercado"),
          done: Boolean(planStartDate && targetDateStr && planDatesOrdered && tradingDays > 0),
          anchor: "gp-timeline",
        },
        {
          id: "weekly_schedule",
          label: L("Budget winning and losing days", "Presupuesta días ganadores y perdedores"),
          done: weeklyOutcomePlanComplete,
          anchor: "gp-weekly-schedule",
        },
        {
          id: "capital_flows",
          label: L("Confirm optional capital flows", "Confirma cashflows opcionales"),
          done: capitalFlowAssumptionsComplete,
          anchor: "gp-planned-withdrawals",
        },
        {
          id: "forecast_analysis",
          label: L(
            "Review the mathematical analysis",
            "Revisa el análisis matemático"
          ),
          done: requiredGoalReady,
          anchor: "gp-forecast-analysis",
        },
        {
          id: "scenario_selection",
          label: L("Choose a standard or manual mode", "Escoge un modo estándar o manual"),
          done: returnModelConfigured,
          anchor: "gp-scenario-selection",
        },
        {
          id: "forecast_review",
          label: L("Confirm the curve and sequence", "Confirma la curva y la secuencia"),
          done: Boolean(selectedPlanId && autoPhasesGenerated),
          anchor: "gp-forecast-review",
        },
      ],
      1: [
        {
          id: "trading_system_steps",
          label: L("Add at least 3 trading system steps", "Agrega al menos 3 pasos del sistema"),
          done: tradingSystemCount >= 3,
          anchor: "gp-trading-system",
        },
        {
          id: "system_do",
          label: L("Add at least 1 'Do' action", "Agrega al menos 1 acción 'Hacer'"),
          done: systemDoCount > 0,
          anchor: "gp-system-do",
        },
        {
          id: "system_dont",
          label: L("Add at least 1 'Don't' rule", "Agrega al menos 1 regla 'No hacer'"),
          done: systemDontCount > 0,
          anchor: "gp-system-dont",
        },
      ],
      2: [
        {
          id: "analysis_styles",
          label: L("Select your analysis style(s)", "Selecciona tu estilo de análisis"),
          done: analysisStylesCount > 0,
          anchor: "gp-analysis-styles",
        },
        {
          id: "analysis_other",
          label: L("Describe 'Other' if selected", "Describe 'Otro' si lo usas"),
          done:
            !(stepsData.analysis?.styles ?? []).includes("other") ||
            (stepsData.analysis?.otherStyleText ?? "").trim().length > 0,
          anchor: "gp-analysis-other",
          optional: true,
        },
      ],
      3: [
        {
          id: "journal_notes",
          label: L("Describe how you will record execution", "Describe cómo registrarás la ejecución"),
          done: journalNotesLen >= 20,
          anchor: "gp-journal-notes",
        },
      ],
      4: [
        {
          id: "strategy",
          label: L("Add at least 1 strategy", "Agrega al menos 1 estrategia"),
          done: strategyCount > 0,
          anchor: "gp-strategy-list",
        },
        {
          id: "non_negotiable_rules",
          label: L("Add at least 1 non‑negotiable rule", "Agrega al menos 1 regla no negociable"),
          done: nonNegotiableCount > 0,
          anchor: "gp-rules",
        },
        {
          id: "commitment",
          label: L("Confirm your commitment", "Confirma tu compromiso"),
          done: disclosureAcceptedForDraft,
          anchor: "gp-commitment",
        },
      ],
    };
  }, [
    L,
    startingBalance,
    targetBalance,
    planStartDate,
    planDatesOrdered,
    targetDateStr,
    tradingDays,
    averageTradingDaysSet,
    maxDailyLossPercent,
    riskPerTradePct,
    lossDaysPerWeekStr,
    autoPhasesGenerated,
    capitalFlowAssumptionsComplete,
    suggestedRows.length,
    tradingSystemCount,
    analysisStylesCount,
    stepsData.analysis,
    journalNotesLen,
    systemDoCount,
    systemDontCount,
    strategyCount,
    nonNegotiableCount,
    disclosureAcceptedForDraft,
    businessAnalysisComplete,
    returnModelConfigured,
    selectedPlanId,
    weeklyOutcomePlanComplete,
  ]);

  const stepCompletion = useMemo(() => {
    return STEP_ORDER.reduce<Record<WizardStep, boolean>>((acc, s) => {
      const tasks = guidedTasksByStep[s] ?? [];
      const required = tasks.filter((t) => !t.optional);
      acc[s] = required.every((t) => t.done);
      return acc;
    }, {} as Record<WizardStep, boolean>);
  }, [guidedTasksByStep]);

  const guideProgress = useMemo(() => {
    const doneCount = STEP_ORDER.filter((s) => stepCompletion[s]).length;
    return doneCount / STEP_ORDER.length;
  }, [stepCompletion]);

  const currentTasks = guidedTasksByStep[step] ?? [];
  const nextTask = currentTasks.find((t) => !t.done && !t.optional) ?? currentTasks.find((t) => !t.done);

  const buildAutoPhasesPreview = () => {
    if (startingBalance <= 0 || targetBalance <= 0) {
      setError(L("Enter starting and target balances first.", "Primero ingresa balance inicial y objetivo."));
      return;
    }
    if (!planStartDate) {
      setError(L("Pick a start date first.", "Elige primero una fecha de inicio."));
      return;
    }
    if (!targetDateStr) {
      setError(L("Pick a target date to build auto phases.", "Elige una fecha meta para crear fases automáticas."));
      return;
    }
    if (!planDatesOrdered) {
      setError(
        L(
          "Target date must be on or after the start date.",
          "La fecha objetivo debe ser igual o posterior a la fecha de inicio."
        )
      );
      return;
    }
    if (maxDailyLossPercent <= 0) {
      setError(L("Set max daily loss first.", "Define la pérdida diaria máx primero."));
      return;
    }
    if (!averageTradingDaysSet) {
      setError(L("Set average operating days per week first.", "Define primero los días operativos promedio por semana."));
      return;
    }
    if (!lossDaysSet) {
      setError(L("Set loss days per week first.", "Define los días de pérdida por semana primero."));
      return;
    }
    setAutoPhasesGenerated(true);
    setError("");
    const msg = L("Auto phases generated.", "Fases automáticas generadas.");
    pushNeuroMessage(msg);
  };

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  // load existing plan from Supabase
  useEffect(() => {
    let mounted = true;
    setRunwayHydrated(false);

    (async () => {
      if (loading || !user || accountsLoading || !activeAccountId) return;
      try {
        const existing = await getGrowthPlanSupabaseByAccount(activeAccountId);
        if (!mounted) return;

        if (existing) {
          setHasExistingPlan(true);
          setIsFollowOnDraft(false);
          setStep0Stage(0);
          setSelectedScenarioId("");
          const existingBusinessAnalysis = (existing.steps as any)?.business_analysis;
          const existingOperatingModel = existingBusinessAnalysis?.operatingModel ?? {};
          const existingForecastSnapshot = existingBusinessAnalysis?.forecastSnapshot ?? {};
          const isLegacyForecast = Number(existing.version ?? 2) < 3;
          const loadedInstrument = normalizeTradingInstrument(
            existingOperatingModel?.tradingInstrument ??
              existingOperatingModel?.runway?.instrument ??
              "stocks"
          );
          const loadedCalendarProfile = getTradingCalendarProfile(loadedInstrument);
          const loadedAverageTradingDays = resolveAverageTradingDaysPerWeek(
            existingBusinessAnalysis?.averageTradingDaysPerWeek ??
              existingBusinessAnalysis?.operatingModel?.averageTradingDaysPerWeek ??
              (existing.steps as any)?._ui?.averageTradingDaysPerWeek ??
              5,
            loadedCalendarProfile.sessionsPerWeek
          );
          const loadedStartDate =
            String(
              (existing as any).planStartDate ??
                (existing as any).plan_start_date ??
                (existing as any).createdAt ??
                (existing as any).created_at ??
                isoToday()
            ).slice(0, 10) || isoToday();
          const loadedTargetDate = String(
            existingForecastSnapshot?.requestedTargetDate ??
              (existing as any).targetDate ??
              (existing as any).target_date ??
              ""
          ).slice(0, 10);
          const inferredRunway = inferTradingRunway(loadedStartDate, loadedTargetDate);
          const loadedRunwayUnit = normalizeTradingRunwayUnit(
            existingOperatingModel?.runway?.unit ?? inferredRunway.unit
          );
          const loadedRunwayAmount = clampTradingRunwayAmount(
            toNum(String(existingOperatingModel?.runway?.amount ?? inferredRunway.amount), 1),
            loadedRunwayUnit
          );

          setStartingBalanceStr(formatMoneyInputValue(existing.startingBalance ?? 5000));
          setTargetBalanceStr(formatMoneyInputValue(existing.targetBalance ?? 60000));
          setPlanStartDate(loadedStartDate);
          setTargetDateStr(
            addTradingRunway(loadedStartDate, loadedRunwayAmount, loadedRunwayUnit)
          );
          setTradingInstrument(loadedInstrument);
          setRunwayAmountStr(String(loadedRunwayAmount));
          setRunwayUnit(loadedRunwayUnit);
          setMaxDailyLossPercentStr(String(existing.maxDailyLossPercent ?? 1));
          setTradingDaysStr(String(existing.tradingDays ?? 60));
          setAverageTradingDaysPerWeekStr(String(loadedAverageTradingDays));
          const loadedLossDays = clampInt(Number(existing.lossDaysPerWeek ?? 0), 0, loadedAverageTradingDays);
          setLossDaysPerWeekStr(String(loadedLossDays));
          setWinningDaysPerWeekStr(
            String(
              clampInt(
                Number(existingOperatingModel?.winningDaysPerWeek ?? loadedAverageTradingDays - loadedLossDays),
                0,
                loadedAverageTradingDays
              )
            )
          );

          setRiskPerTradePctStr(String(existing.maxRiskPerTradePercent ?? 2));
          setGoalDayReturnPctStr(
            String(
              existingBusinessAnalysis?.selectedScenario?.dailyGoalPct ??
                existing.dailyGoalPercent ??
                existing.dailyTargetPct ??
                ""
            )
          );
          setExpectedLossDayPctStr(
            String(
              existingBusinessAnalysis?.selectedScenario?.expectedLossDayPct ??
                existingOperatingModel?.expectedLossDayPct ??
                ""
            )
          );
          setCommitted(false);
          setCommittedDraftKey(null);

          setStepsData(existing.steps ?? getDefaultSteps());
          setRules(existing.rules && existing.rules.length ? existing.rules : getDefaultSuggestedRules());
          setResearchReview(null);
          setResearchReviewError("");
          if (existingBusinessAnalysis && typeof existingBusinessAnalysis === "object") {
            const nextScenarioId = String(existingBusinessAnalysis.selectedScenarioId ?? "");
            if (["conservative", "moderate", "aggressive"].includes(nextScenarioId)) {
              setSelectedScenarioId(nextScenarioId as BusinessScenarioId);
            }
            const storedReturnMode = String(
              existingOperatingModel?.returnModelMode ?? nextScenarioId
            );
            setReturnModelMode(
              isLegacyForecast
                ? "manual"
                : ["conservative", "moderate", "aggressive", "manual"].includes(storedReturnMode)
                  ? (storedReturnMode as OperatingReturnMode)
                  : ""
            );
            const storedSelectedPlanId = String(
              existingOperatingModel?.selectedPlanId ?? storedReturnMode
            );
            setSelectedPlanId(
              isLegacyForecast
                ? "manual"
                : ["conservative", "moderate", "aggressive", "manual"].includes(storedSelectedPlanId)
                  ? (storedSelectedPlanId as FinalPlanId)
                  : ""
            );
            const storedResearchReview = existingBusinessAnalysis.researchReview;
            if (storedResearchReview && typeof storedResearchReview === "object") {
              setResearchReview(storedResearchReview as GrowthPlanResearchReview);
            } else {
              setResearchReview(null);
            }
          } else {
            setReturnModelMode(isLegacyForecast ? "manual" : "");
            setSelectedPlanId(isLegacyForecast ? "manual" : "");
            setResearchReview(null);
          }

          setLoadedStartingBalance(Number(existing.startingBalance ?? 0));
          const existingPlannedWithdrawals = normalizePlannedWithdrawals(
            Array.isArray((existing as any).plannedWithdrawals)
              ? (existing as any).plannedWithdrawals
              : Array.isArray((existing as any).planned_withdrawals)
                ? (existing as any).planned_withdrawals
                : []
          );
          const existingWithdrawalSettings =
            normalizeWithdrawalSettings(existingOperatingModel?.plannedWithdrawalSettings) ??
            normalizeWithdrawalSettings((existing as any).plannedWithdrawalSettings) ??
            normalizeWithdrawalSettings((existing as any).planned_withdrawal_settings) ??
            inferWithdrawalSettingsFromEvents(existingPlannedWithdrawals);
          setPlannedWithdrawals(existingPlannedWithdrawals);
          if (existingWithdrawalSettings?.enabled) {
            setPlannedWithdrawalMode("scheduled");
            setPlannedWithdrawalFrequency(existingWithdrawalSettings.frequency);
            setPlannedWithdrawalAmountStr(String(existingWithdrawalSettings.amount ?? 0));
            setPlannedWithdrawalStartPeriodStr(String(existingWithdrawalSettings.startPeriodIndex ?? 1));
          } else {
            setPlannedWithdrawalMode("none");
            setPlannedWithdrawalFrequency(existingWithdrawalSettings?.frequency ?? "monthly");
            setPlannedWithdrawalAmountStr("");
            setPlannedWithdrawalStartPeriodStr(String(existingWithdrawalSettings?.startPeriodIndex ?? 1));
          }
          const existingDepositSettings = normalizeDepositSettings(
            existingOperatingModel?.plannedDepositSettings
          );
          if (existingDepositSettings?.enabled) {
            setPlannedDepositMode("scheduled");
            setPlannedDepositFrequency(existingDepositSettings.frequency);
            setPlannedDepositAmountStr(String(existingDepositSettings.amount ?? 0));
            setPlannedDepositStartPeriodStr(String(existingDepositSettings.startPeriodIndex ?? 1));
          } else if (existingDepositSettings) {
            setPlannedDepositMode("none");
            setPlannedDepositFrequency(existingDepositSettings.frequency ?? "monthly");
            setPlannedDepositAmountStr("");
            setPlannedDepositStartPeriodStr(String(existingDepositSettings.startPeriodIndex ?? 1));
          } else {
            setPlannedDepositMode("undecided");
          }
          setPlanPhases(
            Array.isArray((existing as any).planPhases)
              ? (existing as any).planPhases
              : Array.isArray((existing as any).plan_phases)
                ? (existing as any).plan_phases
                : []
          );

          // ✅ Load net cashflows since plan start (for $ conversions)
          const cashflowUserId = String((user as any)?.id || (user as any)?.uid || "");
          if (cashflowUserId) {
            try {
              const planStart =
                toDateOnlyStr((existing as any).planStartDate) ||
                toDateOnlyStr((existing as any).plan_start_date) ||
                toDateOnlyStr((existing as any).createdAt) ||
                toDateOnlyStr((existing as any).created_at) ||
                toDateOnlyStr((existing as any).createdAtIso) ||
                toDateOnlyStr((existing as any).createdAtISO) ||
                toDateOnlyStr((existing as any).updatedAt) ||
                toDateOnlyStr((existing as any).updated_at) ||
                toDateOnlyStr((existing as any).updatedAtIso) ||
                toDateOnlyStr((existing as any).updatedAtISO);

              const opts: any = planStart
                ? { fromDate: planStart, throwOnError: true, accountId: activeAccountId }
                : { throwOnError: true, accountId: activeAccountId };
              const cf = await listCashflows(cashflowUserId, opts);
              if (!mounted) return;
              const net = (cf ?? []).reduce((acc: number, c: any) => acc + signedCashflowAmount(c), 0);
              setCashflowNet(net);
            } catch (e) {
              console.warn("[GrowthPlan] cashflows load error", e);
              setCashflowNet(0);
            }
          } else {
            setCashflowNet(0);
          }

          const history = await getGrowthPlanHistorySupabase(activeAccountId);
          if (!mounted) return;
          setPlanHistory(history);

          setAutoPhasesGenerated(true);
          setRunwayHydrated(true);
        } else {
          // new plan
          setHasExistingPlan(false);
          setIsFollowOnDraft(false);
          setStartingBalanceStr("");
          setTargetBalanceStr("");
          const newStartDate = isoToday();
          setTargetDateStr(addTradingRunway(newStartDate, 1, "years"));
          setTradingInstrument("stocks");
          setRunwayAmountStr("1");
          setRunwayUnit("years");
          setMaxDailyLossPercentStr("");
          setTradingDaysStr("");
          setAverageTradingDaysPerWeekStr("5");
          setWinningDaysPerWeekStr("4");
          setTradingDaysTouched(false);
          setLossDaysPerWeekStr("");
          setRiskPerTradePctStr("");
          setGoalDayReturnPctStr("");
          setExpectedLossDayPctStr("");
          setReturnModelMode("");
          setSelectedPlanId("");
          setSelectedScenarioId("");
          setStep0Stage(0);
          setLoadedStartingBalance(null);
          setCashflowNet(0);
          setPlanStartDate(newStartDate);
          setPlannedWithdrawals([]);
          setPlannedDepositMode("none");
          setPlannedDepositFrequency("monthly");
          setPlannedDepositAmountStr("");
          setPlannedDepositStartPeriodStr("1");
          setPlannedWithdrawalMode("none");
          setPlannedWithdrawalFrequency("monthly");
          setPlannedWithdrawalAmountStr("");
          setPlannedWithdrawalStartPeriodStr("1");
          setPlanPhases([]);
          setPlanHistory([]);
          setAutoPhasesGenerated(false);
          setResearchReview(null);
          setResearchReviewError("");
          setRunwayHydrated(true);

        }
      } catch (e) {
        console.error("[GrowthPlan] load error", e);
        if (mounted) setRunwayHydrated(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loading, user, accountsLoading, activeAccountId]);

  // risk coaching (throttled)
  const lastRiskNudgeRef = useRef<number>(0);
  useEffect(() => {
    if (!user) return;
    if (baseBalanceForDollars <= 0) return;
    if (riskPerTradePct <= 2) return;

    const now = Date.now();
    if (now - lastRiskNudgeRef.current < 12000) return;
    lastRiskNudgeRef.current = now;

    (async () => {
      const text =
        (await neuroReact("risk_too_high", lang, {
          riskPct: riskPerTradePct,
          riskUsd,
          startingBalance: baseBalanceForDollars,
        })) ||
        L(
          `Quick note: you're risking ${riskPerTradePct.toFixed(2)}% per trade (~${currency(
            riskUsd
          )}). If you want 2%, reduce size or trade cheaper contracts.`,
          `Nota rápida: estás arriesgando ${riskPerTradePct.toFixed(2)}% por trade (~${currency(
            riskUsd
          )}). Si quieres 2%, reduce tamaño o usa contratos más baratos.`
        );
      pushNeuroMessage(text);
          })();
  }, [riskPerTradePct, riskUsd, baseBalanceForDollars, user, lang]);

  // Field help throttle.
  const lastFieldHelpRef = useRef<Record<string, number>>({});
  async function fieldHelp(field: string, extra?: any) {
    const now = Date.now();
    const last = lastFieldHelpRef.current[field] ?? 0;
    if (now - last < 8000) return; // per-field throttle
    lastFieldHelpRef.current[field] = now;

    const text = await neuroReact("field_help", lang, { field, ...extra });
    if (text) {
      pushNeuroMessage(text);
          }
  }

  const maxLossDollar =
    baseBalanceForDollars > 0 ? (baseBalanceForDollars * (maxDailyLossPercent || 0)) / 100 : 0;
  const requiredGoalDollar =
    baseBalanceForDollars > 0 ? (baseBalanceForDollars * (requiredGoalPct || 0)) / 100 : 0;

  const firstMonthMeta = useMemo(() => {
    if (!autoPhases.length) return null;
    const first = autoPhases[0];
    const monthIndex = first.monthIndex ?? 1;
    const monthPhases = autoPhases.filter((p) => (p.monthIndex ?? monthIndex) === monthIndex);
    const monthGoal =
      first.monthGoal ??
      monthPhases[monthPhases.length - 1]?.monthGoal ??
      monthPhases[monthPhases.length - 1]?.targetEquity ??
      null;
    const weeksInMonth = first.weeksInMonth ?? monthPhases.length;
    const weekIndex = first.weekIndex ?? 1;
    const weeklyPct = weeksInMonth > 0 ? 100 / weeksInMonth : null;
    const weeklyGoal =
      monthGoal && weeksInMonth > 0 ? monthGoal / weeksInMonth : null;
    return { monthIndex, monthGoal, weeksInMonth, weekIndex, weeklyPct, weeklyGoal };
  }, [autoPhases]);

  type MonthSummary = {
    monthIndex: number;
    monthLabel: string;
    startBalance: number;
    endBalance: number;
    tradingProfit: number;
    netChange: number;
    deposit: number;
    withdrawal: number;
    endDate: string | null;
  };

  const monthSummaries = useMemo<MonthSummary[]>(() => {
    if (!autoPhases.length) return [];
    const map = new Map<number, MonthSummary & { maxWeek: number }>();
    for (const phase of autoPhases) {
      const idx = phase.monthIndex ?? 1;
      const startBalance =
        phase.monthStartBalance ??
        (phase.monthGoal != null ? phase.targetEquity - phase.monthGoal : phase.targetEquity);
      const endBalance = phase.monthEndBalance ?? phase.targetEquity;
      const tradingProfit = phase.monthGoal ?? endBalance - startBalance;
      const deposit = phase.monthDeposit ?? 0;
      const withdrawal = phase.monthWithdrawal ?? 0;
      const monthLabel = phase.monthLabel ?? "";
      const weekIndex = phase.weekIndex ?? 0;
      const existing = map.get(idx);
      if (!existing) {
        map.set(idx, {
          monthIndex: idx,
          monthLabel,
          startBalance,
          endBalance,
          tradingProfit,
          netChange: endBalance - startBalance,
          deposit,
          withdrawal,
          endDate: phase.targetDate ?? null,
          maxWeek: weekIndex,
        });
        continue;
      }
      if (weekIndex >= existing.maxWeek) {
        existing.endBalance = endBalance;
        existing.tradingProfit = tradingProfit;
        existing.netChange = endBalance - existing.startBalance;
        existing.deposit = deposit;
        existing.withdrawal = withdrawal;
        existing.endDate = phase.targetDate ?? existing.endDate;
        existing.maxWeek = weekIndex;
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.monthIndex - b.monthIndex)
      .map(({ maxWeek, ...rest }) => rest);
  }, [autoPhases]);

  type QuarterSummary = {
    label: string;
    rangeLabel: string;
    startBalance: number;
    endBalance: number;
    tradingProfit: number;
    netChange: number;
    deposit: number;
    withdrawal: number;
    endDate: string | null;
  };

  const quarterSummaries = useMemo<QuarterSummary[]>(() => {
    if (monthSummaries.length === 0) return [];
    const out: QuarterSummary[] = [];
    for (let i = 0; i < monthSummaries.length; i += 3) {
      const slice = monthSummaries.slice(i, i + 3);
      if (!slice.length) continue;
      const start = slice[0];
      const end = slice[slice.length - 1];
      const label = `Q${Math.floor(i / 3) + 1}`;
      const rangeLabel = `${formatMonthLabel(start.monthLabel, lang)}–${formatMonthLabel(end.monthLabel, lang)}`;
      const startBalance = start.startBalance;
      const endBalance = end.endBalance;
      out.push({
        label,
        rangeLabel,
        startBalance,
        endBalance,
        tradingProfit: slice.reduce((sum, month) => sum + month.tradingProfit, 0),
        netChange: endBalance - startBalance,
        deposit: slice.reduce((sum, month) => sum + month.deposit, 0),
        withdrawal: slice.reduce((sum, month) => sum + month.withdrawal, 0),
        endDate: end.endDate,
      });
    }
    return out;
  }, [monthSummaries, lang]);

  const projectedCompletionDate = projection.completionDate;
  const projectedCompletionBalance = projection.completionBalance ?? null;
  const projectedTargetReached = projection.targetReached;
  const projectedCompletedEarly = projection.completedEarly;
  const projectedCompletesOnSchedule =
    !!projectedCompletionDate && !!targetDateStr && projectedCompletionDate <= targetDateStr;
  const liveTargetReached =
    liveCurrentBalance !== null &&
    targetBalance > 0 &&
    Number.isFinite(liveCurrentBalance) &&
    liveCurrentBalance >= targetBalance;

  const handleStartFollowOnPlan = useCallback(
    (riskMode: "same" | "lower" | "higher") => {
      const sourceBalance =
        liveCurrentBalance !== null && Number.isFinite(liveCurrentBalance) && liveCurrentBalance > 0
          ? liveCurrentBalance
          : targetBalance;

      if (!sourceBalance || sourceBalance <= 0) {
        setError(L("We could not determine the balance for the next cycle yet.", "Todavía no pudimos determinar el balance para el próximo ciclo."));
        return;
      }

      const today = isoToday();
      const originalSpanDays =
        planStartDate && targetDateStr ? Math.max(1, calendarDaysBetween(planStartDate, targetDateStr)) : 90;
      const nextDate = addCalendarDays(today, originalSpanDays);
      const sourceMultiple = targetMultiple > 1 ? targetMultiple : 1.25;
      const nextTarget = Number((sourceBalance * sourceMultiple).toFixed(2));
      const nextRiskPct = scaleFollowOnRisk(riskPerTradePct || 2, riskMode);

      const nextRunway = inferTradingRunway(today, nextDate);
      setStartingBalanceStr(formatMoneyInputValue(sourceBalance));
      setTargetBalanceStr(formatMoneyInputValue(nextTarget));
      setTargetDateStr(nextDate);
      setRunwayAmountStr(String(nextRunway.amount));
      setRunwayUnit(nextRunway.unit);
      setTradingDaysTouched(false);
      setLoadedStartingBalance(sourceBalance);
      setCashflowNet(0);
      setPlanStartDate(today);
      setPlannedWithdrawals([]);
      setPlanPhases([]);
      setAutoPhasesGenerated(false);
      setRiskPerTradePctStr(nextRiskPct.toFixed(2));
      setCommitted(false);
      setCommittedDraftKey(null);
      setIsFollowOnDraft(true);
      setError("");
      setStep(0);
      setStep0Stage(0);

      pushNeuroMessage(
        riskMode === "same"
          ? L(
              "Next-cycle draft ready. We kept the same risk settings and rolled the plan forward from your live balance.",
              "El borrador del próximo ciclo está listo. Mantuvimos los mismos ajustes de riesgo y reiniciamos el plan desde tu balance real."
            )
          : riskMode === "lower"
            ? L(
                "Next-cycle draft ready with lower risk. Review the new numbers, then save when the pacing feels sustainable.",
                "El borrador del próximo ciclo está listo con menos riesgo. Revisa los nuevos números y guarda cuando el ritmo se sienta sostenible."
              )
            : L(
                "Next-cycle draft ready with higher risk. Review the pacing carefully before saving.",
                "El borrador del próximo ciclo está listo con más riesgo. Revisa el ritmo con cuidado antes de guardar."
              )
      );
    },
    [
      L,
      liveCurrentBalance,
      planStartDate,
      riskPerTradePct,
      targetBalance,
      targetDateStr,
      targetMultiple,
    ]
  );

  const tradingDaysFromRange = useMemo(() => {
    if (!targetDateStr) return null;
    if (!planDatesOrdered) return null;
    const start = effectivePlanStartDate;
    const marketCount = computeProjectedTradingDaysBetween(
      start,
      targetDateStr,
      tradingInstrument
    );
    const count = computeCommittedTradingDaysBetween(
      start,
      targetDateStr,
      averageTradingDaysPerWeek,
      tradingInstrument
    );
    if (!Number.isFinite(count) || count <= 0) return null;
    return { start, count, marketCount };
  }, [averageTradingDaysPerWeek, effectivePlanStartDate, planDatesOrdered, targetDateStr, tradingInstrument]);

  const businessScenarioTradingDays = tradingDays > 0 ? tradingDays : (tradingDaysFromRange?.count ?? 60);
  const businessScenarios = useMemo(
    () =>
      buildBusinessScenarios({
        startingBalance: startingBalance > 0 ? startingBalance : 5000,
        tradingDays: businessScenarioTradingDays,
        averageTradingDaysPerWeek,
        isEs,
      }),
    [averageTradingDaysPerWeek, businessScenarioTradingDays, isEs, startingBalance]
  );
  const selectedBusinessScenario = useMemo(
    () => businessScenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null,
    [businessScenarios, selectedScenarioId]
  );
  const reviewScenario = useMemo(
    () => {
      const base =
        selectedBusinessScenario ?? businessScenarios.find((scenario) => scenario.recommended) ?? null;
      if (!base) return null;
      return {
        ...base,
        dailyGoalPct: goalDayReturnPct > 0 ? goalDayReturnPct : base.dailyGoalPct,
        expectedLossDayPct:
          expectedLossDayPct > 0
            ? Math.min(
                base.maxDailyLossPct,
                returnModelMode === "manual"
                  ? expectedLossDayPct
                  : Math.max(base.expectedLossDayPct, expectedLossDayPct)
              )
            : base.expectedLossDayPct,
        maxDailyLossPct: maxDailyLossPercent > 0 ? maxDailyLossPercent : base.maxDailyLossPct,
        riskPerTradePct: riskPerTradePct > 0 ? riskPerTradePct : base.riskPerTradePct,
        lossDaysPerWeek,
      };
    },
    [
      businessScenarios,
      expectedLossDayPct,
      goalDayReturnPct,
      lossDaysPerWeek,
      maxDailyLossPercent,
      riskPerTradePct,
      returnModelMode,
      selectedBusinessScenario,
    ]
  );
  const planRealismReview = useMemo(
    () =>
      buildPlanRealismReview({
        starting: startingBalance,
        target: targetBalance,
        startIso: effectivePlanStartDate,
        targetIso: targetDateStr,
        tradingDays: businessScenarioTradingDays,
        averageTradingDaysPerWeek,
        requiredGoalPct,
        planLossDaysPerWeek: lossDaysPerWeek,
        planMaxDailyLossPct:
          reviewScenario?.expectedLossDayPct ?? activeProjectionPolicy?.expectedLossDayPct ?? maxDailyLossPercent,
        scenario: reviewScenario,
        plannedDeposits: generatedPlannedDeposits,
        plannedWithdrawals: generatedPlannedWithdrawals,
        tradingInstrument,
        evidence: performanceEvidence,
      }),
    [
      businessScenarioTradingDays,
      averageTradingDaysPerWeek,
      effectivePlanStartDate,
      generatedPlannedWithdrawals,
      generatedPlannedDeposits,
      performanceEvidence,
      lossDaysPerWeek,
      activeProjectionPolicy,
      maxDailyLossPercent,
      requiredGoalPct,
      reviewScenario,
      startingBalance,
      targetBalance,
      targetDateStr,
      tradingInstrument,
    ]
  );

  const adaptiveGrowthPlan = useMemo(() => {
    const scenarioId = reviewScenario?.id ?? "moderate";
    const basePolicy = getGrowthPlanOperatingPolicy(scenarioId);
    const policy = reviewScenario
      ? {
          ...basePolicy,
          maxDailyLossPct: reviewScenario.maxDailyLossPct,
          riskPerTradePct: reviewScenario.riskPerTradePct,
          lossDaysPerWeek: reviewScenario.lossDaysPerWeek,
        }
      : basePolicy;
    return buildAdaptiveGrowthPlan({
      starting: startingBalance,
      target: targetBalance,
      startIso: effectivePlanStartDate,
      requestedTargetIso: targetDateStr,
      tradingInstrument,
      averageTradingDaysPerWeek,
      policy,
      selectedPlanId: selectedPlanId || policy.id,
      declaredGoalDayPct: reviewScenario?.dailyGoalPct ?? goalDayReturnPct,
      declaredExpectedLossDayPct: reviewScenario?.expectedLossDayPct ?? expectedLossDayPct,
      evidence: performanceEvidence,
      depositPlan: plannedDepositSettings,
      withdrawalPlan: plannedWithdrawalSettings,
      comparisonPolicies: (["conservative", "moderate", "aggressive"] as const).map((id) => ({
        ...getGrowthPlanOperatingPolicy(id),
        lossDaysPerWeek,
      })),
      estimatedCostPerSessionUsd,
      estimatedTaxReservePct,
      financialCapacity: {
        capitalSource: "business_income",
        accountStructure: accountStructure || null,
        maxLeverageMultiple,
      },
      solveSymmetricReturnPercent: !selectedPlanId,
    });
  }, [
    averageTradingDaysPerWeek,
    accountStructure,
    effectivePlanStartDate,
    estimatedCostPerSessionUsd,
    estimatedTaxReservePct,
    expectedLossDayPct,
    goalDayReturnPct,
    maxLeverageMultiple,
    performanceEvidence,
    plannedDepositSettings,
    plannedWithdrawalSettings,
    reviewScenario,
    selectedPlanId,
    startingBalance,
    targetBalance,
    targetDateStr,
    tradingInstrument,
  ]);

  const declaredReturnSummary = useMemo(() => {
    const totalDays = Math.max(1, averageTradingDaysPerWeek);
    const modeledLossDays = Math.min(totalDays - 1, Math.max(0, lossDaysPerWeek));
    const modeledGoalDays = Math.max(1, totalDays - modeledLossDays);
    const weeklyFactor =
      Math.pow(1 + Math.max(0, goalDayReturnPct) / 100, modeledGoalDays) *
      Math.pow(1 - Math.min(99, Math.max(0, expectedLossDayPct)) / 100, modeledLossDays);
    const weeklyPct = (weeklyFactor - 1) * 100;
    const annualCycles = Math.max(1, adaptiveGrowthPlan.modeledAnnualCycles);
    return {
      weeklyPct,
      monthlyPct: (Math.pow(weeklyFactor, annualCycles / 12) - 1) * 100,
      annualPct: (Math.pow(weeklyFactor, annualCycles) - 1) * 100,
      modeledGoalDays,
      modeledLossDays,
    };
  }, [
    adaptiveGrowthPlan.modeledAnnualCycles,
    averageTradingDaysPerWeek,
    expectedLossDayPct,
    goalDayReturnPct,
    lossDaysPerWeek,
  ]);

  const deadlineToleranceUsd = useMemo(
    () => growthPlanDeadlineToleranceUsd(targetBalance),
    [targetBalance]
  );
  const idealDeadlineOption = useMemo(
    () =>
      selectIdealDeadlineOption({
        scenarios: businessScenarios.map((scenario) => ({
          id: scenario.id,
        })),
        panoramas: adaptiveGrowthPlan.panoramas,
        targetBalance,
        toleranceUsd: deadlineToleranceUsd,
      }),
    [
      adaptiveGrowthPlan.panoramas,
      businessScenarios,
      deadlineToleranceUsd,
      targetBalance,
    ]
  );

  const aiRecommendedPlanId = useMemo<BusinessScenarioId | "mathematical">(() => {
    const ordered: BusinessScenarioId[] = ["conservative", "moderate", "aggressive"];
    const firstSupported = ordered.find((id) =>
      adaptiveGrowthPlan.panoramas.some(
        (panorama) =>
          panorama.id === id &&
          meetsGrowthPlanDeadlineApproximately({
            panorama,
            targetBalance,
            toleranceUsd: deadlineToleranceUsd,
          })
      )
    );
    return firstSupported ?? "mathematical";
  }, [adaptiveGrowthPlan.panoramas, deadlineToleranceUsd, targetBalance]);

  const selectedForecastAssumptions = useMemo(() => {
    if (!selectedPlanId) return null;
    if (selectedPlanId === "manual") {
      return {
        id: "manual" as const,
        goalDayPct: goalDayReturnPct,
        lossDayPct: expectedLossDayPct,
        maxDailyLossPct: maxDailyLossPercent,
        riskPerTradePct,
      };
    }
    const policy = getGrowthPlanOperatingPolicy(selectedPlanId);
    return {
      id: selectedPlanId,
      goalDayPct: policy.goalDayReturnPct,
      lossDayPct: policy.expectedLossDayPct,
      maxDailyLossPct: policy.maxDailyLossPct,
      riskPerTradePct: policy.riskPerTradePct,
    };
  }, [
    expectedLossDayPct,
    goalDayReturnPct,
    maxDailyLossPercent,
    riskPerTradePct,
    selectedPlanId,
  ]);

  const selectedForecastPanorama = useMemo(() => {
    if (!selectedForecastAssumptions) return null;
    const panoramaId = selectedForecastAssumptions.id === "manual" ? "declared" : selectedForecastAssumptions.id;
    return adaptiveGrowthPlan.panoramas.find((panorama) => panorama.id === panoramaId) ?? null;
  }, [adaptiveGrowthPlan.panoramas, selectedForecastAssumptions]);

  const researchReviewInputKey = useMemo(() => {
    if (!selectedPlanId || !selectedForecastAssumptions || !selectedForecastPanorama) return "";
    return JSON.stringify({
      selectedPlanId,
      startingBalance,
      targetBalance,
      targetDateStr,
      tradingInstrument,
      averageTradingDaysPerWeek,
      winningDaysPerWeek,
      lossDaysPerWeek,
      goalDayPct: selectedForecastAssumptions.goalDayPct,
      lossDayPct: selectedForecastAssumptions.lossDayPct,
      maxDailyLossPct: selectedForecastAssumptions.maxDailyLossPct,
      riskPerTradePct: selectedForecastAssumptions.riskPerTradePct,
      projectedBalance: selectedForecastPanorama.projectedBalance,
      completionDate: selectedForecastPanorama.completionDate,
      conditionalHitRate: selectedForecastPanorama.probability.probabilityTargetPct,
      evidenceSessions: planRealismReview.evidenceSessions,
      evidenceTrades: planRealismReview.evidenceTrades,
      evidenceUpdatedAt: performanceEvidence?.updatedAtIso ?? null,
      plannedDepositSettings,
      plannedWithdrawalSettings,
    });
  }, [
    averageTradingDaysPerWeek,
    lossDaysPerWeek,
    performanceEvidence?.updatedAtIso,
    planRealismReview.evidenceSessions,
    planRealismReview.evidenceTrades,
    plannedDepositSettings,
    plannedWithdrawalSettings,
    selectedForecastAssumptions,
    selectedForecastPanorama,
    selectedPlanId,
    startingBalance,
    targetBalance,
    targetDateStr,
    tradingInstrument,
    winningDaysPerWeek,
  ]);
  currentResearchReviewKeyRef.current = researchReviewInputKey;

  const effectiveForecastTargetDate =
    selectedForecastPanorama?.completionDate &&
    selectedForecastPanorama.completionDate > targetDateStr
      ? selectedForecastPanorama.completionDate
      : targetDateStr;

  const selectedForecastProjection = useMemo(() => {
    if (
      !selectedForecastAssumptions ||
      startingBalance <= 0 ||
      targetBalance <= 0 ||
      !effectiveForecastTargetDate
    ) {
      return null;
    }
    return buildPlanProjection({
      starting: startingBalance,
      target: targetBalance,
      startIso: effectivePlanStartDate,
      targetIso: effectiveForecastTargetDate,
      averageTradingDaysPerWeek,
      lossDaysPerWeek,
      maxDailyLossPercent: Math.max(
        selectedForecastAssumptions.maxDailyLossPct,
        selectedForecastAssumptions.lossDayPct
      ),
      modeledLossDayPercent: selectedForecastAssumptions.lossDayPct,
      goalDayReturnPercent: selectedForecastAssumptions.goalDayPct,
      stopAtTarget: true,
      depositSettings: plannedDepositSettings,
      withdrawalSettings: plannedWithdrawalSettings,
      existingWithdrawals: plannedWithdrawals,
      tradingInstrument,
      estimatedCostPerSessionUsd,
    });
  }, [
    averageTradingDaysPerWeek,
    effectiveForecastTargetDate,
    effectivePlanStartDate,
    estimatedCostPerSessionUsd,
    lossDaysPerWeek,
    plannedDepositSettings,
    plannedWithdrawalSettings,
    plannedWithdrawals,
    selectedForecastAssumptions,
    startingBalance,
    targetBalance,
    tradingInstrument,
  ]);

  const selectedForecastChart = useMemo(() => {
    const rows = selectedForecastProjection?.rows ?? [];
    if (!rows.length) return [];
    const stride = Math.max(1, Math.ceil(rows.length / 36));
    const sampled = rows.filter((_, index) => index % stride === 0 || index === rows.length - 1);
    return [
      {
        date: effectivePlanStartDate,
        projected: startingBalance,
        target: targetBalance,
      },
      ...sampled.map((row) => ({
        date: row.isoDate,
        projected: Number(row.endBalance.toFixed(2)),
        target: targetBalance,
      })),
    ];
  }, [effectivePlanStartDate, selectedForecastProjection?.rows, startingBalance, targetBalance]);

  const selectReturnModel = (mode: Exclude<OperatingReturnMode, "">, finalize = false) => {
    const fallbackScenario: BusinessScenarioId = selectedScenarioId || "moderate";
    const scenarioId = mode === "manual" ? fallbackScenario : mode;
    const policy = getGrowthPlanOperatingPolicy(scenarioId);
    setSelectedScenarioId(scenarioId);
    setReturnModelMode(mode);
    setSelectedPlanId(finalize ? mode : "");
    lastAutoReviewKeyRef.current = "";
    researchReviewRequestIdRef.current += 1;
    setResearchReview(null);
    setResearchReviewError("");

    if (mode !== "manual" || goalDayReturnPct <= 0) {
      setGoalDayReturnPctStr(String(policy.goalDayReturnPct));
    }
    if (mode !== "manual" || expectedLossDayPct <= 0) {
      setExpectedLossDayPctStr(String(policy.expectedLossDayPct));
    }
    if (mode !== "manual" || maxDailyLossPercent <= 0) {
      setMaxDailyLossPercentStr(String(policy.maxDailyLossPct));
    }
    if (mode !== "manual" || riskPerTradePct <= 0) {
      setRiskPerTradePctStr(String(policy.riskPerTradePct));
    }
  };

  useEffect(() => {
    if (!returnModelMode || returnModelMode === "manual") return;
    const policy = getGrowthPlanOperatingPolicy(returnModelMode);
    setSelectedScenarioId(returnModelMode);
    setSelectedPlanId((current) => (current === returnModelMode ? current : ""));
    setGoalDayReturnPctStr(String(policy.goalDayReturnPct));
    setExpectedLossDayPctStr(String(policy.expectedLossDayPct));
    setMaxDailyLossPercentStr(String(policy.maxDailyLossPct));
    setRiskPerTradePctStr(String(policy.riskPerTradePct));
  }, [returnModelMode]);

  const aiPlanAdvisor = useMemo(
    () =>
      buildAdaptivePlanAdvisor({
        adaptivePlan: adaptiveGrowthPlan,
        scenario: reviewScenario,
        isEs,
      }),
    [
      adaptiveGrowthPlan,
      isEs,
      reviewScenario,
    ]
  );
  const activeProjectedCheckpoint = useMemo(() => {
    const today = isoToday();
    const milestones = aiPlanAdvisor.weeklyMilestones;
    return milestones.find((milestone) => milestone.targetDate >= today) ?? milestones[milestones.length - 1] ?? null;
  }, [aiPlanAdvisor.weeklyMilestones]);

  const applyAiPlanRecommendation = () => {
    if (!reviewScenario || !aiPlanAdvisor.shouldSurface) return;
    if (
      !aiPlanAdvisor.recommendedCompletionDate ||
      !aiPlanAdvisor.requestedTargetDate ||
      aiPlanAdvisor.recommendedCompletionDate <= aiPlanAdvisor.requestedTargetDate
    ) {
      return;
    }

    setSelectedScenarioId(reviewScenario.id);
    setReturnModelMode(reviewScenario.id);
    setSelectedPlanId(reviewScenario.id);
    setGoalDayReturnPctStr(String(aiPlanAdvisor.recommendedDailyGoalPct));
    setExpectedLossDayPctStr(String(aiPlanAdvisor.expectedLossDayPct));
    setRiskPerTradePctStr(String(reviewScenario.riskPerTradePct));
    setMaxDailyLossPercentStr(String(reviewScenario.maxDailyLossPct));
    setLossDaysPerWeekStr(
      String(clampInt(reviewScenario.lossDaysPerWeek, 0, averageTradingDaysPerWeek))
    );
    if (aiPlanAdvisor.recommendedCompletionDate) {
      const recommendedRunway = inferTradingRunway(
        effectivePlanStartDate,
        aiPlanAdvisor.recommendedCompletionDate
      );
      setRunwayAmountStr(String(recommendedRunway.amount));
      setRunwayUnit(recommendedRunway.unit);
      setTargetDateStr(aiPlanAdvisor.recommendedCompletionDate);
      setTradingDaysTouched(false);
    }
    setAutoPhasesGenerated(true);
    setError("");
    pushNeuroMessage(
      L(
        `Disciplined horizon applied: ${aiPlanAdvisor.recommendedDailyGoalPct.toFixed(2)}% on goal-days, ${aiPlanAdvisor.expectedLossDayPct.toFixed(2)}% expected on modeled losing days, with the completion estimate moved to ${formatPlanDate(aiPlanAdvisor.recommendedCompletionDate, lang)}.`,
        `Horizonte disciplinado aplicado: ${aiPlanAdvisor.recommendedDailyGoalPct.toFixed(2)}% en días de meta, ${aiPlanAdvisor.expectedLossDayPct.toFixed(2)}% esperado en días perdedores modelados, con la fecha estimada movida a ${formatPlanDate(aiPlanAdvisor.recommendedCompletionDate, lang)}.`
      )
    );
  };

  const applyIdealDeadlineOption = () => {
    if (!idealDeadlineOption) return;
    const scenario = businessScenarios.find(
      (item) => item.id === idealDeadlineOption.scenarioId
    );
    if (!scenario) return;

    selectReturnModel(scenario.id, true);
    const runway = inferTradingRunway(
      effectivePlanStartDate,
      idealDeadlineOption.completionDate
    );
    setRunwayAmountStr(String(runway.amount));
    setRunwayUnit(runway.unit);
    setTargetDateStr(idealDeadlineOption.completionDate);
    setTradingDaysTouched(false);
    setAutoPhasesGenerated(true);
    setVisibleForecastRows(60);
    setError("");
    pushNeuroMessage(
      L(
        `Balanced standard plan applied: ${scenario.title} with the attainable mathematical date ${formatPlanDate(idealDeadlineOption.completionDate, lang)}.`,
        `Plan estándar balanceado aplicado: ${scenario.title} con la fecha matemática alcanzable ${formatPlanDate(idealDeadlineOption.completionDate, lang)}.`
      )
    );
  };

  const runResearchPlanReview = async () => {
    if (
      !planRealismReview.shouldSurface ||
      !reviewScenario ||
      !selectedPlanId ||
      !selectedForecastAssumptions ||
      !selectedForecastPanorama ||
      !researchReviewInputKey
    ) {
      setResearchReviewError(
        L(
          "Choose an operating scenario before requesting its AI review.",
          "Escoge un escenario operativo antes de solicitar su evaluación con IA."
        )
      );
      return;
    }

    const requestKey = researchReviewInputKey;
    const requestId = researchReviewRequestIdRef.current + 1;
    researchReviewRequestIdRef.current = requestId;
    setResearchReviewLoading(true);
    setResearchReviewError("");
    setResearchReview(null);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error(L("Your session expired.", "Tu sesión expiró."));
      const response = await fetch("/api/growth-plan/advisor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          locale: isEs ? "es" : "en",
          startingCapitalUsd: startingBalance,
          targetCapitalUsd: targetBalance,
          targetDate: targetDateStr,
          tradingInstrument,
          committedTradingDays: planRealismReview.tradingDays,
          targetReturnPct: planRealismReview.targetReturnPct,
          annualizedTargetReturnPct: planRealismReview.annualizedTargetReturnPct,
          perfectPathReturnPerSessionPct: planRealismReview.requiredCompoundDailyPct,
          requiredGoalDayReturnPct: planRealismReview.requiredGoalPct,
          modeledGoalDays: planRealismReview.modeledGoalDays,
          modeledLossDays: planRealismReview.modeledLossDays,
          modeledMaxLossPct: planRealismReview.modeledMaxLossPct,
          activeScenarioGoalDayPct: planRealismReview.scenarioDailyGoalPct,
          activeScenarioCoveragePct: planRealismReview.scenarioCoveragePct,
          activeScenarioProjectedCapitalUsd: planRealismReview.scenarioProjectedBalance,
          deadlineGapUsd: planRealismReview.scenarioGapUsd,
          verdict: planRealismReview.verdict,
          flags: planRealismReview.flags,
          selectedScenario: {
            id: selectedPlanId,
            title: aiPlanAdvisor.scenarioTitle,
            goalDayReturnPct: selectedForecastAssumptions.goalDayPct,
            expectedLossDayPct: selectedForecastAssumptions.lossDayPct,
            maxDailyLossGuardrailPct: selectedForecastAssumptions.maxDailyLossPct,
            riskPerTradePct: selectedForecastAssumptions.riskPerTradePct,
            goalDaysPerWeek: Math.max(0, averageTradingDaysPerWeek - lossDaysPerWeek),
            lossDaysPerWeek,
            projectedBalanceAtDeadlineUsd: selectedForecastPanorama.projectedBalance,
            coverageAtDeadlinePct:
              targetBalance > 0
                ? Math.min(100, (selectedForecastPanorama.projectedBalance / targetBalance) * 100)
                : 0,
            shortfallAtDeadlineUsd: Math.max(
              0,
              targetBalance - selectedForecastPanorama.projectedBalance
            ),
            completionDate: selectedForecastPanorama.completionDate,
            reachesRequestedDeadline: selectedForecastPanorama.reachesRequestedDeadline,
            sensitivity: {
              probabilityTargetPct:
                selectedForecastPanorama.probability.probabilityTargetPct,
              probabilityCapitalHalfPct:
                selectedForecastPanorama.probability.probabilityCapitalHalfPct,
              p10BalanceUsd: selectedForecastPanorama.probability.p10Balance,
              medianBalanceUsd: selectedForecastPanorama.probability.medianBalance,
              p90BalanceUsd: selectedForecastPanorama.probability.p90Balance,
              medianMaxDrawdownPct:
                selectedForecastPanorama.probability.medianMaxDrawdownPct,
            },
          },
          adaptivePlan: {
            verdict: adaptiveGrowthPlan.verdict,
            isProvisional: adaptiveGrowthPlan.isProvisional,
            requestedProjectedBalanceUsd: adaptiveGrowthPlan.requestedProjectedBalance,
            requestedCoveragePct: adaptiveGrowthPlan.requestedCoveragePct,
            requestedShortfallUsd: adaptiveGrowthPlan.requestedShortfallUsd,
            requestedTradingGrowthUsd: adaptiveGrowthPlan.requestedTradingGrowthUsd,
            requestedDepositsUsd: adaptiveGrowthPlan.requestedDepositsUsd,
            requestedWithdrawalsUsd: adaptiveGrowthPlan.requestedWithdrawalsUsd,
            requestedNetCashflowUsd: adaptiveGrowthPlan.requestedNetCashflowUsd,
            requestedRequiredGoalDayPct: adaptiveGrowthPlan.requestedRequiredGoalDayPct,
            targetAnnualizedReturnPct: adaptiveGrowthPlan.targetAnnualizedReturnPct,
            mathematicallyPossible: adaptiveGrowthPlan.mathematicallyPossible,
            targetProjectionGoalDayPct: adaptiveGrowthPlan.targetProjectionGoalDayPct,
            targetProjectionBalanceUsd: adaptiveGrowthPlan.targetProjectionBalance,
            targetProjectionCoveragePct: adaptiveGrowthPlan.targetProjectionCoveragePct,
            targetProjectionTradingGrowthUsd: adaptiveGrowthPlan.targetProjectionTradingGrowthUsd,
            targetProjectionEstimatedCostsUsd: adaptiveGrowthPlan.targetProjectionEstimatedCostsUsd,
            requestedGrossProjectedBalanceUsd: adaptiveGrowthPlan.requestedGrossProjectedBalance,
            requestedGrossTradingGrowthUsd: adaptiveGrowthPlan.requestedGrossTradingGrowthUsd,
            requestedCostDragUsd: adaptiveGrowthPlan.requestedCostDragUsd,
            costsConsumePercentageEdge: adaptiveGrowthPlan.costsConsumePercentageEdge,
            requestedEstimatedCostsUsd: adaptiveGrowthPlan.requestedEstimatedCostsUsd,
            requestedEstimatedTaxReserveUsd: adaptiveGrowthPlan.requestedEstimatedTaxReserveUsd,
            requestedAfterTaxReserveBalance: adaptiveGrowthPlan.requestedAfterTaxReserveBalance,
            declaredGoalDayPct: adaptiveGrowthPlan.declaredGoalDayPct,
            declaredExpectedLossDayPct: adaptiveGrowthPlan.declaredExpectedLossDayPct,
            policyGoalDayCapPct: adaptiveGrowthPlan.policyGoalDayCapPct,
            policyExpectedLossDayFloorPct: adaptiveGrowthPlan.policyExpectedLossDayFloorPct,
            recommendedGoalDayPct: adaptiveGrowthPlan.recommendedGoalDayPct,
            expectedLossDayPct: adaptiveGrowthPlan.expectedLossDayPct,
            maxDailyLossGuardrailPct: adaptiveGrowthPlan.maxDailyLossGuardrailPct,
            riskPerTradePct: adaptiveGrowthPlan.riskPerTradePct,
            lossDaysPerWeek: adaptiveGrowthPlan.lossDaysPerWeek,
            operatingDaysPerWeek: adaptiveGrowthPlan.operatingDaysPerWeek,
            modeledNetReturnPerSessionPct: adaptiveGrowthPlan.modeledNetReturnPerSessionPct,
            modeledWeeklyReturnPct: adaptiveGrowthPlan.modeledWeeklyReturnPct,
            modeledAnnualCycles: adaptiveGrowthPlan.modeledAnnualCycles,
            modeledAnnualReturnPct: adaptiveGrowthPlan.modeledAnnualReturnPct,
            recommendedCompletionDate: adaptiveGrowthPlan.recommendedCompletionDate,
            recommendedTradingSessions: adaptiveGrowthPlan.recommendedTradingSessions,
            recommendedCalendarMonths: adaptiveGrowthPlan.recommendedCalendarMonths,
            qualificationRequired: adaptiveGrowthPlan.qualificationRequired,
            qualificationMinimumSessions: adaptiveGrowthPlan.qualificationMinimumSessions,
            capacityStatus: adaptiveGrowthPlan.capacityStatus,
            capacityFlags: adaptiveGrowthPlan.capacityFlags,
            panoramas: adaptiveGrowthPlan.panoramas,
            selectedPlanId: adaptiveGrowthPlan.selectedPlanId,
            statisticalValidation: adaptiveGrowthPlan.statisticalValidation,
            flags: adaptiveGrowthPlan.flags,
            nextWeeklyCheckpoints: adaptiveGrowthPlan.weeklyMilestones.slice(0, 12),
            nextMonthlyCheckpoints: adaptiveGrowthPlan.monthlyMilestones.slice(0, 12),
            quarterlyCheckpoints: adaptiveGrowthPlan.quarterlyMilestones.slice(0, 12),
            semiannualCheckpoints: adaptiveGrowthPlan.semiannualMilestones,
            annualCheckpoints: adaptiveGrowthPlan.annualMilestones,
          },
          financialCapacity: {
            capitalSource: "business_income",
            accountStructure,
            maxLeverageMultiple,
            estimatedCostPerSessionUsd,
            estimatedTaxReservePct,
          },
          executionEvidence: {
            depth: planRealismReview.evidenceDepth,
            sessions: planRealismReview.evidenceSessions,
            trades: planRealismReview.evidenceTrades,
            winRatePct: performanceEvidence?.winRate ?? null,
            profitFactor: performanceEvidence?.profitFactor ?? null,
            expectancyUsd: performanceEvidence?.expectancy ?? null,
            avgNetPerSessionUsd: performanceEvidence?.avgNetPerSession ?? null,
            maxDrawdownPct: performanceEvidence?.maxDrawdownPct ?? null,
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        review?: GrowthPlanResearchReview;
        error?: string;
      };
      if (!response.ok || !body.review) {
        throw new Error(body.error || L("The review could not be generated.", "No se pudo generar la evaluación."));
      }
      if (
        researchReviewRequestIdRef.current !== requestId ||
        currentResearchReviewKeyRef.current !== requestKey
      ) {
        return;
      }
      setResearchReview(body.review);
    } catch (reviewError: any) {
      if (
        researchReviewRequestIdRef.current !== requestId ||
        currentResearchReviewKeyRef.current !== requestKey
      ) {
        return;
      }
      setResearchReviewError(
        String(reviewError?.message || L("The review could not be generated.", "No se pudo generar la evaluación."))
      );
    } finally {
      if (researchReviewRequestIdRef.current === requestId) {
        setResearchReviewLoading(false);
      }
    }
  };

  useEffect(() => {
    if (step !== 0 || step0Stage !== 7 || researchReviewLoading) return;
    if (!planRealismReview.shouldSurface || !reviewScenario || !selectedPlanId) return;
    if (!researchReviewInputKey || lastAutoReviewKeyRef.current === researchReviewInputKey) return;
    lastAutoReviewKeyRef.current = researchReviewInputKey;
    void runResearchPlanReview();
  }, [
    planRealismReview.shouldSurface,
    researchReviewLoading,
    researchReviewInputKey,
    reviewScenario,
    selectedPlanId,
    step,
    step0Stage,
  ]);

  const planHistoryItems = useMemo(
    () =>
      planHistory.map((entry) => {
        const snapshot: any = entry.snapshot ?? {};
        const changedFields = Array.isArray(snapshot.changedFields)
          ? snapshot.changedFields.map((field: unknown) => String(field)).filter(Boolean)
          : [];
        return {
          id: entry.id,
          dateLabel: formatHistoryDate(entry.createdAt, lang),
          reasonLabel: historyReasonLabel(String(snapshot.reason ?? entry.resetReason ?? ""), L),
          changedFields,
        };
      }),
    [L, lang, planHistory]
  );

  const autoCadenceUnit = L("Week", "Semana");

  // PDF events
  const onDownloadPdfSuggested = async () => {
    await generateAndDownloadPDF(
      suggestedRows,
      {
        name: (user as any)?.name || L("User", "Usuario"),
        startingBalance,
        targetBalance,
        tradingDays,
        averageTradingDaysPerWeek,
        maxDailyLossPercent,
        lossDaysPerWeek,
        requiredGoalPct,
        explainRequired: {
          goalDays: explainRequired.goalDays,
          totalLossDays: explainRequired.totalLossDays,
          prodLoss: explainRequired.prodLoss,
          totalPlannedDeposit: explainRequired.totalPlannedDeposit,
          plannedDepositCount: explainRequired.plannedDepositCount,
          totalPlannedWithdrawal: explainRequired.totalPlannedWithdrawal,
          plannedWithdrawalCount: explainRequired.plannedWithdrawalCount,
        },
      },
      lang
    );

    const text =
      (await neuroReact("pdf_downloaded", lang, { mode: "suggested" })) ||
      L(
        "Downloaded. This schedule is structure—not a promise. Now commit to execute it.",
        "Descargado. Este calendario es estructura, no promesa. Ahora comprométete a ejecutarlo."
      );
    pushNeuroMessage(text);
      };

  const lossDaysSet = lossDaysPerWeekStr.trim().length > 0;
  const canGeneratePhases =
    startingBalance > 0 &&
    targetBalance > 0 &&
    !!planStartDate &&
    !!targetDateStr &&
    planDatesOrdered &&
    averageTradingDaysSet &&
    maxDailyLossPercent > 0 &&
    lossDaysSet &&
    returnModelConfigured &&
    capitalFlowAssumptionsComplete;

  useEffect(() => {
    if (canGeneratePhases) {
      if (!autoPhasesGenerated) {
        setAutoPhasesGenerated(true);
        setError("");
      }
      return;
    }
    if (autoPhasesGenerated) setAutoPhasesGenerated(false);
  }, [canGeneratePhases, autoPhasesGenerated]);
  const legacyStep0Stages = [
    {
      id: "business_analysis",
      anchor: "gp-business-analysis",
      title: L("Business Analysis", "Análisis empresarial"),
      description: L(
        "Answer this first so the plan can suggest conservative, moderate, and aggressive operating scenarios from your real context.",
        "Contesta esto primero para que el plan sugiera escenarios conservador, moderado y agresivo desde tu contexto real."
      ),
      isComplete: businessAnalysisComplete,
      content: (
        <div id="gp-business-analysis" className="space-y-5">
          <div className="rounded-2xl border border-slate-700/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">
                  {L("Capital policy profile", "Perfil de política de capital")}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-100">
                  {L(
                    "Set the operating posture before the plan talks numbers.",
                    "Define la postura operativa antes de que el plan hable números."
                  )}
                </p>
              </div>
              <span className="rounded-full border border-slate-600 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold text-slate-300">
                {L("Private back-office inputs", "Inputs privados de back-office")}
              </span>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <label
                  htmlFor="gp-business-starting-balance"
                  className="text-[10px] uppercase tracking-[0.18em] text-slate-500"
                >
                  {L("Starting capital", "Capital inicial")}
                </label>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 transition focus-within:border-cyan-300 focus-within:ring-2 focus-within:ring-cyan-300/10">
                  <span className="text-base font-semibold text-cyan-200">$</span>
                  <input
                    id="gp-business-starting-balance"
                    inputMode="decimal"
                    aria-label={L("Starting capital in USD", "Capital inicial en USD")}
                    value={startingBalanceStr}
                    onFocus={() => fieldHelp("starting_balance")}
                    onChange={(event) => {
                      setStartingBalanceStr(formatMoneyInputDraft(event.target.value));
                      setAutoPhasesGenerated(false);
                    }}
                    onBlur={() => {
                      if (!startingBalanceStr.trim()) return;
                      setStartingBalanceStr(formatMoneyInputValue(Math.max(0, startingBalance)));
                    }}
                    className="min-w-0 flex-1 bg-transparent py-2 text-lg font-semibold text-slate-100 outline-none placeholder:text-slate-700"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <label
                  htmlFor="gp-business-target-balance"
                  className="text-[10px] uppercase tracking-[0.18em] text-slate-500"
                >
                  {L("Business target", "Meta empresarial")}
                </label>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 transition focus-within:border-cyan-300 focus-within:ring-2 focus-within:ring-cyan-300/10">
                  <span className="text-base font-semibold text-cyan-200">$</span>
                  <input
                    id="gp-business-target-balance"
                    inputMode="decimal"
                    aria-label={L("Business target in USD", "Meta empresarial en USD")}
                    value={targetBalanceStr}
                    onFocus={() => fieldHelp("target_balance")}
                    onChange={(event) => {
                      setTargetBalanceStr(formatMoneyInputDraft(event.target.value));
                      setAutoPhasesGenerated(false);
                    }}
                    onBlur={() => {
                      if (!targetBalanceStr.trim()) return;
                      setTargetBalanceStr(formatMoneyInputValue(Math.max(0, targetBalance)));
                    }}
                    className="min-w-0 flex-1 bg-transparent py-2 text-lg font-semibold text-slate-100 outline-none placeholder:text-slate-700"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <label className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {L("Trading runway", "Runway de trading")}
                </label>
                <div className="mt-1 grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={runwayLimit}
                    value={runwayAmountStr}
                    onChange={(event) => {
                      setRunwayAmountStr(event.target.value.replace(/\D/g, "").slice(0, 5));
                      setAutoPhasesGenerated(false);
                    }}
                    onBlur={() => setRunwayAmountStr(String(runwayAmount))}
                    aria-invalid={runwayAmountExceedsLimit}
                    className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-lg font-semibold text-slate-100 outline-none focus:border-cyan-300"
                    aria-label={L("Runway amount", "Cantidad del runway")}
                  />
                  <select
                    value={runwayUnit}
                    onChange={(event) => {
                      const nextUnit = normalizeTradingRunwayUnit(event.target.value);
                      setRunwayUnit(nextUnit);
                      setRunwayAmountStr((current) =>
                        String(clampTradingRunwayAmount(toNum(current, 1), nextUnit))
                      );
                      setAutoPhasesGenerated(false);
                    }}
                    className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300"
                  >
                    <option value="days">{L("Days", "Días")}</option>
                    <option value="weeks">{L("Weeks", "Semanas")}</option>
                    <option value="months">{L("Months", "Meses")}</option>
                    <option value="years">{L("Years", "Años")}</option>
                  </select>
                </div>
                {runwayAmountExceedsLimit ? (
                  <p className="mt-2 text-[11px] text-amber-300">
                    {L(
                      `Maximum for this unit is ${runwayLimit}. The safe limit is being used for the forecast.`,
                      `El máximo para esta unidad es ${runwayLimit}. El forecast está usando el límite seguro.`
                    )}
                  </p>
                ) : null}
                <p className="mt-2 text-[11px] text-slate-500">
                  {targetDateStr || "—"} · {businessScenarioTradingDays || 0} {L("committed days", "días comprometidos")}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <label
                  htmlFor="gp-trading-instrument"
                  className="text-[10px] uppercase tracking-[0.18em] text-slate-500"
                >
                  {L("Primary instrument", "Instrumento principal")}
                </label>
                <select
                  id="gp-trading-instrument"
                  value={tradingInstrument}
                  onChange={(event) => {
                    const nextInstrument = normalizeTradingInstrument(event.target.value);
                    const nextProfile = getTradingCalendarProfile(nextInstrument);
                    setTradingInstrument(nextInstrument);
                    setAverageTradingDaysPerWeekStr((current) =>
                      String(
                        resolveAverageTradingDaysPerWeek(
                          current,
                          nextProfile.sessionsPerWeek
                        )
                      )
                    );
                    setTradingDaysTouched(false);
                    setAutoPhasesGenerated(false);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300"
                >
                  <option value="stocks">{L("Stocks / ETFs", "Acciones / ETFs")}</option>
                  <option value="options">{L("US listed options", "Opciones listadas en EE. UU.")}</option>
                  <option value="futures">{L("Futures", "Futuros")}</option>
                  <option value="forex">Forex</option>
                  <option value="crypto">Crypto</option>
                  <option value="other">{L("Other", "Otro")}</option>
                </select>
                <p className="mt-2 text-[11px] text-slate-500">
                  {tradingCalendarProfile.isEstimate
                    ? L("Calendar estimate; verify the selected contract or venue.", "Calendario estimado; verifica el contrato o mercado seleccionado.")
                    : L("Calendar applied automatically.", "Calendario aplicado automáticamente.")}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
              {L(
                "Capital, target, runway, instrument calendar, scenarios, and checkpoints recalculate as one operating model. Dates are planning estimates, not return promises.",
                "Capital, meta, runway, calendario del instrumento, escenarios y checkpoints se recalculan como un solo modelo operativo. Las fechas son estimados de planificación, no promesas de rendimiento."
              )}
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300">
                  {L("Operating scenario desk", "Mesa de escenarios operativos")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {L(
                    "These are capital policies, not promises. Select the risk structure your trading business can actually execute.",
                    "Estas son políticas de capital, no promesas. Escoge la estructura de riesgo que tu empresa de trading puede ejecutar de verdad."
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(8,18,38,0.96),rgba(4,12,28,0.98))] shadow-[0_18px_50px_rgba(2,8,23,0.28)]">
              <div className="border-b border-slate-800/90 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300">
                      {L("Capital & operating assumptions", "Supuestos de capital y operación")}
                    </p>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
                      {L(
                        "Define how the account is expected to operate before evaluating the deadline. Contributions are never counted as trading return.",
                        "Define cómo se espera que opere la cuenta antes de evaluar el plazo. Las aportaciones nunca se cuentan como rendimiento de trading."
                      )}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    businessAnalysisComplete
                      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                      : "border-amber-300/30 bg-amber-300/10 text-amber-200"
                  }`}>
                    {businessAnalysisComplete
                      ? L("Ready to evaluate", "Listo para evaluar")
                      : L("Complete assumptions", "Completa los supuestos")}
                  </span>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {L("Return model", "Modelo de retorno")}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {(["conservative", "moderate", "aggressive", "manual"] as const).map((mode) => {
                      const active = returnModelMode === mode;
                      const policy = getGrowthPlanOperatingPolicy(
                        mode === "manual" ? selectedScenarioId || "moderate" : mode
                      );
                      const policyLossDays = Math.min(
                        Math.max(0, averageTradingDaysPerWeek - 1),
                        policy.lossDaysPerWeek
                      );
                      const policyGoalDays = Math.max(1, averageTradingDaysPerWeek - policyLossDays);
                      const policyWeeklyReturn =
                        (Math.pow(1 + policy.goalDayReturnPct / 100, policyGoalDays) *
                          Math.pow(1 - policy.expectedLossDayPct / 100, policyLossDays) -
                          1) *
                        100;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => selectReturnModel(mode)}
                          className={`rounded-xl border px-3 py-3 text-left transition ${
                            active
                              ? "border-cyan-300 bg-cyan-300/10 shadow-[0_0_24px_rgba(34,211,238,0.08)]"
                              : "border-slate-800 bg-slate-950/60 hover:border-slate-600"
                          }`}
                        >
                          <span className={`block text-xs font-semibold ${active ? "text-cyan-100" : "text-slate-200"}`}>
                            {mode === "conservative"
                              ? L("Conservative", "Conservador")
                              : mode === "moderate"
                                ? L("Moderate", "Moderado")
                                : mode === "aggressive"
                                  ? L("Aggressive", "Agresivo")
                                  : L("Manual", "Manual")}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-500">
                            {mode === "manual"
                              ? L("Set your own assumptions", "Define tus propios supuestos")
                              : L(
                                  `${policy.goalDayReturnPct.toFixed(2)}% goal day · ${policy.expectedLossDayPct.toFixed(2)}% loss day`,
                                  `${policy.goalDayReturnPct.toFixed(2)}% día-meta · ${policy.expectedLossDayPct.toFixed(2)}% día perdedor`
                                )}
                          </span>
                          {mode !== "manual" ? (
                            <span className="mt-1 block text-[10px] font-semibold text-cyan-300/80">
                              {L(
                                `${policyWeeklyReturn.toFixed(2)}% modeled week`,
                                `${policyWeeklyReturn.toFixed(2)}% semana modelada`
                              )}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-xs text-slate-300">
                    {L("Goal-day return %", "Retorno del día-meta %")}
                    <input
                      className={`${inputBase} mt-1 ${returnModelMode && returnModelMode !== "manual" ? "cursor-not-allowed opacity-70" : ""}`}
                      inputMode="decimal"
                      value={goalDayReturnPctStr}
                      readOnly={!!returnModelMode && returnModelMode !== "manual"}
                      onChange={(event) => {
                        setSelectedPlanId("");
                        setGoalDayReturnPctStr(event.target.value);
                      }}
                      placeholder="0.20"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    {L("Expected losing-day %", "Pérdida esperada por día %")}
                    <input
                      className={`${inputBase} mt-1 ${returnModelMode && returnModelMode !== "manual" ? "cursor-not-allowed opacity-70" : ""}`}
                      inputMode="decimal"
                      value={expectedLossDayPctStr}
                      readOnly={!!returnModelMode && returnModelMode !== "manual"}
                      onChange={(event) => {
                        setSelectedPlanId("");
                        setExpectedLossDayPctStr(event.target.value);
                      }}
                      placeholder="0.35"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    {L("Trading days / week", "Días de trading / semana")}
                    <input
                      className={`${inputBase} mt-1`}
                      inputMode="numeric"
                      value={averageTradingDaysPerWeekStr}
                      onChange={(event) => setAverageTradingDaysPerWeekStr(event.target.value)}
                      placeholder="5"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    {L("Expected losing days / week", "Días perdedores esperados / semana")}
                    <input
                      className={`${inputBase} mt-1`}
                      inputMode="numeric"
                      value={lossDaysPerWeekStr}
                      onChange={(event) => setLossDaysPerWeekStr(event.target.value)}
                      placeholder="1"
                    />
                  </label>
                </div>

                {returnModelConfigured ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      [L("Modeled week", "Semana modelada"), declaredReturnSummary.weeklyPct],
                      [L("Modeled month", "Mes modelado"), declaredReturnSummary.monthlyPct],
                      [L("Modeled year", "Año modelado"), declaredReturnSummary.annualPct],
                      [L("Win / loss days", "Días meta / pérdida"), null],
                    ].map(([label, value], index) => (
                      <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
                        <p className="mt-1 text-base font-semibold text-slate-100">
                          {index === 3
                            ? `${declaredReturnSummary.modeledGoalDays} / ${declaredReturnSummary.modeledLossDays}`
                            : `${Number(value).toFixed(2)}%`}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-3 xl:grid-cols-2">
                  {([
                    {
                      kind: "deposit" as const,
                      title: L("Future contributions", "Aportaciones futuras"),
                      subtitle: L("Money added to the account", "Dinero añadido a la cuenta"),
                      mode: plannedDepositMode,
                      setMode: setPlannedDepositMode,
                      frequency: plannedDepositFrequency,
                      setFrequency: setPlannedDepositFrequency,
                      amount: plannedDepositAmountStr,
                      setAmount: setPlannedDepositAmountStr,
                      startPeriod: plannedDepositStartPeriodStr,
                      setStartPeriod: setPlannedDepositStartPeriodStr,
                    },
                    {
                      kind: "withdrawal" as const,
                      title: L("Planned withdrawals", "Retiros planificados"),
                      subtitle: L("Money removed from the account", "Dinero retirado de la cuenta"),
                      mode: plannedWithdrawalMode,
                      setMode: setPlannedWithdrawalMode,
                      frequency: plannedWithdrawalFrequency,
                      setFrequency: setPlannedWithdrawalFrequency,
                      amount: plannedWithdrawalAmountStr,
                      setAmount: setPlannedWithdrawalAmountStr,
                      startPeriod: plannedWithdrawalStartPeriodStr,
                      setStartPeriod: setPlannedWithdrawalStartPeriodStr,
                    },
                  ]).map((flow) => (
                    <div key={flow.kind} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-100">{flow.title}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{flow.subtitle}</p>
                        </div>
                        <div className="flex gap-1.5">
                          {(["none", "scheduled"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => flow.setMode(mode)}
                              className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                                flow.mode === mode
                                  ? "border-emerald-300 bg-emerald-300/10 text-emerald-100"
                                  : "border-slate-700 text-slate-400"
                              }`}
                            >
                              {mode === "none" ? L("None", "Ninguno") : L("Scheduled", "Programado")}
                            </button>
                          ))}
                        </div>
                      </div>
                      {flow.mode === "scheduled" ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <label className="text-[11px] text-slate-400">
                            {L("Frequency", "Frecuencia")}
                            <select
                              className={`${inputBase} mt-1`}
                              value={flow.frequency}
                              onChange={(event) => flow.setFrequency(event.target.value as WithdrawalFrequency)}
                            >
                              <option value="monthly">{L("Monthly", "Mensual")}</option>
                              <option value="quarterly">{L("Quarterly", "Trimestral")}</option>
                              <option value="semiannual">{L("Semiannual", "Semestral")}</option>
                            </select>
                          </label>
                          <label className="text-[11px] text-slate-400">
                            {L("Amount (USD)", "Cantidad (USD)")}
                            <input
                              className={`${inputBase} mt-1`}
                              inputMode="decimal"
                              value={flow.amount}
                              onChange={(event) => flow.setAmount(formatMoneyInputDraft(event.target.value))}
                              onBlur={() => flow.amount && flow.setAmount(formatMoneyInputValue(flow.amount))}
                              placeholder="500.00"
                            />
                          </label>
                          <label className="text-[11px] text-slate-400">
                            {L("Start period", "Período inicial")}
                            <input
                              className={`${inputBase} mt-1`}
                              inputMode="numeric"
                              value={flow.startPeriod}
                              onChange={(event) => flow.setStartPeriod(event.target.value)}
                              placeholder="1"
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {businessAnalysisComplete && aiPlanAdvisor.shouldSurface ? (
              <div
                className={`mt-3 rounded-2xl border p-4 ${
                  aiPlanAdvisor.verdict === "not_supported" || aiPlanAdvisor.verdict === "no_validated_edge"
                    ? "border-red-400/40 bg-red-500/10"
                    : aiPlanAdvisor.verdict === "stretch" || aiPlanAdvisor.verdict === "unvalidated"
                      ? "border-amber-400/40 bg-amber-500/10"
                      : "border-emerald-400/30 bg-emerald-500/10"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p
                      className={`text-[11px] uppercase tracking-[0.24em] ${
                        aiPlanAdvisor.verdict === "not_supported" || aiPlanAdvisor.verdict === "no_validated_edge"
                          ? "text-red-200"
                          : aiPlanAdvisor.verdict === "supported"
                            ? "text-emerald-200"
                            : "text-amber-200"
                      }`}
                    >
                      {L("Evidence-based plan review", "Evaluación del plan basada en evidencia")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {aiPlanAdvisor.headline}
                    </p>
                    <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-300">
                      {L(
                        `The selected win/loss percentages compound to ${currency(aiPlanAdvisor.requestedGrossProjectedBalance)} before fixed session costs and ${currency(aiPlanAdvisor.requestedProjectedBalance)} after those costs by ${formatPlanDate(aiPlanAdvisor.requestedTargetDate, lang)}. The recommended horizon is ${formatPlanDate(aiPlanAdvisor.recommendedCompletionDate, lang)}.`,
                        `Los porcentajes seleccionados de ganancias y pérdidas se componen hasta ${currency(aiPlanAdvisor.requestedGrossProjectedBalance)} antes de costos fijos por sesión y ${currency(aiPlanAdvisor.requestedProjectedBalance)} después de esos costos para ${formatPlanDate(aiPlanAdvisor.requestedTargetDate, lang)}. El horizonte recomendado es ${formatPlanDate(aiPlanAdvisor.recommendedCompletionDate, lang)}.`
                      )}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-600 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold text-slate-200">
                    {aiPlanAdvisor.verdict === "not_supported"
                      ? L("Deadline not supported", "Plazo no respaldado")
                      : aiPlanAdvisor.verdict === "no_validated_edge"
                        ? L("Validate edge first", "Valida la ventaja primero")
                        : aiPlanAdvisor.verdict === "stretch"
                          ? L("Stretch deadline", "Plazo exigente")
                          : aiPlanAdvisor.verdict === "unvalidated"
                            ? L("Provisional model", "Modelo provisional")
                            : L("Evidence supported", "Respaldado por evidencia")}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Target return", "Retorno objetivo")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      {planRealismReview.targetReturnPct.toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Required every session", "Requerido cada sesión")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      {planRealismReview.requiredCompoundDailyPct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Gross percentage compound", "Compuesto porcentual bruto")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      {currency(aiPlanAdvisor.requestedGrossProjectedBalance)}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {aiPlanAdvisor.modeledWeeklyReturnPct.toFixed(2)}% {L("modeled week", "semana modelada")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Net after fixed costs", "Neto después de costos fijos")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      {currency(aiPlanAdvisor.requestedProjectedBalance)}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {L("Cost drag", "Impacto de costos")} {currency(aiPlanAdvisor.requestedCostDragUsd)} · {aiPlanAdvisor.requestedCoveragePct.toFixed(0)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Recommended horizon", "Horizonte recomendado")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      {formatPlanDate(aiPlanAdvisor.recommendedCompletionDate, lang)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Execution evidence", "Evidencia de ejecución")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      {performanceEvidenceLoading
                        ? L("Loading", "Cargando")
                        : L(
                            `${planRealismReview.evidenceSessions} sessions`,
                            `${planRealismReview.evidenceSessions} sesiones`
                          )}
                    </p>
                  </div>
                </div>
                {aiPlanAdvisor.costsConsumePercentageEdge ? (
                  <p className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] leading-5 text-amber-100">
                    {L(
                      `The win/loss percentages produce a positive ${aiPlanAdvisor.modeledWeeklyReturnPct.toFixed(2)}% modeled week before fixed costs. The ${currency(estimatedCostPerSessionUsd)} per-session input consumes that edge in the net projection. Verify the cost input: the zero balance comes from cost drag, not from the compound-return formula.`,
                      `Los porcentajes de ganancias y pérdidas producen una semana modelada positiva de ${aiPlanAdvisor.modeledWeeklyReturnPct.toFixed(2)}% antes de costos fijos. El costo de ${currency(estimatedCostPerSessionUsd)} por sesión consume esa ventaja en la proyección neta. Verifica ese costo: el balance en cero proviene del impacto de costos, no de la fórmula de interés compuesto.`
                    )}
                  </p>
                ) : null}
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-cyan-300/20 bg-slate-950/55 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                      {L("Mathematical goal-day required", "Día-meta matemático requerido")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      {adaptiveGrowthPlan.requestedRequiredGoalDayPct.toFixed(3)}%
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      {L(
                        `Uses ${adaptiveGrowthPlan.declaredExpectedLossDayPct.toFixed(2)}% on ${adaptiveGrowthPlan.lossDaysPerWeek} modeled loss day(s) per week.`,
                        `Usa ${adaptiveGrowthPlan.declaredExpectedLossDayPct.toFixed(2)}% en ${adaptiveGrowthPlan.lossDaysPerWeek} día(s) de pérdida modelados por semana.`
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-300/20 bg-slate-950/55 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                      {L("Target annualized math", "Matemática anualizada de la meta")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      {adaptiveGrowthPlan.targetAnnualizedReturnPct == null
                        ? "—"
                        : `${adaptiveGrowthPlan.targetAnnualizedReturnPct.toFixed(1)}%`}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      {L("Arithmetic requirement, not a forecast or safe return.", "Requisito aritmético, no pronóstico ni retorno seguro.")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-300/20 bg-slate-950/55 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                      {L("Estimated trading costs", "Costos estimados de trading")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      {currency(adaptiveGrowthPlan.requestedEstimatedCostsUsd)}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      {L("Configure costs below; zero is an incomplete estimate.", "Configura los costos abajo; cero es un estimado incompleto.")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-300/20 bg-slate-950/55 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                      {L("After tax reserve", "Luego de reserva contributiva")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      {currency(adaptiveGrowthPlan.requestedAfterTaxReserveBalance)}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      {L("Planning reserve only; verify with a tax professional.", "Solo reserva de planificación; verifica con un profesional contributivo.")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/45">
                  <div className="border-b border-slate-800 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      {L("Internal scenario laboratory", "Laboratorio interno de escenarios")}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      {L(
                        "P10, median, P90, and the conditional hit rate use 400 seeded paths assuming the entered win/loss frequency and percentages continue. They are sensitivity ranges, not empirical probabilities or forecasts.",
                        "P10, mediana, P90 y la tasa condicional de llegada usan 400 rutas con semilla suponiendo que continúan la frecuencia y los porcentajes ingresados. Son rangos de sensibilidad, no probabilidades empíricas ni pronósticos."
                      )}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-295 w-full text-left text-[11px]">
                      <thead className="text-slate-500">
                        <tr className="border-b border-slate-800">
                          <th className="px-3 py-2 font-medium">{L("Scenario", "Escenario")}</th>
                          <th className="px-3 py-2 font-medium">{L("Goal / loss day", "Meta / día pérdida")}</th>
                          <th className="px-3 py-2 font-medium">{L("Annual math", "Matemática anual")}</th>
                          <th className="px-3 py-2 font-medium">{L("Gross / net after costs", "Bruto / neto después de costos")}</th>
                          <th className="px-3 py-2 font-medium">P10 / P50 / P90</th>
                          <th className="px-3 py-2 font-medium">{L("Conditional hit rate", "Tasa condicional de llegada")}</th>
                          <th className="px-3 py-2 font-medium">{L("Median max DD", "DD máximo mediano")}</th>
                          <th className="px-3 py-2 font-medium">{L("Risk of losing 50%", "Riesgo de perder 50%")}</th>
                          <th className="px-3 py-2 font-medium">{L("Completion", "Cumplimiento")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adaptiveGrowthPlan.panoramas.map((panorama) => {
                          const title =
                            panorama.id === "declared"
                              ? L("Your declared inputs", "Tus datos declarados")
                              : panorama.id === "mathematical"
                                ? L("Exact target math", "Matemática exacta de meta")
                                : panorama.id === "conservative"
                                  ? L("Conservative", "Conservador")
                                  : panorama.id === "moderate"
                                    ? L("Moderate", "Moderado")
                                    : L("Aggressive", "Agresivo");
                          return (
                            <tr key={panorama.id} className="border-b border-slate-900 last:border-b-0">
                              <td className="px-3 py-2 font-semibold text-slate-200">
                                {title}
                                <span className="ml-2 text-[9px] uppercase tracking-[0.12em] text-slate-500">
                                  {panorama.riskBand.replace("_", " ")}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-300">
                                +{panorama.goalDayReturnPct.toFixed(3)}% / -{panorama.expectedLossDayPct.toFixed(2)}%
                              </td>
                              <td className="px-3 py-2 text-slate-300">{panorama.modeledAnnualReturnPct.toFixed(1)}%</td>
                              <td className="px-3 py-2 text-slate-200">
                                <p className="font-semibold">{currency(panorama.grossProjectedBalance)}</p>
                                <p className="mt-1 text-[10px] text-slate-500">
                                  {L("Net", "Neto")} {currency(panorama.projectedBalance)} · {L("drag", "impacto")} {currency(panorama.costDragUsd)}
                                </p>
                              </td>
                              <td className="px-3 py-2 text-slate-400">
                                {currency(panorama.probability.p10Balance)} / {currency(panorama.probability.medianBalance)} / {currency(panorama.probability.p90Balance)}
                              </td>
                              <td className="px-3 py-2 font-semibold text-cyan-100">
                                {panorama.probability.probabilityTargetPct.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-slate-300">
                                {panorama.probability.medianMaxDrawdownPct.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-slate-300">
                                {panorama.probability.probabilityCapitalHalfPct.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-slate-300">{formatPlanDate(panorama.completionDate, lang)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-emerald-300/15 bg-slate-950/45 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{L("Gross percentage growth", "Crecimiento porcentual bruto")}</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-200">{currency(adaptiveGrowthPlan.requestedGrossTradingGrowthUsd)}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-300/15 bg-slate-950/45 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{L("Net trading growth", "Crecimiento neto de trading")}</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-200">{currency(adaptiveGrowthPlan.requestedTradingGrowthUsd)}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{L("Cost drag", "Impacto de costos")} {currency(adaptiveGrowthPlan.requestedCostDragUsd)}</p>
                  </div>
                  <div className="rounded-xl border border-cyan-300/15 bg-slate-950/45 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{L("Contributions", "Aportaciones")}</p>
                    <p className="mt-1 text-sm font-semibold text-cyan-100">{currency(adaptiveGrowthPlan.requestedDepositsUsd)}</p>
                  </div>
                  <div className="rounded-xl border border-sky-300/15 bg-slate-950/45 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{L("Withdrawals", "Retiros")}</p>
                    <p className="mt-1 text-sm font-semibold text-sky-100">{currency(adaptiveGrowthPlan.requestedWithdrawalsUsd)}</p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-400">
                  {L(
                    `Operating assumptions: ${aiPlanAdvisor.recommendedDailyGoalPct.toFixed(2)}% on modeled goal-days, ${aiPlanAdvisor.expectedLossDayPct.toFixed(2)}% expected on modeled losing days, ${aiPlanAdvisor.maxDailyLossPct.toFixed(2)}% hard daily-loss guardrail, and ${aiPlanAdvisor.riskPerTradePct.toFixed(2)}% risk per trade. The modeled annual rate is ${aiPlanAdvisor.modeledAnnualReturnPct.toFixed(1)}% across ${aiPlanAdvisor.modeledAnnualCycles.toFixed(1)} instrument-calendar cycles; it is a planning assumption, not a forecast or promise.`,
                    `Supuestos operativos: ${aiPlanAdvisor.recommendedDailyGoalPct.toFixed(2)}% en días de meta modelados, ${aiPlanAdvisor.expectedLossDayPct.toFixed(2)}% esperado en días perdedores modelados, ${aiPlanAdvisor.maxDailyLossPct.toFixed(2)}% como límite duro diario y ${aiPlanAdvisor.riskPerTradePct.toFixed(2)}% de riesgo por trade. La tasa anual modelada es ${aiPlanAdvisor.modeledAnnualReturnPct.toFixed(1)}% a través de ${aiPlanAdvisor.modeledAnnualCycles.toFixed(1)} ciclos del calendario del instrumento; es un supuesto de planificación, no un pronóstico ni una promesa.`
                  )}
                </p>
                {adaptiveGrowthPlan.flags.includes("declared_goal_above_operating_policy") ||
                adaptiveGrowthPlan.flags.includes("declared_loss_assumption_below_operating_policy") ? (
                  <p className="mt-2 rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-[11px] leading-5 text-cyan-100">
                    {selectedPlanId === "manual"
                      ? L(
                          "Your manual percentages are compounded exactly in the deterministic and statistical validation. Because they sit outside a preset policy, the result is flagged for risk and execution-evidence review.",
                          "Tus porcentajes manuales se componen exactamente en la validación determinística y estadística. Como están fuera de una política predefinida, el resultado se marca para revisión de riesgo y evidencia de ejecución."
                        )
                      : L(
                          `Your declared assumptions were evaluated, but the selected preset keeps its ${adaptiveGrowthPlan.policyGoalDayCapPct.toFixed(2)}% goal-day cap and ${adaptiveGrowthPlan.policyExpectedLossDayFloorPct.toFixed(2)}% modeled loss-day floor.`,
                          `Tus supuestos declarados fueron evaluados, pero el plan predefinido mantiene su límite de ${adaptiveGrowthPlan.policyGoalDayCapPct.toFixed(2)}% en día-meta y su piso de ${adaptiveGrowthPlan.policyExpectedLossDayFloorPct.toFixed(2)}% en día perdedor.`
                        )}
                  </p>
                ) : null}
                {adaptiveGrowthPlan.flags.includes("selected_model_requires_extreme_annualized_return") ? (
                  <p className="mt-2 rounded-xl border border-red-400/25 bg-red-400/5 px-3 py-2 text-[11px] leading-5 text-red-100">
                    {L(
                      `The selected percentages imply ${aiPlanAdvisor.modeledAnnualReturnPct.toFixed(1)}% annual compounding if they repeat without deterioration. The arithmetic is valid, but this is an extreme conditional scenario, not a realistic expected return. Validate it with documented execution before using it for operating decisions.`,
                      `Los porcentajes seleccionados implican ${aiPlanAdvisor.modeledAnnualReturnPct.toFixed(1)}% de composición anual si se repiten sin deterioro. La aritmética es válida, pero este es un escenario condicional extremo, no un retorno esperado realista. Valídalo con ejecución documentada antes de usarlo para decisiones operativas.`
                    )}
                  </p>
                ) : null}
                {aiPlanAdvisor.qualificationRequired ? (
                  <p className="mt-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[11px] leading-5 text-amber-100">
                    {L(
                      `Qualification period required: build at least ${aiPlanAdvisor.qualificationMinimumSessions} documented sessions before treating this horizon as validated.`,
                      `Se requiere un período de validación: documenta al menos ${aiPlanAdvisor.qualificationMinimumSessions} sesiones antes de tratar este horizonte como validado.`
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}

            {businessAnalysisComplete && planRealismReview.shouldSurface ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-cyan-300/25 bg-[linear-gradient(135deg,rgba(8,47,73,0.28),rgba(2,6,23,0.96)_62%)]">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cyan-300/10 p-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200">
                      {L("Research AI plan review", "Evaluación Research AI del plan")}
                    </p>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
                      {L(
                        "Uses the verified plan math, your execution evidence, and the private research methodology. AI explains the assessment; it does not set or change the numbers.",
                        "Usa la matemática verificada del plan, tu evidencia de ejecución y la metodología privada de investigación. La IA explica la evaluación; no establece ni cambia los números."
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={runResearchPlanReview}
                    disabled={researchReviewLoading}
                    className="rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-wait disabled:opacity-60"
                  >
                    {researchReviewLoading
                      ? L("Analyzing plan…", "Analizando plan…")
                      : researchReview
                        ? L("Refresh deep review", "Actualizar evaluación")
                        : L("Run deep review", "Hacer evaluación profunda")}
                  </button>
                </div>
                {researchReviewError ? (
                  <p className="px-4 py-3 text-xs text-rose-300">{researchReviewError}</p>
                ) : null}
                {researchReview ? (
                  <div className="space-y-4 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{researchReview.headline}</p>
                      <p className="mt-1 max-w-5xl text-xs leading-5 text-slate-300">{researchReview.summary}</p>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          {L("Key observations", "Observaciones clave")}
                        </p>
                        <div className="mt-2 space-y-2">
                          {researchReview.observations.map((item, index) => (
                            <p key={`${index}-${item}`} className="text-xs leading-5 text-slate-300">
                              <span className="mr-2 text-cyan-300">{String(index + 1).padStart(2, "0")}</span>
                              {item}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          {L("Plan design actions", "Acciones de diseño del plan")}
                        </p>
                        <div className="mt-2 space-y-2">
                          {researchReview.actions.map((item, index) => (
                            <p key={`${index}-${item}`} className="text-xs leading-5 text-slate-300">
                              <span className="mr-2 text-emerald-300">{String(index + 1).padStart(2, "0")}</span>
                              {item}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 text-[10px] leading-4 text-slate-500">
                      <span>{researchReview.methodologyNote}</span>
                      <span>
                        {researchReview.usedResearchCorpus
                          ? L("Private research corpus used", "Corpus privado de investigación utilizado")
                          : L("Deterministic review only", "Solo evaluación determinística")}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {businessAnalysisComplete && aiPlanAdvisor.shouldSurface ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-cyan-300/30 bg-[linear-gradient(135deg,rgba(8,47,73,0.38),rgba(2,6,23,0.94)_58%)] shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
                <div className="border-b border-cyan-300/15 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200">
                      {L("Discipline-first growth roadmap", "Ruta de crecimiento basada en disciplina")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {aiPlanAdvisor.headline}
                    </p>
                    <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-300">
                      {aiPlanAdvisor.body}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full border border-cyan-300/30 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold text-cyan-100">
                      {L("Target projection", "Proyección objetivo")} · {formatPlanDate(aiPlanAdvisor.requestedTargetDate, lang)}
                    </span>
                    {aiPlanAdvisor.recommendedCompletionDate &&
                    aiPlanAdvisor.requestedTargetDate &&
                    aiPlanAdvisor.recommendedCompletionDate > aiPlanAdvisor.requestedTargetDate ? (
                      <button
                        type="button"
                        onClick={applyAiPlanRecommendation}
                        className="rounded-full bg-cyan-300 px-3 py-1.5 text-[11px] font-bold text-slate-950 transition hover:bg-cyan-200"
                      >
                        {L("Use operating runway", "Usar runway operativo")}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border border-cyan-300/15 bg-slate-950/65 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Selected model", "Modelo seleccionado")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-cyan-100">
                      {aiPlanAdvisor.scenarioTitle}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {aiPlanAdvisor.lossDaysPerWeek} {L("planned loss day(s) / week", "día(s) de pérdida planificados / semana")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-300/15 bg-slate-950/65 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Target compound pace", "Ritmo compuesto objetivo")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-cyan-100">
                      {aiPlanAdvisor.targetProjectionGoalDayPct.toFixed(3)}% {L("goal-day", "día de meta")}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {L("Exact math required to reach the requested target", "Matemática exacta requerida para llegar a la meta")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-300/15 bg-slate-950/65 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Target projection", "Proyección objetivo")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-cyan-100">
                      {currency(aiPlanAdvisor.targetProjectionBalance)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {aiPlanAdvisor.targetProjectionCoveragePct.toFixed(0)}% {L("of requested capital by", "del capital solicitado para")} {formatPlanDate(aiPlanAdvisor.requestedTargetDate, lang)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-300/15 bg-slate-950/65 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Gross vs net operation", "Operación bruta vs neta")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-cyan-100">
                      {currency(aiPlanAdvisor.requestedGrossProjectedBalance)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {L("Net after costs", "Neto después de costos")} {currency(aiPlanAdvisor.requestedProjectedBalance)} · {L("drag", "impacto")} {currency(aiPlanAdvisor.requestedCostDragUsd)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/4 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Actual vs next goal", "Real vs próxima meta")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-emerald-200">
                      {liveCurrentBalance == null ? "—" : currency(liveCurrentBalance)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {activeProjectedCheckpoint && liveCurrentBalance != null
                        ? L(
                            `${currency(Math.abs(liveCurrentBalance - activeProjectedCheckpoint.targetBalance))} ${liveCurrentBalance >= activeProjectedCheckpoint.targetBalance ? "ahead" : "remaining"} to ${formatPlanDate(activeProjectedCheckpoint.targetDate, lang)}`,
                            `${currency(Math.abs(liveCurrentBalance - activeProjectedCheckpoint.targetBalance))} ${liveCurrentBalance >= activeProjectedCheckpoint.targetBalance ? "adelantado" : "restante"} para ${formatPlanDate(activeProjectedCheckpoint.targetDate, lang)}`
                          )
                        : L("Waiting for account data", "Esperando datos de la cuenta")}
                    </p>
                  </div>
                </div>
                {aiPlanAdvisor.costsConsumePercentageEdge ? (
                  <p className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] leading-5 text-amber-100">
                    {L(
                      `The selected percentages compound positively at ${aiPlanAdvisor.modeledWeeklyReturnPct.toFixed(2)}% per modeled week. The net projection reaches zero only because the fixed session-cost input is larger than the account can absorb.`,
                      `Los porcentajes seleccionados se componen positivamente a ${aiPlanAdvisor.modeledWeeklyReturnPct.toFixed(2)}% por semana modelada. La proyección neta llega a cero únicamente porque el costo fijo por sesión es mayor de lo que la cuenta puede absorber.`
                    )}
                  </p>
                ) : null}
                <p className="mt-3 text-[10px] leading-4 text-slate-500">
                  {L(
                    "The target projection is the mathematical plan, not a return promise. The operating baseline tests the selected assumptions after costs, and actual balance comes from the account series used by the dashboard.",
                    "La proyección objetivo es el plan matemático, no una promesa de rendimiento. La línea base operativa prueba los supuestos seleccionados después de costos y el balance real proviene de la misma serie de cuenta que usa el dashboard."
                  )}
                </p>
                </div>
                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      {L("Projected goals vs actual", "Metas proyectadas vs real")}
                    </p>
                    <span className="text-[10px] text-slate-500">
                      {L("Actual balance locks when each checkpoint is due", "El balance real se fija cuando vence cada checkpoint")}
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {[
                      {
                        key: "weekly",
                        title: L("Weekly targets", "Metas semanales"),
                        items: aiPlanAdvisor.weeklyMilestones.slice(0, 6),
                        unit: L("Week", "Semana"),
                      },
                      {
                        key: "monthly",
                        title: L("Monthly targets", "Metas mensuales"),
                        items: aiPlanAdvisor.monthlyMilestones.slice(0, 6),
                        unit: L("Month", "Mes"),
                      },
                      {
                        key: "quarterly",
                        title: L("Quarterly targets", "Metas trimestrales"),
                        items: aiPlanAdvisor.quarterlyMilestones.slice(0, 6),
                        unit: L("Quarter", "Trimestre"),
                      },
                      {
                        key: "semiannual",
                        title: L("Six-month targets", "Metas semestrales"),
                        items: aiPlanAdvisor.semiannualMilestones.slice(0, 10),
                        unit: L("Half-year", "Semestre"),
                      },
                      {
                        key: "annual",
                        title: L("Annual targets", "Metas anuales"),
                        items: aiPlanAdvisor.annualMilestones.slice(0, 10),
                        unit: L("Year", "Año"),
                      },
                    ].map((section) => (
                      <div key={section.key} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200">{section.title}</p>
                        <div className="mt-2 space-y-2">
                          {section.items.length ? (
                            section.items.map((milestone) => {
                              const actual = actualBalanceAtCheckpoint(
                                liveBalanceSeries,
                                milestone.targetDate,
                                isoToday()
                              );
                              const variance = actual ? actual.value - milestone.targetBalance : null;
                              return (
                              <div
                                key={`${section.key}-${milestone.periodIndex}-${milestone.targetDate}`}
                                className="rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[11px] text-slate-400">
                                    {section.unit} {milestone.periodIndex}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {formatPlanDate(milestone.targetDate, lang)}
                                  </span>
                                </div>
                                <p className="mt-1 text-[9px] uppercase tracking-[0.16em] text-slate-500">
                                  {L("Projected target", "Meta proyectada")}
                                </p>
                                <p className="text-sm font-semibold text-slate-100">
                                  {currency(milestone.targetBalance)}
                                </p>
                                {actual && variance != null ? (
                                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-2">
                                    <div>
                                      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                                        {L("Actual", "Real")}
                                      </p>
                                      <p className="text-xs font-semibold text-slate-200">{currency(actual.value)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                                        {L("Variance", "Variación")}
                                      </p>
                                      <p className={`text-xs font-semibold ${variance >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                                        {variance >= 0 ? "+" : "-"}{currency(Math.abs(variance))}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="mt-2 border-t border-slate-800/80 pt-2 text-[10px] text-slate-500">
                                    {L("Upcoming · actual pending", "Próximo · real pendiente")}
                                  </p>
                                )}
                                <p className="text-[10px] text-slate-500">
                                  {L("Trading", "Trading")} {currency(milestone.plannedTradingChangeUsd)} · {milestone.plannedReturnPct.toFixed(2)}% · {milestone.sessionCount} {L("sessions", "sesiones")}
                                </p>
                                {milestone.plannedDepositsUsd > 0 || milestone.plannedWithdrawalsUsd > 0 ? (
                                  <p className="text-[10px] text-slate-500">
                                    {L("Contributions", "Aportaciones")} {currency(milestone.plannedDepositsUsd)} · {L("Withdrawals", "Retiros")} {currency(milestone.plannedWithdrawalsUsd)} · {L("Net change", "Cambio neto")} {currency(milestone.plannedChangeUsd)}
                                  </p>
                                ) : null}
                              </div>
                              );
                            })
                          ) : (
                            <p className="text-xs text-slate-500">
                              {L("No defensible checkpoint yet.", "Todavía no hay un checkpoint defendible.")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 xl:grid-cols-3">
              {businessScenarios.map((scenario) => {
                const selected = selectedPlanId === scenario.id;
                return (
                  <div
                    key={scenario.id}
                    className={`rounded-2xl border p-4 transition shadow-[0_18px_45px_rgba(0,0,0,0.18)] ${
                      selected
                        ? "border-cyan-300 bg-cyan-300/10"
                        : scenario.recommended
                          ? "border-slate-600 bg-slate-900/70"
                          : "border-slate-800 bg-slate-950/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-100">{scenario.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{scenario.summary}</p>
                      </div>
                      {scenario.recommended ? (
                        <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">
                          {L("Suggested", "Sugerido")}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 h-30">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={scenario.chart} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis hide domain={["dataMin", "dataMax"]} />
                          <Tooltip
                            contentStyle={{ background: "#020617", border: "1px solid #334155", borderRadius: 8 }}
                            labelStyle={{ color: "#cbd5e1" }}
                            formatter={(value) => [currency(Number(value)), L("Projected equity", "Equity proyectado")]}
                          />
                          <Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                        <p className="text-slate-500">{L("Goal-day model", "Modelo día-meta")}</p>
                        <p className="font-semibold text-emerald-300">{scenario.dailyGoalPct.toFixed(2)}%</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                        <p className="text-slate-500">{L("Risk unit", "Unidad de riesgo")}</p>
                        <p className="font-semibold text-emerald-300">{scenario.riskPerTradePct.toFixed(2)}%</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                        <p className="text-slate-500">{L("Daily stop", "Stop diario")}</p>
                        <p className="font-semibold text-emerald-300">{scenario.maxDailyLossPct.toFixed(2)}%</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                        <p className="text-slate-500">{L("Expected loss-day", "Pérdida esperada/día")}</p>
                        <p className="font-semibold text-emerald-300">{scenario.expectedLossDayPct.toFixed(2)}%</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        selectReturnModel(scenario.id, true);
                        setGoalDayReturnPctStr(String(scenario.dailyGoalPct));
                        setExpectedLossDayPctStr(String(scenario.expectedLossDayPct));
                        setRiskPerTradePctStr(String(scenario.riskPerTradePct));
                        setMaxDailyLossPercentStr(String(scenario.maxDailyLossPct));
                        setLossDaysPerWeekStr(String(clampInt(scenario.lossDaysPerWeek, 0, averageTradingDaysPerWeek)));
                        pushNeuroMessage(
                          L(
                            `${scenario.title} scenario selected. I adjusted risk per trade, max daily loss, and expected loss days to match that operating model.`,
                            `Escenario ${scenario.title} seleccionado. Ajusté riesgo por trade, max daily loss y días esperados de pérdida para ese modelo operativo.`
                          )
                        );
                      }}
                      className={`mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold transition ${
                        selected
                          ? "bg-emerald-400 text-slate-950"
                          : "border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 disabled:border-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent"
                      }`}
                    >
                      {selected ? L("Selected", "Seleccionado") : L("Use scenario", "Usar escenario")}
                    </button>
                  </div>
                );
              })}
              {returnModelMode === "manual" ? (
                <div className={`rounded-2xl border p-4 transition shadow-[0_18px_45px_rgba(0,0,0,0.18)] ${
                  selectedPlanId === "manual"
                    ? "border-cyan-300 bg-cyan-300/10"
                    : "border-slate-700 bg-slate-950/65"
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-100">
                        {L("My manual operating plan", "Mi plan operativo manual")}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {L(
                          "Uses exactly your goal-day, losing-day, risk, schedule, contribution, and withdrawal assumptions.",
                          "Usa exactamente tus supuestos de día-meta, día perdedor, riesgo, calendario, aportaciones y retiros."
                        )}
                      </p>
                    </div>
                    <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-2 py-1 text-[10px] font-semibold text-sky-100">
                      {L("Custom", "Personalizado")}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                      <p className="text-slate-500">{L("Goal-day model", "Modelo día-meta")}</p>
                      <p className="font-semibold text-emerald-300">{goalDayReturnPct.toFixed(2)}%</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                      <p className="text-slate-500">{L("Expected loss-day", "Pérdida esperada/día")}</p>
                      <p className="font-semibold text-emerald-300">{expectedLossDayPct.toFixed(2)}%</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                      <p className="text-slate-500">{L("Modeled week", "Semana modelada")}</p>
                      <p className="font-semibold text-emerald-300">{declaredReturnSummary.weeklyPct.toFixed(2)}%</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                      <p className="text-slate-500">{L("Modeled year", "Año modelado")}</p>
                      <p className="font-semibold text-emerald-300">{declaredReturnSummary.annualPct.toFixed(2)}%</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!goalDayReturnPct || !expectedLossDayPct}
                    onClick={() => setSelectedPlanId("manual")}
                    className={`mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      selectedPlanId === "manual"
                        ? "bg-emerald-400 text-slate-950"
                        : "border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 disabled:border-slate-800 disabled:text-slate-600"
                    }`}
                  >
                    {selectedPlanId === "manual"
                      ? L("Selected plan", "Plan seleccionado")
                      : L("Use my manual plan", "Usar mi plan manual")}
                  </button>
                </div>
              ) : null}
            </div>

            {selectedPlanId ? (
              <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(8,47,73,0.28),rgba(2,6,23,0.9))] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200">
                      {L("Compound statistical validation", "Validación estadística compuesta")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {L(
                        `The selected ${selectedPlanId} plan is tested under the same operating and cash-flow assumptions.`,
                        `El plan ${selectedPlanId} seleccionado se prueba bajo los mismos supuestos operativos y de flujo de efectivo.`
                      )}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    adaptiveGrowthPlan.statisticalValidation.assessment === "supported"
                      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                      : adaptiveGrowthPlan.statisticalValidation.assessment === "conditional"
                        ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
                        : "border-red-300/30 bg-red-300/10 text-red-200"
                  }`}>
                    {adaptiveGrowthPlan.statisticalValidation.assessment.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                  {[
                    [L("Deterministic", "Determinístico"), currency(adaptiveGrowthPlan.statisticalValidation.deterministicProjectedBalance)],
                    [L("Conditional hit rate", "Tasa condicional de llegada"), `${adaptiveGrowthPlan.statisticalValidation.probability.probabilityTargetPct.toFixed(1)}%`],
                    ["P10", currency(adaptiveGrowthPlan.statisticalValidation.probability.p10Balance)],
                    ["P50", currency(adaptiveGrowthPlan.statisticalValidation.probability.medianBalance)],
                    ["P90", currency(adaptiveGrowthPlan.statisticalValidation.probability.p90Balance)],
                    [L("Median drawdown", "Drawdown mediano"), `${adaptiveGrowthPlan.statisticalValidation.probability.medianMaxDrawdownPct.toFixed(2)}%`],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-5 text-slate-500">
                  {L(
                    `${adaptiveGrowthPlan.statisticalValidation.probability.simulations} seeded paths compound the selected win/loss-day assumptions. This is a planning stress test, not a return guarantee.`,
                    `${adaptiveGrowthPlan.statisticalValidation.probability.simulations} trayectorias reproducibles componen los supuestos seleccionados de días ganadores y perdedores. Es una prueba de planificación, no una garantía de rendimiento.`
                  )}
                </p>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">
                {L(
                  "Choose the final operating plan you will follow before continuing.",
                  "Escoge el plan operativo final que vas a seguir antes de continuar."
                )}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "plan_mode",
      anchor: "gp-plan-mode",
      title: L("Plan mode", "Modo del plan"),
      description: L(
        "This plan is automatic and runway-based so dates, sessions, and checkpoints stay synchronized.",
        "Este plan es automático y basado en runway para mantener fechas, sesiones y checkpoints sincronizados."
      ),
      isComplete: true,
      content: (
        <div id="gp-plan-mode" className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-sm text-slate-100 font-semibold">
            {L("Automatic (runway-based)", "Automático (basado en runway)")}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {L(
              "We use the start date, runway, and instrument calendar to calculate trading days and pacing.",
              "Usamos la fecha inicial, el runway y el calendario del instrumento para calcular días de trading y ritmo."
            )}
          </p>
        </div>
      ),
    },
    {
      id: "starting_balance",
      anchor: "gp-starting-balance",
      title: L("Starting balance", "Balance inicial"),
      description: L(
        "This is the money you currently have in your broker account.",
        "Este es el dinero que tienes ahora en tu cuenta de broker."
      ),
      isComplete: startingBalance > 0,
      content: (
        <div>
          <label className="block mb-1 text-slate-300">{L("Starting balance (USD)", "Balance inicial (USD)")}</label>
          <input
            id="gp-starting-balance"
            inputMode="decimal"
            value={startingBalanceStr}
            onFocus={() => fieldHelp("starting_balance")}
            onChange={(e) => {
              setStartingBalanceStr(formatMoneyInputDraft(e.target.value));
              setAutoPhasesGenerated(false);
            }}
            onBlur={() => {
              if (!startingBalanceStr.trim()) return;
              setStartingBalanceStr(formatMoneyInputValue(Math.max(0, startingBalance)));
            }}
            className={inputBase}
            placeholder="0"
          />
        </div>
      ),
    },
    {
      id: "target_balance",
      anchor: "gp-target-balance",
      title: L("Target balance", "Balance objetivo"),
      description: L(
        "This is the balance you want to reach.",
        "Este es el balance al que quieres llegar."
      ),
      isComplete: targetBalance > 0,
      content: (
        <div>
          <label className="block mb-1 text-slate-300">{L("Target balance (USD)", "Balance objetivo (USD)")}</label>
          <input
            id="gp-target-balance"
            inputMode="decimal"
            value={targetBalanceStr}
            onFocus={() => fieldHelp("target_balance")}
            onChange={(e) => {
              setTargetBalanceStr(formatMoneyInputDraft(e.target.value));
              setAutoPhasesGenerated(false);
            }}
            onBlur={() => {
              if (!targetBalanceStr.trim()) return;
              setTargetBalanceStr(formatMoneyInputValue(Math.max(0, targetBalance)));
            }}
            className={inputBase}
            placeholder="0"
          />
        </div>
      ),
    },
    {
      id: "start_date",
      anchor: "gp-start-date",
      title: L("Start date", "Fecha de inicio"),
      description: L(
        "This is when the plan begins counting pace and milestones.",
        "Desde aquí el plan empieza a contar el ritmo y las metas."
      ),
      isComplete: !!planStartDate,
      content: (
        <FlexibleDateField
          id="gp-start-date"
          label={L("Start date", "Fecha de inicio")}
          value={planStartDate ?? ""}
          onFocus={() => fieldHelp("start_date")}
          onChange={(nextValue) => {
            setPlanStartDate(nextValue || isoToday());
            setTradingDaysTouched(false);
            setAutoPhasesGenerated(false);
          }}
          lang={lang}
          className={inputBase}
          fallbackValue={isoToday()}
          helperText={L(
            "Trading days, monthly goals, and phase pacing are counted from this date.",
            "Los días de trading, las metas mensuales y el ritmo de fases se cuentan desde esta fecha."
          )}
        />
      ),
    },
    {
      id: "target_date",
      anchor: "gp-target-date",
      title: L("Target date", "Fecha objetivo"),
      description: L(
        "Calculated automatically from the trading runway and start date.",
        "Se calcula automáticamente desde el runway y la fecha de inicio."
      ),
      isComplete: !!targetDateStr && planDatesOrdered,
      content: (
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
            {L("Calculated target date", "Fecha objetivo calculada")}
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-100">{targetDateStr || "—"}</p>
          <p className="mt-1 text-xs text-slate-400">
            {L(
              `${runwayAmount} ${runwayUnit} from ${effectivePlanStartDate}; ${businessScenarioTradingDays} committed trading days using the selected instrument calendar.`,
              `${runwayAmount} ${runwayUnit} desde ${effectivePlanStartDate}; ${businessScenarioTradingDays} días comprometidos usando el calendario del instrumento seleccionado.`
            )}
          </p>
        </div>
      ),
    },
    {
      id: "planned_withdrawals",
      anchor: "gp-planned-withdrawals",
      title: L("Capital contributions & withdrawals", "Aportaciones de capital y retiros"),
      description: L(
        "Define money entering and leaving the account. The plan keeps cashflow separate from trading performance.",
        "Define el dinero que entra y sale de la cuenta. El plan mantiene el cashflow separado del rendimiento de trading."
      ),
      isComplete: capitalFlowAssumptionsComplete,
      content: (
        <div id="gp-planned-withdrawals" className="space-y-3">
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3">
            <p className="text-xs font-semibold text-cyan-100">{L("Future contributions", "Aportaciones futuras")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPlannedDepositMode("none")}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  plannedDepositMode === "none"
                    ? "border-cyan-300 bg-cyan-300/10 text-cyan-100"
                    : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                {L("No contributions", "Sin aportaciones")}
              </button>
              <button
                type="button"
                onClick={() => setPlannedDepositMode("scheduled")}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  plannedDepositMode === "scheduled"
                    ? "border-cyan-300 bg-cyan-300/10 text-cyan-100"
                    : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                {L("Schedule contributions", "Programar aportaciones")}
              </button>
            </div>
            {plannedDepositMode === "scheduled" ? (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-slate-300">
                  {L("Frequency", "Frecuencia")}
                  <select
                    value={plannedDepositFrequency}
                    onChange={(event) => setPlannedDepositFrequency(event.target.value as WithdrawalFrequency)}
                    className={`${inputBase} mt-1`}
                  >
                    <option value="monthly">{L("Monthly", "Mensual")}</option>
                    <option value="quarterly">{L("Quarterly", "Trimestral")}</option>
                    <option value="semiannual">{L("Semiannual", "Semestral")}</option>
                  </select>
                </label>
                <label className="text-slate-300">
                  {L("Amount per contribution (USD)", "Monto por aportación (USD)")}
                  <input
                    inputMode="decimal"
                    value={plannedDepositAmountStr}
                    onChange={(event) => setPlannedDepositAmountStr(formatMoneyInputDraft(event.target.value))}
                    onBlur={() => plannedDepositAmountStr && setPlannedDepositAmountStr(formatMoneyInputValue(plannedDepositAmountStr))}
                    className={`${inputBase} mt-1`}
                    placeholder="500.00"
                  />
                </label>
                <label className="text-slate-300">
                  {L("First contribution period", "Primer período de aportación")}
                  <input
                    inputMode="numeric"
                    value={plannedDepositStartPeriodStr}
                    onChange={(event) => setPlannedDepositStartPeriodStr(onlyNum(event.target.value))}
                    className={`${inputBase} mt-1`}
                    placeholder="1"
                  />
                </label>
              </div>
            ) : null}
            {plannedDepositMode === "scheduled" && generatedPlannedDeposits.length ? (
              <p className="mt-2 text-xs text-slate-400">
                {L("Projected contributions", "Aportaciones proyectadas")}: {generatedPlannedDeposits.length} · {currency(generatedPlannedDeposits.reduce((sum, item) => sum + item.amount, 0))}
              </p>
            ) : null}
          </div>

          <p className="text-xs font-semibold text-slate-200">{L("Planned withdrawals", "Retiros planificados")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPlannedWithdrawalMode("none")}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                plannedWithdrawalMode === "none"
                  ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                  : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              {L("No withdrawals", "Sin retiros")}
            </button>
            <button
              type="button"
              onClick={() => setPlannedWithdrawalMode("scheduled")}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                plannedWithdrawalMode === "scheduled"
                  ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                  : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              {L("Yes, schedule withdrawals", "Sí, programar retiros")}
            </button>
          </div>

          {plannedWithdrawalMode === "scheduled" ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-slate-300">{L("Frequency", "Frecuencia")}</label>
                <select
                  value={plannedWithdrawalFrequency}
                  onChange={(e) => setPlannedWithdrawalFrequency(e.target.value as WithdrawalFrequency)}
                  className={inputBase}
                >
                  <option value="monthly">{L("Monthly", "Mensual")}</option>
                  <option value="quarterly">{L("Quarterly", "Trimestral")}</option>
                  <option value="semiannual">{L("Semiannual", "Semestral")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-slate-300">{L("Amount per withdrawal (USD)", "Monto por retiro (USD)")}</label>
                <input
                  inputMode="decimal"
                  value={plannedWithdrawalAmountStr}
                  onChange={(e) => setPlannedWithdrawalAmountStr(onlyNum(e.target.value))}
                  onBlur={() => {
                    if (!plannedWithdrawalAmountStr.trim()) return;
                    setPlannedWithdrawalAmountStr(String(plannedWithdrawalAmount));
                  }}
                  className={inputBase}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-300">{L("First withdrawal period", "Primer período de retiro")}</label>
                <input
                  inputMode="numeric"
                  value={plannedWithdrawalStartPeriodStr}
                  onChange={(e) => setPlannedWithdrawalStartPeriodStr(onlyNum(e.target.value))}
                  onBlur={() => {
                    if (!plannedWithdrawalStartPeriodStr.trim()) return;
                    setPlannedWithdrawalStartPeriodStr(String(plannedWithdrawalStartPeriod));
                  }}
                  className={inputBase}
                  placeholder="1"
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
            {plannedWithdrawalMode === "scheduled" && generatedPlannedWithdrawals.length > 0 ? (
              <>
                <p>
                  {L("Planned withdrawals generated:", "Retiros generados:")}{" "}
                  <span className="font-semibold text-slate-100">{generatedPlannedWithdrawals.length}</span>
                </p>
                <p className="mt-1">
                  {L("Total scheduled outflow:", "Salida total programada:")}{" "}
                  <span className="font-semibold text-slate-100">
                    {currency(generatedPlannedWithdrawals.reduce((sum, item) => sum + item.amount, 0))}
                  </span>
                </p>
                <p className="mt-1">
                  {L(
                    "The plan now solves the goal-day % after these withdrawals are removed from equity.",
                    "El plan ahora resuelve el % requerido después de restar estos retiros del equity."
                  )}
                </p>
              </>
            ) : plannedWithdrawalMode === "none" ? (
              <p>
                {L(
                  "This plan compounds without taking money out during the target period.",
                  "Este plan compone sin sacar dinero durante el período objetivo."
                )}
              </p>
            ) : (
              <p>
                {L(
                  "Choose whether you want withdrawals. This choice is required before we finalize the pace.",
                  "Elige si quieres retiros. Esta decisión es requerida antes de cerrar el ritmo."
                )}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "trading_days",
      anchor: "gp-trading-days",
      title: L("Operating schedule", "Calendario operativo"),
      description: L(
        "Tell the plan how many days you realistically operate each week. The total days stay editable.",
        "Dile al plan cuántos días realmente operas por semana. El total de días sigue editable."
      ),
      isComplete: averageTradingDaysSet && tradingDays > 0,
      content: (
        <div id="gp-trading-days" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block mb-1 text-slate-300">
                {L("Average operating days per week", "Días operativos promedio por semana")}
              </label>
              <input
                id="gp-average-trading-days"
                inputMode="numeric"
                value={averageTradingDaysPerWeekStr}
                onFocus={() => fieldHelp("average_trading_days")}
                onChange={(e) => {
                  setAverageTradingDaysPerWeekStr(onlyNum(e.target.value));
                  setTradingDaysTouched(false);
                  setAutoPhasesGenerated(false);
                }}
                onBlur={() => {
                  if (!averageTradingDaysPerWeekStr.trim()) {
                    setAverageTradingDaysPerWeekStr("5");
                    return;
                  }
                  setAverageTradingDaysPerWeekStr(String(averageTradingDaysPerWeek));
                }}
                className={inputBase}
                placeholder={`1..${tradingCalendarProfile.sessionsPerWeek}`}
              />
              <p className="text-slate-500 mt-1 text-xs">
                {L(
                  "Use the number of days you can operate consistently. The advisor uses this to calculate a supportable pace.",
                  "Usa los días que puedas operar de forma consistente. El advisor usa esto para calcular un ritmo sostenible."
                )}
              </p>
            </div>
            <div>
              <label className="block mb-1 text-slate-300">
                {L("Total committed trading days", "Total de días de trading comprometidos")}
              </label>
              <input
                inputMode="numeric"
                value={tradingDaysStr}
                onFocus={() => fieldHelp("trading_days")}
                onChange={(e) => {
                  setTradingDaysTouched(true);
                  setTradingDaysStr(onlyNum(e.target.value));
                }}
                onBlur={() => {
                  if (!tradingDaysStr.trim()) return;
                  setTradingDaysStr(String(clampInt(tradingDays, 0)));
                }}
                className={inputBase}
                placeholder="0"
              />
              <p className="text-slate-500 mt-1 text-xs">
                {L(
                  "You can override this if your real calendar is different.",
                  "Puedes editarlo si tu calendario real es diferente."
                )}
              </p>
            </div>
          </div>
          {tradingDaysFromRange ? (
            <p className="text-slate-500 mt-1 text-xs">
              {L(
                `From start date (${tradingDaysFromRange.start}) to target: ${tradingDaysFromRange.count} committed operating day(s) from ${tradingDaysFromRange.marketCount} ${tradingCalendarProfile.key} market session(s).`,
                `Desde la fecha de inicio (${tradingDaysFromRange.start}) hasta la meta: ${tradingDaysFromRange.count} día(s) operativo(s) comprometidos de ${tradingDaysFromRange.marketCount} sesión(es) de mercado ${tradingCalendarProfile.key}.`
              )}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "max_daily_loss",
      anchor: "gp-max-daily-loss",
      title: L("Max daily loss", "Pérdida diaria máxima"),
      description: L(
        "Your daily safety brake. When hit, you stop trading for the day.",
        "Tu freno de seguridad diario. Al alcanzarlo, paras de operar ese día."
      ),
      isComplete: maxDailyLossPercent > 0,
      content: (
        <div>
          <label className="block mb-1 text-slate-300">{L("Max daily loss (%)", "Pérdida diaria máx (%)")}</label>
          <input
            id="gp-max-daily-loss"
            inputMode="decimal"
            value={maxDailyLossPercentStr}
            onFocus={() => fieldHelp("max_daily_loss")}
            onChange={(e) => {
              setMaxDailyLossPercentStr(onlyNum(e.target.value));
              setAutoPhasesGenerated(false);
            }}
            onBlur={() => {
              if (!maxDailyLossPercentStr.trim()) return;
              setMaxDailyLossPercentStr(String(Math.max(0, maxDailyLossPercent)));
            }}
            className={inputBase}
            placeholder="0.00"
          />
          <p className="text-xs text-slate-500 mt-1">
            {L("Approx:", "Aprox.")} <span className="text-slate-200">{currency(maxLossDollar)}</span>
          </p>
        </div>
      ),
    },
    {
      id: "goal_day_model",
      anchor: "gp-goal-day-model",
      title: L("Modeled goal-day return", "Retorno modelado del día-meta"),
      description: L(
        "Your operating expectation on profitable sessions. This is not the return required to force the final deadline.",
        "Tu expectativa operativa en sesiones ganadoras. No es el retorno requerido para forzar la fecha final."
      ),
      isComplete: goalDayReturnPct > 0,
      content: (
        <div>
          <label className="block mb-1 text-slate-300">
            {L("Goal-day return assumption (%)", "Supuesto de retorno del día-meta (%)")}
          </label>
          <input
            id="gp-goal-day-model"
            inputMode="decimal"
            value={goalDayReturnPctStr}
            onChange={(event) => {
              setReturnModelMode("manual");
              setSelectedPlanId("");
              setGoalDayReturnPctStr(onlyNum(event.target.value));
              setAutoPhasesGenerated(false);
            }}
            onBlur={() => {
              if (!goalDayReturnPctStr.trim()) return;
              setGoalDayReturnPctStr(String(Math.max(0, goalDayReturnPct)));
            }}
            className={inputBase}
            placeholder="0.20"
          />
          <p className="mt-1 text-xs text-slate-500">
            {L(
              "The model may reduce this when your documented execution supports a slower pace; it never raises it automatically.",
              "El modelo puede reducirlo cuando tu ejecución documentada respalda un ritmo menor; nunca lo aumenta automáticamente."
            )}
          </p>
        </div>
      ),
    },
    {
      id: "expected_loss_day",
      anchor: "gp-expected-loss-day",
      title: L("Expected losing-day result", "Resultado esperado del día perdedor"),
      description: L(
        "The modeled average loss on a losing session. It must stay below the hard daily stop.",
        "La pérdida promedio modelada en una sesión perdedora. Debe quedar por debajo del stop diario duro."
      ),
      isComplete: expectedLossDayPct > 0 && expectedLossDayPct <= maxDailyLossPercent,
      content: (
        <div>
          <label className="block mb-1 text-slate-300">
            {L("Expected losing-day result (%)", "Resultado esperado del día perdedor (%)")}
          </label>
          <input
            id="gp-expected-loss-day"
            inputMode="decimal"
            value={expectedLossDayPctStr}
            onChange={(event) => {
              setReturnModelMode("manual");
              setSelectedPlanId("");
              setExpectedLossDayPctStr(onlyNum(event.target.value));
              setAutoPhasesGenerated(false);
            }}
            onBlur={() => {
              if (!expectedLossDayPctStr.trim()) return;
              setExpectedLossDayPctStr(
                String(Math.min(Math.max(0, expectedLossDayPct), Math.max(0, maxDailyLossPercent)))
              );
            }}
            className={inputBase}
            placeholder="0.35"
          />
          <p className="mt-1 text-xs text-slate-500">
            {L(
              `Hard daily stop: ${maxDailyLossPercent.toFixed(2)}%. The expected loss is a planning average, not permission to reach the stop.`,
              `Stop diario duro: ${maxDailyLossPercent.toFixed(2)}%. La pérdida esperada es un promedio de planificación, no permiso para llegar al stop.`
            )}
          </p>
        </div>
      ),
    },
    {
      id: "loss_days_per_week",
      anchor: "gp-loss-days",
      title: L("Loss days per week", "Días de pérdida por semana"),
      description: L(
        "How many losing days you budget inside your selected operating week.",
        "Cuántos días de pérdida presupuestas dentro de tu semana operativa."
      ),
      isComplete: lossDaysSet,
      content: (
        <div>
          <label className="block mb-1 text-slate-300">{L("Loss days per week", "Días de pérdida por semana")}</label>
          <input
            id="gp-loss-days"
            inputMode="numeric"
            value={lossDaysPerWeekStr}
            onFocus={() => fieldHelp("loss_days_per_week")}
            onChange={(e) => {
              setLossDaysPerWeekStr(onlyNum(e.target.value));
              setAutoPhasesGenerated(false);
            }}
            onBlur={() => {
              if (!lossDaysPerWeekStr.trim()) return;
              setLossDaysPerWeekStr(String(clampInt(lossDaysPerWeek, 0, averageTradingDaysPerWeek)));
            }}
            className={inputBase}
            placeholder={`0..${averageTradingDaysPerWeek}`}
          />
          <p className="text-slate-500 mt-1 text-xs">
            {L(
              `With ${averageTradingDaysPerWeek} operating day(s), loss days can be 0 to ${averageTradingDaysPerWeek}.`,
              `Con ${averageTradingDaysPerWeek} día(s) operativo(s), los días de pérdida pueden ser de 0 a ${averageTradingDaysPerWeek}.`
            )}
          </p>
        </div>
      ),
    },
    {
      id: "risk_per_trade",
      anchor: "gp-risk-per-trade",
      title: L("Risk per trade", "Riesgo por trade"),
      description: L(
        "This keeps each trade aligned with your risk plan.",
        "Esto mantiene cada trade alineado con tu plan de riesgo."
      ),
      isComplete: riskPerTradePct > 0,
      content: (
        <div>
          <label className="block mb-1 text-slate-300">
            {L("Max risk per trade (%)", "Riesgo máximo por trade (%)")}
          </label>
          <input
            id="gp-risk-per-trade"
            inputMode="decimal"
            value={riskPerTradePctStr}
            onFocus={() => fieldHelp("risk_per_trade")}
            onChange={(e) => setRiskPerTradePctStr(onlyNum(e.target.value))}
            onBlur={() => {
              if (!riskPerTradePctStr.trim()) return;
              setRiskPerTradePctStr(String(Math.max(0, riskPerTradePct)));
            }}
            className={inputBase}
            placeholder="2"
          />
          <p className="text-xs text-slate-500 mt-1">
            {L("Approx:", "Aprox.")} <span className="text-slate-200">{currency(riskUsd)}</span>
          </p>
        </div>
      ),
    },
    {
      id: "required_goal",
      anchor: "gp-required-goal",
      title: L("Required goal-day %", "% requerido en días de meta"),
      description: L(
        "This is the daily % you need on goal-days to hit your target.",
        "Este es el % diario que necesitas en días de meta para llegar al objetivo."
      ),
      isComplete: requiredGoalPct > 0,
      content: (
        <div id="gp-required-goal" className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-[22px] font-semibold text-emerald-300">
            {requiredGoalPct.toFixed(3)}%
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {L("Approx goal-day $:", "Aprox $ por día meta:")}{" "}
            <span className="text-slate-200">{currency(requiredGoalDollar)}</span>
          </p>
          {explainRequired.totalPlannedWithdrawal > 0 ? (
            <p className="text-xs text-slate-500 mt-1">
              {L("Scheduled withdrawals in plan:", "Retiros programados en el plan:")}{" "}
              <span className="text-sky-300">{currency(explainRequired.totalPlannedWithdrawal)}</span>
            </p>
          ) : null}
          <div className="mt-3">
            <button
              onClick={onDownloadPdfSuggested}
              className="px-4 py-2 rounded-xl border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 transition"
            >
              {L("Download PDF", "Descargar PDF")}
            </button>
          </div>
        </div>
      ),
    },
    {
      id: "phase_builder",
      anchor: "gp-phase-builder",
      title: L("Cadence & milestones", "Cadencia y metas"),
      description: L(
        "Weekly checkpoints aligned to monthly goals, based on trading days.",
        "Checkpoints semanales alineados a metas mensuales, basados en días de trading."
      ),
      isComplete: autoPhasesGenerated,
      content: (
        <div id="gp-phase-builder" className="rounded-2xl border border-slate-700/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] text-slate-500 tracking-widest uppercase">
                {L("Capital schedule", "Calendario de capital")}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                {L(
                  "A business banking view of the plan: runway, checkpoints, and deadline risk.",
                  "Una vista business banking del plan: runway, checkpoints y riesgo de deadline."
                )}
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {canGeneratePhases
                ? L("Auto-generated", "Generado automáticamente")
                : L("Waiting for required inputs", "Esperando datos requeridos")}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-200 font-semibold">
              {L("Weekly checkpoints · Monthly goals", "Checkpoints semanales · Metas mensuales")}
            </span>
            <span className="text-xs text-slate-500">
              {L(
                `Based on the ${tradingCalendarProfile.key} session calendar for ${tradingInstrument}.`,
                `Basado en el calendario de sesiones ${tradingCalendarProfile.key} para ${tradingInstrument}.`
              )}
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {L("Starting capital", "Capital inicial")}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{currency(startingBalance)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {L("Target capital", "Capital objetivo")}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{currency(targetBalance)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {L("Required goal-day", "Día de meta requerido")}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{requiredGoalPct.toFixed(2)}%</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {L("Deadline", "Deadline")}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{targetDateStr || "—"}</p>
            </div>
          </div>
          {planRealismReview.shouldSurface &&
          (planRealismReview.verdict === "high_risk" || planRealismReview.verdict === "stretch") ? (
            <div
              className={`mt-3 rounded-2xl border p-4 ${
                planRealismReview.verdict === "high_risk"
                  ? "border-red-400/40 bg-red-500/10"
                  : "border-amber-400/40 bg-amber-500/10"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p
                    className={`text-[11px] uppercase tracking-[0.24em] ${
                      planRealismReview.verdict === "high_risk" ? "text-red-200" : "text-amber-200"
                    }`}
                  >
                    {L("Deadline risk", "Riesgo de deadline")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">
                    {L(
                      "The current operating model does not support the target by the selected date.",
                      "El modelo operativo actual no sostiene la meta para la fecha seleccionada."
                    )}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    {L(
                      `Under the active scenario, projected deadline capital is ${currency(planRealismReview.scenarioProjectedBalance)} versus a target of ${currency(targetBalance)}. Treat this as a capital-policy issue, not a motivation issue.`,
                      `Bajo el escenario activo, el capital proyectado al deadline es ${currency(planRealismReview.scenarioProjectedBalance)} contra una meta de ${currency(targetBalance)}. Trata esto como un asunto de política de capital, no de motivación.`
                    )}
                  </p>
                </div>
                <span className="rounded-full border border-slate-600 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold text-slate-200">
                  {planRealismReview.estimatedCompletionDate
                    ? L(`Est. completion ${planRealismReview.estimatedCompletionDate}`, `Cierre est. ${planRealismReview.estimatedCompletionDate}`)
                    : L("No reliable completion", "Sin cierre confiable")}
                </span>
              </div>
            </div>
          ) : null}
          {!autoPhasesGenerated ? (
            <p className="mt-3 text-xs text-slate-500">
              {canGeneratePhases
                ? L(
                    "Your milestones are generated automatically once required inputs are set.",
                    "Tus metas se generan automáticamente cuando completas los datos requeridos."
                  )
                : L(
                    "Complete start date, target date, operating days, withdrawal choice, max daily loss, and loss days per week first.",
                    "Completa fecha de inicio, fecha meta, días operativos, elección de retiros, pérdida diaria máx y días de pérdida por semana primero."
                  )}
            </p>
          ) : autoPhases.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              {L(
                "Enter starting balance, target balance, start date, and target date first.",
                "Primero ingresa balance inicial, meta, fecha de inicio y fecha objetivo."
              )}
            </p>
          ) : (
            <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    {L("First checkpoint", "Primer checkpoint")}
                  </p>
                  <p className="mt-2 text-[12px] text-slate-500">
                    {autoCadenceUnit} {firstMonthMeta?.weekIndex ?? 1}/{firstMonthMeta?.weeksInMonth ?? autoPhases.length}
                    {firstMonthMeta?.monthIndex ? (
                      <span className="text-slate-400">
                        {" "}
                        · {L("Month", "Mes")} {firstMonthMeta.monthIndex}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-300">
                    {currency(autoPhases[0].targetEquity)}
                  </p>
                  {autoPhases[0].targetDate ? (
                    <p className="mt-1 text-[12px] text-slate-500">
                      {L("Due:", "Vence:")}{" "}
                      <span className="text-slate-200">{autoPhases[0].targetDate}</span>
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {firstMonthMeta?.monthGoal ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Month profit target", "Meta mensual de ganancia")}
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-100">{currency(firstMonthMeta.monthGoal)}</p>
                    </div>
                  ) : null}
                  {firstMonthMeta?.weeklyGoal ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Weekly profit target", "Meta semanal de ganancia")}
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-100">{currency(firstMonthMeta.weeklyGoal)}</p>
                    </div>
                  ) : null}
                  {firstMonthMeta?.weeklyPct ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Weekly allocation", "Asignación semanal")}
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-100">{firstMonthMeta.weeklyPct.toFixed(1)}%</p>
                    </div>
                  ) : null}
                  {(autoPhases[0].monthDeposit ?? 0) > 0 ? (
                    <div className="rounded-xl border border-cyan-300/20 bg-slate-950/70 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Planned contribution", "Aportación planificada")}
                      </p>
                      <p className="mt-1 text-base font-semibold text-cyan-100">{currency(autoPhases[0].monthDeposit ?? 0)}</p>
                    </div>
                  ) : null}
                  {(autoPhases[0].monthWithdrawal ?? 0) > 0 ? (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        {L("Month withdrawal", "Retiro del mes")}
                      </p>
                      <p className="mt-1 text-base font-semibold text-sky-300">{currency(autoPhases[0].monthWithdrawal ?? 0)}</p>
                    </div>
                  ) : null}
                </div>
              </div>
              {projectedTargetReached && projectedCompletionDate ? (
                <div
                  className={`mt-3 rounded-xl border p-3 ${
                    projectedCompletesOnSchedule
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-amber-400/40 bg-amber-500/10"
                  }`}
                >
                  <p
                    className={`text-[11px] tracking-widest uppercase ${
                      projectedCompletesOnSchedule ? "text-emerald-200" : "text-amber-200"
                    }`}
                  >
                    {projectedCompletesOnSchedule
                      ? L("Projected completion", "Cierre proyectado")
                      : L("Projected completion misses deadline", "Cierre proyectado fuera de deadline")}
                  </p>
                  <p className="mt-1 text-sm text-slate-100">
                    {!projectedCompletesOnSchedule
                      ? L(
                          `At the current risk policy, this plan reaches the target on ${projectedCompletionDate}, after the selected deadline ${targetDateStr}.`,
                          `Con la política de riesgo actual, este plan alcanza la meta el ${projectedCompletionDate}, después del deadline seleccionado ${targetDateStr}.`
                        )
                      : projectedCompletedEarly
                      ? L(
                          `This plan reaches the target on ${projectedCompletionDate} and stops there instead of forcing a fake drawdown back to the goal.`,
                          `Este plan alcanza la meta el ${projectedCompletionDate} y se detiene ahí en vez de forzar un drawdown artificial de regreso a la meta.`
                        )
                      : L(
                          `This plan reaches the target on ${projectedCompletionDate}.`,
                          `Este plan alcanza la meta el ${projectedCompletionDate}.`
                        )}
                  </p>
                  {projectedCompletionBalance !== null ? (
                    <p className="mt-1 text-[12px] text-slate-300">
                      {L("Projected balance at completion:", "Balance proyectado al cierre:")}{" "}
                      <span className={projectedCompletesOnSchedule ? "text-emerald-300" : "text-amber-200"}>{currency(projectedCompletionBalance)}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
              {isFollowOnDraft ? (
                <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                  <p className="text-[11px] text-cyan-200 tracking-widest uppercase">
                    {L("Next-cycle draft", "Borrador del próximo ciclo")}
                  </p>
                  <p className="mt-1 text-sm text-slate-100">
                    {L(
                      "These numbers were prefilled from your live balance. Review target, date, and risk before saving the next plan.",
                      "Estos números fueron prellenados desde tu balance real. Revisa meta, fecha y riesgo antes de guardar el próximo plan."
                    )}
                  </p>
                </div>
              ) : null}
              {liveTargetReached && !isFollowOnDraft ? (
                <div className="mt-3 rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-emerald-200 tracking-widest uppercase">
                        {L("Plan target reached", "Meta del plan alcanzada")}
                      </p>
                      <p className="mt-1 text-sm text-slate-100">
                        {L(
                          "Your live balance is already at or above the target. Close this cycle cleanly and draft the next one from current equity.",
                          "Tu balance real ya está en o por encima de la meta. Cierra este ciclo limpio y prepara el próximo desde el equity actual."
                        )}
                      </p>
                      <p className="mt-1 text-[12px] text-slate-300">
                        {L("Live balance:", "Balance real:")}{" "}
                        <span className="text-emerald-300">{currency(liveCurrentBalance ?? targetBalance)}</span>
                        {" · "}
                        {L("Original target:", "Meta original:")}{" "}
                        <span className="text-slate-100">{currency(targetBalance)}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartFollowOnPlan("same")}
                        className="rounded-xl bg-emerald-400 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                      >
                        {L("New plan · same risk", "Nuevo plan · mismo riesgo")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartFollowOnPlan("lower")}
                        className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-100 transition hover:border-cyan-400 hover:text-cyan-200"
                      >
                        {L("Lower risk", "Menos riesgo")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartFollowOnPlan("higher")}
                        className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-100 transition hover:border-amber-400 hover:text-amber-200"
                      >
                        {L("Higher risk", "Más riesgo")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {quarterSummaries.length ? (
                <div className="mt-3">
                  <p className="text-[11px] text-slate-500 tracking-widest uppercase">
                    {L("Quarter summary", "Resumen trimestral")}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {quarterSummaries.map((q) => (
                      <div key={q.label} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                        <p className="text-[11px] text-slate-400">
                          {q.label} · {q.rangeLabel}
                        </p>
                        <p className="text-[11px] text-slate-300">
                          {L("Start", "Inicio")}: <span className="text-slate-200">{currency(q.startBalance)}</span>
                        </p>
                        <p className="text-[11px] text-slate-300">
                          {L("Target", "Meta")}: <span className="text-slate-200">{currency(q.endBalance)}</span>
                        </p>
                        <p className="text-[11px] text-emerald-300">
                          {L("Trading profit", "Ganancia de trading")}: <span>{currency(q.tradingProfit)}</span>
                        </p>
                        <p className="text-[11px] text-slate-300">
                          {L("Net change", "Cambio neto")}: <span className="text-slate-200">{currency(q.netChange)}</span>
                        </p>
                        {q.deposit > 0 ? (
                          <p className="text-[11px] text-cyan-200">
                            {L("Contributions", "Aportaciones")}: <span>{currency(q.deposit)}</span>
                          </p>
                        ) : null}
                        {q.withdrawal > 0 ? (
                          <p className="text-[11px] text-sky-300">
                            {L("Withdrawals", "Retiros")}: <span>{currency(q.withdrawal)}</span>
                          </p>
                        ) : null}
                        {q.endDate ? (
                          <p className="text-[10px] text-slate-500">
                            {L("End date", "Fecha fin")}: <span className="text-slate-300">{q.endDate}</span>
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="text-[11px] text-slate-500 mt-2">
                {L(
                  "Milestones follow the operating assumptions plus scheduled contributions and withdrawals.",
                  "Las metas siguen los supuestos operativos más las aportaciones y retiros programados."
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                {L(
                  "Trading profit, contributions, withdrawals, and net balance change remain separate at every checkpoint.",
                  "Ganancia de trading, aportaciones, retiros y cambio neto permanecen separados en cada checkpoint."
                )}
              </p>
            </div>
          )}
        </div>
      ),
    },
  ];

  const capitalFlowStage = legacyStep0Stages.find((stage) => stage.id === "planned_withdrawals");
  const requiredLossDayPct = Math.abs(suggestedRows.find((row) => row.type === "loss")?.pct ?? 0);
  const requiredBand =
    requiredGoalPct <= 1
      ? L("Conservative range", "Rango conservador")
      : requiredGoalPct <= 2
        ? L("Moderate range", "Rango moderado")
        : requiredGoalPct <= 4
          ? L("Aggressive range", "Rango agresivo")
          : L("Outside standard modes", "Fuera de los modos estándar");

  const step0Stages = [
    {
      id: "starting_balance",
      anchor: "gp-starting-balance",
      title: L("1. Starting capital", "1. Capital inicial"),
      description: L(
        "How much trading capital will this business plan start with?",
        "¿Con cuánto capital de trading comenzará este plan empresarial?"
      ),
      isComplete: startingBalance > 0,
      content: (
        <div className="mx-auto max-w-xl rounded-2xl border border-cyan-300/20 bg-slate-950/70 p-5">
          <label htmlFor="gp-starting-balance" className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {L("Starting capital in USD", "Capital inicial en USD")}
          </label>
          <div className="mt-3 flex items-center rounded-xl border border-slate-700 bg-slate-950 px-4 focus-within:border-cyan-300">
            <span className="text-xl font-semibold text-cyan-200">$</span>
            <input
              id="gp-starting-balance"
              inputMode="decimal"
              value={startingBalanceStr}
              onChange={(event) => {
                setStartingBalanceStr(formatMoneyInputDraft(event.target.value));
                setSelectedPlanId("");
                setAutoPhasesGenerated(false);
              }}
              onBlur={() => {
                if (startingBalanceStr.trim()) setStartingBalanceStr(formatMoneyInputValue(startingBalance));
              }}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-2xl font-semibold text-slate-100 outline-none"
              placeholder="10,000.00"
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {L(
              "Every percentage in the forecast will also be translated into dollars from the active balance.",
              "Cada porcentaje del forecast también se traducirá a dólares usando el balance activo."
            )}
          </p>
        </div>
      ),
    },
    {
      id: "target_balance",
      anchor: "gp-target-balance",
      title: L("2. Business target", "2. Meta empresarial"),
      description: L(
        "Define the account balance the business should reach.",
        "Define el balance que la empresa de trading debe alcanzar."
      ),
      isComplete: targetBalance > startingBalance,
      content: (
        <div className="mx-auto max-w-xl rounded-2xl border border-emerald-300/20 bg-slate-950/70 p-5">
          <label htmlFor="gp-target-balance" className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {L("Target balance in USD", "Balance objetivo en USD")}
          </label>
          <div className="mt-3 flex items-center rounded-xl border border-slate-700 bg-slate-950 px-4 focus-within:border-emerald-300">
            <span className="text-xl font-semibold text-emerald-200">$</span>
            <input
              id="gp-target-balance"
              inputMode="decimal"
              value={targetBalanceStr}
              onChange={(event) => {
                setTargetBalanceStr(formatMoneyInputDraft(event.target.value));
                setSelectedPlanId("");
                setAutoPhasesGenerated(false);
              }}
              onBlur={() => {
                if (targetBalanceStr.trim()) setTargetBalanceStr(formatMoneyInputValue(targetBalance));
              }}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-2xl font-semibold text-slate-100 outline-none"
              placeholder="25,000.00"
            />
          </div>
          {targetBalance > 0 && targetBalance <= startingBalance ? (
            <p className="mt-2 text-xs text-amber-300">
              {L("The business target must be above starting capital.", "La meta empresarial debe ser mayor que el capital inicial.")}
            </p>
          ) : null}
          {targetMultiple > 1 ? (
            <p className="mt-3 text-sm text-slate-300">
              {L("Capital growth required", "Crecimiento de capital requerido")}: {targetMultiple.toFixed(2)}× · {currency(targetBalance - startingBalance)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "timeline",
      anchor: "gp-timeline",
      title: L("3. Deadline and market", "3. Plazo y mercado"),
      description: L(
        "Choose when the plan starts, how long it has, and which session calendar applies.",
        "Escoge cuándo comienza, cuánto tiempo tendrá y qué calendario de sesiones aplica."
      ),
      isComplete: Boolean(planStartDate && targetDateStr && planDatesOrdered && tradingDays > 0),
      content: (
        <div id="gp-timeline" className="grid gap-4 md:grid-cols-2">
          <FlexibleDateField
            id="gp-start-date"
            label={L("Plan start date", "Fecha de inicio")}
            value={planStartDate ?? ""}
            onChange={(value) => {
              setPlanStartDate(value || isoToday());
              setSelectedPlanId("");
              setTradingDaysTouched(false);
              setAutoPhasesGenerated(false);
            }}
            lang={lang}
            className={inputBase}
            fallbackValue={isoToday()}
            helperText={L(
              "The forecast calendar and every milestone start on this date.",
              "El calendario del forecast y todos los milestones comienzan en esta fecha."
            )}
          />
          <label className="text-sm text-slate-300">
            {L("Primary market", "Mercado principal")}
            <select
              value={tradingInstrument}
              onChange={(event) => {
                const instrument = normalizeTradingInstrument(event.target.value);
                const profile = getTradingCalendarProfile(instrument);
                setTradingInstrument(instrument);
                setAverageTradingDaysPerWeekStr(String(profile.sessionsPerWeek));
                setLossDaysPerWeekStr("1");
                setWinningDaysPerWeekStr(String(Math.max(1, profile.sessionsPerWeek - 1)));
                setSelectedPlanId("");
                setTradingDaysTouched(false);
              }}
              className={`${inputBase} mt-1`}
            >
              <option value="stocks">{L("Stocks / ETFs", "Acciones / ETFs")}</option>
              <option value="options">{L("US listed options", "Opciones listadas en EE. UU.")}</option>
              <option value="futures">{L("Futures", "Futuros")}</option>
              <option value="forex">Forex</option>
              <option value="crypto">Crypto</option>
              <option value="other">{L("Other", "Otro")}</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">
            {L("Time to reach the target", "Tiempo para alcanzar la meta")}
            <div className="mt-1 grid grid-cols-[0.8fr_1.2fr] gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={runwayLimit}
                value={runwayAmountStr}
                onChange={(event) => {
                  setRunwayAmountStr(event.target.value.replace(/\D/g, "").slice(0, 5));
                  setSelectedPlanId("");
                  setTradingDaysTouched(false);
                }}
                onBlur={() => setRunwayAmountStr(String(runwayAmount))}
                aria-invalid={runwayAmountExceedsLimit}
                className={inputBase}
              />
              <select
                value={runwayUnit}
                onChange={(event) => {
                  const nextUnit = normalizeTradingRunwayUnit(event.target.value);
                  setRunwayUnit(nextUnit);
                  setRunwayAmountStr((current) =>
                    String(clampTradingRunwayAmount(toNum(current, 1), nextUnit))
                  );
                  setSelectedPlanId("");
                  setTradingDaysTouched(false);
                }}
                className={inputBase}
              >
                <option value="days">{L("Days", "Días")}</option>
                <option value="weeks">{L("Weeks", "Semanas")}</option>
                <option value="months">{L("Months", "Meses")}</option>
                <option value="years">{L("Years", "Años")}</option>
              </select>
            </div>
            {runwayAmountExceedsLimit ? (
              <p className="mt-2 text-xs text-amber-300">
                {L(
                  `Maximum for this unit is ${runwayLimit}. The safe limit is being used for the forecast.`,
                  `El máximo para esta unidad es ${runwayLimit}. El forecast está usando el límite seguro.`
                )}
              </p>
            ) : null}
          </label>
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200">{L("Calculated deadline", "Fecha calculada")}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{targetDateStr || "—"}</p>
            <p className="mt-1 text-xs text-slate-400">
              {tradingDays} {L("committed sessions", "sesiones comprometidas")} · {tradingCalendarProfile.key}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "weekly_schedule",
      anchor: "gp-weekly-schedule",
      title: L("4. Weekly execution budget", "4. Presupuesto semanal de ejecución"),
      description: L(
        "Budget how many days you expect to trade, win, and lose each week.",
        "Presupuesta cuántos días esperas operar, ganar y perder cada semana."
      ),
      isComplete: weeklyOutcomePlanComplete,
      content: (
        <div id="gp-weekly-schedule" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm text-slate-300">
              {L("Trading days / week", "Días de trading / semana")}
              <input
                inputMode="numeric"
                value={averageTradingDaysPerWeekStr}
                onChange={(event) => {
                  const next = clampInt(toNum(event.target.value, 0), 0, tradingCalendarProfile.sessionsPerWeek);
                  setAverageTradingDaysPerWeekStr(event.target.value.replace(/\D/g, ""));
                  const nextLosses = Math.min(lossDaysPerWeek, Math.max(0, next - 1));
                  setLossDaysPerWeekStr(String(nextLosses));
                  setWinningDaysPerWeekStr(String(Math.max(0, next - nextLosses)));
                  setSelectedPlanId("");
                }}
                className={`${inputBase} mt-1`}
              />
            </label>
            <label className="text-sm text-slate-300">
              {L("Expected winning days", "Días ganadores esperados")}
              <input
                inputMode="numeric"
                value={winningDaysPerWeekStr}
                onChange={(event) => {
                  const nextWins = clampInt(toNum(event.target.value, 0), 0, averageTradingDaysPerWeek);
                  setWinningDaysPerWeekStr(event.target.value.replace(/\D/g, ""));
                  setLossDaysPerWeekStr(String(Math.max(0, averageTradingDaysPerWeek - nextWins)));
                  setSelectedPlanId("");
                }}
                className={`${inputBase} mt-1 border-emerald-400/40`}
              />
            </label>
            <label className="text-sm text-slate-300">
              {L("Expected losing days", "Días perdedores esperados")}
              <input
                inputMode="numeric"
                value={lossDaysPerWeekStr}
                onChange={(event) => {
                  const nextLosses = clampInt(toNum(event.target.value, 0), 0, averageTradingDaysPerWeek);
                  setLossDaysPerWeekStr(event.target.value.replace(/\D/g, ""));
                  setWinningDaysPerWeekStr(String(Math.max(0, averageTradingDaysPerWeek - nextLosses)));
                  setSelectedPlanId("");
                }}
                className={`${inputBase} mt-1 border-rose-400/40`}
              />
            </label>
          </div>
          <div className={`rounded-xl border p-3 text-sm ${weeklyOutcomePlanComplete ? "border-emerald-300/20 bg-emerald-300/5 text-emerald-100" : "border-amber-300/20 bg-amber-300/5 text-amber-100"}`}>
            {weeklyOutcomePlanComplete
              ? L(
                  `${winningDaysPerWeek} winning + ${lossDaysPerWeek} losing = ${averageTradingDaysPerWeek} trading days per week.`,
                  `${winningDaysPerWeek} ganadores + ${lossDaysPerWeek} perdedores = ${averageTradingDaysPerWeek} días de trading por semana.`
                )
              : L("Winning and losing days must equal the trading days budget.", "Los días ganadores y perdedores deben sumar los días de trading.")}
          </div>
        </div>
      ),
    },
    {
      id: "capital_flows",
      anchor: "gp-planned-withdrawals",
      title: L("5. Contributions and withdrawals", "5. Aportaciones y retiros"),
      description: L(
        "Optional cashflows stay separate from trading performance.",
        "Los cashflows opcionales se mantienen separados del rendimiento de trading."
      ),
      isComplete: capitalFlowAssumptionsComplete,
      content: capitalFlowStage?.content ?? null,
    },
    {
      id: "forecast_analysis",
      anchor: "gp-forecast-analysis",
      title: L("6. AI mathematical analysis", "6. Análisis matemático con IA"),
      description: L(
        "The deterministic engine calculates the required pace and compares it with every standard and manual operating model.",
        "El motor determinístico calcula el ritmo requerido y lo compara con cada modelo operativo estándar y manual."
      ),
      isComplete:
        requiredGoalPct > 0 &&
        adaptiveGrowthPlan.panoramas.length > 0,
      content: (
        <div id="gp-forecast-analysis" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200">{L("Mathematical gain / loss", "Ganancia / pérdida matemática")}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-100">+{requiredGoalPct.toFixed(3)}% / -{requiredLossDayPct.toFixed(3)}%</p>
              <p className="mt-1 text-xs text-slate-400">+{currency((baseBalanceForDollars * requiredGoalPct) / 100)} / -{currency((baseBalanceForDollars * requiredLossDayPct) / 100)} {L("at today's base", "sobre la base actual")}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{L("Classification", "Clasificación")}</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{requiredBand}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{L("AI recommendation", "Recomendación IA")}</p>
              <p className="mt-1 text-lg font-semibold capitalize text-emerald-300">{aiRecommendedPlanId}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{L("Evidence", "Evidencia")}</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{performanceEvidenceLoading ? L("Reviewing…", "Revisando…") : adaptiveGrowthPlan.isProvisional ? L("Provisional", "Provisional") : L("Validated", "Validado")}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4">
            <p className="text-sm font-semibold text-emerald-100">
              {aiRecommendedPlanId === "mathematical"
                ? L(
                    "No standard mode reaches the requested target on time. Use a manual percentage, extend the deadline, or change the capital assumptions.",
                    "Ningún modo estándar alcanza la meta en el plazo solicitado. Usa un porcentaje manual, extiende la fecha o cambia los supuestos de capital."
                  )
                : L(
                    `The lowest standard mode that meets the requested deadline or its planning tolerance is ${aiRecommendedPlanId}.`,
                    `El modo estándar más bajo que cumple la fecha solicitada o su tolerancia de planificación es ${aiRecommendedPlanId}.`
                  )}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {L(
                "This is a conditional budget forecast, not a promise of returns. Actual execution will be compared with the saved baseline.",
                "Este es un budget forecast condicional, no una promesa de rendimiento. La ejecución real se comparará con la línea base guardada."
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-violet-300/20 bg-violet-300/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
              {L("Next: select the scenario", "Próximo: escoge el escenario")}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {L(
                "Choose the operating mode in step 7. In step 8, Business AI will analyze that exact selection using its percentages, dollar impact, deadline, risk, and execution evidence.",
                "Escoge el modo operativo en el paso 7. En el paso 8, Business AI analizará exactamente esa selección usando sus porcentajes, impacto en dólares, plazo, riesgo y evidencia de ejecución."
              )}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "scenario_selection",
      anchor: "gp-scenario-selection",
      title: L("7. Choose the operating mode", "7. Escoge el modo operativo"),
      description: L(
        "Compare the deadline, projected balance, and dollar impact; or define a manual model.",
        "Compara la fecha, el balance proyectado y el impacto en dólares; o define un modelo manual."
      ),
      isComplete: returnModelConfigured,
      content: (
        <div id="gp-scenario-selection" className="space-y-4">
          <div className={`grid gap-3 md:grid-cols-3 ${idealDeadlineOption ? "xl:grid-cols-4" : ""}`}>
            {(["conservative", "moderate", "aggressive"] as BusinessScenarioId[]).map((id) => {
              const policy = getGrowthPlanOperatingPolicy(id);
              const panorama = adaptiveGrowthPlan.panoramas.find((item) => item.id === id);
              const active = selectedPlanId === id;
              const recommended = aiRecommendedPlanId === id;
              const shortfallUsd = growthPlanDeadlineShortfallUsd(
                panorama?.projectedBalance ?? 0,
                targetBalance
              );
              const approximatelyMeets = meetsGrowthPlanDeadlineApproximately({
                panorama,
                targetBalance,
                toleranceUsd: deadlineToleranceUsd,
              });
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    selectReturnModel(id, true);
                    setAutoPhasesGenerated(true);
                    setVisibleForecastRows(60);
                  }}
                  className={`rounded-2xl border p-4 text-left transition ${active ? "border-emerald-300 bg-emerald-300/10" : recommended ? "border-cyan-300/50 bg-cyan-300/5" : "border-slate-700 bg-slate-950/70 hover:border-slate-500"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold capitalize text-slate-100">{id}</span>
                    {recommended ? <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">AI</span> : null}
                  </div>
                  <p className="mt-3 text-xl font-semibold text-emerald-300">+{policy.goalDayReturnPct}% / -{policy.expectedLossDayPct}%</p>
                  <p className="mt-1 text-xs text-slate-400">
                    +{currency((baseBalanceForDollars * policy.goalDayReturnPct) / 100)} / -{currency((baseBalanceForDollars * policy.expectedLossDayPct) / 100)}
                  </p>
                  <div className="mt-3 border-t border-slate-800 pt-3 text-xs leading-5 text-slate-400">
                    <p>{L("Projected balance on", "Balance proyectado al")} {formatPlanDate(targetDateStr, lang)}: <span className="text-slate-100">{currency(panorama?.projectedBalance ?? startingBalance)}</span></p>
                    <p>{L("Estimated target date", "Fecha estimada de meta")}: <span className="text-slate-100">{panorama?.completionDate ? formatPlanDate(panorama.completionDate, lang) : L("Not reached", "No alcanzada")}</span></p>
                    <p className={approximatelyMeets ? "text-emerald-300" : "text-rose-300"}>
                      {panorama?.reachesRequestedDeadline
                        ? L("Meets the requested date exactly", "Cumple exactamente la fecha solicitada")
                        : approximatelyMeets
                          ? L(
                              `Approximately on plan · ${currency(shortfallUsd)} below target`,
                              `Aproximadamente en plan · ${currency(shortfallUsd)} por debajo de la meta`
                            )
                          : L(
                              `Misses by ${currency(shortfallUsd)}`,
                              `No cumple por ${currency(shortfallUsd)}`
                            )}
                    </p>
                    <p>{L("Conditional year", "Año condicional")}: <span className="text-amber-200">{Number(panorama?.modeledAnnualReturnPct ?? 0).toFixed(1)}%</span></p>
                  </div>
                </button>
              );
            })}
            {idealDeadlineOption ? (() => {
              const scenario = businessScenarios.find(
                (item) => item.id === idealDeadlineOption.scenarioId
              );
              const policy = getGrowthPlanOperatingPolicy(idealDeadlineOption.scenarioId);
              if (!scenario) return null;
              return (
                <button
                  type="button"
                  onClick={applyIdealDeadlineOption}
                  className="rounded-2xl border border-violet-300/55 bg-violet-300/10 p-4 text-left transition hover:border-violet-200 hover:bg-violet-300/15"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-violet-100">
                      {L("Ideal plan", "Plan ideal")}
                    </span>
                    <span className="rounded-full bg-violet-300/15 px-2 py-1 text-[10px] font-semibold text-violet-100">
                      AI · {scenario.title}
                    </span>
                  </div>
                  <p className="mt-3 text-xl font-semibold text-violet-200">
                    +{policy.goalDayReturnPct}% / -{policy.expectedLossDayPct}%
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    +{currency((baseBalanceForDollars * policy.goalDayReturnPct) / 100)} / -{currency((baseBalanceForDollars * policy.expectedLossDayPct) / 100)}
                  </p>
                  <div className="mt-3 border-t border-violet-300/20 pt-3 text-xs leading-5 text-slate-300">
                    <p>
                      {L("Requested date", "Fecha solicitada")}: <span className="text-rose-200">{formatPlanDate(targetDateStr, lang)} · {L("not met", "no cumple")}</span>
                    </p>
                    <p>
                      {L("Attainable estimated date", "Fecha estimada alcanzable")}: <span className="font-semibold text-violet-100">{formatPlanDate(idealDeadlineOption.completionDate, lang)}</span>
                    </p>
                    <p>
                      {L("Standard operating model", "Modelo operativo estándar")}: <span className="text-slate-100">{scenario.title}</span>
                    </p>
                  </div>
                  <span className="mt-3 inline-flex rounded-lg bg-violet-200 px-3 py-1.5 text-xs font-semibold text-slate-950">
                    {L("Use this realistic date", "Usar esta fecha realista")}
                  </span>
                </button>
              );
            })() : null}
          </div>
          <p className="text-[11px] leading-5 text-slate-500">
            {L(
              `Approximate deadline tolerance: up to ${currency(deadlineToleranceUsd)} below the target. This only classifies the comparison; the saved target and forecast math remain exact.`,
              `Tolerancia aproximada para la fecha: hasta ${currency(deadlineToleranceUsd)} por debajo de la meta. Esto solo clasifica la comparación; la meta guardada y la matemática del forecast permanecen exactas.`
            )}
          </p>
          <div className={`rounded-2xl border p-4 ${selectedPlanId === "manual" ? "border-sky-300 bg-sky-300/10" : "border-slate-700 bg-slate-950/70"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-100">{L("Manual mode", "Modo manual")}</p>
                <p className="text-xs text-slate-400">{L("Choose your own daily gain and loss assumptions.", "Escoge tus propios supuestos diarios de ganancia y pérdida.")}</p>
              </div>
              {requiredGoalPct > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setReturnModelMode("manual");
                    setSelectedPlanId("");
                    setGoalDayReturnPctStr(requiredGoalPct.toFixed(3));
                    setExpectedLossDayPctStr(requiredGoalPct.toFixed(3));
                    setMaxDailyLossPercentStr(requiredGoalPct.toFixed(3));
                    setRiskPerTradePctStr(String(Math.min(1, Math.max(0.1, requiredGoalPct / 4)).toFixed(3)));
                  }}
                  className="rounded-full border border-cyan-300/40 px-3 py-1.5 text-xs text-cyan-100"
                >
                  {L("Load mathematical %", "Cargar % matemático")}
                </button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-slate-300">{L("Winning day %", "Día ganador %")}
                <input value={goalDayReturnPctStr} inputMode="decimal" onChange={(event) => { setReturnModelMode("manual"); setSelectedPlanId(""); setGoalDayReturnPctStr(onlyNum(event.target.value)); }} className={`${inputBase} mt-1`} />
                <span className="mt-1 block text-slate-500">{currency((baseBalanceForDollars * goalDayReturnPct) / 100)}</span>
              </label>
              <label className="text-xs text-slate-300">{L("Losing day %", "Día perdedor %")}
                <input value={expectedLossDayPctStr} inputMode="decimal" onChange={(event) => { setReturnModelMode("manual"); setSelectedPlanId(""); setExpectedLossDayPctStr(onlyNum(event.target.value)); }} className={`${inputBase} mt-1`} />
                <span className="mt-1 block text-slate-500">-{currency((baseBalanceForDollars * expectedLossDayPct) / 100)}</span>
              </label>
              <label className="text-xs text-slate-300">{L("Hard daily stop %", "Stop diario duro %")}
                <input value={maxDailyLossPercentStr} inputMode="decimal" onChange={(event) => { setReturnModelMode("manual"); setSelectedPlanId(""); setMaxDailyLossPercentStr(onlyNum(event.target.value)); }} className={`${inputBase} mt-1`} />
                <span className="mt-1 block text-slate-500">-{currency((baseBalanceForDollars * maxDailyLossPercent) / 100)}</span>
              </label>
              <label className="text-xs text-slate-300">{L("Risk per trade %", "Riesgo por trade %")}
                <input value={riskPerTradePctStr} inputMode="decimal" onChange={(event) => { setReturnModelMode("manual"); setSelectedPlanId(""); setRiskPerTradePctStr(onlyNum(event.target.value)); }} className={`${inputBase} mt-1`} />
                <span className="mt-1 block text-slate-500">{currency(riskUsd)}</span>
              </label>
            </div>
            <button
              type="button"
              disabled={goalDayReturnPct <= 0 || expectedLossDayPct <= 0 || maxDailyLossPercent < expectedLossDayPct || riskPerTradePct <= 0}
              onClick={() => {
                selectReturnModel("manual", true);
                setAutoPhasesGenerated(true);
                setVisibleForecastRows(60);
              }}
              className="mt-4 rounded-xl bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
            >
              {selectedPlanId === "manual" ? L("Manual plan selected", "Plan manual seleccionado") : L("Calculate and use manual plan", "Calcular y usar plan manual")}
            </button>
          </div>
        </div>
      ),
    },
    {
      id: "forecast_review",
      anchor: "gp-forecast-review",
      title: L("8. Forecast curve and sequence", "8. Curva y secuencia del forecast"),
      description: L(
        "Review the selected budget path before continuing to the operating system.",
        "Revisa la trayectoria presupuestada antes de continuar al sistema operativo."
      ),
      isComplete: Boolean(selectedForecastProjection?.rows.length && selectedForecastProjection.targetReached),
      content: selectedForecastProjection && selectedForecastAssumptions ? (
        <div id="gp-forecast-review" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3"><p className="text-[10px] uppercase text-slate-500">{L("Selected mode", "Modo seleccionado")}</p><p className="mt-1 font-semibold capitalize text-emerald-300">{selectedForecastAssumptions.id}</p></div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3"><p className="text-[10px] uppercase text-slate-500">{L("Gain / loss", "Ganancia / pérdida")}</p><p className="mt-1 font-semibold text-slate-100">+{selectedForecastAssumptions.goalDayPct}% / -{selectedForecastAssumptions.lossDayPct}%</p><p className="text-xs text-slate-500">+{currency((baseBalanceForDollars * selectedForecastAssumptions.goalDayPct) / 100)} / -{currency((baseBalanceForDollars * selectedForecastAssumptions.lossDayPct) / 100)}</p></div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3"><p className="text-[10px] uppercase text-slate-500">{L("Requested date", "Fecha solicitada")}</p><p className="mt-1 font-semibold text-slate-100">{formatPlanDate(targetDateStr, lang)}</p></div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3"><p className="text-[10px] uppercase text-slate-500">{L("Forecast completion", "Cumplimiento estimado")}</p><p className="mt-1 font-semibold text-cyan-200">{selectedForecastProjection.completionDate ? formatPlanDate(selectedForecastProjection.completionDate, lang) : L("Not reached", "No alcanzada")}</p></div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-violet-300/25 bg-violet-300/5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-300/10 p-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-violet-200">
                  {L("AI review of your selected scenario", "Evaluación IA del escenario seleccionado")}
                </p>
                <p className="mt-1 text-sm font-semibold capitalize text-slate-100">
                  {researchReview?.selectedScenarioTitle || selectedForecastAssumptions.id}
                </p>
              </div>
              {researchReviewLoading ? (
                <span className="text-xs text-violet-200">{L("Analyzing exact selection…", "Analizando la selección exacta…")}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    lastAutoReviewKeyRef.current = "";
                    void runResearchPlanReview();
                  }}
                  className="rounded-full border border-violet-300/30 px-3 py-1 text-xs text-violet-100"
                >
                  {researchReview ? L("Refresh analysis", "Actualizar análisis") : L("Analyze selection", "Analizar selección")}
                </button>
              )}
            </div>
            {researchReview ? (
              <div className="space-y-4 p-4">
                <div>
                  <p className="font-semibold text-slate-100">{researchReview.headline}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{researchReview.summary}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    [L("Selected-scenario math", "Matemática del escenario"), researchReview.scenarioAnalysis],
                    [L("Deadline test", "Prueba del plazo"), researchReview.deadlineAnalysis],
                    [L("Risk budget", "Presupuesto de riesgo"), researchReview.riskAnalysis],
                    [L("Execution evidence", "Evidencia de ejecución"), researchReview.evidenceAnalysis],
                  ].map(([label, value]) =>
                    value ? (
                      <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-300">{value}</p>
                      </div>
                    ) : null
                  )}
                </div>
                {researchReview.comparison ? (
                  <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200">{L("Context versus other modes", "Contexto frente a otros modos")}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{researchReview.comparison}</p>
                  </div>
                ) : null}
                {researchReview.actions.length ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-200">{L("Operating actions", "Acciones operativas")}</p>
                    <ol className="mt-2 space-y-2 text-xs leading-5 text-slate-300">
                      {researchReview.actions.slice(0, 4).map((action, index) => (
                        <li key={`${index}-${action}`}><span className="mr-2 text-emerald-300">{index + 1}.</span>{action}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            ) : researchReviewError ? (
              <p className="p-4 text-xs text-amber-200">{researchReviewError}</p>
            ) : (
              <p className="p-4 text-xs text-slate-400">
                {L(
                  "The deterministic forecast is ready. AI will now explain this selected scenario without changing its numbers.",
                  "El forecast determinístico está listo. La IA ahora explicará este escenario seleccionado sin cambiar sus números."
                )}
              </p>
            )}
          </div>
          {!selectedForecastProjection.targetReached ? (
            <div className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm text-rose-100">{L("This selection does not reach the target inside the mathematical horizon. Go back and adjust the mode or assumptions.", "Esta selección no alcanza la meta dentro del horizonte matemático. Regresa y ajusta el modo o los supuestos.")}</div>
          ) : effectiveForecastTargetDate > targetDateStr ? (
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{L(`This mode misses the requested deadline and reaches the target on ${formatPlanDate(effectiveForecastTargetDate, lang)}.`, `Este modo no cumple la fecha solicitada y alcanza la meta el ${formatPlanDate(effectiveForecastTargetDate, lang)}.`)}</div>
          ) : null}
          <div className="h-72 rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={selectedForecastChart} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} minTickGap={30} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                <Tooltip contentStyle={{ background: "#020617", border: "1px solid #334155", borderRadius: 8 }} formatter={(value) => currency(Number(value))} />
                <Line type="monotone" dataKey="projected" name={L("Forecast", "Forecast")} stroke="#34d399" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="target" name={L("Business target", "Meta empresarial")} stroke="#f59e0b" strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/80 px-4 py-3">
              <p className="text-sm font-semibold text-slate-100">{L("Daily forecast sequence", "Secuencia diaria del forecast")}</p>
              <span className="text-xs text-slate-500">{Math.min(visibleForecastRows, selectedForecastProjection.rows.length)} / {selectedForecastProjection.rows.length}</span>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full min-w-190 text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">{L("Date", "Fecha")}</th><th className="px-3 py-2">{L("Result", "Resultado")}</th><th className="px-3 py-2">%</th><th className="px-3 py-2">USD</th><th className="px-3 py-2">{L("Start", "Inicio")}</th><th className="px-3 py-2">{L("End", "Final")}</th></tr></thead>
                <tbody>
                  {selectedForecastProjection.rows.slice(0, visibleForecastRows).map((row) => (
                    <tr key={`${row.day}-${row.isoDate}`} className="border-t border-slate-800/80">
                      <td className="px-3 py-2 text-slate-500">{row.day}</td><td className="px-3 py-2 text-slate-300">{row.isoDate}</td><td className={`px-3 py-2 font-semibold ${row.type === "goal" ? "text-emerald-300" : "text-rose-300"}`}>{row.type === "goal" ? L("Win", "Ganancia") : L("Loss", "Pérdida")}</td><td className="px-3 py-2 text-slate-200">{row.pct > 0 ? "+" : ""}{row.pct.toFixed(2)}%</td><td className={`px-3 py-2 ${row.expectedUSD >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{row.expectedUSD >= 0 ? "+" : "-"}{currency(Math.abs(row.expectedUSD))}</td><td className="px-3 py-2 text-slate-300">{currency(row.startBalance)}</td><td className="px-3 py-2 font-semibold text-slate-100">{currency(row.endBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleForecastRows < selectedForecastProjection.rows.length ? (
              <button type="button" onClick={() => setVisibleForecastRows((value) => value + 60)} className="w-full border-t border-slate-800 px-4 py-2 text-xs font-semibold text-cyan-200 hover:bg-slate-900">{L("Show 60 more sessions", "Mostrar 60 sesiones más")}</button>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {[
              [L("Weekly", "Semanal"), adaptiveGrowthPlan.weeklyMilestones.length],
              [L("Monthly", "Mensual"), adaptiveGrowthPlan.monthlyMilestones.length],
              [L("Quarterly", "Trimestral"), adaptiveGrowthPlan.quarterlyMilestones.length],
              [L("Semiannual", "Semestral"), adaptiveGrowthPlan.semiannualMilestones.length],
              [L("Annual", "Anual"), adaptiveGrowthPlan.annualMilestones.length],
            ].map(([label, count]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-slate-100">{count}</p></div>)}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">{L("Choose an operating mode first.", "Escoge primero un modo operativo.")}</p>
      ),
    },
  ];

  const step0Total = step0Stages.length;
  const safeStage = Math.min(step0Stage, step0Total - 1);
  const step0Current = step0Stages[safeStage];
  const step0CanNext = !!step0Current?.isComplete;
  const step0CanBack = safeStage > 0;
  const goStep0Next = () => {
    if (!step0CanNext) return;
    if (safeStage >= step0Total - 1) {
      setStep(1);
      return;
    }
    setStep0Stage((prev) => Math.min(prev + 1, step0Total - 1));
  };
  const goStep0Back = () => {
    if (!step0CanBack) return;
    setStep0Stage((prev) => Math.max(0, prev - 1));
  };

  const step0AnchorIndex = step0Stages.reduce<Record<string, number>>((acc, stage, idx) => {
    if (stage.anchor) acc[stage.anchor] = idx;
    return acc;
  }, {});

  const guidedAnchorStep = STEP_ORDER.reduce<Record<string, WizardStep>>((acc, wizardStep) => {
    for (const task of guidedTasksByStep[wizardStep] ?? []) {
      if (task.anchor) acc[task.anchor] = wizardStep;
    }
    return acc;
  }, {});

  const scrollToAnchor = useCallback((anchor?: string) => {
    if (!anchor) return;
    const stageIndex = step0AnchorIndex[anchor];
    if (typeof stageIndex === "number") {
      setStep(0);
      setStep0Stage(stageIndex);
    } else if (typeof guidedAnchorStep[anchor] === "number") {
      setStep(guidedAnchorStep[anchor]);
    }
    window.setTimeout(() => {
      const el = document.getElementById(anchor);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as any)?.focus?.();
    }, 80);
  }, [guidedAnchorStep, step0AnchorIndex]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyHashAnchor = () => {
      const anchor = window.location.hash.replace(/^#/, "").trim();
      if (!anchor) return;
      scrollToAnchor(anchor);
    };

    const raf = window.requestAnimationFrame(applyHashAnchor);
    const timeout = window.setTimeout(applyHashAnchor, 120);
    window.addEventListener("hashchange", applyHashAnchor);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      window.removeEventListener("hashchange", applyHashAnchor);
    };
  }, [scrollToAnchor]);

  function toggleRule(id: string) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r)));
  }

  function addRule() {
    const t = newRuleText.trim();
    if (!t) return;
    const rule: GrowthPlanRule = {
      id: "custom-" + uuid(),
      label: t,
      description: "",
      isSuggested: false,
      isActive: true,
    };
    setRules((prev) => [rule, ...prev]);
    setNewRuleText("");
    pushNeuroMessage(
      L(
        `Rule added: "${t}". Clear rules protect you when emotions show up.`,
        `Regla agregada: "${t}". Reglas claras te protegen cuando aparecen emociones.`
      )
    );
      }

  function updatePrepareChecklist(items: GrowthPlanChecklistItem[]) {
    setStepsData((prev) => ({
      ...prev,
      prepare: { ...(prev.prepare ?? {}), checklist: items },
    }));
  }

  function movePrepareChecklistItem(index: number, direction: -1 | 1) {
    const list = [...(stepsData.prepare?.checklist ?? [])];
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= list.length) return;
    const item = list[index];
    list.splice(index, 1);
    list.splice(nextIndex, 0, item);
    updatePrepareChecklist(list);
  }

  function updateStrategies(strategies: GrowthPlanStrategy[]) {
    setStepsData((prev) => ({
      ...prev,
      strategy: { ...(prev.strategy ?? {}), strategies },
    }));
  }

  function updateExecutionSystemList(
    key: "doList" | "dontList" | "orderList",
    items: GrowthPlanChecklistItem[]
  ) {
    setStepsData((prev) => ({
      ...prev,
      execution_and_journal: {
        ...(prev.execution_and_journal ?? {}),
        system: {
          ...(prev.execution_and_journal?.system ?? {}),
          [key]: items,
        },
      },
    }));
  }


  const canGoNext = useMemo(() => {
    if (step !== 0) return true;
    const required = (guidedTasksByStep[0] ?? []).filter((t) => !t.optional);
    return required.every((t) => t.done);
  }, [step, guidedTasksByStep]);

  async function goNext() {
    setError("");
    if (!canGoNext) {
      setError(L("Complete required fields before continuing.", "Completa los campos requeridos antes de continuar."));
      const required = (guidedTasksByStep[0] ?? []).filter((t) => !t.optional);
      const firstMissing = required.find((t) => !t.done);
      if (firstMissing?.anchor) scrollToAnchor(firstMissing.anchor);
      return;
    }
    const next = (Math.min(4, step + 1) as WizardStep);
    setStep(next);
    const t =
      (await neuroReact("wizard_step_next", lang, { to: stepTitles[next] })) ||
      (isEs ? `Siguiente: ${stepTitles[next]}.` : `Next: ${stepTitles[next]}.`);
    pushNeuroMessage(t);
      }

  async function goBack() {
    setError("");
    const prev = (Math.max(0, step - 1) as WizardStep);
    setStep(prev);
    const t =
      (await neuroReact("wizard_step_back", lang, { to: stepTitles[prev] })) ||
      (isEs ? `Volver a: ${stepTitles[prev]}.` : `Back to: ${stepTitles[prev]}.`);
    pushNeuroMessage(t);
      }

  async function onStepClick(s: WizardStep) {
    const blockedBy = STEP_ORDER.find((candidate) => candidate < s && !stepCompletion[candidate]);
    if (blockedBy != null) {
      setError(
        L(
          `Complete ${stepTitles[blockedBy]} before opening a later section.`,
          `Completa ${stepTitles[blockedBy]} antes de abrir una sección posterior.`
        )
      );
      setStep(blockedBy);
      if (blockedBy === 0) {
        const firstIncomplete = step0Stages.findIndex((stage) => !stage.isComplete);
        setStep0Stage(Math.max(0, firstIncomplete));
      }
      return;
    }
    setError("");
    setStep(s);
    const t =
      (await neuroReact("wizard_step_clicked", lang, { to: stepTitles[s] })) ||
      (isEs ? `Abierto: ${stepTitles[s]}.` : `Opened: ${stepTitles[s]}.`);
    pushNeuroMessage(t);
      }

  const approveEnabled =
    step === 4 &&
    disclosureAcceptedForDraft &&
    startingBalance > 0 &&
    targetBalance > 0 &&
    !!planStartDate &&
    !!targetDateStr &&
    planDatesOrdered &&
    tradingDays > 0 &&
    averageTradingDaysSet &&
    maxDailyLossPercent > 0 &&
    riskPerTradePct > 0 &&
    lossDaysSet &&
    capitalFlowAssumptionsComplete &&
    autoPhasesGenerated &&
    businessAnalysisComplete &&
    weeklyOutcomePlanComplete &&
    Boolean(selectedForecastProjection?.targetReached) &&
    adaptiveGrowthPlan.capacityStatus !== "blocked";

  const handleApproveAndSave = async () => {
    setError("");

    if (
      startingBalance <= 0 ||
      targetBalance <= 0 ||
      !planStartDate ||
      !targetDateStr ||
      !planDatesOrdered ||
      tradingDays <= 0 ||
      !averageTradingDaysSet ||
      maxDailyLossPercent <= 0 ||
      riskPerTradePct <= 0 ||
      !lossDaysSet ||
      !capitalFlowAssumptionsComplete ||
      !autoPhasesGenerated ||
      !businessAnalysisComplete ||
      !weeklyOutcomePlanComplete ||
      !selectedForecastProjection?.targetReached
    ) {
      setError(L("Please complete all required fields first.", "Completa todos los campos requeridos primero."));
      return;
    }
    if (!planDatesOrdered) {
      setError(
        L(
          "Target date must be on or after the start date.",
          "La fecha objetivo debe ser igual o posterior a la fecha de inicio."
        )
      );
      return;
    }
    if (!disclosureAcceptedForDraft) {
      setError(
        L(
          "Accept the Trading Business Plan disclosure for the current draft before saving.",
          "Acepta la divulgación del Plan de Empresa de Trading para el borrador actual antes de guardar."
        )
      );
      return;
    }

    if (hasExistingPlan && !isFollowOnDraft) {
      const confirmed = window.confirm(
        L(
          "Editing your Trading Business Plan may reset statistics, balance chart and related analytics. Execution records will NOT be reset. Continue?",
          "Editar tu Plan de Empresa de Trading puede reiniciar estadísticas, balance chart y analíticas relacionadas. Los registros de ejecución NO se reinician. ¿Continuar?"
        )
      );
      if (!confirmed) return;
    }
    if (hasExistingPlan && isFollowOnDraft) {
      const confirmed = window.confirm(
        L(
          "Saving this next-cycle draft will replace the current plan record for this account. Continue?",
          "Guardar este borrador del próximo ciclo reemplazará el plan actual de esta cuenta. ¿Continuar?"
        )
      );
      if (!confirmed) return;
    }

    const dailyPctForSave = Math.max(0, selectedForecastAssumptions?.goalDayPct ?? 0);
    const nextPlannedWithdrawals = plannedWithdrawalMode === "scheduled" ? generatedPlannedWithdrawals : [];
    const effectivePlanStart = planStartDate || isoToday();
    const selectedPhaseSource = selectedForecastProjection?.milestones ?? autoPhases;
    const autoPhasePayload =
      autoPhasesGenerated && selectedPhaseSource.length > 0
        ? selectedPhaseSource.map((phase, idx) => {
            const weekLabel =
              phase.weekIndex && phase.monthIndex
                ? L(`Week ${phase.weekIndex} (Month ${phase.monthIndex})`, `Semana ${phase.weekIndex} (Mes ${phase.monthIndex})`)
                : L(`Week ${idx + 1}`, `Semana ${idx + 1}`);
            return {
              id: uuid(),
              title: weekLabel,
              targetEquity: phase.targetEquity,
              targetDate: phase.targetDate ?? null,
              status: "pending" as const,
              monthIndex: phase.monthIndex,
              weekIndex: phase.weekIndex,
              weeksInMonth: phase.weeksInMonth,
              monthGoal: phase.monthGoal,
              monthLabel: phase.monthLabel,
              monthStartBalance: phase.monthStartBalance,
              monthEndBalance: phase.monthEndBalance,
              monthDeposit: phase.monthDeposit,
              monthWithdrawal: phase.monthWithdrawal,
              cumulativeDeposits: phase.cumulativeDeposits,
              cumulativeWithdrawals: phase.cumulativeWithdrawals,
            };
          })
        : planPhases;

    // persist assistant lang inside steps._ui.lang (Supabase only)
    const mergedSteps: any = { ...(stepsData as any) };
    mergedSteps._ui = {
      ...(mergedSteps._ui ?? {}),
      autoPhaseCadence: "weekly",
      averageTradingDaysPerWeek,
      tradingInstrument,
    };
    mergedSteps.business_analysis = {
      selectedScenarioId,
      averageTradingDaysPerWeek,
      disclosure: {
        version: GROWTH_PLAN_DISCLOSURE_VERSION,
        acceptedAt: new Date().toISOString(),
        purpose: "trading_business_discipline",
        source: "web",
      },
      operatingModel: {
        planStartDate: effectivePlanStart,
        targetDate: effectiveForecastTargetDate || targetDateStr || null,
        requestedTargetDate: targetDateStr || null,
        committedTradingDays: selectedForecastProjection?.rows.length ?? tradingDays,
        averageTradingDaysPerWeek,
        winningDaysPerWeek,
        lossDaysPerWeek,
        maxDailyLossPercent,
        riskPerTradePct,
        goalDayReturnPct: selectedForecastAssumptions?.goalDayPct ?? 0,
        expectedLossDayPct: selectedForecastAssumptions?.lossDayPct ?? 0,
        returnModelMode,
        selectedPlanId,
        estimatedCostPerSessionUsd,
        estimatedTaxReservePct,
        financialCapacity: {
          capitalSource: "business_income",
          accountStructure,
          maxLeverageMultiple,
          status: adaptiveGrowthPlan.capacityStatus,
          flags: adaptiveGrowthPlan.capacityFlags,
        },
        plannedDepositMode,
        plannedDepositSettings,
        plannedWithdrawalMode,
        plannedWithdrawalSettings,
        tradingInstrument,
        runway: {
          amount: runwayAmount,
          unit: runwayUnit,
          instrument: tradingInstrument,
          calendarKey: tradingCalendarProfile.key,
          calculatedTargetDate: targetDateStr || null,
          marketSessions: tradingDaysFromRange?.marketCount ?? 0,
          committedTradingDays: tradingDays,
          calendarIsEstimate: tradingCalendarProfile.isEstimate,
        },
      },
      forecastSnapshot: {
        modelVersion: 3,
        generatedAt: new Date().toISOString(),
        requestedTargetDate: targetDateStr || null,
        forecastTargetDate: effectiveForecastTargetDate || null,
        selectedPlanId,
        aiRecommendedPlanId,
        startingBalance,
        targetBalance,
        requiredGoalDayPct: Number(requiredGoalPct.toFixed(4)),
        requestedRequiredGoalDayPct: adaptiveGrowthPlan.requestedRequiredGoalDayPct,
        operatingDaysPerWeek: averageTradingDaysPerWeek,
        winningDaysPerWeek,
        losingDaysPerWeek: lossDaysPerWeek,
        selectedAssumptions: selectedForecastAssumptions,
        projectedBalanceAtRequestedDate: selectedForecastPanorama?.projectedBalance ?? null,
        completionDate: selectedForecastProjection?.completionDate ?? null,
        targetReached: selectedForecastProjection?.targetReached ?? false,
        sessionCount: selectedForecastProjection?.rows.length ?? 0,
        milestones: {
          weekly: adaptiveGrowthPlan.weeklyMilestones,
          monthly: adaptiveGrowthPlan.monthlyMilestones,
          quarterly: adaptiveGrowthPlan.quarterlyMilestones,
          semiannual: adaptiveGrowthPlan.semiannualMilestones,
          annual: adaptiveGrowthPlan.annualMilestones,
        },
        scenarios: adaptiveGrowthPlan.panoramas,
      },
      selectedScenario: reviewScenario
        ? {
            id: reviewScenario.id,
            title: reviewScenario.title,
            dailyGoalPct: reviewScenario.dailyGoalPct,
            expectedLossDayPct: reviewScenario.expectedLossDayPct,
            maxDailyLossPct: reviewScenario.maxDailyLossPct,
            riskPerTradePct: reviewScenario.riskPerTradePct,
            lossDaysPerWeek: reviewScenario.lossDaysPerWeek,
            recommended: reviewScenario.recommended,
          }
        : null,
      scenarios: businessScenarios.map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        dailyGoalPct: scenario.dailyGoalPct,
        expectedLossDayPct: scenario.expectedLossDayPct,
        maxDailyLossPct: scenario.maxDailyLossPct,
        riskPerTradePct: scenario.riskPerTradePct,
        lossDaysPerWeek: scenario.lossDaysPerWeek,
        recommended: scenario.recommended,
        projectedEndBalance: scenario.projectedEndBalance,
      })),
      realismReview: {
        verdict: planRealismReview.verdict,
        policyBand: planRealismReview.policyBand,
        requiredGoalPct: planRealismReview.requiredGoalPct,
        requiredCompoundDailyPct: planRealismReview.requiredCompoundDailyPct,
        scenarioDailyGoalPct: planRealismReview.scenarioDailyGoalPct,
        scenarioProjectedBalance: planRealismReview.scenarioProjectedBalance,
        scenarioGapUsd: planRealismReview.scenarioGapUsd,
        scenarioGapPct: planRealismReview.scenarioGapPct,
        targetMultiple: planRealismReview.targetMultiple,
        targetReturnPct: planRealismReview.targetReturnPct,
        annualizedTargetReturnPct: planRealismReview.annualizedTargetReturnPct,
        tradingDays: planRealismReview.tradingDays,
        modeledGoalDays: planRealismReview.modeledGoalDays,
        modeledLossDays: planRealismReview.modeledLossDays,
        modeledMaxLossPct: planRealismReview.modeledMaxLossPct,
        scenarioCoveragePct: planRealismReview.scenarioCoveragePct,
        evidenceDepth: planRealismReview.evidenceDepth,
        evidenceSessions: planRealismReview.evidenceSessions,
        evidenceTrades: planRealismReview.evidenceTrades,
        evidenceSupportsPositiveEdge: planRealismReview.evidenceSupportsPositiveEdge,
        evidenceUpdatedAtIso: planRealismReview.evidenceUpdatedAtIso,
        flags: planRealismReview.flags,
        estimatedCompletionDate: planRealismReview.estimatedCompletionDate,
        surfacedToUser: planRealismReview.shouldSurface,
        reviewedAt: new Date().toISOString(),
      },
      adaptivePlan: adaptiveGrowthPlan,
      executionEvidence: performanceEvidence,
      aiPlanAdvisor: {
        headline: aiPlanAdvisor.headline,
        body: aiPlanAdvisor.body,
        scenarioTitle: aiPlanAdvisor.scenarioTitle,
        recommendedDailyGoalPct: aiPlanAdvisor.recommendedDailyGoalPct,
        maxDailyLossPct: aiPlanAdvisor.maxDailyLossPct,
        riskPerTradePct: aiPlanAdvisor.riskPerTradePct,
        lossDaysPerWeek: aiPlanAdvisor.lossDaysPerWeek,
        totalTradingDays: aiPlanAdvisor.totalTradingDays,
        totalOperatingWeeks: aiPlanAdvisor.totalOperatingWeeks,
        totalEstimatedMonths: aiPlanAdvisor.totalEstimatedMonths,
        recommendedCompletionDate: aiPlanAdvisor.recommendedCompletionDate,
        phases: aiPlanAdvisor.phases,
        verdict: aiPlanAdvisor.verdict,
        confidence: aiPlanAdvisor.confidence,
        isProvisional: aiPlanAdvisor.isProvisional,
        requestedTargetDate: aiPlanAdvisor.requestedTargetDate,
        targetProjectionGoalDayPct: aiPlanAdvisor.targetProjectionGoalDayPct,
        targetProjectionBalance: aiPlanAdvisor.targetProjectionBalance,
        targetProjectionCoveragePct: aiPlanAdvisor.targetProjectionCoveragePct,
        requestedGrossProjectedBalance: aiPlanAdvisor.requestedGrossProjectedBalance,
        requestedGrossTradingGrowthUsd: aiPlanAdvisor.requestedGrossTradingGrowthUsd,
        requestedCostDragUsd: aiPlanAdvisor.requestedCostDragUsd,
        costsConsumePercentageEdge: aiPlanAdvisor.costsConsumePercentageEdge,
        requestedProjectedBalance: aiPlanAdvisor.requestedProjectedBalance,
        requestedCoveragePct: aiPlanAdvisor.requestedCoveragePct,
        requestedShortfallUsd: aiPlanAdvisor.requestedShortfallUsd,
        expectedLossDayPct: aiPlanAdvisor.expectedLossDayPct,
        modeledNetReturnPerSessionPct: aiPlanAdvisor.modeledNetReturnPerSessionPct,
        modeledWeeklyReturnPct: aiPlanAdvisor.modeledWeeklyReturnPct,
        modeledAnnualCycles: aiPlanAdvisor.modeledAnnualCycles,
        modeledAnnualReturnPct: aiPlanAdvisor.modeledAnnualReturnPct,
        qualificationRequired: aiPlanAdvisor.qualificationRequired,
        qualificationMinimumSessions: aiPlanAdvisor.qualificationMinimumSessions,
        nextMilestone: aiPlanAdvisor.nextMilestone,
        weeklyMilestones: aiPlanAdvisor.weeklyMilestones,
        monthlyMilestones: aiPlanAdvisor.monthlyMilestones,
        quarterlyMilestones: aiPlanAdvisor.quarterlyMilestones,
        semiannualMilestones: aiPlanAdvisor.semiannualMilestones,
        annualMilestones: aiPlanAdvisor.annualMilestones,
        reviewedAt: new Date().toISOString(),
      },
      researchReview,
      updatedAt: new Date().toISOString(),
    };

    const payload: Partial<GrowthPlan> = {
      startingBalance,
      targetBalance,
      targetDate: effectiveForecastTargetDate || targetDateStr || null,
      planMode: "auto",
      targetMultiple: targetMultiple > 0 ? targetMultiple : null,
      planStartDate: effectivePlanStart,
      plannedWithdrawalSettings,
      plannedWithdrawals: nextPlannedWithdrawals,
      planPhases: autoPhasePayload,
      dailyGoalPercent: dailyPctForSave,
      dailyTargetPct: dailyPctForSave,
      maxDailyLossPercent,
      tradingDays: selectedForecastProjection?.rows.length ?? tradingDays,
      lossDaysPerWeek,
      selectedPlan: "suggested",
      maxRiskPerTradePercent: riskPerTradePct,
      maxRiskPerTradeUSD: riskUsd,
      steps: mergedSteps,
      rules,
      version: 3,
    };

    try {
      setPlannedWithdrawals(nextPlannedWithdrawals);
      setPlanPhases(autoPhasePayload);
      await upsertGrowthPlanSupabase(payload, activeAccountId, {
        recordHistory: true,
        historyReason: isFollowOnDraft
          ? "next_cycle_plan"
          : hasExistingPlan
            ? "plan_updated"
            : "plan_created",
      });

      let protectionSummary = "";
      if (user?.id) {
        const protectionRes = await syncGrowthPlanProtectionRules(String(user.id), {
          dailyGoalUsd: requiredGoalDollar,
          dailyGoalPercent: dailyPctForSave,
          maxLossUsd: maxLossDollar,
          maxLossPercent: maxDailyLossPercent,
          startingBalance: baseBalanceForDollars,
          targetBalance,
          planStartDate: effectivePlanStart,
          targetDate: effectiveForecastTargetDate || targetDateStr || null,
        });
        if (protectionRes.ok) {
          const touched =
            protectionRes.data.created + protectionRes.data.updated + protectionRes.data.disabled;
          if (touched > 0) {
            protectionSummary = L(
              "Business Protection System updated: your daily goal and max loss are now protected by plan-based alarms.",
              "Sistema de Protección Empresarial actualizado: tu meta diaria y max loss quedaron protegidos con alarmas basadas en el plan."
            );
          }
        } else {
          console.warn("[GrowthPlan] protection sync failed:", protectionRes.error);
          protectionSummary = L(
            "Trading Business Plan saved, but protection alarms could not sync. Open Business Protection System to review alarms.",
            "Plan de Empresa de Trading guardado, pero no se pudieron sincronizar las alarmas de protección. Abre el Sistema de Protección Empresarial para revisar."
          );
        }
      }

      if (user?.id) {
        try {
          const { data: sessionData } = await supabaseBrowser.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token) {
            const res = await fetch("/api/business-milestones/sync", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ accountId: activeAccountId, lang }),
            });
            const body = await res.json().catch(() => ({}));
            const newMilestones = Array.isArray(body?.newMilestones) ? body.newMilestones.length : 0;
            if (newMilestones > 0) {
              pushNeuroMessage(
                L(
                  `${newMilestones} business milestone${newMilestones === 1 ? "" : "s"} completed. This is operating infrastructure, not decoration.`,
                  `${newMilestones} hito${newMilestones === 1 ? "" : "s"} empresarial${newMilestones === 1 ? "" : "es"} completado${newMilestones === 1 ? "" : "s"}. Esto es infraestructura operativa, no decoración.`
                )
              );
            }
          }
        } catch (err) {
          console.warn("[GrowthPlan] business milestone sync failed:", err);
        }
      }

      const msg =
        (await neuroReact("growth_plan_saved", lang, {
          selectedPlan: "suggested",
          riskPct: riskPerTradePct,
          riskUsd,
        })) ||
        L(
          `Saved ✅ Max risk per trade: ${riskPerTradePct.toFixed(2)}% (~${currency(
            riskUsd
          )}). Your Business AI Coach can now evaluate your execution against this plan.`,
          `Guardado ✅ Riesgo máx por trade: ${riskPerTradePct.toFixed(2)}% (~${currency(
            riskUsd
          )}). El Coach Empresarial IA ya puede evaluar tu ejecución contra este plan.`
        );

      pushNeuroMessage(msg);
      if (protectionSummary) {
        pushNeuroMessage(protectionSummary);
      }

      const coachSummary =
        (await neuroReact("growth_plan_post_save_summary", lang, {
          dailyGoalPercent: dailyPctForSave,
          maxDailyLossPercent,
          lossDaysPerWeek,
          targetBalance,
          startingBalance,
          tradingDays,
        })) || "";
      if (coachSummary) {
        pushNeuroMessage(coachSummary);
      }

      const inboxTitle = L("Business AI Coach update", "Actualización del Coach Empresarial IA");
      const inboxMessage = coachSummary || msg;
      if (user?.id && inboxMessage) {
        void pushInboxEvent({
          userId: String(user.id),
          title: inboxTitle,
          message: inboxMessage,
          category: "ai_coach",
        });
      }
      setIsFollowOnDraft(false);
            router.push("/dashboard");
    } catch (e) {
      console.error("[GrowthPlan] save error", e);
      const msg = String((e as any)?.message ?? "");
      if (msg.includes("plan_mode") || msg.includes("plan_phases") || msg.includes("column") || msg.includes("schema")) {
        setError(
          L(
            "Database schema is missing new Trading Business Plan fields. Apply the latest migration and try again.",
            "Faltan columnas nuevas del Plan de Empresa de Trading en la base de datos. Aplica la migración más reciente y vuelve a intentar."
          )
        );
      } else {
        setError(
          L(
            "There was a problem saving your Trading Business Plan. Please try again.",
            "Hubo un problema guardando tu Plan de Empresa de Trading. Intenta de nuevo."
          )
        );
      }
      pushNeuroMessage(L("Save failed. Please try again in a moment.", "Error al guardar. Intenta nuevamente en un momento."));
    }
  };

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">{L("Loading…", "Cargando…")}</p>
      </main>
    );
  }

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-6 py-10">
        <div className="w-full max-w-4xl bg-slate-900/95 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl space-y-6 text-[14px]">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-emerald-400 uppercase tracking-[0.22em] text-[12px]">NEURO TRADER</p>
              <h1 className="text-2xl md:text-3xl font-semibold text-emerald-400">
                {L("Trading Business Plan Wizard", "Asistente de Plan de Empresa de Trading")}
              </h1>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/dashboard"
                className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
              >
                {L("Business Center", "Centro Empresarial")}
              </Link>
            </div>
          </div>

          <p className="text-slate-400 max-w-3xl">
            {L(
              "This turns your plan into a system:",
              "Esto convierte tu plan en un sistema:"
            )}{" "}
            <b>{L("Prepare → Analyze → Record → Strategy & Rules", "Preparar → Analizar → Registrar → Estrategia y reglas")}</b>.{" "}
            {L(
              "Business AI Coach will use this to coach you based on real execution.",
              "El Coach Empresarial IA usará esto para guiarte según tu ejecución real."
            )}
          </p>

          {cashflowNet !== 0 && loadedStartingBalance !== null && Math.abs(startingBalance - loadedStartingBalance) < 0.01 ? (
            <p className="text-[12px] text-slate-500">
              {L("Note:", "Nota:")} {L("Net cashflows since plan start detected", "Se detectaron cashflows netos desde el inicio del plan")}{" "}
              ({cashflowNet >= 0 ? "+" : "-"}{currency(Math.abs(cashflowNet))}).{" "}
              {L(
                "Dollar conversions (risk $, goal $, max-loss $) use: start + net cashflows.",
                "Las conversiones en dólares (riesgo $, meta $, pérdida máx $) usan: inicio + cashflows netos."
              )}
            </p>
          ) : null}
        </div>

        {hasExistingPlan ? (
          <details className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-100">
              <span>{L("Plan edit history", "Historial de ediciones del plan")}</span>
              <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                {planHistoryItems.length
                  ? L(`${planHistoryItems.length} saved change(s)`, `${planHistoryItems.length} cambio(s) guardado(s)`)
                  : L("No saved edits yet", "Sin ediciones guardadas todavía")}
              </span>
            </summary>
            <div className="mt-3 space-y-2">
              {planHistoryItems.length ? (
                planHistoryItems.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-100">{item.reasonLabel}</p>
                      <p className="text-[11px] text-slate-500">{item.dateLabel}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(item.changedFields.length ? item.changedFields : [L("Snapshot saved", "Snapshot guardado")]).map((field: string) => (
                        <span
                          key={field}
                          className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs leading-5 text-slate-500">
                  {L(
                    "The next approved save will create the first audit snapshot for this account.",
                    "El próximo guardado aprobado creará el primer snapshot auditado para esta cuenta."
                  )}
                </p>
              )}
            </div>
          </details>
        ) : null}

        {/* Guided Mode */}
        {guidedMode ? (
          <div className="space-y-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] text-cyan-200 uppercase tracking-[0.28em]">
                  {L("Capital Plan Desk", "Mesa de Plan de Capital")}
                </p>
                <p className="text-xs text-slate-300">
                  {L(
                    "Back-office checklist for completing the plan before it becomes the operating standard.",
                    "Checklist back-office para completar el plan antes de convertirlo en estándar operativo."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGuidedMode(false)}
                className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-300 hover:text-cyan-200"
              >
                {L("Hide", "Ocultar")}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-cyan-300 transition"
                  style={{ width: `${Math.min(100, Math.max(6, guideProgress * 100))}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-400">
                {Math.round(guideProgress * 100)}%
              </span>
            </div>

            {nextTask ? (
              <button
                type="button"
                onClick={() => scrollToAnchor(nextTask.anchor)}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                  nextTask.done
                    ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                    : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-cyan-300/60"
                }`}
              >
                <span>
                  {nextTask.done ? "✓ " : "• "} {nextTask.label}
                  {nextTask.optional ? (
                    <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      {L("Optional", "Opcional")}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] text-slate-500">
                  {nextTask.done ? L("Done", "Listo") : L("Go", "Ir")}
                </span>
              </button>
            ) : (
              <p className="text-[11px] text-slate-500">
                {L("All items complete for this step.", "Todos los items están completos en este paso.")}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (nextTask?.anchor) {
                    scrollToAnchor(nextTask.anchor);
                    return;
                  }
                  const nextStep = (Math.min(4, step + 1) as WizardStep);
                  setStep(nextStep);
                  scrollToAnchor(`gp-step-${nextStep}`);
                }}
                className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
              >
                {nextTask?.anchor
                  ? L("Go to next item", "Ir al siguiente item")
                  : step < 4
                    ? L("Continue to next step", "Continuar al próximo paso")
                    : L("Ready to save", "Listo para guardar")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep(0);
                  setStep0Stage(0);
                }}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-cyan-300 hover:text-cyan-200"
              >
                {L("Back to numbers", "Volver a números")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setGuidedMode(true)}
            className="self-start rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400 hover:border-cyan-300 hover:text-cyan-200"
          >
            {L("Show Capital Plan Desk", "Mostrar Mesa de Plan de Capital")}
          </button>
        )}

        {/* Stepper (FIXED: numeric array to avoid "01/11/21") */}
        <div className="flex flex-wrap gap-2">
          {STEP_ORDER.map((s, idx) => (
            <button
              key={s}
              type="button"
              onClick={() => onStepClick(s)}
              className={`px-3 py-1.5 rounded-full border text-xs transition ${
                step === s
                  ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                  : "border-slate-700 text-slate-300 hover:border-emerald-400/60"
              }`}
            >
              {idx + 1}. {stepTitles[s]}
            </button>
          ))}
        </div>

        {/* ================= STEP 0 ================= */}
        {step === 0 && (
          <div id="gp-step-0" className="space-y-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    {L("Step", "Paso")} {safeStage + 1}/{step0Total}
                  </p>
                  <p className="text-lg font-semibold text-slate-100">{step0Current.title}</p>
                  <p className="text-sm text-slate-400">{step0Current.description}</p>
                </div>
                <span className="text-[11px] text-slate-500">{L("Required", "Requerido")}</span>
              </div>

              <div key={step0Current.id} className="mt-4 gp-step-animate">
                {step0Current.content}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goStep0Back}
                  disabled={!step0CanBack}
                  className={`rounded-xl border px-4 py-2 text-sm ${
                    step0CanBack
                      ? "border-slate-700 text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
                      : "border-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  {L("Back", "Atrás")}
                </button>
                <button
                  type="button"
                  onClick={goStep0Next}
                  disabled={!step0CanNext}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    step0CanNext
                      ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                      : "bg-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  {safeStage >= step0Total - 1
                    ? L("Continue to Operating System", "Continuar al Sistema Operativo")
                    : L("Next", "Siguiente")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 1 ================= */}
        {step === 1 && (
          <div id="gp-step-1" className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="font-semibold text-emerald-300">
              {L("1) Operating System", "1) Sistema operativo")}
            </p>
            <p className="text-slate-400 text-sm">
              {L(
                "Write your ordered steps and your Do/Don't rules. This becomes the operating system for your trading business.",
                "Escribe tus pasos en orden y tus reglas de Hacer / No hacer. Esto se convierte en el sistema operativo de tu empresa de trading."
              )}
            </p>

            <div id="gp-trading-system" className="space-y-2">
              {(stepsData.prepare?.checklist ?? []).map((it, idx) => (
                <div key={it.id} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-5 text-right">{idx + 1}.</span>
                  <input
                    value={it.text}
                    onFocus={() => fieldHelp("prepare_checklist")}
                    onChange={(e) => {
                      const items = [...(stepsData.prepare?.checklist ?? [])];
                      items[idx] = { ...items[idx], text: e.target.value };
                      updatePrepareChecklist(items);
                    }}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                    placeholder={L("Add a step (e.g., review calendar)", "Agrega un paso (ej., revisar calendario)")}
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => movePrepareChecklistItem(idx, -1)}
                      className="px-2 py-1 rounded-lg border border-slate-700 text-slate-300 hover:border-emerald-400/60 hover:text-emerald-300 transition"
                      title={L("Move up", "Subir")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => movePrepareChecklistItem(idx, 1)}
                      className="px-2 py-1 rounded-lg border border-slate-700 text-slate-300 hover:border-emerald-400/60 hover:text-emerald-300 transition"
                      title={L("Move down", "Bajar")}
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const items = [...(stepsData.prepare?.checklist ?? [])];
                      items.splice(idx, 1);
                      updatePrepareChecklist(items);
                      pushNeuroMessage(
                        L(
                          "Step removed. Keep the system short and actionable.",
                          "Paso eliminado. Mantén el sistema corto y accionable."
                        )
                      );
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-700 text-slate-300 hover:border-red-400/60 hover:text-red-300 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                const items = [...(stepsData.prepare?.checklist ?? [])];
                items.push({ id: uuid(), text: L("New step", "Nuevo paso"), isSuggested: false, isActive: true });
                updatePrepareChecklist(items);
                pushNeuroMessage(
                  L(
                    "Step added. Write it as a clear action you must follow.",
                    "Paso agregado. Escríbelo como una acción clara que debes seguir."
                  )
                );
              }}
              className="px-4 py-2 rounded-xl border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 transition"
            >
              {L("+ Add step", "+ Agregar paso")}
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {/* DO */}
              <div id="gp-system-do" className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">
                  {L("Do", "Hacer")}
                </p>
                {(stepsData.execution_and_journal?.system?.doList ?? []).map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      value={item.text}
                      onFocus={() => fieldHelp("system_do")}
                      onChange={(e) => {
                        const items = [...(stepsData.execution_and_journal?.system?.doList ?? [])];
                        items[idx] = { ...items[idx], text: e.target.value };
                        updateExecutionSystemList("doList", items);
                      }}
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                      placeholder={L("Add a rule you must do", "Agrega una regla que debes hacer")}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const items = [...(stepsData.execution_and_journal?.system?.doList ?? [])];
                        items.splice(idx, 1);
                        updateExecutionSystemList("doList", items);
                      }}
                      className="px-2 py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-red-400/60 hover:text-red-300 transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const items = [...(stepsData.execution_and_journal?.system?.doList ?? [])];
                    items.push({ id: uuid(), text: L("New DO rule", "Nueva regla de HACER"), isSuggested: false, isActive: true });
                    updateExecutionSystemList("doList", items);
                    fieldHelp("system_do");
                  }}
                  className="px-3 py-2 rounded-lg border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 transition text-sm"
                >
                  {L("+ Add", "+ Agregar")}
                </button>
              </div>

              {/* DON'T */}
              <div id="gp-system-dont" className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300">
                  {L("Don't", "No hacer")}
                </p>
                {(stepsData.execution_and_journal?.system?.dontList ?? []).map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      value={item.text}
                      onFocus={() => fieldHelp("system_dont")}
                      onChange={(e) => {
                        const items = [...(stepsData.execution_and_journal?.system?.dontList ?? [])];
                        items[idx] = { ...items[idx], text: e.target.value };
                        updateExecutionSystemList("dontList", items);
                      }}
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                      placeholder={L("Add a rule you must avoid", "Agrega una regla que debes evitar")}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const items = [...(stepsData.execution_and_journal?.system?.dontList ?? [])];
                        items.splice(idx, 1);
                        updateExecutionSystemList("dontList", items);
                      }}
                      className="px-2 py-2 rounded-lg border border-slate-700 text-slate-300 hover:border-red-400/60 hover:text-red-300 transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const items = [...(stepsData.execution_and_journal?.system?.dontList ?? [])];
                    items.push({ id: uuid(), text: L("New DON'T rule", "Nueva regla de NO HACER"), isSuggested: false, isActive: true });
                    updateExecutionSystemList("dontList", items);
                    fieldHelp("system_dont");
                  }}
                  className="px-3 py-2 rounded-lg border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 transition text-sm"
                >
                  {L("+ Add", "+ Agregar")}
                </button>
              </div>
            </div>

            <textarea
              value={stepsData.prepare?.notes ?? ""}
              onFocus={() => fieldHelp("prepare_notes")}
              onChange={(e) =>
                setStepsData((p) => ({ ...p, prepare: { ...(p.prepare ?? {}), notes: e.target.value } }))
              }
              className="w-full mt-3 min-h-27.5 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder={L(
                "Optional notes (exceptions, special cases, reminders).",
                "Notas opcionales (excepciones, casos especiales, recordatorios)."
              )}
            />
          </div>
        )}

        {/* ================= STEP 2 ================= */}
        {step === 2 && (
          <div id="gp-step-2" className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="font-semibold text-emerald-300">
              {L("2) Analysis", "2) Análisis")}
            </p>
            <p className="text-slate-400 text-sm">
              {L(
                "Select what your analysis is based on. Business AI Coach uses this to flag when you trade outside your stated business identity.",
                "Selecciona en qué basas tu análisis. El Coach Empresarial IA usa esto para alertar cuando operas fuera de tu identidad empresarial."
              )}
            </p>

            <div id="gp-analysis-styles" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { k: "technical", label: L("Technical", "Técnico") },
                { k: "fundamental", label: L("Fundamental", "Fundamental") },
                { k: "options_flow", label: L("Options Flow", "Flujo de opciones") },
                { k: "harmonic_patterns", label: L("Harmonic patterns", "Patrones armónicos") },
                { k: "price_action", label: L("Price Action", "Price action") },
                { k: "market_profile", label: L("Market Profile", "Market profile") },
                { k: "order_flow", label: L("Order Flow", "Order flow") },
                { k: "other", label: L("Other", "Otro") },
              ].map((o) => {
                const styles = stepsData.analysis?.styles ?? [];
                const active = styles.includes(o.k as any);
                return (
                  <button
                    key={o.k}
                    type="button"
                    onClick={() => {
                      const next = active ? styles.filter((x) => x !== (o.k as any)) : [...styles, o.k as any];
                      setStepsData((p) => ({ ...p, analysis: { ...(p.analysis ?? {}), styles: next } }));
                      fieldHelp("analysis_styles");
                    }}
                    className={`px-3 py-2 rounded-xl border text-sm transition ${
                      active
                        ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                        : "border-slate-700 text-slate-300 hover:border-emerald-400/60"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>

            <input
              id="gp-analysis-other"
              value={stepsData.analysis?.otherStyleText ?? ""}
              onFocus={() => fieldHelp("analysis_other")}
              onChange={(e) =>
                setStepsData((p) => ({ ...p, analysis: { ...(p.analysis ?? {}), otherStyleText: e.target.value } }))
              }
              className="w-full mt-3 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder={L("If you selected 'Other', describe it here…", "Si seleccionaste 'Otro', descríbelo aquí…")}
            />

            <textarea
              value={stepsData.analysis?.notes ?? ""}
              onFocus={() => fieldHelp("analysis_notes")}
              onChange={(e) =>
                setStepsData((p) => ({ ...p, analysis: { ...(p.analysis ?? {}), notes: e.target.value } }))
              }
              className="w-full mt-3 min-h-32.5 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder={L(
                "Describe your analysis process (confirmations, invalidations, what you avoid).",
                "Describe tu proceso de análisis (confirmaciones, invalidaciones, qué evitas)."
              )}
            />
          </div>
        )}

        {/* ================= STEP 3 ================= */}
        {step === 3 && (
          <div id="gp-step-3" className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="font-semibold text-emerald-300">
              {L("3) Execution Record", "3) Registro de ejecución")}
            </p>
            <p className="text-slate-400 text-sm">
              {L(
                "Describe how you will record every session. This becomes your evidence log for discipline, review, and AI context.",
                "Describe cómo registrarás cada sesión. Esto será tu evidencia de disciplina, revisión y contexto para la IA."
              )}
            </p>

            <textarea
              id="gp-journal-notes"
              value={stepsData.execution_and_journal?.notes ?? ""}
              onFocus={() => fieldHelp("journal_notes")}
              onChange={(e) =>
                setStepsData((p) => ({
                  ...p,
                  execution_and_journal: { ...(p.execution_and_journal ?? {}), notes: e.target.value },
                }))
              }
              className="w-full mt-2 min-h-37.5 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder={L(
                "Describe how you will record execution: imports, emotions, reasons for entry, rules followed/broken, screenshots, etc.",
                "Describe cómo registrarás la ejecución: importaciones, emociones, razones de entrada, reglas seguidas/rotas, screenshots, etc."
              )}
            />
          </div>
        )}

        {/* ================= STEP 4 ================= */}
        {step === 4 && (
          <div id="gp-step-4" className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="font-semibold text-emerald-300">
              {L("4) Strategy & Rules", "4) Estrategia y reglas")}
            </p>
            <p className="text-slate-400 text-sm">
              {L(
                "Define your non‑negotiable rules and your strategies. This is the playbook you execute.",
                "Define tus reglas no negociables y tus estrategias. Este es el playbook que ejecutas."
              )}
            </p>
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-50">
              <p className="font-semibold">
                {L("Business plan rules become protection.", "Las reglas del plan empresarial se convierten en protección.")}
              </p>
              <p className="mt-1 text-emerald-50/80">
                {L(
                  "When you save, NeuroTrader syncs your max daily loss and daily goal into the Business Protection System so the platform can help you obey the plan.",
                  "Cuando guardas, NeuroTrader sincroniza tu max loss diario y meta diaria al Sistema de Protección Empresarial para ayudarte a obedecer el plan."
                )}
              </p>
            </div>

            {/* Rules (Non-negotiables) */}
            <div id="gp-rules" className="mt-3 bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
              <p className="font-semibold text-slate-100">{L("Rules (Non-negotiables)", "Reglas (No negociables)")}</p>

              <div className="space-y-2">
                {rules.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 cursor-pointer"
                    onClick={() => {
                      // click area still works; actual toggle on checkbox below
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={r.isActive ?? true}
                      onChange={() => {
                        toggleRule(r.id);
                        fieldHelp("rules");
                      }}
                      className="mt-1 h-4 w-4 accent-emerald-400"
                    />
                    <div className="space-y-0.5">
                      <div className="text-slate-100">
                        {r.label}{" "}
                        {r.isSuggested ? (
                          <span className="text-[10px] ml-2 text-emerald-300/90 border border-emerald-500/20 px-2 py-px rounded-full">
                            {L("suggested", "sugerida")}
                          </span>
                        ) : (
                          <span className="text-[10px] ml-2 text-slate-400 border border-slate-700 px-2 py-px rounded-full">
                            {L("custom", "personalizada")}
                          </span>
                        )}
                      </div>
                      {r.description ? <div className="text-xs text-slate-400">{r.description}</div> : null}
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  value={newRuleText}
                  onFocus={() => fieldHelp("add_rule")}
                  onChange={(e) => setNewRuleText(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                  placeholder={L("Add your own rule (e.g., No revenge trading)", "Agrega tu propia regla (ej., No revenge trading)")}
                />
                <button
                  type="button"
                  onClick={addRule}
                  className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 font-semibold hover:bg-emerald-300 transition"
                >
                  {L("Add", "Agregar")}
                </button>
              </div>
            </div>

            {/* Strategy */}
            <div className="mt-3 bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
              <p className="font-semibold text-emerald-300">
                {L("Strategy (Setups)", "Estrategia (setups)")}
              </p>
              <p className="text-slate-400 text-sm">
                {L(
                  "Define your setups with entry/exit/management. The clearer this is, the sharper the coaching.",
                  "Define tus setups con entrada/salida/gestión. Mientras más claro, más preciso el coaching."
                )}
              </p>

              <div id="gp-strategy-list" className="space-y-3">
                {(stepsData.strategy?.strategies ?? []).map((s, idx) => (
                  <div key={idx} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={s.name}
                        onFocus={() => fieldHelp("strategy_name")}
                        onChange={(e) => {
                          const arr = [...(stepsData.strategy?.strategies ?? [])];
                          arr[idx] = { ...arr[idx], name: e.target.value };
                          updateStrategies(arr);
                        }}
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                        placeholder={L("Strategy name", "Nombre de estrategia")}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const arr = [...(stepsData.strategy?.strategies ?? [])];
                          arr.splice(idx, 1);
                          updateStrategies(arr);
                          pushNeuroMessage(
                            L(
                              "Strategy removed. Keep only what you actually trade.",
                              "Estrategia eliminada. Deja solo lo que realmente operas."
                            )
                          );
                        }}
                        className="px-3 py-2 rounded-xl border border-slate-700 text-slate-300 hover:border-red-400/60 hover:text-red-300 transition"
                      >
                        ✕
                      </button>
                    </div>

                    {[
                      ["setup", L("Setup / Context", "Setup / Contexto")],
                      ["entryRules", L("Entry rules (conditions)", "Reglas de entrada (condiciones)")],
                      ["exitRules", L("Exit rules (TP / SL)", "Reglas de salida (TP / SL)")],
                      ["managementRules", L("Management (trail, scale, etc.)", "Gestión (trail, scale, etc.)")],
                      ["invalidation", L("Invalidation (when NOT valid)", "Invalidación (cuando NO es válido)")],
                    ].map(([k, label]) => (
                      <textarea
                        key={k}
                        value={(s as any)[k] ?? ""}
                        onFocus={() => fieldHelp(`strategy_${k}`)}
                        onChange={(e) => {
                          const arr = [...(stepsData.strategy?.strategies ?? [])];
                          arr[idx] = { ...arr[idx], [k]: e.target.value };
                          updateStrategies(arr);
                        }}
                        className="w-full min-h-18 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                        placeholder={label}
                      />
                    ))}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  const arr = [...(stepsData.strategy?.strategies ?? [])];
                  arr.unshift({
                    name: L("New Strategy", "Nueva estrategia"),
                    setup: "",
                    entryRules: "",
                    exitRules: "",
                    managementRules: "",
                    invalidation: "",
                    instruments: [],
                    timeframe: "",
                  });
                  updateStrategies(arr);
                  pushNeuroMessage(
                    L(
                      "Strategy added. Tip: write entries as YES/NO criteria, not vibes.",
                      "Estrategia agregada. Tip: escribe criterios SI/NO, no sensaciones."
                    )
                  );
                }}
                className="px-4 py-2 rounded-xl border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 transition"
              >
                {L("+ Add strategy", "+ Agregar estrategia")}
              </button>

              <textarea
                value={stepsData.strategy?.notes ?? ""}
                onFocus={() => fieldHelp("strategy_notes")}
                onChange={(e) =>
                  setStepsData((p) => ({ ...p, strategy: { ...(p.strategy ?? {}), notes: e.target.value } }))
                }
                className="w-full mt-3 min-h-32.5 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                placeholder={L(
                  "General strategy notes (when to stop, what to avoid, etc.)",
                  "Notas generales de estrategia (cuándo parar, qué evitar, etc.)"
                )}
              />
            </div>

            <section
              id="gp-commitment"
              className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-4"
              aria-labelledby="gp-disclosure-title"
            >
              <p
                id="gp-disclosure-title"
                className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200"
              >
                {L("Trading Business Plan Disclosure", "Divulgación del Plan de Empresa de Trading")}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {L(
                  "This tool organizes a trading business process. Projections, conditional hit rates, checkpoints, and AI explanations are educational planning outputs based on the data and assumptions you provide. They are not forecasts, guarantees of profit, or individualized investment, trading, legal, tax, or accounting advice. Actual results may differ because of execution, market conditions, liquidity, slippage, fees, leverage, deposits, and withdrawals. You remain responsible for risk limits, accurate records, independent decisions, and regular projected-versus-actual review.",
                  "Esta herramienta organiza el proceso de un negocio de trading. Las proyecciones, tasas condicionales de llegada, checkpoints y explicaciones de IA son resultados educativos de planificación basados en los datos y supuestos que proporcionas. No son pronósticos, garantías de ganancias ni asesoría individualizada de inversión, trading, legal, contributiva o contable. Los resultados reales pueden diferir por ejecución, condiciones de mercado, liquidez, slippage, costos, apalancamiento, aportaciones y retiros. Sigues siendo responsable de los límites de riesgo, registros precisos, decisiones independientes y revisión periódica de proyectado versus real."
                )}
              </p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={disclosureAcceptedForDraft}
                  onChange={(e) => {
                    setCommitted(e.target.checked);
                    setCommittedDraftKey(e.target.checked ? disclosureDraftKey : null);
                    setError("");
                    fieldHelp("commitment");
                    if (e.target.checked) {
                      pushNeuroMessage(
                        L(
                          "Disclosure accepted. The commitment is to disciplined execution and review, not to a promised return.",
                          "Divulgación aceptada. El compromiso es con ejecución disciplinada y revisión, no con un retorno prometido."
                        )
                      );
                    }
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-900 accent-emerald-400"
                />
                <span>
                  {L(
                    "I understand and accept this disclosure. I am committing to disciplined process, risk controls, accurate records, and regular review, not to a promised return.",
                    "Entiendo y acepto esta divulgación. Me comprometo con un proceso disciplinado, controles de riesgo, registros precisos y revisión periódica, no con un retorno prometido."
                  )}{" "}
                  <Link href="/terms" className="font-semibold text-cyan-200 underline underline-offset-2">
                    {L("Terms of Service", "Términos de Servicio")}
                  </Link>
                </span>
              </label>
            </section>

            {error && <p className="text-red-400">{error}</p>}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleApproveAndSave}
                disabled={!approveEnabled}
                className={`px-5 py-2 rounded-xl font-semibold transition ${
                  approveEnabled
                    ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                {L("Approve & Save Trading Business Plan", "Aprobar y guardar Plan de Empresa de Trading")}
              </button>

              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                {L("Cancel", "Cancelar")}
              </button>
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0}
            className={`px-4 py-2 rounded-xl border transition ${
              step === 0
                ? "border-slate-800 text-slate-600 cursor-not-allowed"
                : "border-slate-700 text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
            }`}
          >
            {L("Back", "Atrás")}
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={step === 4}
            className={`px-4 py-2 rounded-xl border transition ${
              step === 4
                ? "border-slate-800 text-slate-600 cursor-not-allowed"
                : "border-emerald-400 text-emerald-300 hover:bg-emerald-400/10"
            }`}
          >
            {L("Next", "Siguiente")}
          </button>
        </div>

        <style jsx>{`
          @keyframes gpStepIn {
            from {
              opacity: 0;
              transform: translateY(6px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .gp-step-animate {
            animation: gpStepIn 220ms ease;
          }
        `}</style>
        </div>
      </main>
    </>
  );
}
