import { getGrowthPlan } from "@/lib/growthPlanLocal";
import { getAllJournalEntries, JournalEntry } from "@/lib/journalLocal";

export type AdherenceStats = {
  total: number;
  followed: number;
  ratePct: number;
};

export function loadPlanAndEntries() {
  const plan = getGrowthPlan();
  const entries = getAllJournalEntries();
  let used = entries;
  if (plan?.createdAt) {
    const since = plan.createdAt.slice(0, 10);
    used = entries.filter(e => e.date >= since);
  }
  return { plan, entries: used };
}

export function calcBalanceSeries() {
  const { plan, entries } = loadPlanAndEntries();
  const starting = plan?.startingBalance ?? 0;

  // Orden por fecha
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let bal = starting;

  const series = sorted.map(e => {
    bal += (e.pnl || 0);
    return { date: e.date, balance: Math.max(0, bal) };
  });

  return { series, starting };
}

export function calcAdherence(entries: JournalEntry[]): AdherenceStats {
  // Usamos la casilla tipo checkbox del journal: e.followedPlan === true
  const total = entries.length;
  const followed = entries.filter(e => (e as any).followedPlan === true).length;
  const ratePct = total > 0 ? (followed / total) * 100 : 0;
  return { total, followed, ratePct };
}

export function buildForecastTable() {
  const { plan, entries } = loadPlanAndEntries();
  const dailyPct = Number((plan as any)?.dailyTargetPct ?? (plan as any)?.dailyGoalPercent ?? 0) || 0;
  const start = plan?.startingBalance ?? 0;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  let sod = start; // start-of-day
  const rows = sorted.map(e => {
    const expected = dailyPct > 0 ? sod * (dailyPct / 100) : 0;
    const realized = e.pnl || 0;
    const delta = realized - expected;
    const eod = sod + realized;
    const out = {
      date: e.date,
      startOfDay: sod,
      expected,
      realized,
      delta,
      endOfDay: eod,
    };
    sod = eod;
    return out;
  });

  return { rows, dailyPct, startingBalance: start };
}

export function computeQuickAIAdvice(entries: JournalEntry[], maxDailyLossPct?: number) {
  const n = entries.length;
  const wins = entries.filter(e => (e.pnl||0) > 0);
  const losses = entries.filter(e => (e.pnl||0) < 0);
  const winRate = n ? (wins.length / n) * 100 : 0;
  const avgWin = wins.length ? wins.reduce((s,e)=>s+(e.pnl||0),0)/wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,e)=>s+(e.pnl||0),0)/losses.length) : 0;
  const rMultiple = avgLoss > 0 ? avgWin/avgLoss : 0;

  const notes: string[] = [];
  if (winRate < 40 && rMultiple < 1.2) notes.push("Tu relación recompensa/riesgo efectiva es baja. Prioriza set-ups con salida parcial y trailing para ampliar el tamaño de tus ganancias.");
  if (avgLoss > avgWin) notes.push("Tus pérdidas promedio superan tus ganancias. Revisa la disciplina de stop y considera reducir tamaño hasta recuperar consistencia.");
  if (typeof maxDailyLossPct === "number" && maxDailyLossPct > 0) {
    const breaches = entries.filter(e => Math.abs(e.pnl||0) > 0).length; // placeholder si luego agregas flag de breach
    // (Puedes sustituir por un campo e.brokeMaxLoss === true)
    if (breaches > 0) notes.push("Registra y respeta el Max Daily Loss. Si tocas el límite, cierra pantalla y pasa a revisión, no a recuperación.");
  }
  if (rMultiple >= 1.5 && winRate >= 40) notes.push("Base sólida: protege tu edge evitando sobre-operar en días de baja calidad.");

  if (!notes.length) notes.push("Mantén el enfoque en calidad de entradas y consistencia de ejecución. Documenta tu 'why' antes de cada trade.");

  return { winRate, avgWin, avgLoss, rMultiple, notes };
}
