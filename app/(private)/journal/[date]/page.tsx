// app/journal/[date]/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import type { JournalWidgetId, JournalWidgetDef } from "@/app/components/JournalGrid";

import RichTextEditor from "@/app/components/RichTextEditor";

import type { JournalEntry } from "@/lib/journalTypes";
import { getJournalEntryByDate, saveJournalEntry } from "@/lib/journalSupabase";

import { getJournalTradesForDay, saveJournalTradesForDay } from "@/lib/journalTradesSupabase";
import { syncMyTrophies } from "@/lib/trophiesSupabase";

import type { StoredTradeRow } from "@/lib/journalNotes";
import { type InstrumentType } from "@/lib/journalNotes";

import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";

import {
  listJournalTemplates,
  createJournalTemplate,
  deleteJournalTemplate,
  type JournalTemplate,
} from "@/lib/journalTemplatesSupabase";

import {
  getJournalUiSettings,
  saveJournalUiSettings,
  type JournalUiSettings,
} from "@/lib/journalUiSettingsSupabase";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

/* =========================================================
   Trades / DTE parsing
========================================================= */

const KIND_VALUES: InstrumentType[] = ["stock", "option", "future", "crypto", "forex", "other"];
const KIND_LABELS: Record<InstrumentType, { en: string; es: string }> = {
  stock: { en: "Stocks", es: "Acciones" },
  option: { en: "Options", es: "Opciones" },
  future: { en: "Futures", es: "Futuros" },
  crypto: { en: "Crypto", es: "Cripto" },
  forex: { en: "Forex", es: "Forex" },
  other: { en: "Other", es: "Otro" },
};

type SideType = "long" | "short";

type PremiumSide = "none" | "debit" | "credit";

type OptionStrategy =
  | "single"
  | "vertical_spread"
  | "iron_condor"
  | "iron_butterfly"
  | "straddle"
  | "strangle"
  | "calendar"
  | "diagonal"
  | "covered_call"
  | "cash_secured_put"
  | "other";

const PREMIUM_VALUES: PremiumSide[] = ["none", "debit", "credit"];
const PREMIUM_LABELS: Record<PremiumSide, { en: string; es: string }> = {
  none: { en: "—", es: "—" },
  debit: { en: "Debit (I pay premium)", es: "Débito (pago prima)" },
  credit: { en: "Credit (I receive premium)", es: "Crédito (recibo prima)" },
};

const STRATEGY_VALUES: OptionStrategy[] = [
  "single",
  "vertical_spread",
  "iron_condor",
  "iron_butterfly",
  "straddle",
  "strangle",
  "calendar",
  "diagonal",
  "covered_call",
  "cash_secured_put",
  "other",
];
const STRATEGY_LABELS: Record<OptionStrategy, { en: string; es: string }> = {
  single: { en: "Single / naked", es: "Simple / naked" },
  vertical_spread: { en: "Vertical spread", es: "Spread vertical" },
  iron_condor: { en: "Iron Condor", es: "Iron Condor" },
  iron_butterfly: { en: "Iron Butterfly", es: "Iron Butterfly" },
  straddle: { en: "Straddle", es: "Straddle" },
  strangle: { en: "Strangle", es: "Strangle" },
  calendar: { en: "Calendar spread", es: "Calendar spread" },
  diagonal: { en: "Diagonal spread", es: "Diagonal spread" },
  covered_call: { en: "Covered call", es: "Covered call" },
  cash_secured_put: { en: "Cash-secured put", es: "Cash‑secured put" },
  other: { en: "Other option strategy", es: "Otra estrategia de opciones" },
};

type ProcessPhase = "premarket" | "inside" | "after";
const PROCESS_PHASES: ProcessPhase[] = ["premarket", "inside", "after"];
const PROCESS_LABELS: Record<ProcessPhase, { en: string; es: string }> = {
  premarket: { en: "Premarket", es: "Premarket" },
  inside: { en: "In‑Trade", es: "En trade" },
  after: { en: "After‑Trade", es: "Post‑trade" },
};

type JournalChecklistPresets = {
  premarket: string[];
  inside: string[];
  after: string[];
  strategy: string[];
  impulses: string[];
  states: string[];
};

const DEFAULT_CHECKLIST_PRESETS: JournalChecklistPresets = {
  premarket: [
    "News/events checked",
    "Key levels marked",
    "Bias & plan defined",
    "Risk & size set",
    "No‑trade conditions set",
  ],
  inside: [
    "Entry matched setup",
    "Stop placed immediately",
    "Position size respected",
    "Managed per plan",
    "No averaging down",
  ],
  after: [
    "Screenshots saved",
    "Journal updated",
    "Mistakes noted",
    "Lesson captured",
    "Next action defined",
  ],
  strategy: [
    "A+ setup",
    "R/R ≥ 2R",
    "Clear invalidation",
    "Followed plan",
    "Entry at level",
  ],
  impulses: [
    "FOMO",
    "Revenge trade",
    "Chased price",
    "Overtrading",
    "Moved stop impulsively",
  ],
  states: [
    "Calm",
    "Focused",
    "Confident",
    "Anxious",
    "Impatient",
    "Overconfident",
  ],
};

const PROCESS_ITEM_LABELS: Record<string, string> = {
  "News/events checked": "Noticias/eventos revisados",
  "Key levels marked": "Niveles clave marcados",
  "Bias & plan defined": "Sesgo y plan definidos",
  "Risk & size set": "Riesgo y tamaño definidos",
  "No‑trade conditions set": "Condiciones de no‑trade definidas",
  "Entry matched setup": "Entrada coincidió con el setup",
  "Stop placed immediately": "Stop colocado de inmediato",
  "Position size respected": "Tamaño de posición respetado",
  "Managed per plan": "Gestionado según el plan",
  "No averaging down": "Sin promediar en contra",
  "Screenshots saved": "Capturas guardadas",
  "Journal updated": "Journal actualizado",
  "Mistakes noted": "Errores anotados",
  "Lesson captured": "Lección capturada",
  "Next action defined": "Próxima acción definida",
};

const STRATEGY_ITEM_LABELS: Record<string, string> = {
  "A+ setup": "Setup A+",
  "R/R ≥ 2R": "R/B ≥ 2R",
  "Clear invalidation": "Invalidación clara",
  "Followed plan": "Plan seguido",
  "Entry at level": "Entrada en nivel",
};

const IMPULSE_ITEM_LABELS: Record<string, string> = {
  FOMO: "FOMO",
  "Revenge trade": "Trade de revancha",
  "Chased price": "Perseguí el precio",
  Overtrading: "Sobre‑trading",
  "Moved stop impulsively": "Moví el stop impulsivamente",
};

const STATE_ITEM_LABELS: Record<string, string> = {
  Calm: "Calma",
  Focused: "Enfocado",
  Confident: "Confiado",
  Anxious: "Ansioso",
  Impatient: "Impaciente",
  Overconfident: "Sobreconfiado",
};

const EXIT_REASON_TAGS = [
  "Stop Loss Placed",
  "Take Profit Hit",
  "Manual Exit",
  "Moved stop to profit",
  "Stopped out (loss)",
  "Move stop to breakeven",
];

const EXIT_REASON_LABELS: Record<string, string> = {
  "Stop Loss Placed": "Stop loss colocado",
  "Take Profit Hit": "Take profit ejecutado",
  "Manual Exit": "Salida manual",
  "Moved stop to profit": "Stop movido a profit",
  "Stopped out (loss)": "Stop ejecutado (pérdida)",
  "Move stop to breakeven": "Mover stop a BE",
};

const TAG_PREFIX: Record<ProcessPhase | "strategy", string> = {
  premarket: "PRE:",
  inside: "IN:",
  after: "POST:",
  strategy: "STRAT:",
};

const normalizeChecklistPresets = (raw?: any): JournalChecklistPresets => {
  const asList = (v: any, fallback: string[]) =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : fallback;
  return {
    premarket: asList(raw?.premarket, DEFAULT_CHECKLIST_PRESETS.premarket),
    inside: asList(raw?.inside, DEFAULT_CHECKLIST_PRESETS.inside),
    after: asList(raw?.after, DEFAULT_CHECKLIST_PRESETS.after),
    strategy: asList(raw?.strategy, DEFAULT_CHECKLIST_PRESETS.strategy),
    impulses: asList(raw?.impulses, DEFAULT_CHECKLIST_PRESETS.impulses),
    states: asList(raw?.states, DEFAULT_CHECKLIST_PRESETS.states),
  };
};

const checklistTag = (prefix: string | null, item: string) =>
  prefix ? `${prefix} ${item}`.trim() : item.trim();

const mergeChecklistPresetsWithTags = (
  tags: string[] | undefined | null,
  presets: JournalChecklistPresets
): JournalChecklistPresets => {
  const next: JournalChecklistPresets = {
    premarket: [...presets.premarket],
    inside: [...presets.inside],
    after: [...presets.after],
    strategy: [...presets.strategy],
    impulses: [...presets.impulses],
    states: [...presets.states],
  };

  const addUnique = (key: keyof JournalChecklistPresets, item: string) => {
    const clean = item.trim();
    if (!clean) return;
    const exists = next[key].some((t) => t.toLowerCase() === clean.toLowerCase());
    if (!exists) next[key].push(clean);
  };

  const list = Array.isArray(tags) ? tags : [];
  for (const raw of list) {
    const t = String(raw ?? "").trim();
    if (!t) continue;

    if (t.startsWith(TAG_PREFIX.premarket)) {
      addUnique("premarket", t.replace(TAG_PREFIX.premarket, "").trim());
      continue;
    }
    if (t.startsWith(TAG_PREFIX.inside)) {
      addUnique("inside", t.replace(TAG_PREFIX.inside, "").trim());
      continue;
    }
    if (t.startsWith(TAG_PREFIX.after)) {
      addUnique("after", t.replace(TAG_PREFIX.after, "").trim());
      continue;
    }
    if (t.startsWith(TAG_PREFIX.strategy)) {
      addUnique("strategy", t.replace(TAG_PREFIX.strategy, "").trim());
      continue;
    }

    if (t in IMPULSE_ITEM_LABELS) {
      addUnique("impulses", t);
    } else if (t in STATE_ITEM_LABELS) {
      addUnique("states", t);
    } else {
      addUnique("states", t);
    }
  }

  return next;
};

type MindsetRatings = {
  emotional_balance: number | null;
  impulse_control: number | null;
  setup_quality: number | null;
  probability: number | null;
};

const DEFAULT_MINDSET: MindsetRatings = {
  emotional_balance: null,
  impulse_control: null,
  setup_quality: null,
  probability: null,
};

type AfterTradeReview = {
  checklist: Record<string, boolean>;
  ratings: {
    execution: number | null;
    patience: number | null;
    clarity: number | null;
  };
  notes: {
    didWell: string;
    improve: string;
  };
};

const AFTER_REVIEW_ITEMS = [
  { id: "followed_exit_plan", en: "Followed my exit plan", es: "Seguí mi plan de salida" },
  { id: "exit_at_level", en: "Exited at my planned level", es: "Salí en el nivel planificado" },
  { id: "exit_emotion", en: "Exited due to fear/anxiety", es: "Salí por miedo/ansiedad" },
  { id: "moved_stop_no_plan", en: "Moved stop without a plan", es: "Moví el stop sin plan" },
  { id: "let_winner_run", en: "Let the winner run as planned", es: "Dejé correr la ganancia según el plan" },
  { id: "partials_ok", en: "Managed partials correctly", es: "Manejé parciales correctamente" },
  { id: "size_ok", en: "Respected position size", es: "Respeté el tamaño de posición" },
  { id: "fomo_revenge", en: "FOMO or revenge present", es: "Hubo FOMO o revancha" },
  { id: "early_exit", en: "Exited early to lock profits", es: "Salí temprano para asegurar ganancias" },
  { id: "discipline_pressure", en: "Maintained discipline under pressure", es: "Mantuve disciplina bajo presión" },
];

const DEFAULT_AFTER_REVIEW: AfterTradeReview = {
  checklist: Object.fromEntries(AFTER_REVIEW_ITEMS.map((item) => [item.id, false])),
  ratings: {
    execution: 3,
    patience: 3,
    clarity: 3,
  },
  notes: {
    didWell: "",
    improve: "",
  },
};

const clampRating = (v: any) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
};

const normalizeMindset = (raw?: any): MindsetRatings => ({
  emotional_balance: clampRating(raw?.emotional_balance),
  impulse_control: clampRating(raw?.impulse_control),
  setup_quality: clampRating(raw?.setup_quality),
  probability: clampRating(raw?.probability),
});

const normalizeAfterReview = (raw?: any): AfterTradeReview => {
  const checklist: Record<string, boolean> = { ...DEFAULT_AFTER_REVIEW.checklist };
  if (raw?.checklist && typeof raw.checklist === "object") {
    for (const item of AFTER_REVIEW_ITEMS) {
      if (item.id in raw.checklist) {
        checklist[item.id] = !!raw.checklist[item.id];
      }
    }
  }
  return {
    checklist,
    ratings: {
      execution: clampRating(raw?.ratings?.execution) ?? DEFAULT_AFTER_REVIEW.ratings.execution,
      patience: clampRating(raw?.ratings?.patience) ?? DEFAULT_AFTER_REVIEW.ratings.patience,
      clarity: clampRating(raw?.ratings?.clarity) ?? DEFAULT_AFTER_REVIEW.ratings.clarity,
    },
    notes: {
      didWell: typeof raw?.notes?.didWell === "string" ? raw.notes.didWell : DEFAULT_AFTER_REVIEW.notes.didWell,
      improve: typeof raw?.notes?.improve === "string" ? raw.notes.improve : DEFAULT_AFTER_REVIEW.notes.improve,
    },
  };
};

// ✅ Normalizers for DB -> UI
function toSideType(raw: any): SideType {
  const s = String(raw ?? "").toLowerCase();
  if (s === "short") return "short";
  if (s === "long") return "long";
  if (s.includes("short")) return "short";
  return "long";
}

function toPremiumSide(raw: any): PremiumSide {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("credit")) return "credit";
  if (s.includes("debit")) return "debit";
  if (s === "none" || s === "—" || s === "-") return "none";
  return "debit";
}

function toOptionStrategy(raw: any): OptionStrategy {
  const s = String(raw ?? "").toLowerCase().trim();
  const allowed: OptionStrategy[] = [
    "single",
    "vertical_spread",
    "iron_condor",
    "iron_butterfly",
    "straddle",
    "strangle",
    "calendar",
    "diagonal",
    "covered_call",
    "cash_secured_put",
    "other",
  ];
  if ((allowed as string[]).includes(s)) return s as OptionStrategy;

  if (s.includes("single")) return "single";
  if (s.includes("vertical")) return "vertical_spread";
  if (s.includes("condor")) return "iron_condor";
  if (s.includes("butterfly")) return "iron_butterfly";
  if (s.includes("straddle")) return "straddle";
  if (s.includes("strangle")) return "strangle";
  if (s.includes("calendar")) return "calendar";
  if (s.includes("diagonal")) return "diagonal";
  if (s.includes("covered")) return "covered_call";
  if (s.includes("cash")) return "cash_secured_put";

  return "single";
}

type EntryTradeRow = {
  id: string;
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  premiumSide?: PremiumSide;
  optionStrategy?: OptionStrategy;
  price: string;
  quantity: string;
  time: string;
  dte?: number | null;
  expiry?: string | null; // YYYY-MM-DD
};

type ExitTradeRow = {
  id: string;
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  premiumSide?: PremiumSide;
  optionStrategy?: OptionStrategy;
  price: string;
  quantity: string;
  time: string;
  dte?: number | null;
  expiry?: string | null;
};

function toNum(v: any): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function entryRowToStored(r: EntryTradeRow): StoredTradeRow {
  return {
    id: (r as any).id,
    symbol: String(r.symbol ?? "").trim(),
    kind: (r.kind ?? "other") as any,
    side: r.side,
    premiumSide: (r as any).premiumSide,
    optionStrategy: (r as any).optionStrategy,
    price: toNum(r.price),
    quantity: toNum(r.quantity),
    time: String(r.time ?? ""),
    dte: (r as any).dte ?? undefined,
    emotions: (r as any).emotions ?? undefined,
    strategyChecklist: (r as any).strategyChecklist ?? undefined,
  } as any;
}

function exitRowToStored(r: ExitTradeRow): StoredTradeRow {
  return {
    id: (r as any).id,
    symbol: String(r.symbol ?? "").trim(),
    kind: (r.kind ?? "other") as any,
    side: r.side,
    premiumSide: (r as any).premiumSide,
    optionStrategy: (r as any).optionStrategy,
    price: toNum(r.price),
    quantity: toNum(r.quantity),
    time: String(r.time ?? ""),
    dte: (r as any).dte ?? undefined,
    emotions: (r as any).emotions ?? undefined,
    strategyChecklist: (r as any).strategyChecklist ?? undefined,
  } as any;
}

function nowTimeLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseSPXOptionSymbol(raw: string) {
  const s = (raw || "").trim().toUpperCase().replace(/^[\.\-]/, "");
  // SPXW251121C6565 / SPX251121P6000
  const m = s.match(/^([A-Z]+W?)(\d{6})([CP])(\d+(?:\.\d+)?)$/);
  if (!m) return null;

  const underlying = m[1];
  const yy = Number(m[2].slice(0, 2));
  const mm = Number(m[2].slice(2, 4));
  const dd = Number(m[2].slice(4, 6));
  const right = m[3] as "C" | "P";
  const strike = Number(m[4]);

  if (!yy || !mm || !dd) return null;

  const year = 2000 + yy;
  const expiry = new Date(year, mm - 1, dd);
  if (Number.isNaN(expiry.getTime())) return null;

  return { underlying, expiry, right, strike };
}

function calcDTE(entryDateYYYYMMDD: string, expiry: Date) {
  try {
    const [y, m, d] = entryDateYYYYMMDD.split("-").map(Number);
    const entryUTC = Date.UTC(y, m - 1, d);
    const expiryUTC = Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((expiryUTC - entryUTC) / msPerDay);
    if (diffDays === 0) return 0;
    return diffDays >= 0 ? diffDays : null;
  } catch {
    return null;
  }
}

function looksLikeOptionContract(symbol: string) {
  return !!parseSPXOptionSymbol(symbol);
}

function effectiveKind(kind: InstrumentType, symbol: string): InstrumentType {
  if (kind === "option" && !looksLikeOptionContract(symbol)) return "stock";
  return kind || "other";
}

function normalizePremiumSide(kind: InstrumentType, premiumSide?: PremiumSide): PremiumSide {
  if (kind === "option") return premiumSide || "debit";
  return premiumSide || "none";
}

function normalizeStrategy(optionStrategy?: OptionStrategy): OptionStrategy {
  return optionStrategy || "single";
}

function premiumLabel(kind: InstrumentType, premiumSide: PremiumSide | undefined, lang: "en" | "es") {
  const p = normalizePremiumSide(kind, premiumSide);
  return PREMIUM_LABELS[p]?.[lang] ?? PREMIUM_LABELS[p]?.en ?? "—";
}

function strategyLabel(kind: InstrumentType, strategy: OptionStrategy | undefined, lang: "en" | "es") {
  if (kind !== "option") return "—";
  const s = normalizeStrategy(strategy);
  return STRATEGY_LABELS[s]?.[lang] ?? STRATEGY_LABELS[s]?.en ?? "Single / naked";
}

/* =========================================================
   Contract multipliers
========================================================= */

const FUTURES_MULTIPLIERS: Record<string, number> = {
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  YM: 5,
  MYM: 0.5,
  RTY: 50,
  M2K: 5,
  CL: 1000,
  MCL: 100,
  GC: 100,
  MGC: 10,
  SI: 5000,
  HG: 25000,
};

const FUT_MONTH_CODES = "FGHJKMNQUVXZ";

function futureRoot(symbol: string) {
  const s0 = (symbol || "").trim().toUpperCase().replace(/^\//, "");
  const s = s0.replace(/\s+/g, "");

  const re1 = new RegExp(`^([A-Z0-9]{1,8})([${FUT_MONTH_CODES}])(\\d{1,4})$`);
  const m1 = s.match(re1);
  if (m1) return m1[1];

  const m2 = s.match(/^([A-Z0-9]{1,8})/);
  return m2?.[1] ?? s0;
}

function getContractMultiplier(kind: InstrumentType, symbol: string) {
  if (kind === "option") return 100;
  if (kind === "future") {
    const root = futureRoot(symbol);
    return FUTURES_MULTIPLIERS[root] ?? 1;
  }
  return 1;
}

/* =========================================================
   Averages (UI only)
========================================================= */

function computeAverages(trades: { symbol: string; kind: InstrumentType; price: string; quantity: string }[]) {
  const map: Record<string, { sumPxQty: number; sumQty: number }> = {};
  for (const t of trades) {
    const symbol = (t.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const kind = t.kind || "other";
    const key = `${symbol}|${kind}`;
    const px = parseFloat(t.price);
    const qty = parseFloat(t.quantity);
    if (!Number.isFinite(px) || !Number.isFinite(qty) || qty <= 0) continue;
    if (!map[key]) map[key] = { sumPxQty: 0, sumQty: 0 };
    map[key].sumPxQty += px * qty;
    map[key].sumQty += qty;
  }
  return Object.entries(map).map(([key, v]) => {
    const [symbol, kind] = key.split("|") as [string, InstrumentType];
    return { symbol, kind, avg: v.sumPxQty / v.sumQty, qty: v.sumQty };
  });
}

/* =========================================================
   PnL helpers (FIFO + multipliers + premium)
========================================================= */

function pnlSign(kind: InstrumentType, side: SideType, premiumSide: PremiumSide): number {
  if (kind === "option") {
    const p = normalizePremiumSide(kind, premiumSide);
    if (p === "credit") return -1;
    return 1;
  }
  return side === "short" ? -1 : 1;
}

function computeAutoPnL(entries: EntryTradeRow[], exits: ExitTradeRow[]) {
  const key = (s: string, k: InstrumentType, side: SideType, premiumSide: PremiumSide) => `${s}|${k}|${side}|${premiumSide}`;

  type Lot = {
    price: number;
    qtyLeft: number;
    symbol: string;
    kind: InstrumentType;
    side: SideType;
    premiumSide: PremiumSide;
  };

  const entryLots: Record<string, Lot[]> = {};

  for (const e of entries) {
    const sym = (e.symbol || "").trim().toUpperCase();
    if (!sym) continue;

    const kEff = effectiveKind(e.kind || "other", sym);
    const sideEff = e.side || "long";
    const premEff = normalizePremiumSide(kEff, e.premiumSide);

    const k = key(sym, kEff, sideEff, premEff);

    const px = parseFloat(e.price);
    const qty = parseFloat(e.quantity);
    if (!Number.isFinite(px) || !Number.isFinite(qty) || qty <= 0) continue;

    entryLots[k] ||= [];
    entryLots[k].push({ price: px, qtyLeft: qty, symbol: sym, kind: kEff, side: sideEff, premiumSide: premEff });
  }

  let total = 0;

  for (const x of exits) {
    const sym = (x.symbol || "").trim().toUpperCase();
    if (!sym) continue;

    const kEff = effectiveKind(x.kind || "other", sym);
    const sideEff = x.side || "long";
    const premEff = normalizePremiumSide(kEff, x.premiumSide);

    const k = key(sym, kEff, sideEff, premEff);

    const exitPx = parseFloat(x.price);
    let exitQty = parseFloat(x.quantity);
    if (!Number.isFinite(exitPx) || !Number.isFinite(exitQty) || exitQty <= 0) continue;

    const lots = entryLots[k];
    if (!lots || lots.length === 0) continue;

    const sign = pnlSign(kEff, sideEff, premEff);
    const mult = getContractMultiplier(kEff, sym);

    while (exitQty > 0 && lots.length > 0) {
      const lot = lots[0];
      const closeQty = Math.min(lot.qtyLeft, exitQty);
      total += (exitPx - lot.price) * closeQty * sign * mult;
      lot.qtyLeft -= closeQty;
      exitQty -= closeQty;
      if (lot.qtyLeft <= 0) lots.shift();
    }
  }

  return { total };
}

/* =========================================================
   Widget shell
========================================================= */

function WidgetCard({
  title,
  children,
  right,
  subtitle,
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  subtitle?: string;
  compact?: boolean;
}) {
  const headerClass = compact ? "px-2.5 py-0.5" : "px-4 py-2";
  const bodyClass = compact ? "p-2" : "p-4";
  const titleClass = compact ? "text-[12px]" : "text-sm";
  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl h-full flex flex-col overflow-hidden shadow-sm min-h-0">
      <div className={`flex items-center justify-between ${headerClass} border-b border-slate-800 bg-slate-950/40`}>
        <div className="flex items-center gap-2">
          <div>
            <p className={`text-slate-100 ${titleClass} font-semibold`}>{title}</p>
            {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
          </div>
        </div>
        <div>{right}</div>
      </div>
      <div className={`${bodyClass} flex-1 min-h-0 overflow-auto`}>{children}</div>
    </div>
  );
}

/* =========================================================
   Page
========================================================= */

export default function DailyJournalPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { activeAccountId, loading: accountsLoading } = useTradingAccounts();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const kindOptions = useMemo(
    () => KIND_VALUES.map((value) => ({ value, label: KIND_LABELS[value]?.[lang] ?? KIND_LABELS[value]?.en ?? value })),
    [lang]
  );
  const premiumOptions = useMemo(
    () => PREMIUM_VALUES.map((value) => ({ value, label: PREMIUM_LABELS[value]?.[lang] ?? PREMIUM_LABELS[value]?.en ?? value })),
    [lang]
  );
  const strategyOptions = useMemo(
    () => STRATEGY_VALUES.map((value) => ({ value, label: STRATEGY_LABELS[value]?.[lang] ?? STRATEGY_LABELS[value]?.en ?? value })),
    [lang]
  );

  const userId = (user as any)?.id ?? "";

  const dateParam = Array.isArray(params?.date) ? params.date[0] : (params?.date as string);

  const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

  const nextJournalDate = (iso: string, direction: 1 | -1) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d0 = Number(m[3]);
    const d = new Date(Date.UTC(y, mo - 1, d0));
    do {
      d.setUTCDate(d.getUTCDate() + direction);
    } while (d.getUTCDay() === 6); // skip Saturdays only
    return d.toISOString().slice(0, 10);
  };

  // UI state (rich text)
  const [premarketHtml, setPremarketHtml] = useState<string>("");
  const [insideHtml, setInsideHtml] = useState<string>("");
  const [afterHtml, setAfterHtml] = useState<string>("");

  // Optional: keep a reference to the inside editor for dictation insertion
  const insideEditorRef = useRef<any>(null);

  const [entry, setEntry] = useState<JournalEntry>({
    date: dateParam || "",
    pnl: 0,
    instrument: "",
    direction: "long",
    entryPrice: undefined,
    exitPrice: undefined,
    size: undefined,
    screenshots: [],
    notes: "",
    emotion: "",
    tags: [],
    respectedPlan: true,
  });

  const [pnlInput, setPnlInput] = useState<string>("");

  // PnL source:
  // - 'db': trust journal_entries.pnl (net, incl. fees/commissions from broker sync)
  // - 'auto': recompute from Entries/Exits (and subtract broker costs from notes if present)
  const [pnlMode, setPnlMode] = useState<"db" | "auto">("db");
  const [pnlFromDb, setPnlFromDb] = useState<number | null>(null);

  // Preserve extra keys that already exist in journal_entries.notes (e.g., broker sync metadata: costs/pnl/synced_at).
  // This prevents the UI 'Save' action from accidentally wiping sync metadata.
  const [notesExtra, setNotesExtra] = useState<Record<string, any>>({});

  const [processPhase, setProcessPhase] = useState<ProcessPhase>("premarket");
  const [checklistPresets, setChecklistPresets] = useState<JournalChecklistPresets>(DEFAULT_CHECKLIST_PRESETS);
  const [mindset, setMindset] = useState<MindsetRatings>(DEFAULT_MINDSET);
  const [afterReview, setAfterReview] = useState<AfterTradeReview>(DEFAULT_AFTER_REVIEW);
  const [editProcess, setEditProcess] = useState(false);
  const [editMindset, setEditMindset] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState({
    premarket: "",
    inside: "",
    after: "",
    strategy: "",
    impulses: "",
    states: "",
  });

  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveReadyRef = useRef(false);
  const autoSaveIgnoreNextRef = useRef(false);
  const [autoSaveDirty, setAutoSaveDirty] = useState(false);

  const [entryTrades, setEntryTrades] = useState<EntryTradeRow[]>([]);
  const [exitTrades, setExitTrades] = useState<ExitTradeRow[]>([]);

  const [newEntryTrade, setNewEntryTrade] = useState<Omit<EntryTradeRow, "id">>({
    symbol: "",
    kind: "option",
    side: "long",
    premiumSide: "debit",
    optionStrategy: "single",
    price: "",
    quantity: "",
    // Avoid SSR hydration mismatches: we set the default time on mount.
    time: "",
    dte: null,
    expiry: null,
  });

  const [newExitTrade, setNewExitTrade] = useState<Omit<ExitTradeRow, "id">>({
    symbol: "",
    kind: "option",
    side: "long",
    premiumSide: "debit",
    optionStrategy: "single",
    price: "",
    quantity: "",
    // Avoid SSR hydration mismatches: we set the default time on mount.
    time: "",
    dte: null,
    expiry: null,
  });

  // Fill default "Time" values on the client only (prevents SSR hydration mismatches).
  useEffect(() => {
    setNewEntryTrade((p) => (p.time ? p : { ...p, time: nowTimeLabel() }));
    setNewExitTrade((p) => (p.time ? p : { ...p, time: nowTimeLabel() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================
     Wizard + UI presets (no widgets)
  ========================================================= */

  const checklistStorageKey = "journal_checklists_v1";
  const UI_PAGE_KEY = "journal";

  const uiSettingsRef = useRef<JournalUiSettings>({});

  const commitUiSettings = (patch: Partial<JournalUiSettings>) => {
    if (!userId) return;
    const next: JournalUiSettings = {
      ...uiSettingsRef.current,
      ...patch,
      checklists: patch.checklists ?? uiSettingsRef.current.checklists,
    };
    uiSettingsRef.current = next;
    saveJournalUiSettings(userId, UI_PAGE_KEY, next).catch((e) =>
      console.error("[journal] save ui settings failed:", e)
    );
  };

  // Fast client-side hydrate for checklist presets
  useEffect(() => {
    try {
      const raw = localStorage.getItem(checklistStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const normalized = normalizeChecklistPresets(parsed);
      setChecklistPresets(normalized);
      uiSettingsRef.current = { ...uiSettingsRef.current, checklists: normalized };
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(checklistStorageKey, JSON.stringify(checklistPresets));
    } catch {}
    uiSettingsRef.current = { ...uiSettingsRef.current, checklists: checklistPresets };
  }, [checklistPresets]);

  // Load UI settings + templates from Supabase
  useEffect(() => {
    if (!userId || authLoading) return;

    let alive = true;

    (async () => {
      try {
        let hasLocalChecklists = false;

        try {
          const raw = localStorage.getItem(checklistStorageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            const normalized = normalizeChecklistPresets(parsed);
            hasLocalChecklists = true;
            setChecklistPresets(normalized);
            uiSettingsRef.current = { ...uiSettingsRef.current, checklists: normalized };
          }
        } catch {}

        const ui = await getJournalUiSettings(userId, UI_PAGE_KEY);
        if (!alive) return;

        if (ui) {
          const rawChecklists: any = (ui as any).checklists ?? (ui as any).checklist_presets;
          if (!hasLocalChecklists && rawChecklists && typeof rawChecklists === "object") {
            const normalized = normalizeChecklistPresets(rawChecklists);
            setChecklistPresets(normalized);
            try {
              localStorage.setItem(checklistStorageKey, JSON.stringify(normalized));
            } catch {}
            uiSettingsRef.current = { ...uiSettingsRef.current, checklists: normalized };
          }
        }

        // Templates
        const tpls = await listJournalTemplates(userId);
        if (!alive) return;
        setTemplates(tpls);
      } catch (err) {
        console.error("[journal] failed to load UI/templates:", err);
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId, authLoading]);

  // Persist checklist presets to Supabase (debounced)
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => {
      commitUiSettings({ checklists: checklistPresets });
    }, 300);
    return () => clearTimeout(t);
  }, [userId, checklistPresets]);

  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    setCurrentStep(0);
  }, [dateParam]);

  /* =========================================================
     Route protection
  ========================================================= */

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/signin");
    }
  }, [authLoading, user, router]);

  /* =========================================================
     Load existing journal entry + notes
  ========================================================= */

  useEffect(() => {
    if (!dateParam || authLoading || accountsLoading || !userId || !activeAccountId) return;

    let active = true;
    autoSaveReadyRef.current = false;
    autoSaveIgnoreNextRef.current = true;

    (async () => {
      try {
        const [existing, storedTrades] = await Promise.all([
          getJournalEntryByDate(userId, dateParam, activeAccountId),
          getJournalTradesForDay(userId, dateParam, activeAccountId).catch(() =>
            ({ entries: [], exits: [] } as any)
          ),
        ]);

        if (!active) return;

        // Notes (HTML blocks) come from journal_entries.notes
        // Trades for PnL and tables come from journal_trades (preferred),
        // with a fallback to notes payload for legacy data.
        let fallbackEntries: any[] | null = null;
        let fallbackExits: any[] | null = null;

        if (existing) {
          setEntry((prev) => ({ ...prev, ...existing, date: dateParam }));

          const existingPnlNum =
            typeof (existing as any).pnl === "number"
              ? (existing as any).pnl
              : Number((existing as any).pnl);

          if (Number.isFinite(existingPnlNum)) {
            setPnlFromDb(existingPnlNum);
            setPnlMode("db");
            setPnlInput(existingPnlNum.toFixed(2));
          } else {
            setPnlFromDb(null);
            setPnlMode("auto");
            setPnlInput("");
          }

          const notesStr =
            typeof (existing as any).notes === "string" ? (existing as any).notes : "";

          if (notesStr) {
            try {
              const parsed = JSON.parse(notesStr);
              if (parsed && typeof parsed === "object") {
                setPremarketHtml(String((parsed as any).premarket ?? ""));
                setInsideHtml(String((parsed as any).live ?? ""));
                setAfterHtml(String((parsed as any).post ?? ""));

                if (Array.isArray((parsed as any).entries)) fallbackEntries = (parsed as any).entries;
                if (Array.isArray((parsed as any).exits)) fallbackExits = (parsed as any).exits;

                // Preserve extra keys from notes (e.g., broker sync metadata: costs/pnl/synced_at)
                try {
                  const { premarket, live, post, entries, exits, ...rest } = parsed as any;
                  setNotesExtra(rest && typeof rest === "object" ? (rest as any) : {});
                  const storedMindset = (rest as any)?.mindset ?? (rest as any)?.journal_mindset ?? null;
                  if (storedMindset && typeof storedMindset === "object") {
                    setMindset(normalizeMindset(storedMindset));
                  } else {
                    setMindset(DEFAULT_MINDSET);
                  }
                  const storedAfterReview = (rest as any)?.after_review ?? null;
                  if (storedAfterReview && typeof storedAfterReview === "object") {
                    setAfterReview(normalizeAfterReview(storedAfterReview));
                  } else {
                    setAfterReview(DEFAULT_AFTER_REVIEW);
                  }

                  const entryTags = Array.isArray((existing as any)?.tags) ? (existing as any).tags : [];
                  const checklists = (rest as any)?.checklists;
                  const extraTags: string[] = [];
                  if (checklists && typeof checklists === "object") {
                    if (Array.isArray(checklists.premarket)) {
                      extraTags.push(
                        ...checklists.premarket.map((t: any) => checklistTag(TAG_PREFIX.premarket, String(t)))
                      );
                    }
                    if (Array.isArray(checklists.inside)) {
                      extraTags.push(
                        ...checklists.inside.map((t: any) => checklistTag(TAG_PREFIX.inside, String(t)))
                      );
                    }
                    if (Array.isArray(checklists.after)) {
                      extraTags.push(
                        ...checklists.after.map((t: any) => checklistTag(TAG_PREFIX.after, String(t)))
                      );
                    }
                    if (Array.isArray(checklists.strategy)) {
                      extraTags.push(
                        ...checklists.strategy.map((t: any) => checklistTag(TAG_PREFIX.strategy, String(t)))
                      );
                    }
                    if (Array.isArray(checklists.impulses)) {
                      extraTags.push(...checklists.impulses.map((t: any) => String(t)));
                    }
                    if (Array.isArray(checklists.states)) {
                      extraTags.push(...checklists.states.map((t: any) => String(t)));
                    }
                  }
                  const allTags = [...entryTags, ...extraTags].filter(Boolean);
                  if (allTags.length) {
                    setChecklistPresets((prev) => mergeChecklistPresetsWithTags(allTags, prev));
                  }
                } catch {
                  setNotesExtra({});
                  setMindset(DEFAULT_MINDSET);
                  setAfterReview(DEFAULT_AFTER_REVIEW);
                }
              } else {
                // Legacy plain string
                setPremarketHtml(String(notesStr));
                setInsideHtml("");
                setAfterHtml("");
                setNotesExtra({});
                setMindset(DEFAULT_MINDSET);
                setAfterReview(DEFAULT_AFTER_REVIEW);
              }
            } catch {
              // Legacy plain string
              setPremarketHtml(String(notesStr));
              setInsideHtml("");
              setAfterHtml("");
              setNotesExtra({});
              setMindset(DEFAULT_MINDSET);
              setAfterReview(DEFAULT_AFTER_REVIEW);
            }
          } else {
            setPremarketHtml("");
            setInsideHtml("");
            setAfterHtml("");
            setNotesExtra({});
            setMindset(DEFAULT_MINDSET);
            setAfterReview(DEFAULT_AFTER_REVIEW);
          }

          const entryTags = Array.isArray((existing as any)?.tags) ? (existing as any).tags : [];
          if (entryTags.length) {
            setChecklistPresets((prev) => mergeChecklistPresetsWithTags(entryTags, prev));
          }
        } else {
          // No journal_entries row yet (import-only day, first open, etc.)
          setEntry((prev) => ({ ...prev, date: dateParam }));
          setPnlFromDb(null);
          setPnlMode("auto");
          setPnlInput("");
          setPremarketHtml("");
          setInsideHtml("");
          setAfterHtml("");
          setNotesExtra({});
          setMindset(DEFAULT_MINDSET);
          setAfterReview(DEFAULT_AFTER_REVIEW);
        }

        const storedEntries = Array.isArray((storedTrades as any)?.entries)
          ? ((storedTrades as any).entries as any[])
          : [];
        const storedExits = Array.isArray((storedTrades as any)?.exits)
          ? ((storedTrades as any).exits as any[])
          : [];

        const hasStoredTrades = storedEntries.length > 0 || storedExits.length > 0;

        if (hasStoredTrades) {
          const normEntry: EntryTradeRow[] = storedEntries.map((r: any) => ({
            id: String(r.id ?? crypto.randomUUID()),
            symbol: String(r.symbol ?? "").toUpperCase(),
            kind: (r.kind ?? "other") as InstrumentType,

            side: toSideType(r.side),
            premiumSide: toPremiumSide(r.premiumSide ?? r.premium),
            optionStrategy: toOptionStrategy(r.optionStrategy ?? r.strategy),

            price: r.price != null ? String(r.price) : "",
            quantity: r.quantity != null ? String(r.quantity) : "",
            time: String(r.time ?? ""),

            dte: r.dte ?? null,
            expiry: (r as any).expiry ?? null,
          }));

          const normExit: ExitTradeRow[] = storedExits.map((r: any) => ({
            id: String(r.id ?? crypto.randomUUID()),
            symbol: String(r.symbol ?? "").toUpperCase(),
            kind: (r.kind ?? "other") as InstrumentType,

            side: toSideType(r.side),
            premiumSide: toPremiumSide(r.premiumSide ?? r.premium),
            optionStrategy: toOptionStrategy(r.optionStrategy ?? r.strategy),

            price: r.price != null ? String(r.price) : "",
            quantity: r.quantity != null ? String(r.quantity) : "",
            time: String(r.time ?? ""),

            dte: r.dte ?? null,
            expiry: (r as any).expiry ?? null,
          }));

          setEntryTrades(normEntry);
          setExitTrades(normExit);
        } else {
          // Fallback to legacy notes payload
          setEntryTrades(Array.isArray(fallbackEntries) ? (fallbackEntries as any) : []);
          setExitTrades(Array.isArray(fallbackExits) ? (fallbackExits as any) : []);
        }
      } catch (err) {
        console.error("Error loading journal entry:", err);
      } finally {
        if (active) {
          autoSaveReadyRef.current = true;
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [dateParam, userId, authLoading, accountsLoading, activeAccountId]);

  const parsedDate = useMemo(() => {
    try {
      const [y, m, d] = dateParam.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "2-digit",
        timeZone: "UTC",
      }).format(dt);
    } catch {
      return dateParam;
    }
  }, [dateParam]);

  const prevDateIso = useMemo(() => (dateParam ? nextJournalDate(dateParam, -1) : null), [dateParam]);
  const nextDateIso = useMemo(() => (dateParam ? nextJournalDate(dateParam, 1) : null), [dateParam]);

  /* =========================================================
     Entries handlers
  ========================================================= */

  const handleAddEntryTrade = () => {
    const symbol = newEntryTrade.symbol.trim().toUpperCase();
    if (!symbol || !newEntryTrade.price.trim()) return;

    // User manually changed trades → switch PnL to auto mode (computed from Entries/Exits)
    setPnlMode("auto");

    let finalKind: InstrumentType = newEntryTrade.kind;
    if (finalKind === "option" && !looksLikeOptionContract(symbol)) finalKind = "stock";

    let dte: number | null = null;
    let expiryStr: string | null = null;

    if (finalKind === "option") {
      const parsed = parseSPXOptionSymbol(symbol);
      if (parsed) {
        dte = calcDTE(dateParam, parsed.expiry);
        expiryStr = parsed.expiry.toISOString().slice(0, 10);
      }
    }

    const timeToSave = newEntryTrade.time || nowTimeLabel();

    setEntryTrades((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ...newEntryTrade,
        kind: finalKind,
        symbol,
        time: timeToSave,
        dte,
        expiry: expiryStr,
        premiumSide: normalizePremiumSide(finalKind, newEntryTrade.premiumSide),
        optionStrategy: normalizeStrategy(newEntryTrade.optionStrategy),
      },
    ]);

    setNewEntryTrade((p) => ({ ...p, symbol: "", price: "", quantity: "", time: nowTimeLabel(), dte: null, expiry: null }));
  };

  const handleDeleteEntryTrade = (id: string) => {
    setPnlMode("auto");
    setEntryTrades((prev) => prev.filter((t) => t.id !== id));
  };

  /* =========================================================
     Open positions (for exits dropdown)
  ========================================================= */

  const openPositions = useMemo(() => {
    const key = (s: string, k: InstrumentType, side: SideType, premiumSide: PremiumSide, strategy: OptionStrategy) =>
      `${s}|${k}|${side}|${premiumSide}|${strategy}`;

    const totals: Record<
      string,
      {
        symbol: string;
        kind: InstrumentType;
        side: SideType;
        premiumSide: PremiumSide;
        optionStrategy: OptionStrategy;
        entryQty: number;
        exitQty: number;
      }
    > = {};

    for (const e of entryTrades) {
      const sym = (e.symbol || "").trim().toUpperCase();
      if (!sym) continue;
      const kEff = effectiveKind(e.kind || "other", sym);
      const sideEff = e.side || "long";
      const premEff = normalizePremiumSide(kEff, e.premiumSide);
      const stratEff = normalizeStrategy(e.optionStrategy);

      const k = key(sym, kEff, sideEff, premEff, stratEff);
      totals[k] ||= { symbol: sym, kind: kEff, side: sideEff, premiumSide: premEff, optionStrategy: stratEff, entryQty: 0, exitQty: 0 };
      totals[k].entryQty += Number(e.quantity) || 0;
    }

    for (const x of exitTrades) {
      const sym = (x.symbol || "").trim().toUpperCase();
      if (!sym) continue;
      const kEff = effectiveKind(x.kind || "other", sym);
      const sideEff = x.side || "long";
      const premEff = normalizePremiumSide(kEff, x.premiumSide);
      const stratEff = normalizeStrategy(x.optionStrategy);

      const k = key(sym, kEff, sideEff, premEff, stratEff);
      totals[k] ||= { symbol: sym, kind: kEff, side: sideEff, premiumSide: premEff, optionStrategy: stratEff, entryQty: 0, exitQty: 0 };
      totals[k].exitQty += Number(x.quantity) || 0;
    }

    return Object.values(totals)
      .map((t) => ({ ...t, remainingQty: Math.max(0, t.entryQty - t.exitQty) }))
      .filter((t) => t.remainingQty > 0);
  }, [entryTrades, exitTrades]);

  /* =========================================================
     Exits handlers
  ========================================================= */

  const handlePickOpenPosition = (posKey: string) => {
    if (!posKey) return;
    const [symbol, kind, side, premiumSide, optionStrategy] = posKey.split("|") as [
      string,
      InstrumentType,
      SideType,
      PremiumSide,
      OptionStrategy
    ];

    const pos = openPositions.find(
      (p) =>
        p.symbol === symbol &&
        p.kind === kind &&
        p.side === side &&
        p.premiumSide === premiumSide &&
        p.optionStrategy === optionStrategy
    );

    if (!pos) return;

    setNewExitTrade({
      symbol: pos.symbol,
      kind: pos.kind,
      side: pos.side,
      premiumSide: pos.premiumSide,
      optionStrategy: pos.optionStrategy,
      price: "",
      quantity: String(pos.remainingQty),
      time: nowTimeLabel(),
      dte: null,
      expiry: null,
    });
  };

  const handleAddExitTrade = () => {
    const symbol = newExitTrade.symbol.trim().toUpperCase();
    if (!symbol || !newExitTrade.price.trim()) return;

    // User manually changed trades → switch PnL to auto mode (computed from Entries/Exits)
    setPnlMode("auto");

    let finalKind: InstrumentType = newExitTrade.kind;
    if (finalKind === "option" && !looksLikeOptionContract(symbol)) finalKind = "stock";

    let dte: number | null = null;
    let expiryStr: string | null = null;

    if (finalKind === "option") {
      const parsed = parseSPXOptionSymbol(symbol);
      if (parsed) {
        dte = calcDTE(dateParam, parsed.expiry);
        expiryStr = parsed.expiry.toISOString().slice(0, 10);
      }
    }

    const timeToSave = newExitTrade.time || nowTimeLabel();

    setExitTrades((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ...newExitTrade,
        kind: finalKind,
        symbol,
        time: timeToSave,
        dte,
        expiry: expiryStr,
        premiumSide: normalizePremiumSide(finalKind, newExitTrade.premiumSide),
        optionStrategy: normalizeStrategy(newExitTrade.optionStrategy),
      },
    ]);

    setNewExitTrade((p) => ({ ...p, price: "", time: nowTimeLabel(), dte: null, expiry: null }));
  };

  const handleDeleteExitTrade = (id: string) => {
    setPnlMode("auto");
    setExitTrades((prev) => prev.filter((t) => t.id !== id));
  };

  const entryAverages = useMemo(() => computeAverages(entryTrades), [entryTrades]);
  const exitAverages = useMemo(() => computeAverages(exitTrades), [exitTrades]);

  /* =========================================================
     ✅ Auto PnL (FIFO)
  ========================================================= */

  const pnlCalc = useMemo(() => computeAutoPnL(entryTrades, exitTrades), [entryTrades, exitTrades]);

  // Broker sync metadata (optional): stored inside journal_entries.notes by /api/journal/sync
  const brokerCommissionsRaw = useMemo(() => toNumOrNull((notesExtra as any)?.costs?.commissions), [notesExtra]);
  const brokerFeesRaw = useMemo(() => toNumOrNull((notesExtra as any)?.costs?.fees), [notesExtra]);
  const brokerCommissions = brokerCommissionsRaw ?? 0;
  const brokerFees = brokerFeesRaw ?? 0;
  const brokerCostsTotal = brokerCommissions + brokerFees;

  // Inputs (allow empty without snapping back to 0)
  const [commissionsInput, setCommissionsInput] = useState<string>("");
  const [feesInput, setFeesInput] = useState<string>("");

  useEffect(() => {
    setCommissionsInput(brokerCommissionsRaw != null ? String(brokerCommissionsRaw) : "");
  }, [brokerCommissionsRaw]);

  useEffect(() => {
    setFeesInput(brokerFeesRaw != null ? String(brokerFeesRaw) : "");
  }, [brokerFeesRaw]);

  const updateCostField = (field: "commissions" | "fees", raw: string) => {
    const value = raw.trim() === "" ? null : toNum(raw);
    setNotesExtra((prev) => {
      const currentCosts = (prev && typeof prev.costs === "object" ? (prev as any).costs : {}) as Record<string, any>;
      return {
        ...(prev || {}),
        costs: {
          ...currentCosts,
          [field]: value,
        },
      };
    });
    setPnlMode("auto");
  };

  const autoGrossPnl = useMemo(() => (Number.isFinite(pnlCalc.total) ? pnlCalc.total : 0), [pnlCalc.total]);
  const autoNetPnl = useMemo(() => autoGrossPnl - brokerCostsTotal, [autoGrossPnl, brokerCostsTotal]);

  const displayPnl = useMemo(() => {
    if (pnlMode === "db" && pnlFromDb != null && Number.isFinite(pnlFromDb)) {
      // If broker costs are present, prefer NET PnL. Some legacy rows may have saved gross.
      if (brokerCostsTotal > 0) {
        const eps = 0.01;
        if (Math.abs(pnlFromDb - autoNetPnl) <= eps) return pnlFromDb; // already net
        if (Math.abs(pnlFromDb - autoGrossPnl) <= eps) return autoNetPnl; // looks gross → convert to net
      }
      return pnlFromDb;
    }
    return autoNetPnl;
  }, [pnlMode, pnlFromDb, autoGrossPnl, autoNetPnl, brokerCostsTotal]);

  useEffect(() => {
    const v = Number.isFinite(displayPnl) ? displayPnl : 0;
    setEntry((p) => ({ ...p, pnl: v }));
    setPnlInput(v.toFixed(2));
  }, [displayPnl]);

  /* =========================================================
     Tags
  ========================================================= */

  const toggleTag = (tag: string) =>
    setEntry((prev) => {
      const current = prev.tags || [];
      const exists = current.includes(tag);
      const tags = exists ? current.filter((t) => t !== tag) : [...current, tag];
      return { ...prev, tags };
    });
  const tagLabel = (tag: string, map: Record<string, string>) => (isEs ? map[tag] ?? tag : tag);

  const SECTION_PREFIX: Record<keyof JournalChecklistPresets, string | null> = {
    premarket: TAG_PREFIX.premarket,
    inside: TAG_PREFIX.inside,
    after: TAG_PREFIX.after,
    strategy: TAG_PREFIX.strategy,
    impulses: null,
    states: null,
  };

  const normalizeItemText = (raw: string) => raw.trim().replace(/\s+/g, " ");

  const addChecklistItem = (section: keyof JournalChecklistPresets) => {
    const raw = newChecklistItem[section];
    const text = normalizeItemText(raw);
    if (!text) return;
    setChecklistPresets((prev) => {
      const existing = prev[section] || [];
      if (existing.some((i) => i.toLowerCase() === text.toLowerCase())) return prev;
      return { ...prev, [section]: [...existing, text] };
    });
    setNewChecklistItem((prev) => ({ ...prev, [section]: "" }));
  };

  const removeChecklistItem = (section: keyof JournalChecklistPresets, item: string) => {
    setChecklistPresets((prev) => ({
      ...prev,
      [section]: (prev[section] || []).filter((i) => i !== item),
    }));
    const prefix = SECTION_PREFIX[section];
    const tag = checklistTag(prefix, item);
    setEntry((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((t) => t !== tag),
    }));
  };

  const isChecklistSelected = (section: keyof JournalChecklistPresets, item: string) => {
    const prefix = SECTION_PREFIX[section];
    const tag = checklistTag(prefix, item);
    return (entry.tags || []).includes(tag);
  };

  const toggleChecklistItem = (section: keyof JournalChecklistPresets, item: string) => {
    const prefix = SECTION_PREFIX[section];
    const tag = checklistTag(prefix, item);
    toggleTag(tag);
  };

  const extractPrefixed = (tags: string[], prefix: string) =>
    tags
      .filter((t) => t.startsWith(prefix))
      .map((t) => t.slice(prefix.length).trim())
      .filter(Boolean);

  /* =========================================================
     Save (Supabase)
  ========================================================= */

  const handleSave = async (opts?: { silent?: boolean }): Promise<boolean> => {
    if (!userId) {
      if (!opts?.silent) {
        setMsg(L("Cannot save: no user.", "No se puede guardar: sin usuario."));
      }
      return false;
    }

    setSaving(true);
    setAutoSaveState("saving");
    if (!opts?.silent) {
      setMsg("");
    }

    const commissions = toNum((notesExtra as any)?.costs?.commissions);
    const fees = toNum((notesExtra as any)?.costs?.fees);
    const costsTotal = commissions + fees;

    const grossAuto = Number.isFinite(pnlCalc.total) ? pnlCalc.total : 0;
    const netAuto = grossAuto - costsTotal;

    const pnlToSave = (() => {
      if (pnlMode === "db" && pnlFromDb != null && Number.isFinite(pnlFromDb)) {
        if (costsTotal > 0) {
          const eps = 0.01;
          if (Math.abs(pnlFromDb - netAuto) <= eps) return pnlFromDb; // already net
          if (Math.abs(pnlFromDb - grossAuto) <= eps) return netAuto; // saved gross → convert to net
        }
        return pnlFromDb;
      }
      return netAuto;
    })();

    // Preserve any extra keys that may already exist in notes (e.g., broker sync metadata)
    const nextExtra: Record<string, any> = { ...(notesExtra || {}) };

    // Keep a pnl snapshot in notes (if desired / present)
    try {
      const prevPnlMeta = nextExtra.pnl && typeof nextExtra.pnl === "object" ? (nextExtra.pnl as any) : {};
      nextExtra.pnl = {
        ...prevPnlMeta,
        gross: Number.isFinite(Number(prevPnlMeta.gross)) ? Number(prevPnlMeta.gross) : Number(grossAuto.toFixed(2)),
        net: Number(pnlToSave.toFixed(2)),
      };
    } catch {
      // ignore
    }

    // Mindset + checklist snapshot for AI Coach and future analytics
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const checklistSnapshot = {
      premarket: extractPrefixed(tags, TAG_PREFIX.premarket),
      inside: extractPrefixed(tags, TAG_PREFIX.inside),
      after: extractPrefixed(tags, TAG_PREFIX.after),
      strategy: extractPrefixed(tags, TAG_PREFIX.strategy),
      impulses: checklistPresets.impulses.filter((t) => tags.includes(t)),
      states: checklistPresets.states.filter((t) => tags.includes(t)),
    };

    const hasMindset = Object.values(mindset || {}).some((v) => v !== null && v !== undefined);
    nextExtra.mindset = hasMindset ? { ...mindset } : null;
    nextExtra.checklists = checklistSnapshot;
    nextExtra.after_review = { ...afterReview };

    const notesPayload = JSON.stringify({
      ...nextExtra,
      premarket: premarketHtml,
      live: insideHtml,
      post: afterHtml,
      entries: entryTrades,
      exits: exitTrades,
    });

    const entryToSave = {
      ...entry,
      user_id: userId,
      date: dateParam,
      notes: notesPayload,
      pnl: Number(pnlToSave.toFixed(2)),
    };

    try {
      await saveJournalEntry(userId, entryToSave as any, activeAccountId);

      const storedEntries = entryTrades.map(entryRowToStored);
      const storedExits = exitTrades.map(exitRowToStored);

      await saveJournalTradesForDay(userId, dateParam, {
        entries: storedEntries,
        exits: storedExits,
      } as any, activeAccountId);

      // Avoid re-marking the form as dirty from our own save-side state updates.
      autoSaveIgnoreNextRef.current = true;
      setNotesExtra(nextExtra);
      setPnlFromDb(Number(pnlToSave.toFixed(2)));
      setPnlMode("db");
      setAutoSaveDirty(false);
      setAutoSaveState("saved");
      setTimeout(() => setAutoSaveState("idle"), 1500);

      if (!opts?.silent) {
        setMsg(L("Saved ✅", "Guardado ✅"));
        setTimeout(() => setMsg(""), 2000);
      }
      if (userId) {
        void syncMyTrophies(String(userId)).catch((err) => {
          console.warn("[Journal] trophy sync failed:", err);
        });
      }
      try {
        window.dispatchEvent(new Event("ntj_alert_engine_run_now"));
      } catch {
        // ignore
      }
      return true;
    } catch (err: any) {
      console.error(err);
      setAutoSaveState("error");
      if (!opts?.silent) {
        setMsg(err?.message ?? L("Save failed", "Error al guardar"));
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndBack = async () => {
    const ok = await handleSave();
    if (!ok) return;
    router.push("/dashboard");
  };

  /* =========================================================
     Manual save dirty tracking (auto-save disabled)
  ========================================================= */

  useEffect(() => {
    if (!autoSaveReadyRef.current) return;
    if (autoSaveIgnoreNextRef.current) {
      autoSaveIgnoreNextRef.current = false;
      return;
    }
    setAutoSaveDirty(true);
    setAutoSaveState("idle");
  }, [premarketHtml, insideHtml, afterHtml, entryTrades, exitTrades, entry, notesExtra, mindset, afterReview]);

  /* =========================================================
     Import / Sync
  ========================================================= */

  const [syncing, setSyncing] = useState(false);
  const IMPORT_PATH = "/import";

  const handleGoToImport = () => {
    router.push(IMPORT_PATH);
  };

  const handleSyncFromImport = async () => {
    if (!userId || !dateParam || !activeAccountId) {
      setMsg(L("Cannot sync: missing user/date.", "No se puede sincronizar: falta usuario/fecha."));
      return;
    }

    setSyncing(true);
    setMsg("");

    try {
      const {
        data: { session },
        error: sessionErr,
      } = await supabaseBrowser.auth.getSession();

      if (sessionErr || !session?.access_token) {
        setMsg(L("Cannot sync: not authenticated.", "No se puede sincronizar: no autenticado."));
        return;
      }

      const res = await fetch("/api/journal/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ date: dateParam, accountId: activeAccountId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(json?.error ? `${L("Sync error:", "Error de sync:")} ${json.error}` : L("Sync error.", "Error de sync."));
        return;
      }

      const found = json?.trades_found ?? 0;
      const groups = json?.groups ?? 0;
      const updated = json?.updated ?? 0;

      setMsg(`Synced ${found} trades → ${groups} groups (${updated} updated).`);
      setTimeout(() => setMsg(""), 2500);

      // rehydrate
      const freshEntry = await getJournalEntryByDate(userId, dateParam, activeAccountId);
      if (freshEntry) setEntry((prev) => ({ ...prev, ...freshEntry, date: dateParam }));

      const freshTrades = await getJournalTradesForDay(userId, dateParam, activeAccountId);

      const normEntry: EntryTradeRow[] = (freshTrades.entries ?? []).map((r: any) => ({
        id: String(r.id ?? crypto.randomUUID()),
        symbol: String(r.symbol ?? "").toUpperCase(),
        kind: (r.kind ?? "other") as InstrumentType,
        side: toSideType(r.side),
        premiumSide: toPremiumSide(r.premiumSide ?? (r as any).premium),
        optionStrategy: toOptionStrategy(r.optionStrategy ?? (r as any).strategy),
        price: r.price != null ? String(r.price) : "",
        quantity: r.quantity != null ? String(r.quantity) : "",
        time: String(r.time ?? ""),
        dte: r.dte ?? null,
        expiry: (r as any).expiry ?? null,
      }));

      const normExit: ExitTradeRow[] = (freshTrades.exits ?? []).map((r: any) => ({
        id: String(r.id ?? crypto.randomUUID()),
        symbol: String(r.symbol ?? "").toUpperCase(),
        kind: (r.kind ?? "other") as InstrumentType,
        side: toSideType(r.side),
        premiumSide: toPremiumSide(r.premiumSide ?? (r as any).premium),
        optionStrategy: toOptionStrategy(r.optionStrategy ?? (r as any).strategy),
        price: r.price != null ? String(r.price) : "",
        quantity: r.quantity != null ? String(r.quantity) : "",
        time: String(r.time ?? ""),
        dte: r.dte ?? null,
        expiry: (r as any).expiry ?? null,
      }));

      setEntryTrades(normEntry);
      setExitTrades(normExit);

      const freshPnlNum =
        freshEntry && typeof (freshEntry as any).pnl === "number"
          ? (freshEntry as any).pnl
          : Number((freshEntry as any)?.pnl);

      if (Number.isFinite(freshPnlNum)) {
        setPnlFromDb(freshPnlNum);
        setPnlMode("db");
      } else {
        setPnlFromDb(null);
        setPnlMode("auto");
      }

      // Update broker metadata from notes (costs/pnl/etc) WITHOUT overwriting the user's local rich-text edits
      try {
        const notesStr = freshEntry && typeof (freshEntry as any).notes === "string" ? (freshEntry as any).notes : "";
        if (notesStr) {
          const parsedNotes = JSON.parse(notesStr);
          if (parsedNotes && typeof parsedNotes === "object") {
            const { premarket, live, post, entries, exits, ...rest } = parsedNotes as any;
            setNotesExtra(rest && typeof rest === "object" ? (rest as any) : {});
            const storedMindset = (rest as any)?.mindset ?? (rest as any)?.journal_mindset ?? null;
            if (storedMindset && typeof storedMindset === "object") {
              setMindset(normalizeMindset(storedMindset));
            }
          }
        }
      } catch {
        // ignore
      }
    } catch (err) {
      console.error(err);
      setMsg(L("Error syncing trades.", "Error al sincronizar trades."));
    } finally {
      setSyncing(false);
    }
  };

  /* =========================================================
     Templates (Supabase)
  ========================================================= */

  const handleSaveTemplate = async () => {
    const name = newTemplateName.trim();
    if (!name) return;

    try {
      const payload = JSON.stringify({ premarket: premarketHtml, live: insideHtml, post: afterHtml });
      const created = await createJournalTemplate(userId, name, payload);
      setTemplates((prev) => (created ? [created, ...prev] : prev));
      setNewTemplateName("");
      setMsg(L("Template saved ✅", "Plantilla guardada ✅"));
      setTimeout(() => setMsg(""), 1600);
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message ?? L("Template save failed", "Error al guardar la plantilla"));
    }
  };

  const handleApplyTemplate = (tpl: JournalTemplate) => {
    if (!tpl.content) return;

    try {
      const parsed = JSON.parse(tpl.content);
      if (parsed && typeof parsed === "object") {
        setPremarketHtml(String(parsed.premarket ?? ""));
        setInsideHtml(String(parsed.live ?? ""));
        setAfterHtml(String(parsed.post ?? ""));
        return;
      }
    } catch {
      setPremarketHtml(tpl.content);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteJournalTemplate(userId, id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message ?? L("Delete failed", "Error al eliminar"));
    }
  };

  /* =========================================================
     Dictation (insert into Inside editor)
  ========================================================= */

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleDictation = () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      alert(
        L(
          "SpeechRecognition is not available in this browser.",
          "SpeechRecognition no está disponible en este navegador."
        )
      );
      return;
    }

    if (!recognitionRef.current) {
      const rec = new SR();
      rec.lang = isEs ? "es-ES" : "en-US";
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e: any) => {
        let txt = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          txt += e.results[i][0].transcript;
        }
        // Insert into TipTap editor
        try {
          insideEditorRef.current?.chain?.().focus?.().insertContent(txt.replace(/\n/g, "<br/>") + " ").run?.();
        } catch {
          // ignore
        }
      };

      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
    }

    if (!listening) {
      recognitionRef.current.start();
      setListening(true);
    } else {
      recognitionRef.current.stop();
      setListening(false);
    }
  };

  const ratingLabel = (v: number | null | undefined) => (Number.isFinite(Number(v)) ? `${Number(v)}/5` : "—");
  const tagPillClass = (checked: boolean) =>
    [
      "inline-flex items-center gap-1 px-2 py-1 rounded-full border transition",
      checked
        ? "bg-emerald-500/15 border-emerald-400/60 text-emerald-100"
        : "bg-slate-800/70 border-slate-600 text-slate-200 hover:border-slate-400/70",
    ].join(" ");
  const tagCheckboxClass =
    "h-4 w-4 rounded border-slate-500 bg-slate-900 text-emerald-400 shrink-0";

  const RatingSlider = ({
    label,
    value,
    onChange,
    left,
    right,
  }: {
    label: string;
    value: number | null;
    onChange: (v: number) => void;
    left: string;
    right: string;
  }) => {
    const val = Number.isFinite(Number(value)) ? Number(value) : 3;
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-slate-200 font-medium">{label}</p>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
            {ratingLabel(value)}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={val}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-emerald-400"
        />
        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      </div>
    );
  };

  /* =========================================================
     Averages + PnL
  ========================================================= */

  /* =========================================================
     Widgets
  ========================================================= */

  const WIDGETS: JournalWidgetDef[] = [
    {
      id: "premarket",
      title: L("Premarket Prep", "Preparación premarket"),
      defaultLayout: { i: "premarket", x: 0, y: 0, w: 7, h: 8, minW: 4, minH: 6 },
      render: () => (
        <WidgetCard title={L("Premarket Prep", "Preparación premarket")}>
          <RichTextEditor
            value={premarketHtml}
            onChange={setPremarketHtml}
            placeholder={L(
              "Premarket prep: bias, levels, planned setups, rules…",
              "Preparación premarket: sesgo, niveles, setups planificados, reglas…"
            )}
            minHeight={180}
          />
        </WidgetCard>
      ),
    },

    {
      id: "pnl",
      title: L("Day P&L", "P&L del día"),
      defaultLayout: { i: "pnl", x: 7, y: 0, w: 5, h: 3, minW: 3, minH: 2 },
      render: () => (
        <WidgetCard title={L("Day P&L", "P&L del día")} compact>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
              <p className="text-[12px] uppercase tracking-wide text-slate-300">
                {L("Auto P&L", "P&L Auto")}
              </p>
              <div className="mt-1 rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[16px] font-semibold text-slate-100">
                {pnlInput?.trim() ? pnlInput : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
              <label className="text-[12px] uppercase tracking-wide text-slate-300">
                {L("Commissions", "Comisiones")}
              </label>
              <div className="mt-1 flex items-center gap-1 rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[13px] text-slate-100 focus-within:border-emerald-400">
                <input
                  type="number"
                  value={commissionsInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCommissionsInput(val);
                    updateCostField("commissions", val);
                  }}
                  className="w-full bg-transparent text-[14px] text-slate-100 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
              <label className="text-[12px] uppercase tracking-wide text-slate-300">
                {L("Fees", "Fees")}
              </label>
              <div className="mt-1 flex items-center gap-1 rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[13px] text-slate-100 focus-within:border-emerald-400">
                <input
                  type="number"
                  value={feesInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFeesInput(val);
                    updateCostField("fees", val);
                  }}
                  className="w-full bg-transparent text-[14px] text-slate-100 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </WidgetCard>
      ),
    },

    {
      id: "entries",
      title: L("Entries", "Entradas"),
      defaultLayout: { i: "entries", x: 7, y: 3, w: 5, h: 7, minW: 4, minH: 6 },
      render: () => (
        <WidgetCard title={L("Entries", "Entradas")}>
          <div className="grid grid-cols-1 md:grid-cols-8 gap-2 text-sm">
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                {L("Symbol / Contract", "Símbolo / Contrato")}
              </label>
              <input
                type="text"
                value={newEntryTrade.symbol}
                onChange={(e) => {
                  const up = e.target.value.toUpperCase();
                  setNewEntryTrade((p) => ({ ...p, symbol: up }));
                }}
                style={{ textTransform: "uppercase" }}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400 uppercase"
                placeholder="SPXW251121C6565"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Type", "Tipo")}</label>
              <select
                value={newEntryTrade.kind}
                onChange={(e) => setNewEntryTrade((p) => ({ ...p, kind: e.target.value as InstrumentType }))}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                {kindOptions.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Side", "Lado")}</label>
              <select
                value={newEntryTrade.side}
                onChange={(e) => setNewEntryTrade((p) => ({ ...p, side: e.target.value as SideType }))}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                <option value="long">{L("LONG", "LARGO")}</option>
                <option value="short">{L("SHORT", "CORTO")}</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Premium", "Prima")}</label>
              <select
                value={newEntryTrade.premiumSide}
                onChange={(e) => setNewEntryTrade((p) => ({ ...p, premiumSide: e.target.value as PremiumSide }))}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                {premiumOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                {L("Option strategy", "Estrategia de opciones")}
              </label>
              <select
                value={newEntryTrade.optionStrategy}
                onChange={(e) => setNewEntryTrade((p) => ({ ...p, optionStrategy: e.target.value as OptionStrategy }))}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                {strategyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Price", "Precio")}</label>
              <input
                type="number"
                value={newEntryTrade.price}
                onChange={(e) => setNewEntryTrade((p) => ({ ...p, price: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Quantity", "Cantidad")}</label>
              <input
                type="number"
                value={newEntryTrade.quantity}
                onChange={(e) => setNewEntryTrade((p) => ({ ...p, quantity: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Time", "Hora")}</label>
              <input
                type="text"
                value={newEntryTrade.time}
                onChange={(e) => setNewEntryTrade((p) => ({ ...p, time: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300"
              />
              <button
                type="button"
                className="text-[11px] text-emerald-300 mt-1"
                onClick={() => setNewEntryTrade((p) => ({ ...p, time: nowTimeLabel() }))}
              >
                {L("use current time", "usar hora actual")}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddEntryTrade}
            className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
          >
            {L("Add entry", "Agregar entrada")}
          </button>

          {entryTrades.length > 0 && (
            <div className="space-y-2 text-xs mt-3">
              <table className="w-full text-left text-[12px] border border-slate-800 rounded-lg overflow-hidden">
                <thead className="bg-slate-900/80">
                  <tr>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Symbol", "Símbolo")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Type", "Tipo")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Side", "Lado")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Premium", "Prima")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Strategy", "Estrategia")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Price", "Precio")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Qty", "Cant.")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Time", "Hora")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">DTE</th>
                    <th className="px-2 py-1 border-b border-slate-800 text-right">–</th>
                  </tr>
                </thead>
                <tbody>
                  {entryTrades.map((t) => (
                    <tr key={t.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{t.symbol}</td>
                      <td className="px-2 py-1">{t.kind}</td>
                      <td className="px-2 py-1">{t.side}</td>
                      <td className="px-2 py-1">{premiumLabel(t.kind, t.premiumSide, lang)}</td>
                      <td className="px-2 py-1">{strategyLabel(t.kind, t.optionStrategy, lang)}</td>
                      <td className="px-2 py-1">{t.price}</td>
                      <td className="px-2 py-1">{t.quantity}</td>
                      <td className="px-2 py-1">{t.time}</td>
                      <td className="px-2 py-1">{t.kind === "option" ? (t.dte ?? "—") : "—"}</td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteEntryTrade(t.id)}
                          className="text-slate-500 hover:text-sky-300"
                          title={L("Delete entry", "Eliminar entrada")}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pt-1 border-t border-slate-800 mt-1">
                <p className="text-[11px] text-slate-400 mb-1">
                  {L("Average entry price per symbol/type", "Precio promedio de entrada por símbolo/tipo")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {entryAverages.map((a) => (
                    <span key={`${a.symbol}|${a.kind}`} className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px]">
                      {a.symbol} ({a.kind}): {a.avg.toFixed(2)} · {L("qty", "cant.")} {a.qty}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </WidgetCard>
      ),
    },

    {
      id: "exits",
      title: L("Exits", "Salidas"),
      defaultLayout: { i: "exits", x: 7, y: 10, w: 5, h: 6, minW: 4, minH: 5 },
      render: () => (
        <WidgetCard title={L("Exits", "Salidas")}>
          <div className="grid grid-cols-1 md:grid-cols-8 gap-2 text-sm">
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                {L("Close position", "Cerrar posición")}
              </label>
              <select
                value={
                  newExitTrade.symbol
                    ? [
                        newExitTrade.symbol,
                        effectiveKind(newExitTrade.kind, newExitTrade.symbol),
                        newExitTrade.side,
                        normalizePremiumSide(newExitTrade.kind, newExitTrade.premiumSide),
                        normalizeStrategy(newExitTrade.optionStrategy),
                      ].join("|")
                    : ""
                }
                onChange={(e) => handlePickOpenPosition(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                <option value="">{L("Select…", "Seleccionar…")}</option>
                {openPositions.map((p) => (
                  <option
                    key={[p.symbol, p.kind, p.side, p.premiumSide, p.optionStrategy].join("|")}
                    value={[p.symbol, p.kind, p.side, p.premiumSide, p.optionStrategy].join("|")}
                  >
                    {p.symbol} ({p.kind}) {p.side.toUpperCase()} · {premiumLabel(p.kind, p.premiumSide, lang)} ·{" "}
                    {strategyLabel(p.kind, p.optionStrategy, lang)} · {L("rem", "rest")}{` ${p.remainingQty}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Type", "Tipo")}</label>
              <input readOnly value={newExitTrade.kind} className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300" />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Side", "Lado")}</label>
              <input readOnly value={newExitTrade.side} className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300" />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Premium", "Prima")}</label>
              <input readOnly value={premiumLabel(newExitTrade.kind, newExitTrade.premiumSide, lang)} className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300" />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                {L("Option strategy", "Estrategia de opciones")}
              </label>
              <input readOnly value={strategyLabel(newExitTrade.kind, newExitTrade.optionStrategy, lang)} className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300" />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Exit price", "Precio de salida")}</label>
              <input type="number" value={newExitTrade.price} onChange={(e) => setNewExitTrade((p) => ({ ...p, price: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400" />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Qty to close", "Cantidad a cerrar")}</label>
              <input type="number" value={newExitTrade.quantity} onChange={(e) => setNewExitTrade((p) => ({ ...p, quantity: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400" />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">{L("Time", "Hora")}</label>
              <input type="text" value={newExitTrade.time} onChange={(e) => setNewExitTrade((p) => ({ ...p, time: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300" />
              <button type="button" className="text-[11px] text-emerald-300 mt-1" onClick={() => setNewExitTrade((p) => ({ ...p, time: nowTimeLabel() }))}>
                {L("use current time", "usar hora actual")}
              </button>
            </div>
          </div>

          <button type="button" onClick={handleAddExitTrade} className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition">
            {L("Add exit", "Agregar salida")}
          </button>

          {exitTrades.length > 0 && (
            <div className="space-y-2 text-xs mt-3">
              <table className="w-full text-left text-[12px] border border-slate-800 rounded-lg overflow-hidden">
                <thead className="bg-slate-900/80">
                  <tr>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Symbol", "Símbolo")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Type", "Tipo")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Side", "Lado")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Premium", "Prima")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Strategy", "Estrategia")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Price", "Precio")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Qty", "Cant.")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">{L("Time", "Hora")}</th>
                    <th className="px-2 py-1 border-b border-slate-800">DTE</th>
                    <th className="px-2 py-1 border-b border-slate-800 text-right">–</th>
                  </tr>
                </thead>
                <tbody>
                  {exitTrades.map((t) => (
                    <tr key={t.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{t.symbol}</td>
                      <td className="px-2 py-1">{t.kind}</td>
                      <td className="px-2 py-1">{t.side}</td>
                      <td className="px-2 py-1">{premiumLabel(t.kind, t.premiumSide, lang)}</td>
                      <td className="px-2 py-1">{strategyLabel(t.kind, t.optionStrategy, lang)}</td>
                      <td className="px-2 py-1">{t.price}</td>
                      <td className="px-2 py-1">{t.quantity}</td>
                      <td className="px-2 py-1">{t.time}</td>
                      <td className="px-2 py-1">{t.kind === "option" ? (t.dte ?? "—") : "—"}</td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteExitTrade(t.id)}
                          className="text-slate-500 hover:text-sky-300"
                          title={L("Delete exit", "Eliminar salida")}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pt-1 border-t border-slate-800 mt-1">
                <p className="text-[11px] text-slate-400 mb-1">
                  {L("Average exit price per symbol/type", "Precio promedio de salida por símbolo/tipo")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {exitAverages.map((a) => (
                    <span key={`${a.symbol}|${a.kind}`} className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px]">
                      {a.symbol} ({a.kind}): {a.avg.toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </WidgetCard>
      ),
    },

    {
      id: "inside",
      title: L("Inside the Trade", "Dentro del trade"),
      defaultLayout: { i: "inside", x: 0, y: 8, w: 7, h: 8, minW: 4, minH: 6 },
      render: () => (
        <WidgetCard
          title={L("Inside the Trade", "Dentro del trade")}
          right={
            <button
              type="button"
              onClick={toggleDictation}
              className={`px-2 py-1 rounded ${listening ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-200"} text-xs hover:bg-slate-700`}
            >
              {listening ? L("● Stop dictation", "● Detener dictado") : L("Start dictation", "Iniciar dictado")}
            </button>
          }
        >
          <RichTextEditor
            value={insideHtml}
            onChange={setInsideHtml}
            placeholder={L(
              "During the trade: execution notes, management decisions, mistakes, emotions…",
              "Durante el trade: notas de ejecución, decisiones de manejo, errores, emociones…"
            )}
            minHeight={180}
            onReady={(ed: any) => {
              insideEditorRef.current = ed;
            }}
          />
        </WidgetCard>
      ),
    },

    {
      id: "after",
      title: L("After-trade Analysis", "Análisis post‑trade"),
      defaultLayout: { i: "after", x: 0, y: 16, w: 7, h: 8, minW: 4, minH: 6 },
      render: () => (
        <WidgetCard title={L("After-trade Analysis", "Análisis post‑trade")}>
          <RichTextEditor
            value={afterHtml}
            onChange={setAfterHtml}
            placeholder={L(
              "Post-trade: what went right/wrong, process corrections, rule breaks, next actions…",
              "Post-trade: qué salió bien/mal, correcciones de proceso, rompimientos de reglas, próximos pasos…"
            )}
            minHeight={180}
          />
          <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">
              {L("After‑Trade Checklist (optional)", "Checklist post‑trade (opcional)")}
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[13px]">
              {AFTER_REVIEW_ITEMS.map((item) => (
                <label
                  key={item.id}
                  className={tagPillClass(!!afterReview.checklist[item.id]) + " px-3 py-2 rounded-lg"}
                >
                  <input
                    type="checkbox"
                    checked={!!afterReview.checklist[item.id]}
                    onChange={() =>
                      setAfterReview((prev) => ({
                        ...prev,
                        checklist: { ...prev.checklist, [item.id]: !prev.checklist[item.id] },
                      }))
                    }
                    className={`${tagCheckboxClass} mt-0.5`}
                  />
                  <span className="text-slate-200">{L(item.en, item.es)}</span>
                </label>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <RatingSlider
                label={L("Exit execution", "Ejecución de salida")}
                value={afterReview.ratings.execution}
                onChange={(v) =>
                  setAfterReview((prev) => ({ ...prev, ratings: { ...prev.ratings, execution: v } }))
                }
                left={L("Poor", "Baja")}
                right={L("Excellent", "Excelente")}
              />
              <RatingSlider
                label={L("Patience", "Paciencia")}
                value={afterReview.ratings.patience}
                onChange={(v) =>
                  setAfterReview((prev) => ({ ...prev, ratings: { ...prev.ratings, patience: v } }))
                }
                left={L("Low", "Baja")}
                right={L("High", "Alta")}
              />
              <RatingSlider
                label={L("Mental clarity", "Claridad mental")}
                value={afterReview.ratings.clarity}
                onChange={(v) =>
                  setAfterReview((prev) => ({ ...prev, ratings: { ...prev.ratings, clarity: v } }))
                }
                left={L("Foggy", "Nublada")}
                right={L("Clear", "Clara")}
              />
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  {L("What I did well", "Lo que hice bien")}
                </label>
                <textarea
                  rows={2}
                  value={afterReview.notes.didWell}
                  onChange={(e) =>
                    setAfterReview((prev) => ({ ...prev, notes: { ...prev.notes, didWell: e.target.value } }))
                  }
                  className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                  placeholder={L("Short and direct…", "Corto y directo…")}
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wide text-slate-400">
                  {L("What to fix next time", "Qué corregir la próxima vez")}
                </label>
                <textarea
                  rows={2}
                  value={afterReview.notes.improve}
                  onChange={(e) =>
                    setAfterReview((prev) => ({ ...prev, notes: { ...prev.notes, improve: e.target.value } }))
                  }
                  className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                  placeholder={L("One clear improvement…", "Una mejora clara…")}
                />
              </div>
            </div>
          </details>
        </WidgetCard>
      ),
    },

    {
      id: "emotional",
      title: L("Mindset & Impulse", "Mentalidad e impulsos"),
      defaultLayout: { i: "emotional", x: 7, y: 16, w: 5, h: 6, minW: 3, minH: 4 },
      render: () => (
        <WidgetCard
          title={L("Mindset & Impulse", "Mentalidad e impulsos")}
          right={
            <button
              type="button"
              onClick={() => setEditMindset((v) => !v)}
              className="px-2 py-1 rounded-md border border-slate-700 text-[11px] text-slate-300 hover:text-white hover:border-slate-500"
            >
              {editMindset ? L("Done", "Listo") : L("Customize", "Personalizar")}
            </button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RatingSlider
              label={L("Emotional balance", "Balance emocional")}
              value={mindset.emotional_balance}
              onChange={(v) => setMindset((prev) => ({ ...prev, emotional_balance: v }))}
              left={L("Unstable", "Inestable")}
              right={L("Calm", "Calmado")}
            />
            <RatingSlider
              label={L("Impulse control", "Control de impulsos")}
              value={mindset.impulse_control}
              onChange={(v) => setMindset((prev) => ({ ...prev, impulse_control: v }))}
              left={L("Reactive", "Reactivo")}
              right={L("Disciplined", "Disciplinado")}
            />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-200 text-sm font-semibold">
                {L("State tags", "Estado")}
              </p>
              {editMindset && (
                <span className="text-[11px] text-slate-500">
                  {L("Add or remove tags", "Añadir o quitar etiquetas")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
              {checklistPresets.states.map((t) => (
                <label key={t} className={tagPillClass(!!entry.tags?.includes(t))}>
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className={tagCheckboxClass}
                  />
                  <span className="wrap-break-word">{tagLabel(t, STATE_ITEM_LABELS)}</span>
                  {editMindset && (
                    <button
                      type="button"
                      onClick={() => removeChecklistItem("states", t)}
                      className="ml-1 text-slate-500 hover:text-rose-400"
                      title={L("Remove", "Eliminar")}
                    >
                      ✕
                    </button>
                  )}
                </label>
              ))}
            </div>
            {editMindset && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newChecklistItem.states}
                  onChange={(e) => setNewChecklistItem((prev) => ({ ...prev, states: e.target.value }))}
                  placeholder={L("Add state tag", "Añadir etiqueta")}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => addChecklistItem("states")}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400"
                >
                  {L("Add", "Añadir")}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 pt-3 mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-200 text-sm font-semibold">
                {L("Impulse triggers", "Impulsos")}
              </p>
              {editMindset && (
                <span className="text-[11px] text-slate-500">
                  {L("Track only what matters", "Solo lo importante")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
              {checklistPresets.impulses.map((t) => (
                <label key={t} className={tagPillClass(!!entry.tags?.includes(t))}>
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className={tagCheckboxClass}
                  />
                  <span className="wrap-break-word">{tagLabel(t, IMPULSE_ITEM_LABELS)}</span>
                  {editMindset && (
                    <button
                      type="button"
                      onClick={() => removeChecklistItem("impulses", t)}
                      className="ml-1 text-slate-500 hover:text-rose-400"
                      title={L("Remove", "Eliminar")}
                    >
                      ✕
                    </button>
                  )}
                </label>
              ))}
            </div>
            {editMindset && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newChecklistItem.impulses}
                  onChange={(e) => setNewChecklistItem((prev) => ({ ...prev, impulses: e.target.value }))}
                  placeholder={L("Add impulse tag", "Añadir impulso")}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => addChecklistItem("impulses")}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400"
                >
                  {L("Add", "Añadir")}
                </button>
              </div>
            )}
          </div>
        </WidgetCard>
      ),
    },

    {
      id: "strategy",
      title: L("Process & Strategy", "Proceso y estrategia"),
      defaultLayout: { i: "strategy", x: 7, y: 22, w: 5, h: 8, minW: 3, minH: 4 },
      render: () => (
        <WidgetCard
          title={L("Process & Strategy", "Proceso y estrategia")}
          right={
            <button
              type="button"
              onClick={() => setEditProcess((v) => !v)}
              className="px-2 py-1 rounded-md border border-slate-700 text-[11px] text-slate-300 hover:text-white hover:border-slate-500"
            >
              {editProcess ? L("Done", "Listo") : L("Customize", "Personalizar")}
            </button>
          }
        >
          <div className="flex items-center gap-2 mb-3">
            {PROCESS_PHASES.map((phase) => {
              const on = processPhase === phase;
              return (
                <button
                  key={phase}
                  type="button"
                  onClick={() => setProcessPhase(phase)}
                  className={`px-3 py-1 rounded-full text-xs border ${on ? "bg-emerald-500 text-slate-950 border-emerald-400" : "bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500"}`}
                >
                  {PROCESS_LABELS[phase][lang]}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
            {checklistPresets[processPhase].map((t) => (
              <label key={`${processPhase}-${t}`} className={tagPillClass(isChecklistSelected(processPhase, t))}>
                <input
                  type="checkbox"
                  onChange={() => toggleChecklistItem(processPhase, t)}
                  checked={isChecklistSelected(processPhase, t)}
                  className={tagCheckboxClass}
                />
                <span className="wrap-break-word">{tagLabel(t, PROCESS_ITEM_LABELS)}</span>
                {editProcess && (
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(processPhase, t)}
                    className="ml-1 text-slate-500 hover:text-rose-400"
                    title={L("Remove", "Eliminar")}
                  >
                    ✕
                  </button>
                )}
              </label>
            ))}
          </div>

          {editProcess && (
            <div className="mt-2 flex gap-2">
              <input
                value={newChecklistItem[processPhase]}
                onChange={(e) => setNewChecklistItem((prev) => ({ ...prev, [processPhase]: e.target.value }))}
                placeholder={L("Add checklist item", "Añadir item")}
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={() => addChecklistItem(processPhase)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400"
              >
                {L("Add", "Añadir")}
              </button>
            </div>
          )}

          <div className="border-t border-slate-800 pt-3 mt-4">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              {L("Strategy checklist", "Checklist de estrategia")}
            </p>
            <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
              {checklistPresets.strategy.map((t) => (
                <label key={t} className={tagPillClass(isChecklistSelected("strategy", t))}>
                  <input
                    type="checkbox"
                    onChange={() => toggleChecklistItem("strategy", t)}
                    checked={isChecklistSelected("strategy", t)}
                    className={tagCheckboxClass}
                  />
                  <span className="wrap-break-word">{tagLabel(t, STRATEGY_ITEM_LABELS)}</span>
                  {editProcess && (
                    <button
                      type="button"
                      onClick={() => removeChecklistItem("strategy", t)}
                      className="ml-1 text-slate-500 hover:text-rose-400"
                      title={L("Remove", "Eliminar")}
                    >
                      ✕
                    </button>
                  )}
                </label>
              ))}
            </div>
            {editProcess && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newChecklistItem.strategy}
                  onChange={(e) => setNewChecklistItem((prev) => ({ ...prev, strategy: e.target.value }))}
                  placeholder={L("Add strategy item", "Añadir estrategia")}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => addChecklistItem("strategy")}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400"
                >
                  {L("Add", "Añadir")}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <RatingSlider
                label={L("Setup quality", "Calidad del setup")}
                value={mindset.setup_quality}
                onChange={(v) => setMindset((prev) => ({ ...prev, setup_quality: v }))}
                left={L("Weak", "Débil")}
                right={L("Strong", "Fuerte")}
              />
              <RatingSlider
                label={L("Probability rating", "Probabilidad")}
                value={mindset.probability}
                onChange={(v) => setMindset((prev) => ({ ...prev, probability: v }))}
                left={L("Low", "Baja")}
                right={L("High", "Alta")}
              />
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 mt-4">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              {L("Exit evidence", "Evidencia de salida")}
            </p>
            <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
              {EXIT_REASON_TAGS.map((t) => (
                <label key={t} className={tagPillClass(!!entry.tags?.includes(t))}>
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className={tagCheckboxClass}
                  />
                  <span className="wrap-break-word">{tagLabel(t, EXIT_REASON_LABELS)}</span>
                </label>
              ))}
            </div>
          </div>
        </WidgetCard>
      ),
    },

    {
      id: "templates",
      title: L("Templates", "Plantillas"),
      defaultLayout: { i: "templates", x: 0, y: 30, w: 12, h: 5, minW: 6, minH: 4 },
      render: () => (
        <WidgetCard title={L("Templates (Premarket + Inside + After)", "Plantillas (Premarket + Dentro + Post)")}>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1 mb-3">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between gap-2 text-xs bg-slate-950/90 border border-slate-800 rounded-lg px-2 py-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="px-2 py-1 rounded bg-emerald-500/90 text-slate-950 text-[11px] font-semibold hover:bg-emerald-400"
                  >
                    {L("Apply", "Aplicar")}
                  </button>
                  <span className="text-slate-300">{tpl.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(tpl.id)}
                  className="text-slate-500 hover:text-sky-300"
                  title={L("Delete template", "Eliminar plantilla")}
                >
                  ✕
                </button>
              </div>
            ))}
            {templates.length === 0 && (
              <p className="text-xs text-slate-400">{L("No templates yet.", "Aún no hay plantillas.")}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-2">
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder={L("Template name", "Nombre de la plantilla")}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
            />
            <button type="button" onClick={handleSaveTemplate} className="px-4 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition">
              {L("Save current as template", "Guardar actual como plantilla")}
            </button>
          </div>
        </WidgetCard>
      ),
    },

  ];

  /* =========================================================
     Render
  ========================================================= */

  const sectionMap = useMemo(
    () => Object.fromEntries(WIDGETS.map((w) => [w.id, w])),
    [WIDGETS]
  );

  const WIZARD_STEPS = useMemo(
    () => [
      {
        key: "session",
        label: L("Premarket + In‑Trade", "Premarket + En‑trade"),
        description: L(
          "Premarket + in‑trade notes with mindset and trade evidence in one flow.",
          "Premarket + en‑trade con mindset y evidencia del trade en un solo flujo."
        ),
        sections: ["premarket", "inside", "emotional", "strategy", "entries", "exits", "templates"] as JournalWidgetId[],
      },
      {
        key: "after",
        label: L("After‑Trade", "Post‑trade"),
        description: L("Lessons, mistakes, and next actions.", "Lecciones, errores y próximos pasos."),
        sections: ["after"] as JournalWidgetId[],
      },
    ],
    [lang]
  );

  const stepCount = WIZARD_STEPS.length;
  const activeStep = WIZARD_STEPS[Math.min(currentStep, stepCount - 1)] || WIZARD_STEPS[0];
  const gridMode = activeStep?.key === "session";
  const fullWidthSections = useMemo(
    () => new Set<JournalWidgetId>(gridMode ? ["entries", "exits"] : []),
    [gridMode]
  );

  const goPrevStep = () => setCurrentStep((s) => Math.max(0, s - 1));
  const goNextStep = () => setCurrentStep((s) => Math.min(stepCount - 1, s + 1));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 md:px-8 py-6">
      {prevDateIso && (
        <button
          type="button"
          aria-label={L("Previous day", "Día anterior")}
          onClick={() => router.push(`/journal/${prevDateIso}`)}
          className="fixed left-3 md:left-5 top-1/2 -translate-y-1/2 z-40 h-11 w-11 rounded-full border border-slate-700 bg-slate-950/80 text-slate-200 shadow-lg hover:border-emerald-400 hover:text-emerald-300 transition"
        >
          ←
        </button>
      )}
      {nextDateIso && (
        <button
          type="button"
          aria-label={L("Next day", "Día siguiente")}
          onClick={() => router.push(`/journal/${nextDateIso}`)}
          className="fixed right-3 md:right-5 top-1/2 -translate-y-1/2 z-40 h-11 w-11 rounded-full border border-slate-700 bg-slate-950/80 text-slate-200 shadow-lg hover:border-emerald-400 hover:text-emerald-300 transition"
        >
          →
        </button>
      )}
      <div className="mx-auto w-full max-w-none">
        {/* Top */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-4">
          <div data-tour="journal-date-header">
            <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">
              {L("Daily Journal", "Journal diario")}
            </p>
            <h1 className="text-[28px] md:text-[32px] font-semibold mt-1">
              {parsedDate} — {L("session review", "revisión de sesión")}
            </h1>
            <p className="text-[15px] text-slate-400 mt-1">
              {L(
                "Log trades, screenshots, emotions and rule compliance.",
                "Registra trades, screenshots, emociones y cumplimiento de reglas."
              )}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="mr-0 sm:mr-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${
                  saving || autoSaveState === "saving"
                    ? "border-emerald-400/60 text-emerald-300 bg-emerald-500/10"
                    : autoSaveDirty
                    ? "border-amber-400/60 text-amber-300 bg-amber-500/10"
                    : autoSaveState === "saved"
                    ? "border-sky-400/60 text-sky-300 bg-sky-500/10"
                    : autoSaveState === "error"
                    ? "border-red-400/60 text-red-300 bg-red-500/10"
                    : "border-slate-700 text-slate-300 bg-slate-900/40"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    saving || autoSaveState === "saving"
                      ? "bg-emerald-300 animate-pulse"
                      : autoSaveDirty
                      ? "bg-amber-300"
                      : autoSaveState === "saved"
                      ? "bg-sky-300"
                      : autoSaveState === "error"
                      ? "bg-red-300"
                      : "bg-slate-500"
                  }`}
                />
                {saving || autoSaveState === "saving"
                  ? L("Saving…", "Guardando…")
                  : autoSaveDirty
                  ? L("Unsaved changes", "Cambios sin guardar")
                  : autoSaveState === "saved"
                  ? L("Saved", "Guardado")
                  : autoSaveState === "error"
                  ? L("Save failed", "Fallo al guardar")
                  : L("Manual save mode", "Modo guardado manual")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => router.back()}
              className="shrink-0 px-3 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              {L("← Back", "← Volver")}
            </button>
            <Link
              href="/dashboard"
              className="shrink-0 px-3 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              {L("← Back to dashboard", "← Volver al dashboard")}
            </Link>
          </div>
        </div>

        {/* Wizard */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-x-auto">
              {WIZARD_STEPS.map((step, idx) => {
                const on = idx === currentStep;
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => setCurrentStep(idx)}
                    className={`px-3 py-1 rounded-full text-[11px] border whitespace-nowrap transition ${
                      on
                        ? "bg-emerald-400 text-slate-950 border-emerald-400"
                        : "bg-slate-950 text-slate-300 border-slate-700 hover:border-emerald-400"
                    }`}
                  >
                    {idx + 1}. {step.label}
                  </button>
                );
              })}
              <span className="text-[10px] text-slate-400 ml-1">
                {L("Step", "Paso")} {currentStep + 1} {L("of", "de")} {stepCount}
              </span>
            </div>

            <div className="flex items-center flex-wrap justify-center gap-1.5" data-tour="journal-save">
              <button
                type="button"
                onClick={handleGoToImport}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-[11px] hover:border-sky-400 hover:text-sky-300 transition"
              >
                {L("Import", "Importar")}
              </button>
              <button
                type="button"
                onClick={handleSyncFromImport}
                disabled={syncing}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-[11px] hover:border-amber-400 hover:text-amber-300 transition disabled:opacity-50"
              >
                {syncing ? L("Syncing…", "Sincronizando…") : L("Sync", "Sincronizar")}
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 text-[11px] hover:border-emerald-400 hover:text-emerald-300 transition disabled:opacity-50"
              >
                {L("Save", "Guardar")}
              </button>
              <button
                type="button"
                onClick={handleSaveAndBack}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-[12px] font-semibold hover:bg-emerald-300 transition disabled:opacity-50"
              >
                {L("Save & return to dashboard", "Guardar y volver al dashboard")}
              </button>
            </div>

            {activeStep?.key === "session" && (
              <div className="relative rounded-2xl border border-emerald-400/25 bg-slate-950/80 px-3.5 py-3 max-w-[420px] shadow-[0_0_32px_rgba(16,185,129,0.18)]">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-transparent to-sky-500/10 pointer-events-none" />
                <div className="relative grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-emerald-400/40 bg-slate-900/70 px-3 py-2 shadow-[0_0_16px_rgba(16,185,129,0.25)]">
                    <p className="text-[10px] uppercase tracking-wide text-emerald-200/80">
                      {L("Auto P&L", "P&L Auto")}
                    </p>
                    <div className="mt-1 text-[16px] font-semibold text-emerald-100 leading-none">
                      {pnlInput?.trim() ? pnlInput : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                    <label className="text-[10px] uppercase tracking-wide text-slate-300">
                      {L("Commissions", "Comisiones")}
                    </label>
                    <input
                      type="number"
                      value={commissionsInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCommissionsInput(val);
                        updateCostField("commissions", val);
                      }}
                      className="mt-1 w-full px-2 py-1 rounded-md bg-slate-950 border border-slate-700 text-[11px] text-slate-100 focus:outline-none focus:border-emerald-400"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                    <label className="text-[10px] uppercase tracking-wide text-slate-300">
                      {L("Fees", "Fees")}
                    </label>
                    <input
                      type="number"
                      value={feesInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFeesInput(val);
                        updateCostField("fees", val);
                      }}
                      className="mt-1 w-full px-2 py-1 rounded-md bg-slate-950 border border-slate-700 text-[11px] text-slate-100 focus:outline-none focus:border-emerald-400"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-1 text-[9px] text-slate-500">
            {activeStep?.description}
          </div>
        </div>

        <div className={gridMode ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "space-y-4"}>
          {activeStep?.sections.map((id) => (
            <div key={id} className={gridMode && fullWidthSections.has(id) ? "lg:col-span-2" : ""}>
              {sectionMap[id]?.render()}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={goPrevStep}
            disabled={currentStep === 0}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-emerald-400 hover:text-emerald-300 transition disabled:opacity-50"
          >
            {L("← Previous", "← Anterior")}
          </button>
          <span className="text-xs text-slate-500">
            {activeStep?.label}
          </span>
          <button
            type="button"
            onClick={goNextStep}
            disabled={currentStep >= stepCount - 1}
            className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-sm font-semibold hover:bg-emerald-300 transition disabled:opacity-50"
          >
            {currentStep >= stepCount - 1 ? L("Done", "Listo") : L("Next →", "Siguiente →")}
          </button>
        </div>
      </div>
    </main>
  );
}
