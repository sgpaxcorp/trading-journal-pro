// app/challenges/[id]/page.tsx
"use client";

import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

import {
  CHALLENGES,
  type ChallengeDefinition,
  type ChallengeProgress,
  type ChallengeDayLog,
  getChallengeProgress,
  listChallengeRuns,
  listChallengeDayLogs,
  startChallenge,
  logChallengeDay,
} from "@/lib/challengesSupabase";

import {
  getProfileGamification,
  type ProfileGamification,
} from "@/lib/profileGamificationSupabase";

type RouteParams = {
  id: string;
};

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function statusLabel(status: string | null | undefined, L: (en: string, es: string) => string) {
  if (!status) return L("Not started", "No iniciado");
  if (status === "active") return L("Active", "Activo");
  if (status === "completed") return L("Completed", "Completado");
  if (status === "failed") return L("Failed", "Fallido");
  if (status === "restarted") return L("Restarted", "Reiniciado");
  return status;
}

function statusClass(status?: string | null) {
  if (!status) return "text-slate-300";
  if (status === "active") return "text-emerald-300";
  if (status === "completed") return "text-emerald-400";
  if (status === "failed") return "text-sky-300";
  if (status === "restarted") return "text-slate-400";
  return "text-slate-300";
}

export default function ChallengeDetailPage() {
  const router = useRouter();
  const params = useParams() as unknown as RouteParams;
  const { user, loading } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const userId = useMemo(() => user?.id || "", [user]);

  const [definition, setDefinition] = useState<ChallengeDefinition | null>(null);
  const [progress, setProgress] = useState<ChallengeProgress | null>(null);
  const [runs, setRuns] = useState<ChallengeProgress[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [dayLogs, setDayLogs] = useState<ChallengeDayLog[]>([]);

  const [gamification, setGamification] = useState<ProfileGamification>({
    xp: 0,
    level: 1,
    tier: "Bronze",
    badges: [],
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check-in UI state
  const [checkinDay, setCheckinDay] = useState<string>(todayIso());
  const [journalCompleted, setJournalCompleted] = useState<boolean>(true);
  const [respectedMaxLoss, setRespectedMaxLoss] = useState<boolean>(true);
  const [followedPlan, setFollowedPlan] = useState<boolean>(true);
  const [note, setNote] = useState<string>("");
  const [checkinBusy, setCheckinBusy] = useState<boolean>(false);

  const processGreen = journalCompleted && respectedMaxLoss && followedPlan;

  const xpPreview = useMemo(() => {
    if (!definition) return 0;
    const xpRules = definition.xp;
    let xp = 0;
    if (journalCompleted) xp += xpRules.journal;
    if (respectedMaxLoss) xp += xpRules.respectedMaxLoss;
    if (followedPlan) xp += xpRules.followedPlan;
    if (processGreen) xp += xpRules.processGreenBonus;
    return xp;
  }, [definition, journalCompleted, respectedMaxLoss, followedPlan, processGreen]);

  // Auth guard
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  // Load definition + runs + progress + logs + gamification
  useEffect(() => {
    if (!params?.id) return;

    const def = CHALLENGES.find((c) => c.id === params.id) || null;
    if (!def) {
      router.push("/challenges");
      return;
    }

    setDefinition(def);

    const run = async () => {
      try {
        if (!userId) return;

        setError(null);

        const [latest, allRuns, g] = await Promise.all([
          getChallengeProgress(userId, def.id),
          listChallengeRuns({ userId, challengeId: def.id, limit: 10 }),
          getProfileGamification(userId, {
            syncToDb: true,
            fallbackToDbCache: true,
          }),
        ]);

        setProgress(latest);
        setRuns(allRuns);
        setGamification(g);

        const runId = latest?.runId || allRuns?.[0]?.runId || null;
        setSelectedRunId(runId);

        if (runId) {
          const logs = await listChallengeDayLogs({ userId, runId, limit: 120 });
          setDayLogs(logs);
        } else {
          setDayLogs([]);
        }

        // reset the check-in form to today
        setCheckinDay(todayIso());
        setJournalCompleted(true);
        setRespectedMaxLoss(true);
        setFollowedPlan(true);
        setNote("");
      } catch (e: any) {
        console.error("[ChallengeDetailPage] load error:", e);
        setError(e?.message ?? L("Failed to load challenge.", "No se pudo cargar el reto."));
      }
    };

    void run();
  }, [params?.id, router, userId]);

  // When switching runs, reload logs
  useEffect(() => {
    if (!userId || !selectedRunId) return;

    const run = async () => {
      try {
        const logs = await listChallengeDayLogs({ userId, runId: selectedRunId, limit: 120 });
        setDayLogs(logs);
      } catch (e) {
        console.error("[ChallengeDetailPage] list logs error:", e);
        setDayLogs([]);
      }
    };

    void run();
  }, [userId, selectedRunId]);

  const activeRun = runs.find((r) => r.runId === selectedRunId) || progress;

  const requiredLabel = activeRun
    ? `${activeRun.processGreenDays} / ${activeRun.requiredGreenDays}`
    : "—";

  const durationLabel = activeRun
    ? `${activeRun.daysTracked} / ${activeRun.durationDays}`
    : "—";

  const pct = useMemo(() => {
    if (!activeRun) return 0;
    const denom = activeRun.durationDays || 0;
    if (denom <= 0) return 0;
    return Math.min(100, (activeRun.daysTracked / denom) * 100);
  }, [activeRun]);

  if (!definition) return null;

  async function refreshGamification() {
    if (!userId) return;
    const g = await getProfileGamification(userId, {
      syncToDb: true,
      fallbackToDbCache: true,
    });
    setGamification(g);
  }

  const handleStart = async () => {
    try {
      if (!userId) return;

      // Capture the definition in a const so TS can trust it across awaits.
      const def = definition;
      if (!def) return;

      setSaving(true);
      setError(null);

      const updated = await startChallenge(userId, def.id);
      setProgress(updated);

      const allRuns = await listChallengeRuns({ userId, challengeId: def.id, limit: 10 });
      setRuns(allRuns);

      const runId = updated?.runId || allRuns?.[0]?.runId || null;
      setSelectedRunId(runId);

      if (runId) {
        const logs = await listChallengeDayLogs({ userId, runId, limit: 120 });
        setDayLogs(logs);
      } else {
        setDayLogs([]);
      }

      await refreshGamification();

      // Reset check-in
      setCheckinDay(todayIso());
      setJournalCompleted(true);
      setRespectedMaxLoss(true);
      setFollowedPlan(true);
      setNote("");
    } catch (e: any) {
      console.error("[ChallengeDetailPage] start error:", e);
      setError(e?.message ?? L("Failed to start challenge.", "No se pudo iniciar el reto."));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCheckin = async () => {
    try {
      // Capture state in locals so TS can trust them across `await` boundaries.
      const def = definition;
      const runId = selectedRunId;
      if (!userId || !def || !runId) return;

      setCheckinBusy(true);
      setError(null);

      const res = await logChallengeDay({
        userId,
        challengeId: def.id,
        runId,
        input: {
          day: checkinDay,
          journalCompleted,
          respectedMaxLoss,
          followedPlan,
          // `note` is optional; avoid sending `null` (TypeScript expects `string | undefined`).
          note: note.trim() ? note.trim() : undefined,
        },
      });

      setProgress(res.progress);

      // Reload runs + logs for clean UI
      const allRuns = await listChallengeRuns({ userId, challengeId: def.id, limit: 10 });
      setRuns(allRuns);
      setSelectedRunId(res.progress.runId);

      const logs = await listChallengeDayLogs({ userId, runId: res.progress.runId, limit: 120 });
      setDayLogs(logs);

      await refreshGamification();

      // If user just edited a past day, keep the date selection.
      // If they checked-in for today, we keep it and clear note only.
      setNote("");
    } catch (e: any) {
      console.error("[ChallengeDetailPage] check-in error:", e);
      setError(e?.message ?? L("Failed to save check-in.", "No se pudo guardar el check-in."));
    } finally {
      setCheckinBusy(false);
    }
  };

  const canCheckin = Boolean(userId && selectedRunId && activeRun && activeRun.status === "active");

  const handleLoadLogIntoForm = (log: ChallengeDayLog) => {
    setCheckinDay(log.day);
    setJournalCompleted(log.journalCompleted);
    setRespectedMaxLoss(log.respectedMaxLoss);
    setFollowedPlan(log.followedPlan);
    setNote(log.note || "");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-emerald-400">
              {L("Challenge", "Reto")}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {definition.title}
            </h1>
            <p className="text-sm text-slate-400">
              {definition.shortDescription}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleStart}
              disabled={saving || !userId}
              className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 transition disabled:opacity-60"
            >
              {saving
                ? L("Starting...", "Iniciando...")
                : progress
                ? L("Restart challenge", "Reiniciar reto")
                : L("Start challenge", "Iniciar reto")}
            </button>

            {runs.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span>{L("Run:", "Corrida:")}</span>
                <select
                  value={selectedRunId || ""}
                  onChange={(e) => setSelectedRunId(e.target.value)}
                  className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] text-slate-200"
                >
                  {runs.map((r) => (
                    <option key={r.runId} value={r.runId}>
                      {String(r.startedAt || "").slice(0, 10)} · {statusLabel(r.status, L)} · {r.processGreenDays}/{r.requiredGreenDays}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-[2fr,1.2fr] mb-8">
          <article className="rounded-2xl border border-emerald-500/30 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-wide text-emerald-300">
              {L("Overview", "Resumen")}
            </p>
            <p className="mt-2 text-sm text-slate-200">
              {definition.highlight}
            </p>

            <p className="mt-4 text-xs text-slate-400">
              {L("Duration:", "Duración:")}{" "}
              <span className="font-medium text-slate-100">
                {definition.durationDays} {L("trading days (check-ins)", "días de trading (check-ins)")}
              </span>
            </p>

            <p className="mt-2 text-xs text-slate-400">
              {L("Completion target:", "Meta de cumplimiento:")}{" "}
              <span className="font-medium text-slate-100">
                {Math.ceil(definition.durationDays * definition.requiredGreenPct)}{" "}
                {L("process-green days", "días verdes de proceso")}
              </span>
            </p>

            <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
              {definition.benefits.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>

            <p className="mt-5 text-[11px] text-slate-400">
              {L(
                "Tip: do a quick check-in after each trading day. The goal is to stack process-green days. Your XP and badges reward consistency, not hype.",
                "Tip: haz un check‑in rápido después de cada día de trading. El objetivo es acumular días verdes de proceso. Tu XP e insignias premian la consistencia."
              )}
            </p>
          </article>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {L("Status", "Estado")}
              </p>
              <p className={`mt-1 text-lg font-semibold capitalize ${statusClass(activeRun?.status ?? null)}`}>
                {statusLabel(activeRun?.status ?? null, L)}
              </p>

              {activeRun && (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <p className="text-[11px] text-slate-400">{L("Green vs target", "Verdes vs meta")}</p>
                      <p className="text-sm font-semibold text-emerald-300">{requiredLabel}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <p className="text-[11px] text-slate-400">{L("Days tracked", "Días registrados")}</p>
                      <p className="text-sm font-semibold text-slate-100">{durationLabel}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <p className="text-[11px] text-slate-400">{L("Max loss breaks", "Rompimientos de max loss")}</p>
                      <p className="text-sm font-semibold text-slate-100">{activeRun.maxLossBreaks}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-800/60 bg-slate-950/60 p-3">
                      <p className="text-[11px] text-slate-400">{L("XP earned", "XP ganados")}</p>
                      <p className="text-sm font-semibold text-emerald-300">{activeRun.xpEarned.toLocaleString()} XP</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="h-1.5 w-full rounded-full bg-slate-900 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {L("Challenge completion progress (days logged).", "Progreso del reto (días registrados).")}
                    </p>
                  </div>
                </>
              )}

              {!activeRun && (
                <p className="mt-3 text-xs text-slate-400">
                  {L(
                    "You have not started this challenge yet. Start it to begin tracking daily check-ins and XP.",
                    "Aún no has iniciado este reto. Inícialo para comenzar a registrar check‑ins y XP."
                  )}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {L("Profile snapshot", "Resumen de perfil")}
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {L("Level", "Nivel")} <span className="font-semibold">{gamification.level}</span> • {L("Tier", "Nivel")}{" "}
                <span className="font-semibold">{gamification.tier}</span>
              </p>
              <p className="mt-1 text-xs text-emerald-300">
                {gamification.xp.toLocaleString()} {L("XP total", "XP total")}
              </p>

              {gamification.badges.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {gamification.badges.map((b) => (
                    <span
                      key={b}
                      className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </section>

        {/* Daily check-in */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 mb-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">{L("Daily check-in", "Check‑in diario")}</h2>
              <p className="text-[12px] text-slate-400 mt-1">
                {L(
                  "Log each trading day. You can edit a prior day inside the current run.",
                  "Registra cada día de trading. Puedes editar un día anterior en la corrida actual."
                )}
              </p>
            </div>

            <div className="text-right">
              <p className="text-[11px] text-slate-400">{L("XP preview", "Vista previa XP")}</p>
              <p className={`text-sm font-semibold ${processGreen ? "text-emerald-300" : "text-slate-200"}`}>
                {xpPreview.toLocaleString()} XP
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <label className="text-[11px] uppercase tracking-wide text-slate-400">{L("Day", "Día")}</label>
              <input
                type="date"
                value={checkinDay}
                onChange={(e) => setCheckinDay(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                disabled={!canCheckin || checkinBusy}
              />

              <div className="mt-4 space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={journalCompleted}
                    onChange={(e) => setJournalCompleted(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                    disabled={!canCheckin || checkinBusy}
                  />
                  <span className="text-slate-200">{L("Journal completed", "Journal completado")}</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={respectedMaxLoss}
                    onChange={(e) => setRespectedMaxLoss(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                    disabled={!canCheckin || checkinBusy}
                  />
                  <span className="text-slate-200">{L("Respected max loss rule", "Respeté la regla de max loss")}</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={followedPlan}
                    onChange={(e) => setFollowedPlan(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                    disabled={!canCheckin || checkinBusy}
                  />
                  <span className="text-slate-200">{L("Followed my plan", "Seguí mi plan")}</span>
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{L("Result", "Resultado")}</p>
                <p className={`text-sm font-semibold ${processGreen ? "text-emerald-300" : "text-sky-200"}`}>
                  {processGreen ? L("Process-green day", "Día verde de proceso") : L("Learning day", "Día de aprendizaje")}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {L(
                    "Process-green requires: journal + max loss respected + followed plan.",
                    "Verde de proceso requiere: journal + max loss respetado + plan seguido."
                  )}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSaveCheckin}
                  disabled={!canCheckin || checkinBusy}
                  className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 transition disabled:opacity-60"
                >
                  {checkinBusy ? L("Saving...", "Guardando...") : L("Save check-in", "Guardar check-in")}
                </button>
              </div>

              {!canCheckin && (
                <p className="mt-3 text-[11px] text-slate-500">
                  {L("Start the challenge to unlock check-ins.", "Inicia el reto para desbloquear check‑ins.")}
                </p>
              )}

              {activeRun && activeRun.status !== "active" && (
                <p className="mt-3 text-[11px] text-slate-500">
                  {L("This run is", "Esta corrida está")} {statusLabel(activeRun.status, L)}.{" "}
                  {L("Start a new run to continue earning XP.", "Inicia una nueva corrida para seguir ganando XP.")}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 flex flex-col">
              <label className="text-[11px] uppercase tracking-wide text-slate-400">{L("Notes (optional)", "Notas (opcional)")}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 flex-1 min-h-[140px] resize-y rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                placeholder={L(
                  "What did you do well? What rule slipped? What will you do differently tomorrow?",
                  "¿Qué hiciste bien? ¿Qué regla falló? ¿Qué harás diferente mañana?"
                )}
                disabled={!canCheckin || checkinBusy}
              />

              <div className="mt-3 text-[11px] text-slate-500">
                {L("Tip: keep it short and honest. The point is pattern recognition.", "Tip: sé breve y honesto. El objetivo es reconocer patrones.")}
              </div>
            </div>
          </div>
        </section>

        {/* History */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">{L("History", "Historial")}</h2>
              <p className="text-[12px] text-slate-400 mt-1">
                {L("Click a row to load it into the check-in form.", "Haz clic en una fila para cargarla en el check‑in.")}
              </p>
            </div>
            <p className="text-[11px] text-slate-400">
              {dayLogs.length} {L("days logged", "días registrados")}
            </p>
          </div>

          {dayLogs.length === 0 ? (
            <p className="text-sm text-slate-400">
              {L("No check-ins yet for this run.", "Aún no hay check‑ins para esta corrida.")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/40">
              <table className="w-full border-collapse text-[12px]">
                <thead className="bg-slate-950/60">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.18em] text-slate-300">{L("Day", "Día")}</th>
                    <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.18em] text-slate-300">{L("Result", "Resultado")}</th>
                    <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.18em] text-slate-300">{L("Checklist", "Checklist")}</th>
                    <th className="px-3 py-2 text-right text-[11px] uppercase tracking-[0.18em] text-slate-300">XP</th>
                    <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.18em] text-slate-300">{L("Notes", "Notas")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dayLogs
                    .slice()
                    .sort((a, b) => String(b.day).localeCompare(String(a.day)))
                    .map((d) => (
                      <tr
                        key={d.id}
                        className="border-t border-slate-800/70 hover:bg-slate-900/40 cursor-pointer"
                        onClick={() => handleLoadLogIntoForm(d)}
                        title={L("Click to edit this day", "Haz clic para editar este día")}
                      >
                        <td className="px-3 py-2 text-slate-100 font-medium whitespace-nowrap">{d.day}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                              d.processGreen
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                : "border-sky-500/40 bg-sky-500/10 text-sky-200"
                            }`}
                          >
                            {d.processGreen ? L("GREEN", "VERDE") : L("LEARNING", "APRENDIZAJE")}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          <span className={d.journalCompleted ? "text-emerald-200" : "text-slate-500"}>{L("Journal", "Journal")}</span>
                          <span className="text-slate-600"> · </span>
                          <span className={d.respectedMaxLoss ? "text-emerald-200" : "text-rose-200"}>{L("Max loss", "Max loss")}</span>
                          <span className="text-slate-600"> · </span>
                          <span className={d.followedPlan ? "text-emerald-200" : "text-slate-500"}>{L("Plan", "Plan")}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-100 font-semibold whitespace-nowrap">
                          {d.xpAwarded.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {d.note ? d.note : <span className="text-slate-600">—</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mt-5 text-xs text-slate-400 flex items-center justify-between">
          <Link
            href="/challenges"
            className="text-emerald-300 hover:text-emerald-200 underline underline-offset-4"
          >
            ← {L("Back to all challenges", "Volver a todos los retos")}
          </Link>
          <p>
            {L(
              "Your AI coach will use this challenge history to personalize your coaching.",
              "Tu coach AI usará este historial de retos para personalizar tu coaching."
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
