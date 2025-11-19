"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { saveGrowthPlan, getGrowthPlan, GrowthPlan } from "@/lib/growthPlanLocal";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/* ================= Helpers ================= */
const toNum = (s: string, fb = 0) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : fb;
};
const clampInt = (n: number, lo = 0, hi = Number.MAX_SAFE_INTEGER) =>
  Math.max(lo, Math.min(hi, Math.floor(n)));
const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });
const todayLong = () =>
  new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "2-digit" });

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

  // Ajuste mínimo para cerrar exactamente en target (por redondeo)
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

function buildPlanUsingChosenGoal(
  starting: number,
  totalDays: number,
  lossDaysPerWeek: number,
  lossPct: number,
  chosenGoalPct: number
): { rows: PlanRow[]; finalBalance: number } {
  let bal = starting;
  const rows: PlanRow[] = [];
  const perWeek = clampInt(lossDaysPerWeek, 0, 5);

  for (let d = 1; d <= totalDays; d++) {
    const dayInWeek = (d - 1) % 5;
    const isLoss = perWeek > 0 && dayInWeek < perWeek;
    const pct = isLoss ? -lossPct : chosenGoalPct;
    const expectedUSD = bal * (pct / 100);
    const endBalance = bal + expectedUSD;
    rows.push({ day: d, type: isLoss ? "loss" : "goal", pct, expectedUSD, endBalance });
    bal = endBalance;
  }

  return { rows, finalBalance: bal };
}

async function loadLogoDataURL(src = "/logo.png"): Promise<string | null> {
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
    dailyGoalPercentChosen: number;
    maxDailyLossPercent: number;
    lossDaysPerWeek: number;
    mode: "suggested" | "chosen";
    requiredGoalPct?: number;
    explainRequired?: { goalDays: number; totalLossDays: number; prodLoss: number };
    projectedFinalBalance?: number;
  }
) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const M = 56;

  // Portada
  let y = 48;
  const logo = await loadLogoDataURL("/logo.png");
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, y, 128, 36, undefined, "FAST");
      y += 56;
    } catch {
      y += 8;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  const title =
    meta.mode === "suggested"
      ? "Growth Plan – Suggested (Exact Target)"
      : "Growth Plan – Built with Your Daily Goal";
  doc.text(title, M, y);
  y += 32;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor("#334155");
  doc.text(`Date: ${todayLong()}`, M, y);
  y += 26;

  doc.setTextColor("#0f172a");
  doc.text(`Dear ${meta.name || "User"},`, M, y);
  y += 20;

  const chunks: string[] = [];
  if (meta.mode === "suggested") {
    chunks.push(
      `You start with ${currency(meta.startingBalance)} and want to reach ${currency(
        meta.targetBalance || 0
      )} in ${meta.tradingDays} trading day(s).`
    );
    chunks.push(
      `You selected a daily goal of ${meta.dailyGoalPercentChosen}%, but for the suggested plan we will NOT use your selected daily goal.`
    );
    chunks.push(
      `Instead, we compute the average return needed on goal-days to finish exactly at your target, while loss-days apply your max daily loss (${meta.maxDailyLossPercent}%).`
    );
    if (meta.explainRequired) {
      const { goalDays, totalLossDays, prodLoss } = meta.explainRequired;
      const required = meta.requiredGoalPct ?? 0;
      chunks.push(
        `Weekly pattern assumes ${meta.lossDaysPerWeek} loss day(s) per 5 trading days → ${totalLossDays} loss day(s) and ${goalDays} goal-day(s).`
      );
      chunks.push(
        `Required r satisfies: (1 + r)^G = Target / (Start × Π(1 − L)). With Π(1 − L) ≈ ${prodLoss.toFixed(
          6
        )}, r ≈ ${required.toFixed(3)}% (applied on goal-days only).`
      );
    }
  } else {
    chunks.push(
      `You start with ${currency(meta.startingBalance)} and will trade for ${meta.tradingDays} day(s) using your selected daily goal of ${meta.dailyGoalPercentChosen}%.`
    );
    chunks.push(
      `On loss-days we apply your max daily loss of ${meta.maxDailyLossPercent}%. The weekly pattern places ${meta.lossDaysPerWeek} loss day(s) within each 5-day trading week.`
    );
    if (typeof meta.projectedFinalBalance === "number") {
      chunks.push(
        `Projected ending balance after ${meta.tradingDays} day(s): ${currency(
          meta.projectedFinalBalance
        )}.`
      );
    }
  }
  const paragraph = chunks.join(" ");
  const wrapped = doc.splitTextToSize(paragraph, 612 - M * 2);
  doc.text(wrapped, M, y);
  y += 18 + wrapped.length * 16;

  // Resumen
  const summaryBody: Array<[string, string]> = [
    ["Starting balance", currency(meta.startingBalance)],
    ["Trading days", String(meta.tradingDays)],
    ["Daily goal (selected)", `${meta.dailyGoalPercentChosen}%`],
    ["Max daily loss (%)", `${meta.maxDailyLossPercent}%`],
    ["Loss days per week", String(meta.lossDaysPerWeek)],
  ];
  if (meta.mode === "suggested") {
    summaryBody.splice(1, 0, ["Target balance", currency(meta.targetBalance || 0)]);
    if (typeof meta.requiredGoalPct === "number") {
      summaryBody.push(["Required goal-day %", `${meta.requiredGoalPct.toFixed(3)}%`]);
    }
  } else if (typeof meta.projectedFinalBalance === "number") {
    summaryBody.push(["Projected ending balance", currency(meta.projectedFinalBalance)]);
  }

  autoTable(doc, {
    startY: y + 6,
    margin: { left: M, right: M },
    styles: { fontSize: 12, cellPadding: 6 },
    headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42] },
    body: summaryBody,
    columns: [{ header: "Field" }, { header: "Value" }],
    theme: "grid",
  });

  // Página 2: tabla
  doc.addPage();
  const tableData = rows.map((r) => [
    r.day,
    r.type === "loss" ? "Loss" : "Goal",
    `${r.pct.toFixed(3)}%`,
    currency(r.expectedUSD),
    currency(r.endBalance),
  ]);

  autoTable(doc, {
    margin: { left: M, right: M, top: 56 },
    styles: { fontSize: 12, cellPadding: 6 },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    head: [["Day", "Type", "% applied", "Expected (USD)", "Ending balance (USD)"]],
    body: tableData,
    theme: "grid",
    didDrawPage: () => {
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      const h =
        meta.mode === "suggested"
          ? "Daily Schedule – Suggested Plan (Exact Target)"
          : "Daily Schedule – Plan Using Your Daily Goal";
      doc.text(h, M, 40);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Page ${doc.getNumberOfPages()}`, 612 - M, 792 - 28, { align: "right" });
    },
  });

  const filename =
    meta.mode === "suggested" ? "growth-plan-suggested.pdf" : "growth-plan-chosen-goal.pdf";
  doc.save(filename);
}

/* ================= Page ================= */
export default function GrowthPlanPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // NEW: flag to know if user already had a plan before
  const [hasExistingPlan, setHasExistingPlan] = useState(false);

  // Inputs como string (permite borrar)
  const [startingBalanceStr, setStartingBalanceStr] = useState("5000");
  const [targetBalanceStr, setTargetBalanceStr] = useState("60000");
  const [dailyGoalPercentStr, setDailyGoalPercentStr] = useState("1");
  const [maxDailyLossPercentStr, setMaxDailyLossPercentStr] = useState("1");
  const [tradingDaysStr, setTradingDaysStr] = useState("60");
  const [maxOnePercentLossDaysStr, setMaxOnePercentLossDaysStr] = useState("0");
  const [lossDaysPerWeekStr, setLossDaysPerWeekStr] = useState("0");

  const [selectedPlan, setSelectedPlan] = useState<"suggested" | "chosen" | null>(null);
  const [committed, setCommitted] = useState(false);
  const [error, setError] = useState("");

  // Normalizados
  const startingBalance = toNum(startingBalanceStr, 0);
  const targetBalance = toNum(targetBalanceStr, 0);
  const dailyGoalPercentChosen = toNum(dailyGoalPercentStr, 0);
  const maxDailyLossPercent = toNum(maxDailyLossPercentStr, 0);
  const tradingDays = clampInt(toNum(tradingDaysStr, 0), 0);
  const maxOnePercentLossDays = clampInt(toNum(maxOnePercentLossDaysStr, 0), 0);
  const lossDaysPerWeek = clampInt(toNum(lossDaysPerWeekStr, 0), 0, 5);

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  useEffect(() => {
    const existing = getGrowthPlan();
    if (!existing) return;

    // Mark that this user already had a plan before
    setHasExistingPlan(true);

    const start = existing.startingBalance ?? 5000;
    const targ = existing.targetBalance ?? 60000;
    const dailyPct = (existing as any).dailyTargetPct ?? (existing as any).dailyGoalPercent ?? 1;
    const maxLoss = (existing as any).maxDailyLossPercent ?? (existing as any).maxLossPercent ?? 1;
    const days = (existing as any).tradingDays ?? 60;
    const tol1 = (existing as any).maxOnePercentLossDays ?? 0;
    const lossPerW = (existing as any).lossDaysPerWeek ?? 0;

    setStartingBalanceStr(String(start));
    setTargetBalanceStr(String(targ));
    setDailyGoalPercentStr(String(dailyPct));
    setMaxDailyLossPercentStr(String(maxLoss));
    setTradingDaysStr(String(days));
    setMaxOnePercentLossDaysStr(String(tol1));
    setLossDaysPerWeekStr(String(lossPerW));
    setCommitted(false);
    setSelectedPlan(null);
  }, []);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">Loading your plan...</p>
      </main>
    );
  }

  // Cálculos sugeridos / elegidos
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

  const { rows: chosenRows, finalBalance: chosenFinalBalance } = useMemo(
    () =>
      buildPlanUsingChosenGoal(
        Math.max(0, startingBalance),
        tradingDays,
        lossDaysPerWeek,
        Math.max(0, maxDailyLossPercent),
        Math.max(0, dailyGoalPercentChosen)
      ),
    [startingBalance, tradingDays, lossDaysPerWeek, maxDailyLossPercent, dailyGoalPercentChosen]
  );

  // Datos preview (métricas generales)
  const totalReturnPct =
    startingBalance > 0 && targetBalance > 0
      ? ((targetBalance - startingBalance) / startingBalance) * 100
      : 0;
  const avgDailyNeeded = tradingDays > 0 ? totalReturnPct / tradingDays : 0;
  const dailyGoalDollar =
    startingBalance > 0 ? (startingBalance * (dailyGoalPercentChosen || 0)) / 100 : 0;
  const maxLossDollar =
    startingBalance > 0 ? (startingBalance * (maxDailyLossPercent || 0)) / 100 : 0;

  const onlyNum = (s: string) => s.replace(/[^\d.]/g, "");

  // Guardar (respeta el plan seleccionado)
  const handleApproveAndSave = () => {
    setError("");

    if (
      startingBalance <= 0 ||
      targetBalance <= 0 ||
      tradingDays <= 0 ||
      maxDailyLossPercent <= 0
    ) {
      setError("Please complete all fields with valid, positive values before committing.");
      return;
    }
    if (!selectedPlan) {
      setError("Please select which plan you want to approve (Suggested or Your chosen plan).");
      return;
    }
    if (selectedPlan === "chosen" && dailyGoalPercentChosen <= 0) {
      setError("Daily goal (%) must be greater than 0 for your chosen plan.");
      return;
    }
    if (!committed) {
      setError("Please confirm your commitment before saving this growth plan.");
      return;
    }

    // NEW: warning only if the user is EDITING an existing plan
    if (hasExistingPlan) {
      const confirmed = window.confirm(
        "If you edit your growth plan, you will reset statistics, the balance chart and related analytics. Your journal entries will NOT be reset. Do you want to continue?"
      );
      if (!confirmed) {
        return;
      }
    }

    // Si eligió Suggested, usamos el requiredGoalPct; si no, usamos el daily seleccionado.
    const dailyPctForSave =
      selectedPlan === "suggested" ? Math.max(0, requiredGoalPct) : Math.max(0, dailyGoalPercentChosen);

    const plan: Partial<GrowthPlan> & {
      dailyGoalPercent: number;
      dailyTargetPct: number;
      maxDailyLossPercent: number;
      maxOnePercentLossDays: number;
      tradingDays: number;
      createdAt: string;
      lossDaysPerWeek?: number;
      selectedPlan?: "suggested" | "chosen";
    } = {
      startingBalance,
      targetBalance,
      dailyGoalPercent: dailyPctForSave,
      dailyTargetPct: dailyPctForSave,
      maxDailyLossPercent,
      tradingDays,
      maxOnePercentLossDays,
      createdAt: new Date().toISOString(),
      lossDaysPerWeek,
      selectedPlan,
    };

    saveGrowthPlan(plan as GrowthPlan);
    router.push("/dashboard");
  };

  // PDFs
  const onDownloadPdfSuggested = async () => {
    await generateAndDownloadPDF(suggestedRows, {
      mode: "suggested",
      name: user?.name || "User",
      startingBalance,
      targetBalance,
      tradingDays,
      dailyGoalPercentChosen,
      maxDailyLossPercent,
      lossDaysPerWeek,
      requiredGoalPct,
      explainRequired: {
        goalDays: explainRequired.goalDays,
        totalLossDays: explainRequired.totalLossDays,
        prodLoss: explainRequired.prodLoss,
      },
    });
  };
  const onDownloadPdfChosen = async () => {
    await generateAndDownloadPDF(chosenRows, {
      mode: "chosen",
      name: user?.name || "User",
      startingBalance,
      tradingDays,
      dailyGoalPercentChosen,
      maxDailyLossPercent,
      lossDaysPerWeek,
      projectedFinalBalance: chosenFinalBalance,
    });
  };

  const approveEnabled =
    !!selectedPlan &&
    committed &&
    startingBalance > 0 &&
    targetBalance > 0 &&
    tradingDays > 0 &&
    maxDailyLossPercent > 0 &&
    (selectedPlan === "suggested" || dailyGoalPercentChosen > 0);

  /* ================= UI ================= */
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-6 py-10">
      <div className="w-full max-w-3xl bg-slate-900/95 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl space-y-6 text-[14px]">
        {/* Header */}
        <div className="space-y-2">
          <p className="text-emerald-400 uppercase tracking-[0.22em] text-[12px]">
            Growth plan setup
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-emerald-400">
            Design your account growth commitment
          </h1>
          <p className="text-slate-400 max-w-2xl">
            Choose between our <b>Suggested plan (Exact Target)</b> or <b>Your chosen daily goal</b>.
            You can download a PDF for each option and then approve one.
          </p>
        </div>

        {/* Formulario */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block mb-1 text-slate-300">Starting balance (USD)</label>
            <input
              inputMode="decimal"
              value={startingBalanceStr}
              onChange={(e) => setStartingBalanceStr(onlyNum(e.target.value))}
              onBlur={() => setStartingBalanceStr(String(Math.max(0, startingBalance)))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block mb-1 text-slate-300">Target balance (USD)</label>
            <input
              inputMode="decimal"
              value={targetBalanceStr}
              onChange={(e) => setTargetBalanceStr(onlyNum(e.target.value))}
              onBlur={() => setTargetBalanceStr(String(Math.max(0, targetBalance)))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block mb-1 text-slate-300">Daily goal (%)</label>
            <input
              inputMode="decimal"
              value={dailyGoalPercentStr}
              onChange={(e) => setDailyGoalPercentStr(onlyNum(e.target.value))}
              onBlur={() => setDailyGoalPercentStr(String(Math.max(0, dailyGoalPercentChosen)))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="0.00"
            />
            <p className="text-slate-500 mt-1">
              Suggested plan ignores this and uses the computed goal-day % to hit your target.
            </p>
          </div>

          <div>
            <label className="block mb-1 text-slate-300">Max daily loss (%)</label>
            <input
              inputMode="decimal"
              value={maxDailyLossPercentStr}
              onChange={(e) => setMaxDailyLossPercentStr(onlyNum(e.target.value))}
              onBlur={() => setMaxDailyLossPercentStr(String(Math.max(0, maxDailyLossPercent)))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block mb-1 text-slate-300">Trading days you commit to follow this plan</label>
            <input
              inputMode="numeric"
              value={tradingDaysStr}
              onChange={(e) => setTradingDaysStr(onlyNum(e.target.value))}
              onBlur={() => setTradingDaysStr(String(clampInt(tradingDays, 0)))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block mb-1 text-slate-300">Loss days per week (preview)</label>
            <input
              inputMode="numeric"
              value={lossDaysPerWeekStr}
              onChange={(e) => setLossDaysPerWeekStr(onlyNum(e.target.value))}
              onBlur={() => setLossDaysPerWeekStr(String(clampInt(lossDaysPerWeek, 0, 5)))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="0..5"
            />
            <p className="text-slate-500 mt-1">Distributed across each 5-day trading week.</p>
          </div>

          <div className="md:col-span-2">
            <label className="block mb-1 text-slate-300">
              How many days can you lose -1% before reviewing? (optional)
            </label>
            <input
              inputMode="numeric"
              value={maxOnePercentLossDaysStr}
              onChange={(e) => setMaxOnePercentLossDaysStr(onlyNum(e.target.value))}
              onBlur={() => setMaxOnePercentLossDaysStr(String(clampInt(maxOnePercentLossDays, 0)))}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="0"
            />
          </div>
        </div>

        {/* ==== PREVIEW 1: Suggested ==== */}
        <div className="mt-2 bg-slate-950/80 border border-emerald-500/15 rounded-2xl p-4 space-y-3 relative">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-emerald-300">
              Preview of your commitment — Suggested plan
            </p>
            <label className="flex items-center gap-2 text-emerald-300 cursor-pointer">
              <input
                type="radio"
                name="plan-select"
                checked={selectedPlan === "suggested"}
                onChange={() => setSelectedPlan("suggested")}
                className="h-4 w-4 accent-emerald-400"
              />
              Select this plan
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <tbody>
                <tr className="border-b border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-400">Starting balance</td>
                  <td className="py-1.5 text-slate-100">{currency(startingBalance)}</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-400">Target balance</td>
                  <td className="py-1.5 text-emerald-400 font-semibold">
                    {currency(targetBalance)}
                  </td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-400">Avg. return needed per day</td>
                  <td className="py-1.5 text-slate-100">
                    {tradingDays > 0
                      ? `${(((targetBalance - startingBalance) / startingBalance / tradingDays) * 100).toFixed(3)}%`
                      : "—"}
                  </td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-400">Loss days per week (preview)</td>
                  <td className="py-1.5 text-slate-100">{lossDaysPerWeek}</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-400">Required goal-day % (to reach target)</td>
                  <td className="py-1.5 text-slate-100">
                    {Number.isFinite(explainRequired.goalPct)
                      ? `${explainRequired.goalPct.toFixed(3)}%`
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <button
            onClick={onDownloadPdfSuggested}
            className="px-4 py-2 rounded-xl border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 transition"
          >
            Download Suggested Plan (PDF)
          </button>
        </div>

        {/* ==== PREVIEW 2: Chosen ==== */}
        <div className="mt-2 bg-slate-950/80 border border-sky-500/20 rounded-2xl p-4 space-y-3 relative">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sky-300">
              Preview of your commitment — Your chosen plan
            </p>
            <label className="flex items-center gap-2 text-sky-300 cursor-pointer">
              <input
                type="radio"
                name="plan-select"
                checked={selectedPlan === "chosen"}
                onChange={() => setSelectedPlan("chosen")}
                className="h-4 w-4 accent-sky-400"
              />
              Select this plan
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <tbody>
                <tr className="border-b border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-400">Starting balance</td>
                  <td className="py-1.5 text-slate-100">{currency(startingBalance)}</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-400">Daily goal (chosen)</td>
                  <td className="py-1.5 text-emerald-300">
                    {dailyGoalPercentChosen || 0}% ({currency(dailyGoalDollar)})
                  </td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-400">Max daily loss (chosen)</td>
                  <td className="py-1.5 text-sky-300">
                    {maxDailyLossPercent || 0}% ({currency(maxLossDollar)})
                  </td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-400">Loss days per week (preview)</td>
                  <td className="py-1.5 text-slate-100">{lossDaysPerWeek}</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-1.5 pr-3 text-slate-400">Projected ending balance</td>
                  <td className="py-1.5 text-slate-100">
                    {currency(chosenFinalBalance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <button
            onClick={onDownloadPdfChosen}
            className="px-4 py-2 rounded-xl border border-sky-400 text-sky-300 hover:bg-sky-400/10 transition"
          >
            Download Plan Using Your Daily Goal (PDF)
          </button>
        </div>

        {/* Acciones finales */}
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            onClick={handleApproveAndSave}
            disabled={!approveEnabled}
            className={`px-5 py-2 rounded-xl font-semibold transition ${
              approveEnabled
                ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
          >
            Approve & save selected plan
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:border-emerald-400 hover:text-emerald-300 transition"
          >
            Cancel
          </button>
        </div>

        <label className="flex items-start gap-2 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={committed}
            onChange={(e) => {
              setCommitted(e.target.checked);
              setError("");
            }}
            className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-900"
          />
          <span>
            I understand this is a commitment to my process, not a guarantee of profits. I agree to
            follow this plan with discipline.
          </span>
        </label>
        {error && <p className="text-red-400">{error}</p>}
      </div>
    </main>
  );
}
