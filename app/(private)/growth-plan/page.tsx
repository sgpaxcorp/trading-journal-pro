// app/(private)/growth-plan/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
  getGrowthPlanSupabaseByAccount,
  upsertGrowthPlanSupabase,
} from "@/lib/growthPlanSupabase";

import { listCashflows, signedCashflowAmount } from "@/lib/cashflowsSupabase";
import { syncMyTrophies } from "@/lib/trophiesSupabase";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";

import { pushNeuroMessage } from "@/app/components/neuroEventBus";

/* ================= Helpers ================= */
const toNum = (s: string, fb = 0) => {
  const v = Number(s);
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
const todayLong = () => {
  const locale =
    typeof document !== "undefined"
      ? document.documentElement.lang || undefined
      : undefined;
  return new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "2-digit" });
};

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
  type: "goal" | "loss";
  pct: number;
  expectedUSD: number;
  endBalance: number;
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
  const tradingDays = listTradingDaysBetween(startIso, targetIso);
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
    maxDailyLossPercent: number;
    lossDaysPerWeek: number;
    requiredGoalPct: number;
    explainRequired?: { goalDays: number; totalLossDays: number; prodLoss: number };
  },
  lang: "en" | "es"
) {
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
  const title = L("Growth Plan – Suggested (Exact Target)", "Plan de crecimiento – Sugerido (Meta exacta)");
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
        `Weekly pattern assumes ${meta.lossDaysPerWeek} loss day(s) per 5 trading days -> ${totalLossDays} loss day(s) and ${goalDays} goal-day(s).`,
        `El patrón semanal asume ${meta.lossDaysPerWeek} día(s) de pérdida por cada 5 días de trading -> ${totalLossDays} día(s) de pérdida y ${goalDays} día(s) de meta.`
      )
    );
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
    [L("Estimated daily goal (goal-days only)", "Meta diaria estimada (solo días de meta)"), `${meta.requiredGoalPct.toFixed(3)}%`],
    [L("Max daily loss (%)", "Pérdida diaria máxima (%)"), `${meta.maxDailyLossPercent}%`],
    [L("Loss days per week", "Días de pérdida por semana"), String(meta.lossDaysPerWeek)],
  ];

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
    "Each row is one trading day. Type shows Goal-day or Loss-day. % applied is the estimated daily goal for goal-days. Expected (USD) is the projected result for that day. Ending balance is the projected balance after the day.",
    "Cada fila es un día de trading. Tipo indica Día de Meta o Día de Pérdida. % aplicado es la meta diaria estimada solo en días de meta. Esperado (USD) es el resultado proyectado para ese día. Balance final es el balance estimado al cierre."
  );
  const guideWrapped = doc.splitTextToSize(guide, 612 - M * 2);
  doc.text(guideWrapped, M, y);

  doc.addPage();
  const tableData = rows.map((r) => [
    r.day,
    r.type === "loss" ? L("Loss", "Pérdida") : L("Goal", "Meta"),
    `${r.pct.toFixed(3)}%`,
    currency(r.expectedUSD),
    currency(r.endBalance),
  ]);

  autoTable(doc, {
    margin: { left: M, right: M, top: 56 },
    styles: { fontSize: 12, cellPadding: 6 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    head: [[L("Day", "Día"), L("Type", "Tipo de día"), L("% applied", "Meta diaria (%)"), L("Expected (USD)", "Esperado (USD)"), L("Ending balance (USD)", "Balance final (USD)")]],
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

/* ================= Neuro Reaction =================
   - We use /api/neuro-reaction for:
     1) "field_help" (short explanations for each field)
     2) coaching nudges (risk too high, saved plan, etc.)
*/
async function neuroReact(event: string, lang: "en" | "es", data: any) {
  try {
    const session = await supabaseBrowser.auth.getSession();
    const token = session?.data?.session?.access_token;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch("/api/neuro-assistant/neuro-reaction", {
      method: "POST",
      headers,
      body: JSON.stringify({ event, lang, data }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const text = (j?.text as string) || "";
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function observedDate(date: Date): Date {
  const day = date.getDay();
  if (day === 6) return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  if (day === 0) return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return date;
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekdayOffset = (7 + weekday - firstOfMonth.getDay()) % 7;
  const day = 1 + firstWeekdayOffset + 7 * (n - 1);
  return new Date(year, month, day);
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastOfMonth = new Date(year, month + 1, 0);
  const offsetBack = (7 + lastOfMonth.getDay() - weekday) % 7;
  const day = lastOfMonth.getDate() - offsetBack;
  return new Date(year, month, day);
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getUsMarketHolidayDates(year: number): string[] {
  const holidays: string[] = [];
  holidays.push(toYMD(observedDate(new Date(year, 0, 1)))); // New Year
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 0, 1, 3))); // MLK
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 1, 1, 3))); // Presidents
  const easter = getEasterDate(year);
  const goodFriday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
  holidays.push(toYMD(goodFriday)); // Good Friday
  holidays.push(toYMD(getLastWeekdayOfMonth(year, 4, 1))); // Memorial Day
  holidays.push(toYMD(observedDate(new Date(year, 5, 19)))); // Juneteenth
  holidays.push(toYMD(observedDate(new Date(year, 6, 4)))); // Independence Day
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 8, 1, 1))); // Labor Day
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 10, 4, 4))); // Thanksgiving
  holidays.push(toYMD(observedDate(new Date(year, 11, 25)))); // Christmas
  return holidays;
}

function listTradingDaysBetween(startIso: string, endIso: string): string[] {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return [];
  const start = s <= e ? s : e;
  const end = s <= e ? e : s;
  const years: number[] = [];
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) years.push(y);
  const holidaySet = new Set(years.flatMap(getUsMarketHolidayDates));

  const days: string[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const ds = toYMD(d);
    const dow = d.getDay();
    const isStock = dow !== 0 && dow !== 6 && !holidaySet.has(ds);
    if (isStock) days.push(ds);
  }
  return days;
}

function computeTradingDaysBetween(startIso: string, endIso: string) {
  return listTradingDaysBetween(startIso, endIso).length;
}

/* ================= Wizard ================= */
type WizardStep = 0 | 1 | 2 | 3 | 4;

const STEP_ORDER: WizardStep[] = [0, 1, 2, 3, 4];

const STEP_TITLES_EN: Record<WizardStep, string> = {
  0: "Goal & Numbers",
  1: "Trading System",
  2: "Analysis",
  3: "Journal",
  4: "Strategy & Rules",
};

const STEP_TITLES_ES: Record<WizardStep, string> = {
  0: "Meta y números",
  1: "Sistema de Trading",
  2: "Análisis",
  3: "Journal",
  4: "Estrategia y reglas",
};

type AssistantLang = "en" | "es"; // stored in Supabase (inside growth plan record)

type PlannedWithdrawal = {
  id: string;
  targetEquity: number;
  amount: number;
  status?: "pending" | "taken" | "skipped";
  achievedAt?: string | null;
  decidedAt?: string | null;
};

type PlanPhase = {
  id: string;
  title?: string | null;
  targetEquity: number;
  targetDate?: string | null;
  status?: "pending" | "completed";
  completedAt?: string | null;
};

export default function GrowthPlanPage() {
  const { user, loading } = useAuth();
  const { activeAccountId, loading: accountsLoading } = useTradingAccounts();
  const router = useRouter();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale) as AssistantLang;
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const stepTitles = isEs ? STEP_TITLES_ES : STEP_TITLES_EN;
  const inputBase =
    "w-full rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none px-2.5 py-1.5 text-sm";

  const [step, setStep] = useState<WizardStep>(0);
  const [error, setError] = useState("");
  const [hasExistingPlan, setHasExistingPlan] = useState(false);

  // Cashflows net since plan start (for correct $ conversions when editing an existing plan)
  const [cashflowNet, setCashflowNet] = useState(0);
  const [loadedStartingBalance, setLoadedStartingBalance] = useState<number | null>(null);

  // Neuro language toggle is stored in Supabase (kept in steps._ui.lang)
  const [assistantLang, setAssistantLang] = useState<AssistantLang>(lang);

  // Strings for inputs
  const [startingBalanceStr, setStartingBalanceStr] = useState("");
  const [targetBalanceStr, setTargetBalanceStr] = useState("");
  const [targetDateStr, setTargetDateStr] = useState("");
  const planMode = "auto" as const;
  const [tradingDaysTouched, setTradingDaysTouched] = useState(false);
  const [guidedMode, setGuidedMode] = useState(true);
  const [maxDailyLossPercentStr, setMaxDailyLossPercentStr] = useState("");
  const [tradingDaysStr, setTradingDaysStr] = useState("");
  const [lossDaysPerWeekStr, setLossDaysPerWeekStr] = useState("");
  const [plannedWithdrawals, setPlannedWithdrawals] = useState<PlannedWithdrawal[]>([]);
  const [planPhases, setPlanPhases] = useState<PlanPhase[]>([]);
  const [planStartDate, setPlanStartDate] = useState<string | null>(null);
  const [autoPhasesGenerated, setAutoPhasesGenerated] = useState(false);
  const [step0Stage, setStep0Stage] = useState(0);

  // Risk
  const [riskPerTradePctStr, setRiskPerTradePctStr] = useState("");

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
  const lossDaysPerWeek = clampInt(toNum(lossDaysPerWeekStr, 0), 0, 5);
  const riskPerTradePct = Math.max(0, toNum(riskPerTradePctStr, 0));
  const targetMultiple =
    startingBalance > 0 && targetBalance > 0 ? targetBalance / startingBalance : 0;

  const baseBalanceForDollars = useMemo(() => {
    // If editing an existing plan AND the user hasn't changed the starting balance from what we loaded,
    // then include net cashflows since plan start for $ conversions (risk USD, goal USD, max-loss USD).
    if (loadedStartingBalance !== null && Math.abs(startingBalance - loadedStartingBalance) < 0.01) {
      return Math.max(0, startingBalance + (cashflowNet || 0));
    }
    return Math.max(0, startingBalance);
  }, [startingBalance, loadedStartingBalance, cashflowNet]);

  const riskUsd = useMemo(() => calcRiskUsd(baseBalanceForDollars, riskPerTradePct), [baseBalanceForDollars, riskPerTradePct]);

  const onlyNum = (s: string) => s.replace(/[^\d.]/g, "");

  useEffect(() => {
    if (!targetDateStr) return;
    if (tradingDaysTouched) return;
    const startIso = isoToday();
    const count = computeTradingDaysBetween(startIso, targetDateStr);
    if (!Number.isFinite(count) || count <= 0) return;
    setTradingDaysStr(String(count));
  }, [targetDateStr, tradingDaysTouched]);

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

  const guidedTasksByStep = useMemo<Record<WizardStep, GuidedTask[]>>(() => {
    const lossDaysSet = lossDaysPerWeekStr.trim().length > 0;
    const requiredGoalReady =
      computeRequiredGoalPct(
        Math.max(0, startingBalance),
        Math.max(0, targetBalance),
        tradingDays,
        lossDaysPerWeek,
        Math.max(0, maxDailyLossPercent)
      ).goalPctDecimal > 0;
    return {
      0: [
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
          id: "target_date",
          label: L("Pick a target date", "Elige fecha meta"),
          done: !!targetDateStr,
          anchor: "gp-target-date",
        },
        {
          id: "trading_days",
          label: L("Set your trading days", "Define tus días de trading"),
          done: tradingDays > 0,
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
          label: L("Describe how you will journal", "Describe cómo llevarás el journal"),
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
    targetDateStr,
    tradingDays,
    maxDailyLossPercent,
    riskPerTradePct,
    lossDaysPerWeekStr,
    autoPhasesGenerated,
    tradingSystemCount,
    analysisStylesCount,
    stepsData.analysis,
    journalNotesLen,
    systemDoCount,
    systemDontCount,
    strategyCount,
    nonNegotiableCount,
    committed,
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
    if (!targetDateStr) {
      setError(L("Pick a target date to build auto phases.", "Elige una fecha meta para crear fases automáticas."));
      return;
    }
    if (maxDailyLossPercent <= 0) {
      setError(L("Set max daily loss first.", "Define la pérdida diaria máx primero."));
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

    (async () => {
      if (loading || !user || accountsLoading || !activeAccountId) return;
      try {
        const existing = await getGrowthPlanSupabaseByAccount(activeAccountId);
        if (!mounted) return;

        if (existing) {
          setHasExistingPlan(true);

          setStartingBalanceStr(String(existing.startingBalance ?? 5000));
          setTargetBalanceStr(String(existing.targetBalance ?? 60000));
          setTargetDateStr(
            String((existing as any).targetDate ?? (existing as any).target_date ?? "").slice(0, 10)
          );
          setMaxDailyLossPercentStr(String(existing.maxDailyLossPercent ?? 1));
          setTradingDaysStr(String(existing.tradingDays ?? 60));
          setLossDaysPerWeekStr(String(existing.lossDaysPerWeek ?? 0));

          setRiskPerTradePctStr(String(existing.maxRiskPerTradePercent ?? 2));

          setCommitted(false);

          setStepsData(existing.steps ?? getDefaultSteps());
          setRules(existing.rules && existing.rules.length ? existing.rules : getDefaultSuggestedRules());

          setLoadedStartingBalance(Number(existing.startingBalance ?? 0));
          setPlanStartDate(
            String((existing as any).planStartDate ?? (existing as any).plan_start_date ?? (existing as any).createdAt ?? (existing as any).created_at ?? "")
              .slice(0, 10) || null
          );
          setPlannedWithdrawals(
            Array.isArray((existing as any).plannedWithdrawals)
              ? (existing as any).plannedWithdrawals
              : Array.isArray((existing as any).planned_withdrawals)
                ? (existing as any).planned_withdrawals
                : []
          );
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

          // ✅ Neuro language from Supabase (stored inside plan to keep "everything in Supabase")
          // We store it in stepsData._ui.lang (does not require schema changes)
          const anySteps = (existing.steps as any) || {};
          const savedLang = (anySteps?._ui?.lang as AssistantLang | undefined) ?? "en";
          setAssistantLang(savedLang);
          setAutoPhasesGenerated(true);

          const t =
            (await neuroReact("growth_plan_loaded", savedLang, {
              hasExistingPlan: true,
              step: stepTitles[0],
            })) ||
            L(
              "Loaded your Growth Plan. We'll go step-by-step: Goal & Numbers → Prepare → Analysis → Journal → Strategy & Rules.",
              "Cargamos tu plan. Vamos paso a paso: Meta y números → Preparación → Análisis → Journal → Estrategia y reglas."
            );
          pushNeuroMessage(t);
        } else {
          // new plan
          setHasExistingPlan(false);
          setStartingBalanceStr("");
          setTargetBalanceStr("");
          setTargetDateStr("");
          setMaxDailyLossPercentStr("");
          setTradingDaysStr("");
          setTradingDaysTouched(false);
          setLossDaysPerWeekStr("");
          setRiskPerTradePctStr("");
          setLoadedStartingBalance(null);
          setCashflowNet(0);
          setPlanStartDate(isoToday());
          setPlannedWithdrawals([]);
          setPlanPhases([]);
          setAutoPhasesGenerated(false);

          const t =
            (await neuroReact("growth_plan_loaded", assistantLang, {
              hasExistingPlan: false,
              step: stepTitles[0],
            })) ||
            L(
              "Welcome. Start by entering your account numbers and risk rules. Then we build your trading process step-by-step.",
              "Bienvenido. Empieza ingresando tus números de cuenta y reglas de riesgo. Luego construimos tu proceso paso a paso."
            );
          pushNeuroMessage(t);
                  }
      } catch (e) {
        console.error("[GrowthPlan] load error", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loading, user, accountsLoading, activeAccountId]); // intentionally not depending on assistantLang to avoid reloading loop

  // save assistant language to Supabase (inside steps._ui.lang)
  const langSaveTimer = useRef<any>(null);
  async function persistAssistantLang(nextLang: AssistantLang) {
    // merge into stepsData without breaking types
    const mergedSteps: any = { ...(stepsData as any) };
    mergedSteps._ui = { ...(mergedSteps._ui ?? {}), lang: nextLang };

    setStepsData(mergedSteps);

    // debounce to avoid spamming writes
    if (langSaveTimer.current) clearTimeout(langSaveTimer.current);
    langSaveTimer.current = setTimeout(async () => {
      try {
        await upsertGrowthPlanSupabase(
          {
            steps: mergedSteps,
          } as any,
          activeAccountId
        );
      } catch (e) {
        console.error("[GrowthPlan] persistAssistantLang error", e);
      }
    }, 500);
  }

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
        (await neuroReact("risk_too_high", assistantLang, {
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
  }, [riskPerTradePct, riskUsd, baseBalanceForDollars, user, assistantLang]);

  // Field help throttle (so Neuro doesn’t spam)
  const lastFieldHelpRef = useRef<Record<string, number>>({});
  async function fieldHelp(field: string, extra?: any) {
    const now = Date.now();
    const last = lastFieldHelpRef.current[field] ?? 0;
    if (now - last < 8000) return; // per-field throttle
    lastFieldHelpRef.current[field] = now;

    const text = await neuroReact("field_help", assistantLang, { field, ...extra });
    if (text) {
      pushNeuroMessage(text);
          }
  }

  const explainRequired = useMemo(() => {
    const calc = computeRequiredGoalPct(
      Math.max(0, startingBalance),
      Math.max(0, targetBalance),
      tradingDays,
      lossDaysPerWeek,
      Math.max(0, maxDailyLossPercent)
    );
    return {
      goalDays: calc.goalDays,
      totalLossDays: calc.totalLossDays,
      prodLoss: calc.lossMultipliersProduct,
      goalPct: calc.goalPctDecimal * 100,
    };
  }, [startingBalance, targetBalance, tradingDays, lossDaysPerWeek, maxDailyLossPercent]);

  const { rows: suggestedRows, requiredGoalPct } = useMemo(
    () =>
      buildBalancedPlanSuggested(
        Math.max(0, startingBalance),
        Math.max(0, targetBalance),
        tradingDays,
        lossDaysPerWeek,
        Math.max(0, maxDailyLossPercent)
      ),
    [startingBalance, targetBalance, tradingDays, lossDaysPerWeek, maxDailyLossPercent]
  );

  const maxLossDollar =
    baseBalanceForDollars > 0 ? (baseBalanceForDollars * (maxDailyLossPercent || 0)) / 100 : 0;
  const requiredGoalDollar =
    baseBalanceForDollars > 0 ? (baseBalanceForDollars * (requiredGoalPct || 0)) / 100 : 0;

  const autoPhases = useMemo(() => {
    if (!autoPhasesGenerated) return [];
    if (!targetDateStr) return [];
    if (startingBalance <= 0 || targetBalance <= 0) return [];
    const startIso = planStartDate || isoToday();
    return buildWeeklyMilestonesFromMonthlyGoals(
      startingBalance,
      targetBalance,
      startIso,
      targetDateStr,
      lossDaysPerWeek,
      Math.max(0, maxDailyLossPercent)
    );
  }, [
    autoPhasesGenerated,
    targetDateStr,
    startingBalance,
    targetBalance,
    planStartDate,
    lossDaysPerWeek,
    maxDailyLossPercent,
  ]);

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
    profit: number;
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
      const monthLabel = phase.monthLabel ?? "";
      const weekIndex = phase.weekIndex ?? 0;
      const existing = map.get(idx);
      if (!existing) {
        map.set(idx, {
          monthIndex: idx,
          monthLabel,
          startBalance,
          endBalance,
          profit: endBalance - startBalance,
          endDate: phase.targetDate ?? null,
          maxWeek: weekIndex,
        });
        continue;
      }
      if (weekIndex >= existing.maxWeek) {
        existing.endBalance = endBalance;
        existing.profit = endBalance - existing.startBalance;
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
    profit: number;
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
        profit: endBalance - startBalance,
        endDate: end.endDate,
      });
    }
    return out;
  }, [monthSummaries, lang]);

  const tradingDaysFromToday = useMemo(() => {
    if (!targetDateStr) return null;
    const today = isoToday();
    const count = computeTradingDaysBetween(today, targetDateStr);
    if (!Number.isFinite(count) || count <= 0) return null;
    return { today, count };
  }, [targetDateStr]);

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
        maxDailyLossPercent,
        lossDaysPerWeek,
        requiredGoalPct,
        explainRequired: {
          goalDays: explainRequired.goalDays,
          totalLossDays: explainRequired.totalLossDays,
          prodLoss: explainRequired.prodLoss,
        },
      },
      lang
    );

    const text =
      (await neuroReact("pdf_downloaded", assistantLang, { mode: "suggested" })) ||
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
    !!targetDateStr &&
    maxDailyLossPercent > 0 &&
    lossDaysSet;

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
      id: "plan_mode",
      anchor: "gp-plan-mode",
      title: L("Plan mode", "Modo del plan"),
      description: L(
        "This plan is always automatic (date-based) to keep your pace realistic.",
        "Este plan es automático (por fecha) para mantener un ritmo realista."
      ),
      isComplete: true,
      content: (
        <div id="gp-plan-mode" className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-sm text-slate-100 font-semibold">
            {L("Automatic (date-based)", "Automático (por fecha)")}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {L(
              "We use your target date to calculate trading days and pacing.",
              "Usamos tu fecha meta para calcular días de trading y el ritmo."
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
              setStartingBalanceStr(onlyNum(e.target.value));
              setAutoPhasesGenerated(false);
            }}
            onBlur={() => {
              if (!startingBalanceStr.trim()) return;
              setStartingBalanceStr(String(Math.max(0, startingBalance)));
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
              setTargetBalanceStr(onlyNum(e.target.value));
              setAutoPhasesGenerated(false);
            }}
            onBlur={() => {
              if (!targetBalanceStr.trim()) return;
              setTargetBalanceStr(String(Math.max(0, targetBalance)));
            }}
            className={inputBase}
            placeholder="0"
          />
        </div>
      ),
    },
    {
      id: "target_date",
      anchor: "gp-target-date",
      title: L("Target date", "Fecha objetivo"),
      description: L(
        "Pick a realistic date you want to reach your target.",
        "Elige una fecha realista en la que quieres llegar a tu meta."
      ),
      isComplete: !!targetDateStr,
      content: (
        <div>
          <label className="block mb-1 text-slate-300">{L("Target date", "Fecha objetivo")}</label>
          <input
            id="gp-target-date"
            type="date"
            value={targetDateStr}
            onChange={(e) => {
              setTargetDateStr(e.target.value);
              setTradingDaysTouched(false);
              setAutoPhasesGenerated(false);
              setPlanStartDate(isoToday());
            }}
            className={inputBase}
          />
        </div>
      ),
    },
    {
      id: "trading_days",
      anchor: "gp-trading-days",
      title: L("Trading days", "Días de trading"),
      description: L(
        "We calculate this from your target date. You can edit it if needed.",
        "Lo calculamos desde tu fecha meta. Puedes editarlo si hace falta."
      ),
      isComplete: tradingDays > 0,
      content: (
        <div>
          <label className="block mb-1 text-slate-300">
            {L("Trading days you commit to follow this plan", "Días de trading que te comprometes a seguir")}
          </label>
          <input
            id="gp-trading-days"
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
          {tradingDaysFromToday ? (
            <p className="text-slate-500 mt-1 text-xs">
              {L(
                `From today (${tradingDaysFromToday.today}) to target: ${tradingDaysFromToday.count} trading days (NYSE holidays excluded).`,
                `Desde hoy (${tradingDaysFromToday.today}) hasta la meta: ${tradingDaysFromToday.count} días de trading (feriados NYSE excluidos).`
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
        "How many losing days you expect per 5 trading days.",
        "Cuántos días de pérdida esperas por cada 5 días de trading."
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
              setLossDaysPerWeekStr(String(clampInt(lossDaysPerWeek, 0, 5)));
            }}
            className={inputBase}
            placeholder="0..5"
          />
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
        <div id="gp-phase-builder" className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] text-slate-500 tracking-widest uppercase">
                {L("Cadence", "Cadencia")}
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
              {L("Based on trading days (NYSE holidays excluded).", "Basado en días de trading (feriados NYSE excluidos).")}
            </span>
          </div>
          {!autoPhasesGenerated ? (
            <p className="mt-3 text-xs text-slate-500">
              {canGeneratePhases
                ? L(
                    "Your milestones are generated automatically once required inputs are set.",
                    "Tus metas se generan automáticamente cuando completas los datos requeridos."
                  )
                : L(
                    "Complete target date + max daily loss + loss days per week first.",
                    "Completa fecha meta + pérdida diaria máx + días de pérdida por semana primero."
                  )}
            </p>
          ) : autoPhases.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              {L(
                "Enter starting balance, target balance, and target date first.",
                "Primero ingresa balance inicial, meta y fecha objetivo."
              )}
            </p>
          ) : (
            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-[12px] text-slate-500">
                {L("First checkpoint", "Primer checkpoint")} · {autoCadenceUnit}{" "}
                {firstMonthMeta?.weekIndex ?? 1}/{firstMonthMeta?.weeksInMonth ?? autoPhases.length}
                {firstMonthMeta?.monthIndex ? (
                  <span className="text-slate-400">
                    {" "}
                    · {L("Month", "Mes")} {firstMonthMeta.monthIndex}
                  </span>
                ) : null}
              </p>
              <p className="text-[18px] text-emerald-300 font-semibold">
                {currency(autoPhases[0].targetEquity)}
              </p>
              {firstMonthMeta?.monthGoal ? (
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Month goal (profit):", "Meta del mes (ganancia):")}{" "}
                  <span className="text-slate-200">{currency(firstMonthMeta.monthGoal)}</span>
                </p>
              ) : null}
              {firstMonthMeta?.weeklyPct ? (
                <p className="text-[11px] text-slate-500">
                  {L("Weekly share:", "Porción semanal:")}{" "}
                  <span className="text-slate-200">
                    {firstMonthMeta.weeklyPct.toFixed(1)}%
                  </span>
                </p>
              ) : null}
              {firstMonthMeta?.weeklyGoal ? (
                <p className="text-[11px] text-slate-500">
                  {L("Weekly goal (profit):", "Meta semanal (ganancia):")}{" "}
                  <span className="text-slate-200">
                    {currency(firstMonthMeta.weeklyGoal)}
                  </span>
                </p>
              ) : null}
              {autoPhases[0].targetDate ? (
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Target date:", "Fecha objetivo:")}{" "}
                  <span className="text-slate-200">{autoPhases[0].targetDate}</span>
                </p>
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
                          {L("Profit", "Ganancia")}: <span>{currency(q.profit)}</span>
                        </p>
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
                  "Milestones follow the minimum % required by your loss rules.",
                  "Las metas siguen el % mínimo requerido según tus reglas de pérdida."
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                {L(
                  "Weekly checkpoints split the monthly goal evenly.",
                  "Los checkpoints semanales dividen la meta mensual en partes iguales."
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

  const scrollToAnchor = (anchor?: string) => {
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
  };

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
      (await neuroReact("wizard_step_next", assistantLang, { to: stepTitles[next] })) ||
      (isEs ? `Siguiente: ${stepTitles[next]}.` : `Next: ${stepTitles[next]}.`);
    pushNeuroMessage(t);
      }

  async function goBack() {
    setError("");
    const prev = (Math.max(0, step - 1) as WizardStep);
    setStep(prev);
    const t =
      (await neuroReact("wizard_step_back", assistantLang, { to: stepTitles[prev] })) ||
      (isEs ? `Volver a: ${stepTitles[prev]}.` : `Back to: ${stepTitles[prev]}.`);
    pushNeuroMessage(t);
      }

  async function onStepClick(s: WizardStep) {
    setStep(s);
    const t =
      (await neuroReact("wizard_step_clicked", assistantLang, { to: stepTitles[s] })) ||
      (isEs ? `Abierto: ${stepTitles[s]}.` : `Opened: ${stepTitles[s]}.`);
    pushNeuroMessage(t);
      }

  const approveEnabled =
    step === 4 &&
    committed &&
    startingBalance > 0 &&
    targetBalance > 0 &&
    !!targetDateStr &&
    tradingDays > 0 &&
    maxDailyLossPercent > 0 &&
    riskPerTradePct > 0 &&
    lossDaysSet &&
    autoPhasesGenerated;

  const handleApproveAndSave = async () => {
    setError("");

    if (
      startingBalance <= 0 ||
      targetBalance <= 0 ||
      !targetDateStr ||
      tradingDays <= 0 ||
      maxDailyLossPercent <= 0 ||
      riskPerTradePct <= 0 ||
      !lossDaysSet ||
      !autoPhasesGenerated
    ) {
      setError(L("Please complete all required fields first.", "Completa todos los campos requeridos primero."));
      return;
    }
    if (!committed) {
      setError(L("Please confirm your commitment before saving.", "Confirma tu compromiso antes de guardar."));
      return;
    }

    if (hasExistingPlan) {
      const confirmed = window.confirm(
        L(
          "Editing your growth plan may reset statistics, balance chart and related analytics. Journal entries will NOT be reset. Continue?",
          "Editar tu plan puede reiniciar estadísticas, balance chart y analíticas relacionadas. El journal NO se reinicia. ¿Continuar?"
        )
      );
      if (!confirmed) return;
    }

    const dailyPctForSave = Math.max(0, requiredGoalPct);
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
            };
          })
        : planPhases;

    // persist assistant lang inside steps._ui.lang (Supabase only)
    const mergedSteps: any = { ...(stepsData as any) };
    mergedSteps._ui = { ...(mergedSteps._ui ?? {}), lang: assistantLang, autoPhaseCadence: "weekly" };

    const effectivePlanStart = planStartDate || isoToday();
    const payload: Partial<GrowthPlan> = {
      startingBalance,
      targetBalance,
      targetDate: targetDateStr || null,
      planMode: "auto",
      targetMultiple: targetMultiple > 0 ? targetMultiple : null,
      planStartDate: effectivePlanStart,
      plannedWithdrawals,
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
      await upsertGrowthPlanSupabase(payload, activeAccountId);
      if (user?.id) {
        void syncMyTrophies(String(user.id)).catch((err) => {
          console.warn("[GrowthPlan] trophy sync failed:", err);
        });
      }

      const msg =
        (await neuroReact("growth_plan_saved", assistantLang, {
          selectedPlan: "suggested",
          riskPct: riskPerTradePct,
          riskUsd,
        })) ||
        L(
          `Saved ✅ Max risk per trade: ${riskPerTradePct.toFixed(2)}% (~${currency(
            riskUsd
          )}). Your AI Coach can now evaluate your execution against this plan.`,
          `Guardado ✅ Riesgo máx por trade: ${riskPerTradePct.toFixed(2)}% (~${currency(
            riskUsd
          )}). El Coach IA ya puede evaluar tu ejecución vs este plan.`
        );

      pushNeuroMessage(msg);

      const coachSummary =
        (await neuroReact("growth_plan_post_save_summary", assistantLang, {
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

      const inboxTitle = L("AI Coaching update", "Actualización de AI Coaching");
      const inboxMessage = coachSummary || msg;
      if (user?.id && inboxMessage) {
        void pushInboxEvent({
          userId: String(user.id),
          title: inboxTitle,
          message: inboxMessage,
          category: "ai_coach",
        });
      }
            router.push("/dashboard");
    } catch (e) {
      console.error("[GrowthPlan] save error", e);
      const msg = String((e as any)?.message ?? "");
      if (msg.includes("plan_mode") || msg.includes("plan_phases") || msg.includes("column") || msg.includes("schema")) {
        setError(
          L(
            "Database schema is missing new Growth Plan fields. Apply the latest migration and try again.",
            "Faltan columnas nuevas del Growth Plan en la base de datos. Aplica la migración más reciente y vuelve a intentar."
          )
        );
      } else {
        setError(
          L(
            "There was a problem saving your growth plan. Please try again.",
            "Hubo un problema guardando tu plan. Intenta de nuevo."
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
    <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-6 py-10">
      <div className="w-full max-w-4xl bg-slate-900/95 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl space-y-6 text-[14px]">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-emerald-400 uppercase tracking-[0.22em] text-[12px]">NEURO TRADER</p>
              <h1 className="text-2xl md:text-3xl font-semibold text-emerald-400">
                {L("Growth Plan Wizard", "Asistente de plan de crecimiento")}
              </h1>
            </div>

            {/* ✅ Neuro language toggle (saved to Supabase inside plan) */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Neuro:</span>
              <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/70 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setAssistantLang("en");
                    persistAssistantLang("en");
                    pushNeuroMessage(L("Neuro language set to EN.", "Idioma de Neuro: EN."));
                                      }}
                  className={`px-3 py-1 rounded-full transition ${
                    assistantLang === "en"
                      ? "bg-emerald-400 text-slate-950 font-semibold"
                      : "text-slate-300 hover:text-slate-50"
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssistantLang("es");
                    persistAssistantLang("es");
                    pushNeuroMessage(L("Neuro language set to ES.", "Idioma de Neuro: ES."));
                                      }}
                  className={`px-3 py-1 rounded-full transition ${
                    assistantLang === "es"
                      ? "bg-emerald-400 text-slate-950 font-semibold"
                      : "text-slate-300 hover:text-slate-50"
                  }`}
                >
                  ES
                </button>
              </div>
            </div>
          </div>

          <p className="text-slate-400 max-w-3xl">
            {L(
              "This turns your plan into a system:",
              "Esto convierte tu plan en un sistema:"
            )}{" "}
            <b>{L("Prepare → Analysis → Journal → Strategy & Rules", "Preparar → Análisis → Journal → Estrategia y reglas")}</b>.{" "}
            {L(
              "Neuro and AI Coach will use this to coach you based on real execution.",
              "Neuro y el Coach IA usarán esto para guiarte según tu ejecución real."
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

        {/* Guided Mode */}
        {guidedMode ? (
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] text-emerald-300 uppercase tracking-[0.28em]">
                  {L("Plan Coach", "Coach del Plan")}
                </p>
                <p className="text-xs text-slate-300">
                  {L(
                    "We’ll guide you step‑by‑step. Complete the items below to unlock the next section.",
                    "Te guío paso a paso. Completa lo siguiente para desbloquear la próxima sección."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGuidedMode(false)}
                className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
              >
                {L("Hide", "Ocultar")}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400 transition"
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
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-emerald-400/60"
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
                className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
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
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
              >
                {L("Back to numbers", "Volver a números")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setGuidedMode(true)}
            className="self-start rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400 hover:border-emerald-400 hover:text-emerald-300"
          >
            {L("Show Plan Coach", "Mostrar Coach del Plan")}
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
              {L("1) Trading System", "1) Sistema de Trading")}
            </p>
            <p className="text-slate-400 text-sm">
              {L(
                "Write your ordered steps and your Do/Don't rules. This becomes your daily system.",
                "Escribe tus pasos en orden y tus reglas de Hacer / No hacer. Esto se convierte en tu sistema diario."
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
                "Select what your analysis is based on. Neuro uses this to flag when you trade outside your identity.",
                "Selecciona en qué basas tu análisis. Neuro usa esto para alertar cuando operas fuera de tu identidad."
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
              {L("3) Journal", "3) Journal")}
            </p>
            <p className="text-slate-400 text-sm">
              {L(
                "Describe how you will journal every session. This becomes your evidence log for discipline.",
                "Describe cómo llevarás el journal en cada sesión. Esto será tu evidencia de disciplina."
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
                "Describe how you will journal: imports, emotions, reasons for entry, rules followed/broken, screenshots, etc.",
                "Describe cómo llevarás el journal: importaciones, emociones, razones de entrada, reglas seguidas/rotas, screenshots, etc."
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
                        "Commitment confirmed ✅. Next step is to Approve & Save your Growth Plan.",
                        "Compromiso confirmado ✅. El siguiente paso es Aprobar y Guardar tu plan."
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
                {L("Approve & Save Growth Plan", "Aprobar y guardar plan")}
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
  );
}
