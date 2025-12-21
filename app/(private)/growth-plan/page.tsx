"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  calcRiskUsd,
  getDefaultSteps,
  getDefaultSuggestedRules,
  type GrowthPlan,
  type GrowthPlanRule,
  type GrowthPlanSteps,
  type GrowthPlanChecklistItem,
  type GrowthPlanStrategy,
  getGrowthPlanSupabase,
  upsertGrowthPlanSupabase,
} from "@/lib/growthPlanSupabase";

import { pushNeuroMessage, openNeuroPanel } from "@/app/components/neuroEventBus";

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
      `This suggested plan computes the average goal-day return needed to finish exactly at your target, while loss-days apply your max daily loss (${meta.maxDailyLossPercent}%).`
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
      `You start with ${currency(meta.startingBalance)} and trade for ${meta.tradingDays} day(s) using your selected daily goal of ${meta.dailyGoalPercentChosen}%.`
    );
    chunks.push(
      `On loss-days we apply your max daily loss of ${meta.maxDailyLossPercent}%. Weekly pattern places ${meta.lossDaysPerWeek} loss day(s) within each 5-day trading week.`
    );
    if (typeof meta.projectedFinalBalance === "number") {
      chunks.push(`Projected ending balance: ${currency(meta.projectedFinalBalance)}.`);
    }
  }

  const paragraph = chunks.join(" ");
  const wrapped = doc.splitTextToSize(paragraph, 612 - M * 2);
  doc.text(wrapped, M, y);
  y += 18 + wrapped.length * 16;

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

/* ================= Neuro Reaction =================
   - We use /api/neuro-reaction for:
     1) "field_help" (short explanations for each field)
     2) coaching nudges (risk too high, saved plan, etc.)
*/
async function neuroReact(event: string, lang: "en" | "es", data: any) {
  try {
    const res = await fetch("/api/neuro-assistant/neuro-reaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

/* ================= Wizard ================= */
type WizardStep = 0 | 1 | 2 | 3 | 4;

const STEP_ORDER: WizardStep[] = [0, 1, 2, 3, 4];

const STEP_TITLES: Record<WizardStep, string> = {
  0: "Meta & Numbers",
  1: "Prepare",
  2: "Analysis",
  3: "Strategy",
  4: "Journal & Commit",
};

type AssistantLang = "en" | "es"; // stored in Supabase (inside growth plan record)

export default function GrowthPlanPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<WizardStep>(0);
  const [error, setError] = useState("");
  const [hasExistingPlan, setHasExistingPlan] = useState(false);

  // IMPORTANT: page UI is English by requirement.
  // Neuro language toggle must be stored in Supabase.
  const [assistantLang, setAssistantLang] = useState<AssistantLang>("en");

  // Strings for inputs
  const [startingBalanceStr, setStartingBalanceStr] = useState("5000");
  const [targetBalanceStr, setTargetBalanceStr] = useState("60000");
  const [dailyGoalPercentStr, setDailyGoalPercentStr] = useState("1");
  const [maxDailyLossPercentStr, setMaxDailyLossPercentStr] = useState("1");
  const [tradingDaysStr, setTradingDaysStr] = useState("60");
  const [maxOnePercentLossDaysStr, setMaxOnePercentLossDaysStr] = useState("0");
  const [lossDaysPerWeekStr, setLossDaysPerWeekStr] = useState("0");

  // Risk
  const [riskPerTradePctStr, setRiskPerTradePctStr] = useState("2");

  // Plan selection + commit
  const [selectedPlan, setSelectedPlan] = useState<"suggested" | "chosen" | null>(null);
  const [committed, setCommitted] = useState(false);

  // Steps + rules
  const [stepsData, setStepsData] = useState<GrowthPlanSteps>(() => getDefaultSteps());
  const [rules, setRules] = useState<GrowthPlanRule[]>(() => getDefaultSuggestedRules());
  const [newRuleText, setNewRuleText] = useState("");

  // normalized numbers
  const startingBalance = toNum(startingBalanceStr, 0);
  const targetBalance = toNum(targetBalanceStr, 0);
  const dailyGoalPercentChosen = toNum(dailyGoalPercentStr, 0);
  const maxDailyLossPercent = toNum(maxDailyLossPercentStr, 0);
  const tradingDays = clampInt(toNum(tradingDaysStr, 0), 0);
  const maxOnePercentLossDays = clampInt(toNum(maxOnePercentLossDaysStr, 0), 0);
  const lossDaysPerWeek = clampInt(toNum(lossDaysPerWeekStr, 0), 0, 5);
  const riskPerTradePct = Math.max(0, toNum(riskPerTradePctStr, 0));

  const riskUsd = useMemo(() => calcRiskUsd(startingBalance, riskPerTradePct), [startingBalance, riskPerTradePct]);

  const onlyNum = (s: string) => s.replace(/[^\d.]/g, "");

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  // load existing plan from Supabase
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (loading || !user) return;
      try {
        const existing = await getGrowthPlanSupabase();
        if (!mounted) return;

        if (existing) {
          setHasExistingPlan(true);

          setStartingBalanceStr(String(existing.startingBalance ?? 5000));
          setTargetBalanceStr(String(existing.targetBalance ?? 60000));

          const dailyPct = (existing.dailyTargetPct ?? existing.dailyGoalPercent ?? 1) as number;
          setDailyGoalPercentStr(String(dailyPct));

          setMaxDailyLossPercentStr(String(existing.maxDailyLossPercent ?? 1));
          setTradingDaysStr(String(existing.tradingDays ?? 60));
          setMaxOnePercentLossDaysStr(String(existing.maxOnePercentLossDays ?? 0));
          setLossDaysPerWeekStr(String(existing.lossDaysPerWeek ?? 0));

          setRiskPerTradePctStr(String(existing.maxRiskPerTradePercent ?? 2));

          setSelectedPlan(existing.selectedPlan ?? null);
          setCommitted(false);

          setStepsData(existing.steps ?? getDefaultSteps());
          setRules(existing.rules && existing.rules.length ? existing.rules : getDefaultSuggestedRules());

          // ✅ Neuro language from Supabase (stored inside plan to keep "everything in Supabase")
          // We store it in stepsData._ui.lang (does not require schema changes)
          const anySteps = (existing.steps as any) || {};
          const savedLang = (anySteps?._ui?.lang as AssistantLang | undefined) ?? "en";
          setAssistantLang(savedLang);

          const t =
            (await neuroReact("growth_plan_loaded", savedLang, {
              hasExistingPlan: true,
              step: STEP_TITLES[0],
            })) ||
            "Loaded your Growth Plan. We'll go step-by-step: Meta & Numbers → Prepare → Analysis → Strategy → Journal & Commit.";
          pushNeuroMessage(t);
          openNeuroPanel();
        } else {
          // new plan
          const t =
            (await neuroReact("growth_plan_loaded", assistantLang, {
              hasExistingPlan: false,
              step: STEP_TITLES[0],
            })) ||
            "Welcome. Start by entering your account numbers and risk rules. Then we build your trading process step-by-step.";
          pushNeuroMessage(t);
          openNeuroPanel();
        }
      } catch (e) {
        console.error("[GrowthPlan] load error", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loading, user]); // intentionally not depending on assistantLang to avoid reloading loop

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
        await upsertGrowthPlanSupabase({
          steps: mergedSteps,
        } as any);
      } catch (e) {
        console.error("[GrowthPlan] persistAssistantLang error", e);
      }
    }, 500);
  }

  // risk coaching (throttled)
  const lastRiskNudgeRef = useRef<number>(0);
  useEffect(() => {
    if (!user) return;
    if (startingBalance <= 0) return;
    if (riskPerTradePct <= 2) return;

    const now = Date.now();
    if (now - lastRiskNudgeRef.current < 12000) return;
    lastRiskNudgeRef.current = now;

    (async () => {
      const text =
        (await neuroReact("risk_too_high", assistantLang, {
          riskPct: riskPerTradePct,
          riskUsd,
          startingBalance,
        })) ||
        `Quick note: you're risking ${riskPerTradePct.toFixed(2)}% per trade (~${currency(
          riskUsd
        )}). If you want 2%, reduce size or trade cheaper contracts.`;
      pushNeuroMessage(text);
      openNeuroPanel();
    })();
  }, [riskPerTradePct, riskUsd, startingBalance, user, assistantLang]);

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
      openNeuroPanel();
    }
  }

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">Loading…</p>
      </main>
    );
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

  const dailyGoalDollar =
    startingBalance > 0 ? (startingBalance * (dailyGoalPercentChosen || 0)) / 100 : 0;
  const maxLossDollar =
    startingBalance > 0 ? (startingBalance * (maxDailyLossPercent || 0)) / 100 : 0;

  // PDF events
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

    const text =
      (await neuroReact("pdf_downloaded", assistantLang, { mode: "suggested" })) ||
      "Downloaded. This schedule is structure—not a promise. Now choose which plan you will approve.";
    pushNeuroMessage(text);
    openNeuroPanel();
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

    const text =
      (await neuroReact("pdf_downloaded", assistantLang, { mode: "chosen" })) ||
      "Downloaded. Great—now your plan is measurable. Focus on executing the process.";
    pushNeuroMessage(text);
    openNeuroPanel();
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
    pushNeuroMessage(`Rule added: "${t}". Clear rules protect you when emotions show up.`);
    openNeuroPanel();
  }

  function updatePrepareChecklist(items: GrowthPlanChecklistItem[]) {
    setStepsData((prev) => ({
      ...prev,
      prepare: { ...(prev.prepare ?? {}), checklist: items },
    }));
  }

  function updateStrategies(strategies: GrowthPlanStrategy[]) {
    setStepsData((prev) => ({
      ...prev,
      strategy: { ...(prev.strategy ?? {}), strategies },
    }));
  }

  const canGoNext = useMemo(() => {
    if (step === 0) {
      return (
        startingBalance > 0 &&
        targetBalance > 0 &&
        tradingDays > 0 &&
        maxDailyLossPercent > 0 &&
        riskPerTradePct > 0
      );
    }
    return true;
  }, [step, startingBalance, targetBalance, tradingDays, maxDailyLossPercent, riskPerTradePct]);

  async function goNext() {
    setError("");
    if (!canGoNext) {
      setError("Complete required fields before continuing.");
      return;
    }
    const next = (Math.min(4, step + 1) as WizardStep);
    setStep(next);
    const t = (await neuroReact("wizard_step_next", assistantLang, { to: STEP_TITLES[next] })) || `Next: ${STEP_TITLES[next]}.`;
    pushNeuroMessage(t);
    openNeuroPanel();
  }

  async function goBack() {
    setError("");
    const prev = (Math.max(0, step - 1) as WizardStep);
    setStep(prev);
    const t = (await neuroReact("wizard_step_back", assistantLang, { to: STEP_TITLES[prev] })) || `Back to: ${STEP_TITLES[prev]}.`;
    pushNeuroMessage(t);
    openNeuroPanel();
  }

  async function onStepClick(s: WizardStep) {
    setStep(s);
    const t = (await neuroReact("wizard_step_clicked", assistantLang, { to: STEP_TITLES[s] })) || `Opened: ${STEP_TITLES[s]}.`;
    pushNeuroMessage(t);
    openNeuroPanel();
  }

  const approveEnabled =
    step === 4 &&
    !!selectedPlan &&
    committed &&
    startingBalance > 0 &&
    targetBalance > 0 &&
    tradingDays > 0 &&
    maxDailyLossPercent > 0 &&
    riskPerTradePct > 0 &&
    (selectedPlan === "suggested" || dailyGoalPercentChosen > 0);

  const handleApproveAndSave = async () => {
    setError("");

    if (
      startingBalance <= 0 ||
      targetBalance <= 0 ||
      tradingDays <= 0 ||
      maxDailyLossPercent <= 0 ||
      riskPerTradePct <= 0
    ) {
      setError("Please enter valid, positive values first.");
      return;
    }
    if (!selectedPlan) {
      setError("Select which plan you want to approve (Suggested or Your chosen plan).");
      return;
    }
    if (selectedPlan === "chosen" && dailyGoalPercentChosen <= 0) {
      setError("Daily goal (%) must be greater than 0 for your chosen plan.");
      return;
    }
    if (!committed) {
      setError("Please confirm your commitment before saving.");
      return;
    }

    if (hasExistingPlan) {
      const confirmed = window.confirm(
        "Editing your growth plan may reset statistics, balance chart and related analytics. Journal entries will NOT be reset. Continue?"
      );
      if (!confirmed) return;
    }

    const dailyPctForSave =
      selectedPlan === "suggested"
        ? Math.max(0, requiredGoalPct)
        : Math.max(0, dailyGoalPercentChosen);

    // persist assistant lang inside steps._ui.lang (Supabase only)
    const mergedSteps: any = { ...(stepsData as any) };
    mergedSteps._ui = { ...(mergedSteps._ui ?? {}), lang: assistantLang };

    const payload: Partial<GrowthPlan> = {
      startingBalance,
      targetBalance,
      dailyGoalPercent: dailyPctForSave,
      dailyTargetPct: dailyPctForSave,
      maxDailyLossPercent,
      tradingDays,
      maxOnePercentLossDays,
      lossDaysPerWeek,
      selectedPlan,
      maxRiskPerTradePercent: riskPerTradePct,
      maxRiskPerTradeUSD: riskUsd,
      steps: mergedSteps,
      rules,
      version: 2,
    };

    try {
      await upsertGrowthPlanSupabase(payload);

      const msg =
        (await neuroReact("growth_plan_saved", assistantLang, {
          selectedPlan,
          riskPct: riskPerTradePct,
          riskUsd,
        })) ||
        `Saved ✅ Max risk per trade: ${riskPerTradePct.toFixed(2)}% (~${currency(
          riskUsd
        )}). Your AI Coach can now evaluate your execution against this plan.`;

      pushNeuroMessage(msg);
      openNeuroPanel();
      router.push("/dashboard");
    } catch (e) {
      console.error("[GrowthPlan] save error", e);
      setError("There was a problem saving your growth plan. Please try again.");
      pushNeuroMessage("Save failed. Please try again in a moment.");
      openNeuroPanel();
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-6 py-10">
      <div className="w-full max-w-4xl bg-slate-900/95 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl space-y-6 text-[14px]">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-emerald-400 uppercase tracking-[0.22em] text-[12px]">NEURO TARDER</p>
              <h1 className="text-2xl md:text-3xl font-semibold text-emerald-400">Growth Plan Wizard</h1>
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
                    pushNeuroMessage("Neuro language set to EN.");
                    openNeuroPanel();
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
                    pushNeuroMessage("Idioma de Neuro: ES.");
                    openNeuroPanel();
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
            This turns your plan into a system: <b>Prepare → Analysis → Strategy → Journal</b>. Neuro and AI Coach will
            use this to coach you based on real execution.
          </p>
        </div>

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
              {idx + 1}. {STEP_TITLES[s]}
            </button>
          ))}
        </div>

        {/* ================= STEP 0 ================= */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-slate-300">Starting balance (USD)</label>
                <input
                  inputMode="decimal"
                  value={startingBalanceStr}
                  onFocus={() => fieldHelp("starting_balance")}
                  onChange={(e) => setStartingBalanceStr(onlyNum(e.target.value))}
                  onBlur={() => setStartingBalanceStr(String(Math.max(0, startingBalance)))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                  placeholder="0"
                />
                <p className="text-slate-500 mt-1">
                  This should match your broker account balance you’re starting from.
                </p>
              </div>

              <div>
                <label className="block mb-1 text-slate-300">Target balance (USD)</label>
                <input
                  inputMode="decimal"
                  value={targetBalanceStr}
                  onFocus={() => fieldHelp("target_balance")}
                  onChange={(e) => setTargetBalanceStr(onlyNum(e.target.value))}
                  onBlur={() => setTargetBalanceStr(String(Math.max(0, targetBalance)))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-300">Trading days you commit to follow this plan</label>
                <input
                  inputMode="numeric"
                  value={tradingDaysStr}
                  onFocus={() => fieldHelp("trading_days")}
                  onChange={(e) => setTradingDaysStr(onlyNum(e.target.value))}
                  onBlur={() => setTradingDaysStr(String(clampInt(tradingDays, 0)))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-300">Max daily loss (%)</label>
                <input
                  inputMode="decimal"
                  value={maxDailyLossPercentStr}
                  onFocus={() => fieldHelp("max_daily_loss")}
                  onChange={(e) => setMaxDailyLossPercentStr(onlyNum(e.target.value))}
                  onBlur={() => setMaxDailyLossPercentStr(String(Math.max(0, maxDailyLossPercent)))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                  placeholder="0.00"
                />
                <p className="text-slate-500 mt-1">
                  Your daily safety brake. When hit, you stop trading for the day.
                </p>
              </div>

              <div>
                <label className="block mb-1 text-slate-300">Loss days per week (preview)</label>
                <input
                  inputMode="numeric"
                  value={lossDaysPerWeekStr}
                  onFocus={() => fieldHelp("loss_days_per_week")}
                  onChange={(e) => setLossDaysPerWeekStr(onlyNum(e.target.value))}
                  onBlur={() => setLossDaysPerWeekStr(String(clampInt(lossDaysPerWeek, 0, 5)))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                  placeholder="0..5"
                />
                <p className="text-slate-500 mt-1">Distributed across each 5-day trading week.</p>
              </div>

              <div>
                <label className="block mb-1 text-slate-300">Daily goal (%) (only if you choose “Your chosen plan”)</label>
                <input
                  inputMode="decimal"
                  value={dailyGoalPercentStr}
                  onFocus={() => fieldHelp("daily_goal_percent")}
                  onChange={(e) => setDailyGoalPercentStr(onlyNum(e.target.value))}
                  onBlur={() => setDailyGoalPercentStr(String(Math.max(0, dailyGoalPercentChosen)))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                  placeholder="0.00"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block mb-1 text-slate-300">Max risk per trade (%) (suggested: 2%)</label>
                <input
                  inputMode="decimal"
                  value={riskPerTradePctStr}
                  onFocus={() => fieldHelp("risk_per_trade")}
                  onChange={(e) => setRiskPerTradePctStr(onlyNum(e.target.value))}
                  onBlur={() => setRiskPerTradePctStr(String(Math.max(0, riskPerTradePct)))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                  placeholder="2"
                />
                <p className="text-slate-400 mt-1">
                  With your starting balance, {riskPerTradePct || 0}% ≈{" "}
                  <b className="text-emerald-300">{currency(riskUsd)}</b> per trade.
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block mb-1 text-slate-300">
                  Max -1% loss days before review (optional)
                </label>
                <input
                  inputMode="numeric"
                  value={maxOnePercentLossDaysStr}
                  onFocus={() => fieldHelp("max_one_percent_loss_days")}
                  onChange={(e) => setMaxOnePercentLossDaysStr(onlyNum(e.target.value))}
                  onBlur={() => setMaxOnePercentLossDaysStr(String(clampInt(maxOnePercentLossDays, 0)))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Plan previews (kept) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-950/80 border border-emerald-500/15 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-emerald-300">Suggested plan (Exact Target)</p>
                  <label className="flex items-center gap-2 text-emerald-300 cursor-pointer">
                    <input
                      type="radio"
                      name="plan-select"
                      checked={selectedPlan === "suggested"}
                      onChange={() => {
                        setSelectedPlan("suggested");
                        pushNeuroMessage("Selected: Suggested plan. This one aims to land exactly on your target.");
                        openNeuroPanel();
                      }}
                      className="h-4 w-4 accent-emerald-400"
                    />
                    Select
                  </label>
                </div>

                <table className="w-full border-collapse">
                  <tbody>
                    <tr className="border-b border-slate-800">
                      <td className="py-1.5 pr-3 text-slate-400">Starting</td>
                      <td className="py-1.5 text-slate-100">{currency(startingBalance)}</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-1.5 pr-3 text-slate-400">Target</td>
                      <td className="py-1.5 text-emerald-400 font-semibold">{currency(targetBalance)}</td>
                    </tr>
                    <tr className="border-t border-slate-800">
                      <td className="py-1.5 pr-3 text-slate-400">Loss days/week</td>
                      <td className="py-1.5 text-slate-100">{lossDaysPerWeek}</td>
                    </tr>
                    <tr className="border-t border-slate-800">
                      <td className="py-1.5 pr-3 text-slate-400">Required goal-day %</td>
                      <td className="py-1.5 text-slate-100">
                        {Number.isFinite(explainRequired.goalPct) ? `${explainRequired.goalPct.toFixed(3)}%` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <button
                  onClick={onDownloadPdfSuggested}
                  className="px-4 py-2 rounded-xl border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 transition"
                >
                  Download PDF (Suggested)
                </button>
              </div>

              <div className="bg-slate-950/80 border border-sky-500/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sky-300">Your chosen plan</p>
                  <label className="flex items-center gap-2 text-sky-300 cursor-pointer">
                    <input
                      type="radio"
                      name="plan-select"
                      checked={selectedPlan === "chosen"}
                      onChange={() => {
                        setSelectedPlan("chosen");
                        pushNeuroMessage("Selected: Your chosen plan. This uses your daily goal percent.");
                        openNeuroPanel();
                      }}
                      className="h-4 w-4 accent-sky-400"
                    />
                    Select
                  </label>
                </div>

                <table className="w-full border-collapse">
                  <tbody>
                    <tr className="border-b border-slate-800">
                      <td className="py-1.5 pr-3 text-slate-400">Starting</td>
                      <td className="py-1.5 text-slate-100">{currency(startingBalance)}</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-1.5 pr-3 text-slate-400">Daily goal</td>
                      <td className="py-1.5 text-emerald-300">
                        {dailyGoalPercentChosen || 0}% ({currency(dailyGoalDollar)})
                      </td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-1.5 pr-3 text-slate-400">Max daily loss</td>
                      <td className="py-1.5 text-sky-300">
                        {maxDailyLossPercent || 0}% ({currency(maxLossDollar)})
                      </td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-1.5 pr-3 text-slate-400">Projected ending</td>
                      <td className="py-1.5 text-slate-100">{currency(chosenFinalBalance)}</td>
                    </tr>
                  </tbody>
                </table>

                <button
                  onClick={onDownloadPdfChosen}
                  className="px-4 py-2 rounded-xl border border-sky-400 text-sky-300 hover:bg-sky-400/10 transition"
                >
                  Download PDF (Chosen)
                </button>
              </div>
            </div>

            {/* Rules */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
              <p className="font-semibold text-slate-100">Rules (Non-negotiables)</p>

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
                            suggested
                          </span>
                        ) : (
                          <span className="text-[10px] ml-2 text-slate-400 border border-slate-700 px-2 py-px rounded-full">
                            custom
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
                  placeholder="Add your own rule (e.g., No revenge trading)"
                />
                <button
                  type="button"
                  onClick={addRule}
                  className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 font-semibold hover:bg-emerald-300 transition"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 1 ================= */}
        {step === 1 && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="font-semibold text-emerald-300">1) Prepare Before Trading</p>
            <p className="text-slate-400 text-sm">
              Build your checklist. AI Coach will compare your execution against this.
            </p>

            <div className="space-y-2">
              {(stepsData.prepare?.checklist ?? []).map((it, idx) => (
                <div key={it.id} className="flex gap-2">
                  <input
                    value={it.text}
                    onFocus={() => fieldHelp("prepare_checklist")}
                    onChange={(e) => {
                      const items = [...(stepsData.prepare?.checklist ?? [])];
                      items[idx] = { ...items[idx], text: e.target.value };
                      updatePrepareChecklist(items);
                    }}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const items = [...(stepsData.prepare?.checklist ?? [])];
                      items.splice(idx, 1);
                      updatePrepareChecklist(items);
                      pushNeuroMessage("Checklist item removed. Keep the list short and actionable.");
                      openNeuroPanel();
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
                items.push({ id: uuid(), text: "New checklist item", isSuggested: false, isActive: true });
                updatePrepareChecklist(items);
                pushNeuroMessage("Added a checklist item. Write it as something you can verify before entering.");
                openNeuroPanel();
              }}
              className="px-4 py-2 rounded-xl border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 transition"
            >
              + Add item
            </button>

            <textarea
              value={stepsData.prepare?.notes ?? ""}
              onFocus={() => fieldHelp("prepare_notes")}
              onChange={(e) =>
                setStepsData((p) => ({ ...p, prepare: { ...(p.prepare ?? {}), notes: e.target.value } }))
              }
              className="w-full mt-3 min-h-[110px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="Optional notes (what invalidates trading today, what you must avoid, etc.)"
            />
          </div>
        )}

        {/* ================= STEP 2 ================= */}
        {step === 2 && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="font-semibold text-emerald-300">2) Analysis</p>
            <p className="text-slate-400 text-sm">
              Select what your analysis is based on. Neuro uses this to flag when you trade outside your identity.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { k: "technical", label: "Technical" },
                { k: "fundamental", label: "Fundamental" },
                { k: "options_flow", label: "Options Flow" },
                { k: "harmonic_patterns", label: "Harmonic patterns" },
                { k: "price_action", label: "Price Action" },
                { k: "market_profile", label: "Market Profile" },
                { k: "order_flow", label: "Order Flow" },
                { k: "other", label: "Other" },
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
              value={stepsData.analysis?.otherStyleText ?? ""}
              onFocus={() => fieldHelp("analysis_other")}
              onChange={(e) =>
                setStepsData((p) => ({ ...p, analysis: { ...(p.analysis ?? {}), otherStyleText: e.target.value } }))
              }
              className="w-full mt-3 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="If you selected 'Other', describe it here…"
            />

            <textarea
              value={stepsData.analysis?.notes ?? ""}
              onFocus={() => fieldHelp("analysis_notes")}
              onChange={(e) =>
                setStepsData((p) => ({ ...p, analysis: { ...(p.analysis ?? {}), notes: e.target.value } }))
              }
              className="w-full mt-3 min-h-[130px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="Describe your analysis process (confirmations, invalidations, what you avoid)."
            />
          </div>
        )}

        {/* ================= STEP 3 ================= */}
        {step === 3 && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="font-semibold text-emerald-300">3) Strategy</p>
            <p className="text-slate-400 text-sm">
              Define your setups with entry/exit/management. The clearer this is, the sharper the coaching.
            </p>

            <div className="space-y-3">
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
                      placeholder="Strategy name"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const arr = [...(stepsData.strategy?.strategies ?? [])];
                        arr.splice(idx, 1);
                        updateStrategies(arr);
                        pushNeuroMessage("Strategy removed. Keep only what you actually trade.");
                        openNeuroPanel();
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-700 text-slate-300 hover:border-red-400/60 hover:text-red-300 transition"
                    >
                      ✕
                    </button>
                  </div>

                  {[
                    ["setup", "Setup / Context"],
                    ["entryRules", "Entry rules (conditions)"],
                    ["exitRules", "Exit rules (TP / SL)"],
                    ["managementRules", "Management (trail, scale, etc.)"],
                    ["invalidation", "Invalidation (when NOT valid)"],
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
                      className="w-full min-h-[72px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
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
                  name: "New Strategy",
                  setup: "",
                  entryRules: "",
                  exitRules: "",
                  managementRules: "",
                  invalidation: "",
                  instruments: [],
                  timeframe: "",
                });
                updateStrategies(arr);
                pushNeuroMessage("Strategy added. Tip: write entries as YES/NO criteria, not vibes.");
                openNeuroPanel();
              }}
              className="px-4 py-2 rounded-xl border border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 transition"
            >
              + Add strategy
            </button>

            <textarea
              value={stepsData.strategy?.notes ?? ""}
              onFocus={() => fieldHelp("strategy_notes")}
              onChange={(e) =>
                setStepsData((p) => ({ ...p, strategy: { ...(p.strategy ?? {}), notes: e.target.value } }))
              }
              className="w-full mt-3 min-h-[130px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="General strategy notes (when to stop, what to avoid, etc.)"
            />
          </div>
        )}

        {/* ================= STEP 4 ================= */}
        {step === 4 && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="font-semibold text-emerald-300">4) Journal & Commit</p>
            <p className="text-slate-400 text-sm">
              AI Coach will compare your journal execution against this plan (imports, emotions, rules, screenshots).
            </p>

            <textarea
              value={stepsData.execution_and_journal?.notes ?? ""}
              onFocus={() => fieldHelp("journal_notes")}
              onChange={(e) =>
                setStepsData((p) => ({
                  ...p,
                  execution_and_journal: { ...(p.execution_and_journal ?? {}), notes: e.target.value },
                }))
              }
              className="w-full mt-2 min-h-[150px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:border-emerald-400 outline-none"
              placeholder="Describe how you will journal: imports, emotions, reasons for entry, rules followed/broken, screenshots, etc."
            />

            <label className="flex items-start gap-2 text-slate-300 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={committed}
                onChange={(e) => {
                  setCommitted(e.target.checked);
                  setError("");
                  fieldHelp("commitment");
                  if (e.target.checked) {
                    pushNeuroMessage("Commitment confirmed ✅. Next step is to Approve & Save your Growth Plan.");
                    openNeuroPanel();
                  }
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-900 accent-emerald-400"
              />
              <span>
                I understand this is a commitment to process, not a guarantee of profits. I agree to follow this plan
                with discipline.
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
                Approve & Save Growth Plan
              </button>

              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                Cancel
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
            Back
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
            Next
          </button>
        </div>
      </div>
    </main>
  );
}
