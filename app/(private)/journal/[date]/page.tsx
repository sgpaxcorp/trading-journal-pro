// app/journal/[date]/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import JournalGrid, {
  type JournalWidgetId,
  type JournalWidgetDef,
} from "@/app/components/JournalGrid";

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

function WidgetCard({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl h-full flex flex-col overflow-hidden shadow-sm min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-2">
          <span className="drag-handle cursor-move select-none inline-flex items-center justify-center px-2 py-1 rounded-md border border-slate-700 text-[11px] text-slate-400">
            ⇕
          </span>
          <p className="text-slate-200 text-sm font-medium">{title}</p>
        </div>
        <div>{right}</div>
      </div>
      <div className="p-4 flex-1 min-h-0 overflow-auto">{children}</div>
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

  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
     Widgets active state
  ========================================================= */

  const ALL_WIDGETS: { id: JournalWidgetId; label: string; defaultOn: boolean }[] = [
    { id: "pnl", label: L("Day P&L", "P&L del día"), defaultOn: true },
    { id: "premarket", label: L("Premarket Prep", "Preparación premarket"), defaultOn: true },
    { id: "inside", label: L("Inside the Trade", "Dentro del trade"), defaultOn: true },
    { id: "after", label: L("After-trade Analysis", "Análisis post‑trade"), defaultOn: true },
    { id: "entries", label: L("Entries", "Entradas"), defaultOn: true },
    { id: "exits", label: L("Exits", "Salidas"), defaultOn: true },
    { id: "emotional", label: L("Emotional State", "Estado emocional"), defaultOn: true },
    { id: "strategy", label: L("Strategy / Probability", "Estrategia / Probabilidad"), defaultOn: true },
    { id: "screenshots", label: L("Screenshots", "Screenshots"), defaultOn: true },
    { id: "templates", label: L("Templates", "Plantillas"), defaultOn: true },
    { id: "actions", label: L("Actions", "Acciones"), defaultOn: true },
  ];

  const widgetsKey = "journal_widgets_active_v1";
  const layoutStorageKey = "journal_layout_v1";
  const UI_PAGE_KEY = "journal";

  // IMPORTANT (SSR hydration): Next.js can pre-render this "use client" page on the server.
  // If we read localStorage during the initial render, the server HTML can differ from the
  // client's first render (stored toggles), causing a hydration mismatch.
  // So we render a deterministic default first, then hydrate from localStorage/Supabase in effects.
  const DEFAULT_ACTIVE_WIDGETS = ALL_WIDGETS.filter((w) => w.defaultOn).map((w) => w.id) as JournalWidgetId[];
  const [activeWidgets, setActiveWidgets] = useState<JournalWidgetId[]>(DEFAULT_ACTIVE_WIDGETS);

  // Fast client-side hydrate from localStorage (Supabase will override if it has saved UI).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(widgetsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length) {
        setActiveWidgets(parsed as JournalWidgetId[]);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep localStorage in sync (fast UI)
  useEffect(() => {
    try {
      localStorage.setItem(widgetsKey, JSON.stringify(activeWidgets));
    } catch {}
  }, [activeWidgets]);

  const toggleWidget = (id: JournalWidgetId) => {
    setActiveWidgets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /* =========================================================
     ✅ FIX 1: If user clears cookies/site data, localStorage is wiped.
     Solution: store templates + layout + widget toggles in Supabase.
  ========================================================= */

  const [journalGridKey, setJournalGridKey] = useState(0);

  // Load UI settings + templates from Supabase
  useEffect(() => {
    if (!userId || authLoading) return;

    let alive = true;

    (async () => {
      try {
        // 1) UI settings (layout + widget toggles)
        // Local-first: if localStorage already has settings, keep them.
        // Supabase is the fallback when localStorage is empty (e.g., cookies/site data cleared).
        let hasLocalWidgets = false;
        let hasLocalLayout = false;

        try {
          const raw = localStorage.getItem(widgetsKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) hasLocalWidgets = true;
          }
        } catch {}

        try {
          const raw = localStorage.getItem(layoutStorageKey);
          if (raw) {
            JSON.parse(raw);
            hasLocalLayout = true;
          }
        } catch {}

        const ui = await getJournalUiSettings(userId, UI_PAGE_KEY);
        if (!alive) return;

        if (ui) {
          // widgets (only if missing locally)
          const aw: any = (ui as any).activeWidgets ?? (ui as any).active_widgets;
          if (!hasLocalWidgets && Array.isArray(aw) && aw.length) {
            setActiveWidgets(aw);
            try {
              localStorage.setItem(widgetsKey, JSON.stringify(aw));
            } catch {}
          }

          // layout (only if missing locally)
          const lay: any = (ui as any).layout;
          if (!hasLocalLayout && lay && typeof lay === "object") {
            try {
              localStorage.setItem(layoutStorageKey, JSON.stringify(lay));
            } catch {}
            // force remount so JournalGrid re-reads localStorage
            setJournalGridKey((k) => k + 1);
          }
        }

        // 2) Templates
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

  // Persist activeWidgets to Supabase (debounced)
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => {
      saveJournalUiSettings(userId, UI_PAGE_KEY, { activeWidgets: activeWidgets as any }).catch((e) =>
        console.error("[journal] save activeWidgets failed:", e)
      );
    }, 200);
    return () => clearTimeout(t);
  }, [userId, activeWidgets]);

  // Persist grid layout to Supabase WITHOUT touching JournalGrid internals.
  // JournalGrid already writes to localStorage; we just observe changes.
  const lastLayoutStrRef = useRef<string | null>(null);
  const saveLayoutTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    lastLayoutStrRef.current = localStorage.getItem(layoutStorageKey);

    const interval = setInterval(() => {
      try {
        const cur = localStorage.getItem(layoutStorageKey);
        if (!cur || cur === lastLayoutStrRef.current) return;

        lastLayoutStrRef.current = cur;

        // debounce writes
        if (saveLayoutTimerRef.current) clearTimeout(saveLayoutTimerRef.current);
        saveLayoutTimerRef.current = setTimeout(() => {
          try {
            const json = JSON.parse(cur);
            saveJournalUiSettings(userId, UI_PAGE_KEY, { layout: json }).catch((e) =>
              console.error("[journal] save layout failed:", e)
            );
          } catch {
            // ignore invalid JSON
          }
        }, 250);
      } catch {
        // ignore
      }
    }, 500);

    return () => {
      clearInterval(interval);
      if (saveLayoutTimerRef.current) clearTimeout(saveLayoutTimerRef.current);
    };
  }, [userId]);

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
                } catch {
                  setNotesExtra({});
                }
              } else {
                // Legacy plain string
                setPremarketHtml(String(notesStr));
                setInsideHtml("");
                setAfterHtml("");
                setNotesExtra({});
              }
            } catch {
              // Legacy plain string
              setPremarketHtml(String(notesStr));
              setInsideHtml("");
              setAfterHtml("");
              setNotesExtra({});
            }
          } else {
            setPremarketHtml("");
            setInsideHtml("");
            setAfterHtml("");
            setNotesExtra({});
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
  const brokerCommissions = useMemo(() => toNum((notesExtra as any)?.costs?.commissions), [notesExtra]);
  const brokerFees = useMemo(() => toNum((notesExtra as any)?.costs?.fees), [notesExtra]);
  const brokerCostsTotal = brokerCommissions + brokerFees;

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

  const emotionTags = [
    "Calm",
    "Greedy",
    "Desperate",
    "Adrenaline",
    "Confident",
    "Fearful",
    "Angry",
    "FOMO",
    "Revenge trade",
    "Focus",
    "Patience",
    "Discipline",
    "Anxiety",
    "Overconfident",
  ];

  const emotionTagLabels: Record<string, string> = {
    Calm: "Calma",
    Greedy: "Codicia",
    Desperate: "Desesperado",
    Adrenaline: "Adrenalina",
    Confident: "Confiado",
    Fearful: "Miedo",
    Angry: "Enojo",
    FOMO: "FOMO",
    "Revenge trade": "Trade de revancha",
    Focus: "Enfoque",
    Patience: "Paciencia",
    Discipline: "Disciplina",
    Anxiety: "Ansiedad",
    Overconfident: "Sobreconfiado",
  };

  const probabilityTags = [
    "Exploratory Trade",
    "50% Probability",
    "Trade with Edge",
    "High Probability",
    "Low Probability",
    "Setup not perfect",
    "Good Risk-Reward",
    "Poor Risk-Reward",
    "Followed Plan",
    "Deviated from Plan",
    "Clear Setup",
    "Unclear Setup",
  ];

  const probabilityTagLabels: Record<string, string> = {
    "Exploratory Trade": "Trade exploratorio",
    "50% Probability": "Probabilidad 50%",
    "Trade with Edge": "Trade con edge",
    "High Probability": "Alta probabilidad",
    "Low Probability": "Baja probabilidad",
    "Setup not perfect": "Setup no perfecto",
    "Good Risk-Reward": "Buen R/R",
    "Poor Risk-Reward": "Mal R/R",
    "Followed Plan": "Siguió el plan",
    "Deviated from Plan": "Se desvió del plan",
    "Clear Setup": "Setup claro",
    "Unclear Setup": "Setup poco claro",
  };

  const exitReasonTags = [
    "Stop Loss Placed",
    "Take Profit Hit",
    "Manual Exit",
    "Moved stop to profit",
    "Stopped out (loss)",
    "Move stop to breakeven",
  ];

  const exitReasonTagLabels: Record<string, string> = {
    "Stop Loss Placed": "Stop loss colocado",
    "Take Profit Hit": "Take profit ejecutado",
    "Manual Exit": "Salida manual",
    "Moved stop to profit": "Stop movido a profit",
    "Stopped out (loss)": "Stop ejecutado (pérdida)",
    "Move stop to breakeven": "Mover stop a BE",
  };

  const strategyTagLabels: Record<string, string> = {
    "Respect Strategy": "Respeta la estrategia",
    "Not follow my plan": "No seguí mi plan",
    "No respect my plan": "No respeté mi plan",
    "Planned stop was in place": "Stop planificado en su lugar",
    "Used planned position sizing": "Usé tamaño de posición planificado",
    "Risk-to-reward ≥ 2R (planned)": "Riesgo/beneficio ≥ 2R (plan)",
    "Risk-to-reward < 1.5R (tight)": "Riesgo/beneficio < 1.5R (ajustado)",
    "Is Vix high?": "¿VIX alto?",
    "Is Vix low?": "¿VIX bajo?",
    "Earnings play": "Trade por earnings",
    "News-driven trade": "Trade por noticias",
    "Momentum trade": "Trade de momentum",
    "Reversal trade": "Trade de reversión",
    "Scalping trade": "Trade de scalping",
  };

  const tagLabel = (tag: string, map: Record<string, string>) => (isEs ? map[tag] ?? tag : tag);

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

      setNotesExtra(nextExtra);
      setPnlFromDb(Number(pnlToSave.toFixed(2)));
      setPnlMode("db");

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
     Auto-save (debounced)
  ========================================================= */

  useEffect(() => {
    if (!autoSaveReadyRef.current) return;
    if (autoSaveIgnoreNextRef.current) {
      autoSaveIgnoreNextRef.current = false;
      return;
    }
    setAutoSaveDirty(true);
  }, [premarketHtml, insideHtml, afterHtml, entryTrades, exitTrades, entry, notesExtra]);

  useEffect(() => {
    if (!autoSaveReadyRef.current) return;
    if (!autoSaveDirty) return;
    if (!userId || !activeAccountId) return;
    if (saving) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveState("saving");

    autoSaveTimerRef.current = setTimeout(() => {
      void (async () => {
        const ok = await handleSave({ silent: true });
        if (ok) {
          setAutoSaveState("saved");
          setAutoSaveDirty(false);
          setTimeout(() => setAutoSaveState("idle"), 1500);
        } else {
          setAutoSaveState("error");
        }
      })();
    }, 10000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [autoSaveDirty, userId, activeAccountId, saving]);

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
            minHeight={260}
          />
        </WidgetCard>
      ),
    },

    {
      id: "pnl",
      title: L("Day P&L", "P&L del día"),
      defaultLayout: { i: "pnl", x: 7, y: 0, w: 5, h: 3, minW: 3, minH: 2 },
      render: () => (
        <WidgetCard title={L("Day P&L", "P&L del día")}>
          <label className="text-slate-400 text-xs uppercase tracking-wide">
            {L("Day P&L (USD) — AUTO", "P&L del día (USD) — AUTO")}
          </label>
          <input
            type="text"
            value={pnlInput}
            readOnly
            className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-[16px] focus:outline-none focus:border-emerald-400 opacity-90"
            placeholder={L("Auto-calculated", "Calculado automáticamente")}
          />
          <p className="text-xs text-slate-500 mt-2">
            {L(
              "Calculated from Entries/Exits (FIFO + multipliers + premium).",
              "Calculado desde Entradas/Salidas (FIFO + multiplicadores + prima)."
            )}
          </p>
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
            minHeight={260}
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
            minHeight={260}
          />
        </WidgetCard>
      ),
    },

    {
      id: "emotional",
      title: L("Emotional state", "Estado emocional"),
      defaultLayout: { i: "emotional", x: 7, y: 16, w: 5, h: 4, minW: 3, minH: 3 },
      render: () => (
        <WidgetCard title={L("Emotional state & impulses", "Estado emocional e impulsos")}>
          <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
            {emotionTags.map((t) => (
              <label key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-950 border border-slate-700">
                <input type="checkbox" onChange={() => toggleTag(t)} checked={entry.tags?.includes(t)} className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0" />
                <span className="wrap-break-word">{tagLabel(t, emotionTagLabels)}</span>
              </label>
            ))}
          </div>
        </WidgetCard>
      ),
    },

    {
      id: "strategy",
      title: L("Strategy / Probability", "Estrategia / Probabilidad"),
      defaultLayout: { i: "strategy", x: 7, y: 20, w: 5, h: 6, minW: 3, minH: 3 },
      render: () => (
        <WidgetCard title={L("Strategy checklist + Probability", "Checklist de estrategia + Probabilidad")}>
          <div className="mb-4">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              {L("Strategy checklist", "Checklist de estrategia")}
            </p>
            <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
              {[
                "Respect Strategy",
                "Not follow my plan",
                "No respect my plan",
                "Planned stop was in place",
                "Used planned position sizing",
                "Risk-to-reward ≥ 2R (planned)",
                "Risk-to-reward < 1.5R (tight)",
                "Is Vix high?",
                "Is Vix low?",
                "Earnings play",
                "News-driven trade",
                "Momentum trade",
                "Reversal trade",
                "Scalping trade",
              ].map((t) => (
                <label key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-950 border border-slate-700">
                  <input type="checkbox" onChange={() => toggleTag(t)} checked={entry.tags?.includes(t)} className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0" />
                  <span className="wrap-break-word">{tagLabel(t, strategyTagLabels)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 mt-2">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              {L("Exit / Stop-loss evidence", "Evidencia de salida / stop-loss")}
            </p>
            <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
              {exitReasonTags.map((t) => (
                <label key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-950 border border-slate-700">
                  <input type="checkbox" onChange={() => toggleTag(t)} checked={entry.tags?.includes(t)} className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0" />
                  <span className="wrap-break-word">{tagLabel(t, exitReasonTagLabels)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 mt-3">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              {L("Probability & stats flags", "Señales de probabilidad y stats")}
            </p>
            <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
              {probabilityTags.map((t) => (
                <label key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-950 border border-slate-700">
                  <input type="checkbox" onChange={() => toggleTag(t)} checked={entry.tags?.includes(t)} className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0" />
                  <span className="wrap-break-word">{tagLabel(t, probabilityTagLabels)}</span>
                </label>
              ))}
            </div>
          </div>
        </WidgetCard>
      ),
    },

    {
      id: "screenshots",
      title: L("Screenshots", "Screenshots"),
      defaultLayout: { i: "screenshots", x: 0, y: 24, w: 12, h: 6, minW: 6, minH: 5 },
      render: () => (
        <WidgetCard title={L("Screenshots (links / notes)", "Screenshots (links / notas)")}>
          <textarea
            rows={8}
            value={(entry.screenshots || []).join("\n")}
            onChange={(e) =>
              setEntry((p) => ({
                ...p,
                screenshots: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            }
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[15px] text-slate-100 focus:outline-none focus:border-emerald-400 resize-y"
            placeholder={L("Paste here URLs/notes…", "Pega aquí URLs/notas…")}
          />
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

    {
      id: "actions",
      title: L("Actions", "Acciones"),
      defaultLayout: { i: "actions", x: 0, y: 35, w: 12, h: 4, minW: 6, minH: 3 },
      render: () => (
        <WidgetCard title={L("Actions", "Acciones")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500">
              {msg && <span className="text-emerald-400 mr-3">{msg}</span>}
              {autoSaveState !== "idle" && (
                <span className="text-slate-400 mr-3">
                  {autoSaveState === "saving"
                    ? L("Auto-saving…", "Auto-guardando…")
                    : autoSaveState === "saved"
                    ? L("Auto-saved", "Auto-guardado")
                    : L("Auto-save failed", "Fallo al auto-guardar")}
                </span>
              )}
              {L("Your structure, your rules.", "Tu estructura, tus reglas.")}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleGoToImport} className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-sky-400 hover:text-sky-300 transition">
                {L("Import", "Importar")}
              </button>

              <button
                type="button"
                onClick={handleSyncFromImport}
                disabled={syncing}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-amber-400 hover:text-amber-300 transition disabled:opacity-50"
              >
                {syncing ? L("Syncing…", "Sincronizando…") : L("Sync", "Sincronizar")}
              </button>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-emerald-400 hover:text-emerald-300 transition disabled:opacity-50"
              >
                {L("Save", "Guardar")}
              </button>

              <button
                type="button"
                onClick={handleSaveAndBack}
                disabled={saving}
                className="px-6 py-2 rounded-xl bg-emerald-400 text-slate-950 text-sm font-semibold hover:bg-emerald-300 transition disabled:opacity-50"
              >
                {L("Save & return to dashboard", "Guardar y volver al dashboard")}
              </button>
            </div>
          </div>
        </WidgetCard>
      ),
    },
  ];

  /* =========================================================
     Render
  ========================================================= */

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 md:px-8 py-6">
      <div className="mx-auto w-full max-w-none">
        {/* Top */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-4">
          <div>
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
                  autoSaveState === "saving"
                    ? "border-emerald-400/60 text-emerald-300 bg-emerald-500/10"
                    : autoSaveState === "saved"
                    ? "border-sky-400/60 text-sky-300 bg-sky-500/10"
                    : autoSaveState === "error"
                    ? "border-red-400/60 text-red-300 bg-red-500/10"
                    : "border-slate-700 text-slate-300 bg-slate-900/40"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    autoSaveState === "saving"
                      ? "bg-emerald-300 animate-pulse"
                      : autoSaveState === "saved"
                      ? "bg-sky-300"
                      : autoSaveState === "error"
                      ? "bg-red-300"
                      : "bg-slate-500"
                  }`}
                />
                {autoSaveState === "saving"
                  ? L("Auto-saving…", "Auto-guardando…")
                  : autoSaveState === "saved"
                  ? L("Auto-saved", "Auto-guardado")
                  : autoSaveState === "error"
                  ? L("Auto-save failed", "Fallo al auto-guardar")
                  : L("Auto-save on", "Auto-guardado activo")}
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

        {/* Widget toggles */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 mb-5">
          <p className="text-xs text-slate-400 mb-2">
            {L(
              "Customize this journal page: toggle widgets on/off.",
              "Personaliza esta página: activa o desactiva los widgets."
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {ALL_WIDGETS.map((w) => {
              const on = activeWidgets.includes(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleWidget(w.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition ${
                    on
                      ? "bg-emerald-400 text-slate-950 border-emerald-400"
                      : "bg-slate-950 text-slate-300 border-slate-700 hover:border-emerald-400"
                  }`}
                >
                  {on ? "✓ " : "+ "}
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        <JournalGrid key={journalGridKey} storageKey={layoutStorageKey} widgets={WIDGETS} activeIds={activeWidgets} />
      </div>
    </main>
  );
}
