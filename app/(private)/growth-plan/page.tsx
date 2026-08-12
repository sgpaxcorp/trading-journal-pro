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
  normalizePlannedWithdrawals,
  normalizeWithdrawalSettings,
  selectTradingDaysByWeeklyAverage,
  type PlannedWithdrawalEvent,
  type PlannedWithdrawalSettings,
  type WithdrawalFrequency,
} from "@/lib/growthPlanProjection";
import {
  addTradingRunway,
  getTradingCalendarProfile,
  inferTradingRunway,
  listTradingSessionsBetween,
  listTradingSessionsFrom,
  normalizeTradingInstrument,
  normalizeTradingRunwayUnit,
  type TradingInstrument,
  type TradingRunwayUnit,
} from "@/lib/tradingCalendar";
import {
  buildGrowthPlanFeasibility,
  type GrowthPlanEvidence,
  type GrowthPlanFeasibilityVerdict,
} from "@/lib/growthPlanFeasibility";

import { listCashflows, signedCashflowAmount } from "@/lib/cashflowsSupabase";
import { syncGrowthPlanProtectionRules } from "@/lib/alertsSupabase";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";

/* ================= Helpers ================= */
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
  }

  const paragraph = chunks.join(" ");
  const wrapped = doc.splitTextToSize(paragraph, 612 - M * 2);
  doc.text(wrapped, M, y);
  y += 18 + wrapped.length * 16;

  doc.setFontSize(10);
  doc.setTextColor("#64748b");
  const disclaimer = L(
    "Projection only. This is not investment advice.",
    "Solo proyección. Esto no es recomendación de inversión."
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
    "Each row is one trading day. Type shows Goal-day or Loss-day. % applied is the estimated daily goal for goal-days. Expected (USD) is the projected result for that day. Withdrawal (USD) shows any scheduled capital taken out that day. Ending balance is the projected balance after both trading and any scheduled withdrawal.",
    "Cada fila es un día de trading. Tipo indica Día de Meta o Día de Pérdida. % aplicado es la meta diaria estimada solo en días de meta. Esperado (USD) es el resultado proyectado para ese día. Retiro (USD) muestra cualquier capital programado que sale ese día. Balance final es el balance estimado después del trading y de cualquier retiro programado."
  );
  const guideWrapped = doc.splitTextToSize(guide, 612 - M * 2);
  doc.text(guideWrapped, M, y);

  doc.addPage();
  const tableData = rows.map((r) => [
    r.day,
    r.type === "loss" ? L("Loss", "Pérdida") : L("Goal", "Meta"),
    `${r.pct.toFixed(3)}%`,
    currency(r.expectedUSD),
    currency(r.withdrawalUSD ?? 0),
    currency(r.endBalance),
  ]);

  autoTable(doc, {
    margin: { left: M, right: M, top: 56 },
    styles: { fontSize: 12, cellPadding: 6 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    head: [[L("Day", "Día"), L("Type", "Tipo de día"), L("% applied", "Meta diaria (%)"), L("Expected (USD)", "Esperado (USD)"), L("Withdrawal (USD)", "Retiro (USD)"), L("Ending balance (USD)", "Balance final (USD)")]],
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

type PlannedWithdrawalMode = "undecided" | "none" | "scheduled";

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
  monthWithdrawal?: number;
  cumulativeWithdrawals?: number;
};

type BusinessProfile = {
  riskProfile: "conservative" | "moderate" | "aggressive" | "";
  experience: "new" | "developing" | "experienced" | "";
  incomeDependency: "low" | "medium" | "high" | "";
  drawdownComfort: "low" | "medium" | "high" | "";
  tradingStyle: "scalp" | "day" | "swing" | "";
};

type BusinessScenarioId = "conservative" | "moderate" | "aggressive";

type BusinessScenario = {
  id: BusinessScenarioId;
  title: string;
  summary: string;
  dailyGoalPct: number;
  maxDailyLossPct: number;
  riskPerTradePct: number;
  lossDaysPerWeek: number;
  projectedEndBalance: number;
  chart: Array<{ label: string; value: number }>;
  fitScore: number;
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
};

type GrowthPlanResearchReview = {
  headline: string;
  summary: string;
  observations: string[];
  actions: string[];
  limitations: string[];
  methodologyNote: string;
  model: string;
  usedResearchCorpus: boolean;
  generatedAt: string;
};

const EMPTY_BUSINESS_PROFILE: BusinessProfile = {
  riskProfile: "",
  experience: "",
  incomeDependency: "",
  drawdownComfort: "",
  tradingStyle: "",
};

function isBusinessProfileComplete(profile: BusinessProfile) {
  return Boolean(
    profile.riskProfile &&
      profile.experience &&
      profile.incomeDependency &&
      profile.drawdownComfort &&
      profile.tradingStyle
  );
}

function profileFitScore(profile: BusinessProfile, scenarioId: BusinessScenarioId) {
  let score = 60;
  if (profile.riskProfile === scenarioId) score += 18;
  if (profile.experience === "experienced" && scenarioId === "aggressive") score += 8;
  if (profile.experience === "new" && scenarioId === "conservative") score += 10;
  if (profile.incomeDependency === "high" && scenarioId === "conservative") score += 12;
  if (profile.incomeDependency === "low" && scenarioId === "aggressive") score += 6;
  if (profile.drawdownComfort === "low" && scenarioId === "conservative") score += 12;
  if (profile.drawdownComfort === "high" && scenarioId === "aggressive") score += 8;
  if (profile.tradingStyle === "scalp" && scenarioId === "aggressive") score -= 4;
  if (profile.tradingStyle === "swing" && scenarioId === "conservative") score += 4;
  if (profile.incomeDependency === "high" && scenarioId === "aggressive") score -= 18;
  if (profile.drawdownComfort === "low" && scenarioId === "aggressive") score -= 22;
  if (profile.experience === "new" && scenarioId === "aggressive") score -= 20;
  return Math.max(5, Math.min(99, score));
}

function buildScenarioChart(starting: number, tradingDays: number, dailyGoalPct: number) {
  const days = Math.max(20, Math.min(260, tradingDays || 60));
  const points = Math.min(12, Math.max(6, Math.ceil(days / 10)));
  const out: Array<{ label: string; value: number }> = [];
  for (let i = 0; i < points; i++) {
    const day = Math.round((days / (points - 1)) * i);
    const value = Math.max(0, starting * Math.pow(1 + dailyGoalPct / 100, day));
    out.push({ label: day === 0 ? "0" : String(day), value: Number(value.toFixed(2)) });
  }
  return out;
}

function buildBusinessScenarios(params: {
  profile: BusinessProfile;
  startingBalance: number;
  tradingDays: number;
  isEs: boolean;
}) {
  const { profile, startingBalance, tradingDays, isEs } = params;
  const bases: Array<{
    id: BusinessScenarioId;
    dailyGoalPct: number;
    maxDailyLossPct: number;
    riskPerTradePct: number;
    lossDaysPerWeek: number;
  }> = [
    { id: "conservative", dailyGoalPct: 0.35, maxDailyLossPct: 1, riskPerTradePct: 0.5, lossDaysPerWeek: 2 },
    { id: "moderate", dailyGoalPct: 0.65, maxDailyLossPct: 2, riskPerTradePct: 1, lossDaysPerWeek: 1 },
    { id: "aggressive", dailyGoalPct: 1.1, maxDailyLossPct: 3, riskPerTradePct: 1.75, lossDaysPerWeek: 1 },
  ];

  let safety = 1;
  if (profile.experience === "new") safety *= 0.78;
  if (profile.incomeDependency === "high") safety *= 0.82;
  if (profile.drawdownComfort === "low") safety *= 0.78;
  if (profile.riskProfile === "aggressive") safety *= 1.08;
  if (profile.riskProfile === "conservative") safety *= 0.9;
  if (!isBusinessProfileComplete(profile)) safety = 0.92;

  const scored = bases.map((base) => {
    const fitScore = profileFitScore(profile, base.id);
    const dailyGoalPct = Number(Math.max(0.1, base.dailyGoalPct * safety).toFixed(2));
    const riskPerTradePct = Number(Math.max(0.25, base.riskPerTradePct * safety).toFixed(2));
    const maxDailyLossPct = Number(Math.max(0.75, base.maxDailyLossPct * Math.min(1.05, safety + 0.1)).toFixed(2));
    const chart = buildScenarioChart(Math.max(0, startingBalance || 1000), tradingDays || 60, dailyGoalPct);
    const projectedEndBalance = chart[chart.length - 1]?.value ?? 0;
    return {
      id: base.id,
      title:
        base.id === "conservative"
          ? isEs
            ? "Conservador"
            : "Conservative"
          : base.id === "moderate"
            ? isEs
              ? "Moderado"
              : "Moderate"
            : isEs
              ? "Agresivo"
              : "Aggressive",
      summary:
        base.id === "conservative"
          ? isEs
            ? "Prioriza supervivencia, baja variación y cumplimiento."
            : "Prioritizes survival, low variance, and compliance."
          : base.id === "moderate"
            ? isEs
              ? "Balancea crecimiento con límites claros de daño."
              : "Balances growth with clear damage limits."
            : isEs
              ? "Busca expansión más rápida con reglas estrictas."
              : "Targets faster expansion with strict rules.",
      dailyGoalPct,
      maxDailyLossPct,
      riskPerTradePct,
      lossDaysPerWeek: base.lossDaysPerWeek,
      projectedEndBalance,
      chart,
      fitScore,
      recommended: false,
    } satisfies BusinessScenario;
  });

  const best = scored.reduce((winner, item) => (item.fitScore > winner.fitScore ? item : winner), scored[0]);
  return scored.map((item) => ({ ...item, recommended: item.id === best.id }));
}

function simulateScenarioToTarget(params: {
  starting: number;
  target: number;
  startIso: string;
  deadlineIso: string;
  averageTradingDaysPerWeek?: number;
  scenario: BusinessScenario;
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
    const pct = isLossDay ? -Math.max(0, scenario.maxDailyLossPct) : Math.max(0, scenario.dailyGoalPct);
    balance = Math.max(0, balance + balance * (pct / 100));
    balance = Math.max(0, balance - (withdrawalByDate.get(date) ?? 0));

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

function buildAiPlanAdvisor(params: {
  starting: number;
  target: number;
  startIso: string;
  averageTradingDaysPerWeek: number;
  scenario: BusinessScenario | null;
  plannedWithdrawals?: PlannedWithdrawal[];
  tradingInstrument: TradingInstrument;
  isEs: boolean;
}): AiPlanAdvisor {
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
  const [guidedMode, setGuidedMode] = useState(true);
  const [maxDailyLossPercentStr, setMaxDailyLossPercentStr] = useState("");
  const [tradingDaysStr, setTradingDaysStr] = useState("");
  const [averageTradingDaysPerWeekStr, setAverageTradingDaysPerWeekStr] = useState("5");
  const [lossDaysPerWeekStr, setLossDaysPerWeekStr] = useState("");
  const [plannedWithdrawalMode, setPlannedWithdrawalMode] = useState<PlannedWithdrawalMode>("undecided");
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
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile>(EMPTY_BUSINESS_PROFILE);
  const [selectedScenarioId, setSelectedScenarioId] = useState<BusinessScenarioId | "">("");
  const [performanceEvidence, setPerformanceEvidence] = useState<GrowthPlanEvidence | null>(null);
  const [performanceEvidenceLoading, setPerformanceEvidenceLoading] = useState(false);
  const [researchReview, setResearchReview] = useState<GrowthPlanResearchReview | null>(null);
  const [researchReviewLoading, setResearchReviewLoading] = useState(false);
  const [researchReviewError, setResearchReviewError] = useState("");

  // Commit
  const [committed, setCommitted] = useState(false);

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
  const runwayAmount = Math.max(1, clampInt(toNum(runwayAmountStr, 1), 1, 1200));
  const averageTradingDaysPerWeek = resolveAverageTradingDaysPerWeek(
    averageTradingDaysPerWeekStr,
    tradingCalendarProfile.sessionsPerWeek
  );
  const averageTradingDaysSet = averageTradingDaysPerWeekStr.trim().length > 0;
  const lossDaysPerWeek = clampInt(toNum(lossDaysPerWeekStr, 0), 0, averageTradingDaysPerWeek);
  const plannedWithdrawalAmount = Math.max(0, toNum(plannedWithdrawalAmountStr, 0));
  const plannedWithdrawalStartPeriod = Math.max(1, clampInt(toNum(plannedWithdrawalStartPeriodStr, 1), 1));
  const riskPerTradePct = Math.max(0, toNum(riskPerTradePctStr, 0));
  const targetMultiple =
    startingBalance > 0 && targetBalance > 0 ? targetBalance / startingBalance : 0;
  const businessAnalysisComplete = isBusinessProfileComplete(businessProfile) && !!selectedScenarioId;

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
  const effectivePlanStartDate = planStartDate || isoToday();
  const planDatesOrdered =
    !effectivePlanStartDate || !targetDateStr || effectivePlanStartDate <= targetDateStr;

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
        if (alive) setLiveCurrentBalance(null);
        return;
      }

      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
          if (alive) setLiveCurrentBalance(null);
          return;
        }

        const res = await fetch(`/api/account/series?accountId=${encodeURIComponent(activeAccountId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (alive) setLiveCurrentBalance(null);
          return;
        }

        const body = (await res.json().catch(() => ({}))) as {
          series?: Array<{ value?: number | string | null }>;
        };
        const series = Array.isArray(body?.series) ? body.series : [];
        const latest = series
          .map((point) => Number(point?.value))
          .filter((value: number) => Number.isFinite(value))
          .slice(-1)[0];

        if (alive) {
          setLiveCurrentBalance(Number.isFinite(latest) ? latest : null);
        }
      } catch {
        if (alive) setLiveCurrentBalance(null);
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
    }
  }, [averageTradingDaysPerWeek, lossDaysPerWeekStr]);

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
        withdrawalSettings: plannedWithdrawalSettings,
        existingWithdrawals: plannedWithdrawals,
        tradingInstrument,
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
      withdrawalSettings: plannedWithdrawalSettings,
      existingWithdrawals: plannedWithdrawals,
      tradingInstrument,
    });
  }, [
    lossDaysPerWeek,
    averageTradingDaysPerWeek,
    maxDailyLossPercent,
    effectivePlanStartDate,
    plannedWithdrawalSettings,
    plannedWithdrawals,
    startingBalance,
    targetBalance,
    targetDateStr,
    tradingInstrument,
  ]);

  const suggestedRows = projection.rows;
  const requiredGoalPct = projection.requiredGoalPct;
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
    const prodLoss =
      totalLossDays > 0
        ? Math.pow(1 - Math.max(0, maxDailyLossPercent) / 100, totalLossDays)
        : 1;

    return {
      goalDays,
      totalLossDays,
      prodLoss,
      goalPct: requiredGoalPct,
      totalPlannedWithdrawal: generatedPlannedWithdrawals.reduce((sum, item) => sum + item.amount, 0),
      plannedWithdrawalCount: generatedPlannedWithdrawals.length,
    };
  }, [generatedPlannedWithdrawals, maxDailyLossPercent, requiredGoalPct, suggestedRows]);

  const guidedTasksByStep = useMemo<Record<WizardStep, GuidedTask[]>>(() => {
    const lossDaysSet = lossDaysPerWeekStr.trim().length > 0;
    const requiredGoalReady = suggestedRows.length > 0;
    return {
      0: [
        {
          id: "business_analysis",
          label: L("Complete Business Analysis and select a scenario", "Completa Business Analysis y selecciona un escenario"),
          done: businessAnalysisComplete,
          anchor: "gp-business-analysis",
        },
        {
          id: "plan_mode",
          label: L("Plan mode (automatic)", "Modo del plan (automático)"),
          done: true,
          anchor: "gp-plan-mode",
        },
        {
          id: "starting_balance",
          label: L("Enter starting balance", "Ingresa balance inicial"),
          done: startingBalance > 0,
          anchor: "gp-starting-balance",
        },
        {
          id: "target_balance",
          label: L("Enter target balance", "Ingresa balance objetivo"),
          done: targetBalance > 0,
          anchor: "gp-target-balance",
        },
        {
          id: "start_date",
          label: L("Pick a start date", "Elige fecha de inicio"),
          done: !!planStartDate,
          anchor: "gp-start-date",
        },
        {
          id: "target_date",
          label: L("Pick a target date", "Elige fecha meta"),
          done: !!targetDateStr && planDatesOrdered,
          anchor: "gp-target-date",
        },
        {
          id: "planned_withdrawals",
          label: L("Choose planned withdrawals", "Configura retiros planificados"),
          done: plannedWithdrawalConfigured,
          anchor: "gp-planned-withdrawals",
        },
        {
          id: "trading_days",
          label: L("Set average operating days and total trading days", "Define días operativos promedio y total de trading"),
          done: averageTradingDaysSet && tradingDays > 0,
          anchor: "gp-trading-days",
        },
        {
          id: "max_daily_loss",
          label: L("Set max daily loss", "Define pérdida diaria máx"),
          done: maxDailyLossPercent > 0,
          anchor: "gp-max-daily-loss",
        },
        {
          id: "loss_days_per_week",
          label: L("Set loss days per week", "Define días de pérdida por semana"),
          done: lossDaysSet,
          anchor: "gp-loss-days",
        },
        {
          id: "risk_per_trade",
          label: L("Set risk per trade", "Define riesgo por trade"),
          done: riskPerTradePct > 0,
          anchor: "gp-risk-per-trade",
        },
        {
          id: "required_goal",
          label: L("Review required goal %", "Revisa % requerido"),
          done: requiredGoalReady,
          anchor: "gp-required-goal",
        },
        {
          id: "phase_builder",
          label: L("Generate milestones", "Genera las metas"),
          done: autoPhasesGenerated,
          anchor: "gp-phase-builder",
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
          done: committed,
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
    plannedWithdrawalConfigured,
    suggestedRows.length,
    tradingSystemCount,
    analysisStylesCount,
    stepsData.analysis,
    journalNotesLen,
    systemDoCount,
    systemDontCount,
    strategyCount,
    nonNegotiableCount,
    committed,
    businessAnalysisComplete,
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
          const existingBusinessAnalysis = (existing.steps as any)?.business_analysis;
          const existingOperatingModel = existingBusinessAnalysis?.operatingModel ?? {};
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
            (existing as any).targetDate ?? (existing as any).target_date ?? ""
          ).slice(0, 10);
          const inferredRunway = inferTradingRunway(loadedStartDate, loadedTargetDate);
          const loadedRunwayAmount = Math.max(
            1,
            clampInt(
              toNum(String(existingOperatingModel?.runway?.amount ?? inferredRunway.amount), 1),
              1,
              1200
            )
          );
          const loadedRunwayUnit = normalizeTradingRunwayUnit(
            existingOperatingModel?.runway?.unit ?? inferredRunway.unit
          );

          setStartingBalanceStr(formatMoneyInputValue(existing.startingBalance ?? 5000));
          setTargetBalanceStr(formatMoneyInputValue(existing.targetBalance ?? 60000));
          setPlanStartDate(loadedStartDate);
          setTargetDateStr(loadedTargetDate || addTradingRunway(loadedStartDate, loadedRunwayAmount, loadedRunwayUnit));
          setTradingInstrument(loadedInstrument);
          setRunwayAmountStr(String(loadedRunwayAmount));
          setRunwayUnit(loadedRunwayUnit);
          setMaxDailyLossPercentStr(String(existing.maxDailyLossPercent ?? 1));
          setTradingDaysStr(String(existing.tradingDays ?? 60));
          setAverageTradingDaysPerWeekStr(String(loadedAverageTradingDays));
          setLossDaysPerWeekStr(String(clampInt(Number(existing.lossDaysPerWeek ?? 0), 0, loadedAverageTradingDays)));

          setRiskPerTradePctStr(String(existing.maxRiskPerTradePercent ?? 2));

          setCommitted(false);

          setStepsData(existing.steps ?? getDefaultSteps());
          setRules(existing.rules && existing.rules.length ? existing.rules : getDefaultSuggestedRules());
          setResearchReview(null);
          setResearchReviewError("");
          if (existingBusinessAnalysis && typeof existingBusinessAnalysis === "object") {
            const nextProfile = {
              ...EMPTY_BUSINESS_PROFILE,
              ...(existingBusinessAnalysis.profile && typeof existingBusinessAnalysis.profile === "object"
                ? existingBusinessAnalysis.profile
                : {}),
            } as BusinessProfile;
            setBusinessProfile(nextProfile);
            const nextScenarioId = String(existingBusinessAnalysis.selectedScenarioId ?? "");
            if (["conservative", "moderate", "aggressive"].includes(nextScenarioId)) {
              setSelectedScenarioId(nextScenarioId as BusinessScenarioId);
            }
            const storedResearchReview = existingBusinessAnalysis.researchReview;
            if (storedResearchReview && typeof storedResearchReview === "object") {
              setResearchReview(storedResearchReview as GrowthPlanResearchReview);
            } else {
              setResearchReview(null);
            }
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
          setTradingDaysTouched(false);
          setLossDaysPerWeekStr("");
          setRiskPerTradePctStr("");
          setLoadedStartingBalance(null);
          setCashflowNet(0);
          setPlanStartDate(newStartDate);
          setPlannedWithdrawals([]);
          setPlannedWithdrawalMode("undecided");
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
      setIsFollowOnDraft(true);
      setError("");
      setStep(0);
      setStep0Stage(0);

      pushNeuroMessage(
        riskMode === "same"
          ? L(
              "Next-cycle draft ready. We kept the same risk profile and rolled the plan forward from your live balance.",
              "El borrador del próximo ciclo está listo. Mantuvimos el mismo perfil de riesgo y reiniciamos el plan desde tu balance real."
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
        profile: businessProfile,
        startingBalance: startingBalance > 0 ? startingBalance : 5000,
        tradingDays: businessScenarioTradingDays,
        isEs,
      }),
    [businessProfile, businessScenarioTradingDays, isEs, startingBalance]
  );
  const selectedBusinessScenario = useMemo(
    () => businessScenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null,
    [businessScenarios, selectedScenarioId]
  );
  const reviewScenario = useMemo(
    () =>
      isBusinessProfileComplete(businessProfile)
        ? selectedBusinessScenario ?? businessScenarios.find((scenario) => scenario.recommended) ?? null
        : null,
    [businessProfile, businessScenarios, selectedBusinessScenario]
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
        planMaxDailyLossPct: maxDailyLossPercent,
        scenario: reviewScenario,
        plannedWithdrawals: generatedPlannedWithdrawals,
        tradingInstrument,
        evidence: performanceEvidence,
      }),
    [
      businessScenarioTradingDays,
      averageTradingDaysPerWeek,
      effectivePlanStartDate,
      generatedPlannedWithdrawals,
      performanceEvidence,
      lossDaysPerWeek,
      maxDailyLossPercent,
      requiredGoalPct,
      reviewScenario,
      startingBalance,
      targetBalance,
      targetDateStr,
      tradingInstrument,
    ]
  );

  const aiPlanAdvisor = useMemo(
    () =>
      buildAiPlanAdvisor({
        starting: startingBalance,
        target: targetBalance,
        startIso: effectivePlanStartDate,
        averageTradingDaysPerWeek,
        scenario: reviewScenario,
        plannedWithdrawals: generatedPlannedWithdrawals,
        tradingInstrument,
        isEs,
      }),
    [
      averageTradingDaysPerWeek,
      effectivePlanStartDate,
      generatedPlannedWithdrawals,
      isEs,
      reviewScenario,
      startingBalance,
      targetBalance,
      tradingInstrument,
    ]
  );

  const applyAiPlanRecommendation = () => {
    if (!reviewScenario || !aiPlanAdvisor.shouldSurface) return;

    setSelectedScenarioId(reviewScenario.id);
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
    setAutoPhasesGenerated(false);
    setError("");
    pushNeuroMessage(
      L(
        `Operating recommendation applied: ${reviewScenario.title} model at ${reviewScenario.dailyGoalPct.toFixed(2)}% on goal-days, with an estimated completion date of ${formatPlanDate(aiPlanAdvisor.recommendedCompletionDate, lang)}.`,
        `Recomendación operativa aplicada: modelo ${reviewScenario.title} a ${reviewScenario.dailyGoalPct.toFixed(2)}% en días de meta, con fecha estimada de cumplimiento ${formatPlanDate(aiPlanAdvisor.recommendedCompletionDate, lang)}.`
      )
    );
  };

  const runResearchPlanReview = async () => {
    if (!planRealismReview.shouldSurface || !reviewScenario) {
      setResearchReviewError(
        L(
          "Complete the capital, runway, risk profile, and operating scenario first.",
          "Completa primero el capital, runway, perfil de riesgo y escenario operativo."
        )
      );
      return;
    }

    setResearchReviewLoading(true);
    setResearchReviewError("");
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
          executionEvidence: {
            depth: planRealismReview.evidenceDepth,
            sessions: planRealismReview.evidenceSessions,
            trades: planRealismReview.evidenceTrades,
            winRatePct: performanceEvidence?.winRate ?? null,
            profitFactor: performanceEvidence?.profitFactor ?? null,
            expectancyUsd: performanceEvidence?.expectancy ?? null,
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
      setResearchReview(body.review);
    } catch (reviewError: any) {
      setResearchReviewError(
        String(reviewError?.message || L("The review could not be generated.", "No se pudo generar la evaluación."))
      );
    } finally {
      setResearchReviewLoading(false);
    }
  };

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
    plannedWithdrawalConfigured;

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
  const step0Stages = [
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
                    inputMode="numeric"
                    value={runwayAmountStr}
                    onChange={(event) => {
                      setRunwayAmountStr(event.target.value.replace(/\D/g, "").slice(0, 4));
                      setAutoPhasesGenerated(false);
                    }}
                    onBlur={() => setRunwayAmountStr(String(runwayAmount))}
                    className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-lg font-semibold text-slate-100 outline-none focus:border-cyan-300"
                    aria-label={L("Runway amount", "Cantidad del runway")}
                  />
                  <select
                    value={runwayUnit}
                    onChange={(event) => {
                      setRunwayUnit(normalizeTradingRunwayUnit(event.target.value));
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

          <div className="grid gap-3 xl:grid-cols-5">
            {[
              {
                key: "riskProfile",
                label: L("Risk profile", "Perfil de riesgo"),
                options: [
                  ["conservative", L("Conservative", "Conservador")],
                  ["moderate", L("Moderate", "Moderado")],
                  ["aggressive", L("Aggressive", "Agresivo")],
                ],
              },
              {
                key: "experience",
                label: L("Experience", "Experiencia"),
                options: [
                  ["new", L("New", "Nuevo")],
                  ["developing", L("Developing", "En desarrollo")],
                  ["experienced", L("Experienced", "Experimentado")],
                ],
              },
              {
                key: "incomeDependency",
                label: L("Income dependency", "Dependencia de ingresos"),
                options: [
                  ["low", L("Low", "Baja")],
                  ["medium", L("Medium", "Media")],
                  ["high", L("High", "Alta")],
                ],
              },
              {
                key: "drawdownComfort",
                label: L("Drawdown comfort", "Tolerancia al drawdown"),
                options: [
                  ["low", L("Low", "Baja")],
                  ["medium", L("Medium", "Media")],
                  ["high", L("High", "Alta")],
                ],
              },
              {
                key: "tradingStyle",
                label: L("Trading style", "Estilo de trading"),
                options: [
                  ["scalp", L("Scalp", "Scalp")],
                  ["day", L("Day trade", "Day trade")],
                  ["swing", L("Swing", "Swing")],
                ],
              },
            ].map((field) => (
              <div key={field.key} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{field.label}</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {field.options.map(([value, label]) => {
                    const active = (businessProfile as any)[field.key] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setBusinessProfile((prev) => ({
                            ...prev,
                            [field.key]: value,
                          }))
                        }
                        className={`rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                          active
                            ? "border-cyan-300 bg-cyan-300/10 text-cyan-100 shadow-[0_0_0_1px_rgba(103,232,249,0.08)]"
                            : "border-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-900/70"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
              {!isBusinessProfileComplete(businessProfile) ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-200">
                  {L("Complete questions first", "Completa las preguntas primero")}
                </span>
              ) : null}
            </div>

            {planRealismReview.shouldSurface ? (
              <div
                className={`mt-3 rounded-2xl border p-4 ${
                  planRealismReview.verdict === "high_risk"
                    ? "border-red-400/40 bg-red-500/10"
                    : planRealismReview.verdict === "stretch" || planRealismReview.verdict === "unvalidated"
                      ? "border-amber-400/40 bg-amber-500/10"
                      : "border-emerald-400/30 bg-emerald-500/10"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p
                      className={`text-[11px] uppercase tracking-[0.24em] ${
                        planRealismReview.verdict === "high_risk"
                          ? "text-red-200"
                          : planRealismReview.verdict === "aligned"
                            ? "text-emerald-200"
                            : "text-amber-200"
                      }`}
                    >
                      {L("Evidence-based plan review", "Evaluación del plan basada en evidencia")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {planRealismReview.verdict === "high_risk"
                        ? L(
                            "The arithmetic is defined, but the current operating model does not support this pace.",
                            "La matemática está definida, pero el modelo operativo actual no sostiene este ritmo."
                          )
                        : planRealismReview.verdict === "unvalidated"
                          ? L(
                              "The model covers the target, but execution evidence is still insufficient.",
                              "El modelo cubre la meta, pero todavía falta evidencia suficiente de ejecución."
                            )
                          : planRealismReview.verdict === "aligned"
                            ? L(
                                "The target is aligned with the selected model and available evidence.",
                                "La meta está alineada con el modelo seleccionado y la evidencia disponible."
                              )
                        : L(
                            "The target is a stretch under the selected operating assumptions.",
                            "La meta exige más que los supuestos operativos seleccionados."
                          )}
                    </p>
                    <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-300">
                      {L(
                        `The perfect-path pace is ${planRealismReview.requiredCompoundDailyPct.toFixed(2)}% on every committed session. Your operating model includes ${planRealismReview.modeledLossDays} modeled loss day(s) at up to ${planRealismReview.modeledMaxLossPct.toFixed(2)}% and ${planRealismReview.modeledGoalDays} goal-day(s), so those goal-days must average ${planRealismReview.requiredGoalPct.toFixed(2)}%. These are different metrics, not conflicting calculations.`,
                        `El ritmo de una trayectoria perfecta es ${planRealismReview.requiredCompoundDailyPct.toFixed(2)}% en cada sesión comprometida. Tu modelo incluye ${planRealismReview.modeledLossDays} día(s) de pérdida a un máximo de ${planRealismReview.modeledMaxLossPct.toFixed(2)}% y ${planRealismReview.modeledGoalDays} día(s) de meta; por eso esos días de meta deben promediar ${planRealismReview.requiredGoalPct.toFixed(2)}%. Son métricas distintas, no cálculos contradictorios.`
                      )}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-600 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold text-slate-200">
                    {planRealismReview.policyBand === "high_risk"
                      ? L("High-risk target", "Meta de alto riesgo")
                      : planRealismReview.policyBand === "needs_validation"
                        ? L("Needs validation", "Requiere validación")
                        : L("Model aligned", "Modelo alineado")}
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
                      {L("Every session", "Cada sesión")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      {planRealismReview.requiredCompoundDailyPct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Goal-day average", "Promedio día-meta")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      {planRealismReview.requiredGoalPct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Model coverage", "Cobertura del modelo")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      {planRealismReview.scenarioCoveragePct.toFixed(0)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Projected capital", "Capital proyectado")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      {currency(planRealismReview.scenarioProjectedBalance)}
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
                <p className="mt-3 text-[11px] leading-5 text-slate-400">
                  {L(
                    `The active scenario budgets ${planRealismReview.scenarioDailyGoalPct.toFixed(2)}% on goal-days and projects ${currency(planRealismReview.scenarioProjectedBalance)} by ${targetDateStr}. Annualized target math is ${planRealismReview.annualizedTargetReturnPct?.toFixed(1) ?? "—"}%. This is an educational operating estimate, not a return forecast or investment recommendation.`,
                    `El escenario activo presupone ${planRealismReview.scenarioDailyGoalPct.toFixed(2)}% en días de meta y proyecta ${currency(planRealismReview.scenarioProjectedBalance)} para ${targetDateStr}. La matemática anualizada de la meta es ${planRealismReview.annualizedTargetReturnPct?.toFixed(1) ?? "—"}%. Este es un estimado operativo educativo, no un pronóstico de rendimiento ni una recomendación de inversión.`
                  )}
                </p>
              </div>
            ) : null}

            {planRealismReview.shouldSurface ? (
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

            {aiPlanAdvisor.shouldSurface ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-cyan-300/30 bg-[linear-gradient(135deg,rgba(8,47,73,0.38),rgba(2,6,23,0.94)_58%)] shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
                <div className="border-b border-cyan-300/15 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200">
                      {L("Model-recommended operating path", "Ruta operativa recomendada por el modelo")}
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
                      {aiPlanAdvisor.recommendedCompletionDate
                        ? L(
                            `Est. completion ${formatPlanDate(aiPlanAdvisor.recommendedCompletionDate, lang)}`,
                            `Cierre estimado ${formatPlanDate(aiPlanAdvisor.recommendedCompletionDate, lang)}`
                          )
                        : L("Needs more data", "Necesita más data")}
                    </span>
                    <button
                      type="button"
                      onClick={applyAiPlanRecommendation}
                      disabled={!aiPlanAdvisor.recommendedCompletionDate}
                      className="rounded-full bg-cyan-300 px-3 py-1.5 text-[11px] font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {L("Apply operating recommendation", "Aplicar recomendación operativa")}
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-cyan-300/15 bg-slate-950/65 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Recommended model", "Modelo recomendado")}
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
                      {L("Recommended percentages", "Porcentajes recomendados")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-cyan-100">
                      {aiPlanAdvisor.recommendedDailyGoalPct.toFixed(2)}% {L("goal-day", "día de meta")}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {aiPlanAdvisor.riskPerTradePct.toFixed(2)}% {L("risk/trade", "riesgo/trade")} · {aiPlanAdvisor.maxDailyLossPct.toFixed(2)}% {L("max/day", "máx./día")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-300/15 bg-slate-950/65 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Recommended period", "Período recomendado")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-cyan-100">
                      {aiPlanAdvisor.totalTradingDays === null
                        ? "—"
                        : L(
                            `${aiPlanAdvisor.totalTradingDays} trading days`,
                            `${aiPlanAdvisor.totalTradingDays} días de trading`
                          )}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {aiPlanAdvisor.totalOperatingWeeks === null
                        ? L("Outside projection range", "Fuera del rango de proyección")
                        : L(
                            `${aiPlanAdvisor.totalOperatingWeeks} weeks · about ${aiPlanAdvisor.totalEstimatedMonths} months`,
                            `${aiPlanAdvisor.totalOperatingWeeks} semanas · aprox. ${aiPlanAdvisor.totalEstimatedMonths} meses`
                          )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-300/15 bg-slate-950/65 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {L("Recommended completion", "Cumplimiento recomendado")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-cyan-100">
                      {formatPlanDate(aiPlanAdvisor.recommendedCompletionDate, lang)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {L("Calculated from the operating assumptions above", "Calculado con los supuestos operativos anteriores")}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[10px] leading-4 text-slate-500">
                  {L(
                    "Planning projection only. It is not a promise of returns; actual completion depends on execution, losses, withdrawals, and market conditions.",
                    "Proyección de planificación solamente. No es una promesa de rendimiento; el cumplimiento real depende de la ejecución, pérdidas, retiros y condiciones del mercado."
                  )}
                </p>
                </div>
                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      {L("Recommended execution periods", "Períodos de ejecución recomendados")}
                    </p>
                    <span className="text-[10px] text-slate-500">
                      {L("Percentage remains constant", "El porcentaje se mantiene constante")}
                    </span>
                  </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {aiPlanAdvisor.phases.map((phase) => (
                    <div key={`${phase.title}-${phase.targetEquity}`} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                        {phase.title}
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-100">
                        {currency(phase.targetEquity)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {L("Goal-day pace", "Ritmo en días de meta")}:{" "}
                        <span className="text-slate-100">{phase.dailyGoalPct.toFixed(2)}%</span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {L("Est. date", "Fecha est.")}:{" "}
                        <span className="text-slate-100">{formatPlanDate(phase.targetDate, lang)}</span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {L("Period", "Período")}:{" "}
                        <span className="text-slate-100">
                          {phase.tradingDays === null
                            ? "—"
                            : L(
                                `${phase.tradingDays} days · ${phase.operatingWeeks} weeks · ~${phase.estimatedMonths} months`,
                                `${phase.tradingDays} días · ${phase.operatingWeeks} semanas · ~${phase.estimatedMonths} meses`
                              )}
                        </span>
                      </p>
                      <p className="mt-2 text-[11px] leading-5 text-slate-300">
                        {phase.guardrail}
                      </p>
                    </div>
                  ))}
                </div>
                </div>
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 xl:grid-cols-3">
              {businessScenarios.map((scenario) => {
                const selected = selectedScenarioId === scenario.id;
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
                        <p className="text-slate-500">{L("Daily objective", "Objetivo diario")}</p>
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
                        <p className="text-slate-500">{L("Suitability", "Suitability")}</p>
                        <p className="font-semibold text-emerald-300">{scenario.fitScore}%</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!isBusinessProfileComplete(businessProfile)}
                      onClick={() => {
                        setSelectedScenarioId(scenario.id);
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
            </div>
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
      title: L("Planned withdrawals", "Retiros planificados"),
      description: L(
        "Tell the plan if you want to take money out during the plan. Withdrawals change the pacing and milestone math.",
        "Indica si quieres retirar dinero durante el plan. Los retiros cambian el ritmo y el cálculo de metas."
      ),
      isComplete: plannedWithdrawalConfigured,
      content: (
        <div id="gp-planned-withdrawals" className="space-y-3">
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
                  "Milestones follow the minimum % required by your loss rules and any scheduled withdrawals.",
                  "Las metas siguen el % mínimo requerido según tus reglas de pérdida y cualquier retiro programado."
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                {L(
                  "Weekly checkpoints roll up into month-end balances after planned withdrawals are deducted.",
                  "Los checkpoints semanales escalan al balance de fin de mes después de descontar los retiros programados."
                )}
              </p>
            </div>
          )}
        </div>
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

  const scrollToAnchor = useCallback((anchor?: string) => {
    if (!anchor) return;
    const stageIndex = step0AnchorIndex[anchor];
    if (typeof stageIndex === "number") {
      setStep(0);
      setStep0Stage(stageIndex);
    }
    window.setTimeout(() => {
      const el = document.getElementById(anchor);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as any)?.focus?.();
    }, 80);
  }, [step0AnchorIndex]);

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
    setStep(s);
    const t =
      (await neuroReact("wizard_step_clicked", lang, { to: stepTitles[s] })) ||
      (isEs ? `Abierto: ${stepTitles[s]}.` : `Opened: ${stepTitles[s]}.`);
    pushNeuroMessage(t);
      }

  const approveEnabled =
    step === 4 &&
    committed &&
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
    plannedWithdrawalConfigured &&
    autoPhasesGenerated &&
    businessAnalysisComplete;

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
      !plannedWithdrawalConfigured ||
      !autoPhasesGenerated ||
      !businessAnalysisComplete
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
    if (!committed) {
      setError(L("Please confirm your commitment before saving.", "Confirma tu compromiso antes de guardar."));
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

    const dailyPctForSave = Math.max(0, requiredGoalPct);
    const nextPlannedWithdrawals = plannedWithdrawalMode === "scheduled" ? generatedPlannedWithdrawals : [];
    const effectivePlanStart = planStartDate || isoToday();
    const autoPhasePayload =
      autoPhasesGenerated && autoPhases.length > 0
        ? autoPhases.map((phase, idx) => {
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
              monthWithdrawal: phase.monthWithdrawal,
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
      profile: businessProfile,
      selectedScenarioId,
      averageTradingDaysPerWeek,
      operatingModel: {
        planStartDate: effectivePlanStart,
        targetDate: targetDateStr || null,
        committedTradingDays: tradingDays,
        averageTradingDaysPerWeek,
        lossDaysPerWeek,
        maxDailyLossPercent,
        riskPerTradePct,
        plannedWithdrawalMode,
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
      selectedScenario: selectedBusinessScenario
        ? {
            id: selectedBusinessScenario.id,
            title: selectedBusinessScenario.title,
            dailyGoalPct: selectedBusinessScenario.dailyGoalPct,
            maxDailyLossPct: selectedBusinessScenario.maxDailyLossPct,
            riskPerTradePct: selectedBusinessScenario.riskPerTradePct,
            lossDaysPerWeek: selectedBusinessScenario.lossDaysPerWeek,
            fitScore: selectedBusinessScenario.fitScore,
            recommended: selectedBusinessScenario.recommended,
          }
        : null,
      scenarios: businessScenarios.map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        dailyGoalPct: scenario.dailyGoalPct,
        maxDailyLossPct: scenario.maxDailyLossPct,
        riskPerTradePct: scenario.riskPerTradePct,
        lossDaysPerWeek: scenario.lossDaysPerWeek,
        fitScore: scenario.fitScore,
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
        reviewedAt: new Date().toISOString(),
      },
      researchReview,
      updatedAt: new Date().toISOString(),
    };

    const payload: Partial<GrowthPlan> = {
      startingBalance,
      targetBalance,
      targetDate: targetDateStr || null,
      planMode: "auto",
      targetMultiple: targetMultiple > 0 ? targetMultiple : null,
      planStartDate: effectivePlanStart,
      plannedWithdrawalSettings,
      plannedWithdrawals: nextPlannedWithdrawals,
      planPhases: autoPhasePayload,
      dailyGoalPercent: dailyPctForSave,
      dailyTargetPct: dailyPctForSave,
      maxDailyLossPercent,
      tradingDays,
      lossDaysPerWeek,
      selectedPlan: "suggested",
      maxRiskPerTradePercent: riskPerTradePct,
      maxRiskPerTradeUSD: riskUsd,
      steps: mergedSteps,
      rules,
      version: 2,
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
          targetDate: targetDateStr || null,
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
                  {safeStage >= step0Total - 1 ? L("Done", "Listo") : L("Next", "Siguiente")}
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

            <label id="gp-commitment" className="flex items-start gap-2 text-slate-300 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={committed}
                onChange={(e) => {
                  setCommitted(e.target.checked);
                  setError("");
                  fieldHelp("commitment");
                  if (e.target.checked) {
                    pushNeuroMessage(
                      L(
                        "Commitment confirmed ✅. Next step is to Approve & Save your Trading Business Plan.",
                        "Compromiso confirmado ✅. El siguiente paso es aprobar y guardar tu Plan de Empresa de Trading."
                      )
                    );
                                      }
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-900 accent-emerald-400"
              />
              <span>
                {L(
                  "I understand this is a commitment to process, not a guarantee of profits. I agree to follow this plan with discipline.",
                  "Entiendo que esto es un compromiso con el proceso, no una garantía de ganancias. Acepto seguir este plan con disciplina."
                )}
              </span>
            </label>

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
