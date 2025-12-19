// lib/challengesSupabase.ts
import { supabaseBrowser } from "@/lib/supaBaseClient";

export type ChallengeId = "consistency-30" | "ninety-day";
export type ChallengeStatus = "not_started" | "active" | "completed" | "failed";
export type ChallengeTier = "Bronze" | "Silver" | "Gold" | "Elite";

export type ChallengeDefinition = {
  id: ChallengeId;
  title: string;
  shortDescription: string;
  durationDays: number;
  highlight: string;
  benefits: string[];
};

export type ChallengeProgress = {
  challengeId: ChallengeId;
  status: ChallengeStatus;
  startedAt: string | null; // ISO
  completedAt: string | null;
  failedAt: string | null;
  daysTracked: number;
  processGreenDays: number;
  maxLossBreaks: number;
  xpEarned: number;
};

/* =========================
   Tablas (tuyas)
========================= */
const TABLE_DEFS = "challenge_definitions";
const TABLE_PROGRESS = "challenge_progress";
const LOG = "[challengesSupabase]";

/* =========================
   Definiciones fallback (igual a tu local)
   - Si en DB no hay defs, usamos estas
========================= */
export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: "consistency-30",
    title: "Consistency Challenge",
    shortDescription: "30 days focused on process, not P&L.",
    durationDays: 30,
    highlight: "Win by respecting your rules and journaling every day.",
    benefits: [
      "Unlock the 'Consistency Ninja' badge.",
      "Earn 1,000 XP for your profile.",
      "Download a completion certificate.",
    ],
  },
  {
    id: "ninety-day",
    title: "90 Day Transformation",
    shortDescription: "Three phases: Stabilize, Build, Scale.",
    durationDays: 90,
    highlight: "Turn your trading into a structured, 3-phase transformation.",
    benefits: [
      "Unlock phase badges (Stabilizer, Builder, Scaler).",
      "Earn up to 3,000 XP on completion.",
      "Qualify for higher global tiers.",
    ],
  },
];

/* =========================
   Helpers
========================= */

function toIsoNow() {
  return new Date().toISOString();
}

function normalizeChallengeId(raw: any): ChallengeId {
  const s = String(raw || "").trim();
  if (s === "consistency-30" || s === "ninety-day") return s;
  // fallback seguro
  return "consistency-30";
}

function normalizeStatus(raw: any): ChallengeStatus {
  const s = String(raw || "").trim();
  if (s === "not_started" || s === "active" || s === "completed" || s === "failed")
    return s;
  return "not_started";
}

function normalizeProgressRow(row: any): ChallengeProgress {
  return {
    challengeId: normalizeChallengeId(row.challenge_id ?? row.challengeId),
    status: normalizeStatus(row.status),
    startedAt: row.started_at ?? row.startedAt ?? null,
    completedAt: row.completed_at ?? row.completedAt ?? null,
    failedAt: row.failed_at ?? row.failedAt ?? null,
    daysTracked: Number(row.days_tracked ?? row.daysTracked ?? 0),
    processGreenDays: Number(row.process_green_days ?? row.processGreenDays ?? 0),
    maxLossBreaks: Number(row.max_loss_breaks ?? row.maxLossBreaks ?? 0),
    xpEarned: Number(row.xp_earned ?? row.xpEarned ?? 0),
  };
}

function toDbProgress(userId: string, p: ChallengeProgress) {
  return {
    user_id: userId,
    challenge_id: p.challengeId,
    status: p.status,
    started_at: p.startedAt,
    completed_at: p.completedAt,
    failed_at: p.failedAt,
    days_tracked: p.daysTracked,
    process_green_days: p.processGreenDays,
    max_loss_breaks: p.maxLossBreaks,
    xp_earned: p.xpEarned,
    updated_at: toIsoNow(),
  };
}

/**
 * Lee defs desde DB; si está vacío/da error, usa fallback local CHALLENGES.
 */
export async function getChallengeDefinitions(): Promise<ChallengeDefinition[]> {
  try {
    const { data, error } = await supabaseBrowser
      .from(TABLE_DEFS)
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error(LOG, "getChallengeDefinitions error:", error);
      return CHALLENGES;
    }

    if (!data || data.length === 0) return CHALLENGES;

    // Mapeo flexible (por si tus columnas tienen nombres distintos)
    const mapped = data.map((r: any) => {
      const id = normalizeChallengeId(r.id);
      return {
        id,
        title: String(r.title ?? r.name ?? ""),
        shortDescription: String(r.short_description ?? r.shortDescription ?? ""),
        durationDays: Number(r.duration_days ?? r.durationDays ?? 0),
        highlight: String(r.highlight ?? ""),
        benefits: Array.isArray(r.benefits) ? r.benefits.map(String) : [],
      } as ChallengeDefinition;
    });

    // si por algún motivo faltan campos, fallback
    const ok = mapped.every((d) => d.id && d.durationDays);
    return ok ? mapped : CHALLENGES;
  } catch (e) {
    console.error(LOG, "getChallengeDefinitions exception:", e);
    return CHALLENGES;
  }
}

async function getDefById(id: ChallengeId): Promise<ChallengeDefinition | null> {
  const defs = await getChallengeDefinitions();
  return defs.find((d) => d.id === id) ?? null;
}

/* =========================
   Public API (igual que local, pero async)
========================= */

export async function getAllChallengeProgress(userId: string): Promise<ChallengeProgress[]> {
  try {
    if (!userId) return [];

    const { data, error } = await supabaseBrowser
      .from(TABLE_PROGRESS)
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error(LOG, "getAllChallengeProgress error:", error);
      return [];
    }

    return (data ?? []).map(normalizeProgressRow);
  } catch (e) {
    console.error(LOG, "getAllChallengeProgress exception:", e);
    return [];
  }
}

export async function getChallengeProgress(
  userId: string,
  id: ChallengeId
): Promise<ChallengeProgress | null> {
  try {
    if (!userId) return null;

    const { data, error } = await supabaseBrowser
      .from(TABLE_PROGRESS)
      .select("*")
      .eq("user_id", userId)
      .eq("challenge_id", id)
      .maybeSingle();

    if (error) {
      console.error(LOG, "getChallengeProgress error:", error);
      return null;
    }
    if (!data) return null;

    return normalizeProgressRow(data);
  } catch (e) {
    console.error(LOG, "getChallengeProgress exception:", e);
    return null;
  }
}

export async function startChallenge(
  userId: string,
  id: ChallengeId
): Promise<ChallengeProgress> {
  if (!userId) throw new Error("Missing userId");

  // Busca existente
  const existing = await getChallengeProgress(userId, id);
  const now = toIsoNow();

  const base: ChallengeProgress =
    existing ?? {
      challengeId: id,
      status: "not_started",
      startedAt: null,
      completedAt: null,
      failedAt: null,
      daysTracked: 0,
      processGreenDays: 0,
      maxLossBreaks: 0,
      xpEarned: 0,
    };

  const updated: ChallengeProgress = {
    ...base,
    status: "active",
    startedAt: base.startedAt ?? now,
  };

  // Upsert (user_id + challenge_id debe ser UNIQUE en DB)
  const { error } = await supabaseBrowser
    .from(TABLE_PROGRESS)
    .upsert(toDbProgress(userId, updated), { onConflict: "user_id,challenge_id" });

  if (error) {
    console.error(LOG, "startChallenge upsert error:", error);
    // Aun así devolvemos estado en memoria para no romper UI
  }

  return updated;
}

/**
 * Register daily result for a challenge.
 * Igual que local, pero persistiendo a DB.
 */
export async function updateChallengeDayResult(params: {
  userId: string;
  id: ChallengeId;
  processScore: number; // 0–100
  brokeMaxLoss: boolean;
}): Promise<ChallengeProgress> {
  const { userId, id, processScore, brokeMaxLoss } = params;
  if (!userId) throw new Error("Missing userId");

  const current = await getChallengeProgress(userId, id);
  if (!current) throw new Error("Challenge not started yet.");

  const xpFromDay = processScore >= 80 ? 20 : 0;

  const updated: ChallengeProgress = {
    ...current,
    daysTracked: current.daysTracked + 1,
    processGreenDays: current.processGreenDays + (processScore >= 80 ? 1 : 0),
    maxLossBreaks: current.maxLossBreaks + (brokeMaxLoss ? 1 : 0),
    xpEarned: current.xpEarned + xpFromDay,
  };

  // Primero guardamos el update del día
  const { error } = await supabaseBrowser
    .from(TABLE_PROGRESS)
    .upsert(toDbProgress(userId, updated), { onConflict: "user_id,challenge_id" });

  if (error) console.error(LOG, "updateChallengeDayResult upsert error:", error);

  // Luego evaluamos completion/fail (y si cambia status, guardamos otra vez)
  return await evaluateChallengeCompletion(userId, updated);
}

/**
 * Check if a challenge should become completed or failed.
 * Misma lógica que local, pero guardando DB.
 */
export async function evaluateChallengeCompletion(
  userId: string,
  progress: ChallengeProgress
): Promise<ChallengeProgress> {
  if (!userId) throw new Error("Missing userId");

  const defs = await getDefById(progress.challengeId);
  if (!defs) return progress;

  const nowIso = toIsoNow();

  const minGreenDays = Math.round(defs.durationDays * 0.66);
  const maxAllowedLossBreaks = 2;

  let next = { ...progress };

  if (
    next.status === "active" &&
    next.processGreenDays >= minGreenDays &&
    next.maxLossBreaks <= maxAllowedLossBreaks
  ) {
    const bonus = next.challengeId === "consistency-30" ? 1000 : 3000;

    next = {
      ...next,
      status: "completed",
      completedAt: next.completedAt ?? nowIso,
      xpEarned: next.xpEarned + bonus,
    };
  }

  if (next.status === "active" && next.daysTracked > defs.durationDays * 2) {
    next = {
      ...next,
      status: "failed",
      failedAt: next.failedAt ?? nowIso,
    };
  }

  // Persistir si cambió algo relevante
  const { error } = await supabaseBrowser
    .from(TABLE_PROGRESS)
    .upsert(toDbProgress(userId, next), { onConflict: "user_id,challenge_id" });

  if (error) console.error(LOG, "evaluateChallengeCompletion upsert error:", error);

  return next;
}
