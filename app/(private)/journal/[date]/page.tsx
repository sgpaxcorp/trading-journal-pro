// app/journal/[date]/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { saveJournalTradesForDay } from "@/lib/journalTradesSupabase";
import { parseNotes } from "@/lib/journalNotes";
import { supabaseBrowser } from "@/lib/supaBaseClient";

import { getJournalTradesForDay } from "@/lib/journalTradesSupabase";





import JournalGrid, {
  type JournalWidgetId,
  type JournalWidgetDef,
} from "@/app/components/JournalGrid";

import type { JournalEntry } from "@/lib/journalTypes";
import {
  getJournalEntryByDate,
  saveJournalEntry,
} from "@/lib/journalSupabase";

import {
  getJournalTemplates,
  addJournalTemplate,
  deleteJournalTemplate,
  JournalTemplate,
} from "@/lib/journalTemplatesLocal";
import { type InstrumentType } from "@/lib/journalNotes";
import { useAuth } from "@/context/AuthContext";

/* =========================
   Helpers: editor / tables
========================= */
function insertHtmlAtCaret(html: string) {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const el = document.createElement("div");
  el.innerHTML = html;
  const frag = document.createDocumentFragment();
  let node: ChildNode | null = null;
  let lastNode: ChildNode | null = null;
  while ((node = el.firstChild)) lastNode = frag.appendChild(node);
  range.insertNode(frag);
  if (lastNode) {
    const newRange = range.cloneRange();
    newRange.setStartAfter(lastNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}

function closestTableFromSelection(): HTMLTableElement | null {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  let node: Node | null = sel.anchorNode;
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && (node as HTMLElement).tagName !== "TABLE") {
    node = (node as HTMLElement)?.parentElement ?? null;
  }
  return (node as HTMLTableElement) || null;
}

function insertTable(rows: number, cols: number) {
  rows = Math.max(1, Math.min(6, rows));
  cols = Math.max(1, Math.min(6, cols));
  const head =
    `<thead><tr>` +
    Array.from({ length: cols })
      .map(() => `<th class="border border-slate-700 px-2 py-1">Header</th>`)
      .join("") +
    `</tr></thead>`;
  const body =
    `<tbody>` +
    Array.from({ length: rows })
      .map(
        () =>
          `<tr>` +
          Array.from({ length: cols })
            .map(() => `<td class="border border-slate-800 px-2 py-1">Cell</td>`)
            .join("") +
          `</tr>`
      )
      .join("") +
    `</tbody>`;

  insertHtmlAtCaret(
    `<table class="w-full border border-slate-700 text-left text-[15px]">${head}${body}</table>`
  );
}

function addTableRow() {
  const table = closestTableFromSelection();
  if (!table) return;
  const tbody = table.tBodies[0] || table.createTBody();
  const cols =
    table.tHead?.rows[0]?.cells.length || tbody.rows[0]?.cells.length || 2;
  const tr = tbody.insertRow(-1);
  for (let i = 0; i < cols; i++) {
    const td = tr.insertCell(-1);
    td.className = "border border-slate-800 px-2 py-1";
    td.textContent = "Cell";
  }
}

function addTableColumn() {
  const table = closestTableFromSelection();
  if (!table) return;
  if (table.tHead && table.tHead.rows[0]) {
    const th = document.createElement("th");
    th.className = "border border-slate-700 px-2 py-1";
    th.textContent = "Header";
    table.tHead.rows[0].appendChild(th);
  }
  const tbody = table.tBodies[0];
  if (tbody) {
    Array.from(tbody.rows).forEach((row) => {
      const td = document.createElement("td");
      td.className = "border border-slate-800 px-2 py-1";
      td.textContent = "Cell";
      row.appendChild(td);
    });
  }
}

/* =========================
   UI: Table Picker
========================= */
function TablePicker({
  onPick,
}: {
  onPick: (rows: number, cols: number) => void;
}) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  return (
    <div className="absolute top-full left-0 mt-1 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl z-50">
      <div className="text-[11px] text-slate-400 mb-2">
        {hover ? `${hover[0]} × ${hover[1]}` : "Choose size (max 6×6)"}
      </div>
      <div className="grid grid-cols-6 gap-1">
        {Array.from({ length: 36 }).map((_, i) => {
          const r = Math.floor(i / 6) + 1;
          const c = (i % 6) + 1;
          const active =
            hover && r <= hover[0] && c <= hover[1]
              ? "bg-emerald-500/80"
              : "bg-slate-800";
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover([r, c])}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick(r, c)}
              className={`h-6 w-6 rounded ${active}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/* =========================
   Toolbar
========================= */
function EditorToolbar({
  onBold,
  onItalic,
  onUnderline,
  onUL,
  onOL,
  onQuote,
  onAddRow,
  onAddCol,
  onInsertTable,
  extraRight,
}: {
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onUL: () => void;
  onOL: () => void;
  onQuote: () => void;
  onAddRow: () => void;
  onAddCol: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  extraRight?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btn =
    "px-2 py-1 rounded bg-slate-800 text-slate-200 text-xs hover:bg-slate-700";
  return (
    <div className="relative flex items-center gap-1 w-full">
      <div className="flex items-center gap-1">
        <button className={btn} type="button" onClick={onBold}>
          B
        </button>
        <button className={btn} type="button" onClick={onItalic}>
          I
        </button>
        <button className={btn} type="button" onClick={onUnderline}>
          U
        </button>
        <button className={btn} type="button" onClick={onUL}>
          •
        </button>
        <button className={btn} type="button" onClick={onOL}>
          1.
        </button>
        <button className={btn} type="button" onClick={onQuote}>
          “ ”
        </button>

        <div className="relative">
          <button
            className={btn}
            type="button"
            onClick={() => setOpen((v) => !v)}
            title="Insert table (1–6 × 1–6)"
          >
            ▦
          </button>
          {open && (
            <TablePicker
              onPick={(r, c) => {
                onInsertTable(r, c);
                setOpen(false);
              }}
            />
          )}
        </div>

        <button className={btn} type="button" onClick={onAddRow}>
          +row
        </button>
        <button className={btn} type="button" onClick={onAddCol}>
          +col
        </button>
      </div>

      <div className="ml-auto">{extraRight}</div>
    </div>
  );
}

/* =========================
   Trades / DTE parsing
========================= */
const KIND_OPTIONS: { value: InstrumentType; label: string }[] = [
  { value: "stock", label: "Stocks" },
  { value: "option", label: "Options" },
  { value: "future", label: "Futures" },
  { value: "crypto", label: "Crypto" },
  { value: "forex", label: "Forex" },
  { value: "other", label: "Other" },
];

type SideType = "long" | "short";

/** Cómo se maneja la prima */
type PremiumSide = "none" | "debit" | "credit";

/** Estrategias de opciones (para tu journal) */
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

const PREMIUM_OPTIONS: { value: PremiumSide; label: string }[] = [
  { value: "none", label: "—" },
  { value: "debit", label: "Debit (I pay premium)" },
  { value: "credit", label: "Credit (I receive premium)" },
];

const STRATEGY_OPTIONS: { value: OptionStrategy; label: string }[] = [
  { value: "single", label: "Single / naked" },
  { value: "vertical_spread", label: "Vertical spread" },
  { value: "iron_condor", label: "Iron Condor" },
  { value: "iron_butterfly", label: "Iron Butterfly" },
  { value: "straddle", label: "Straddle" },
  { value: "strangle", label: "Strangle" },
  { value: "calendar", label: "Calendar spread" },
  { value: "diagonal", label: "Diagonal spread" },
  { value: "covered_call", label: "Covered call" },
  { value: "cash_secured_put", label: "Cash-secured put" },
  { value: "other", label: "Other option strategy" },
];
// ✅ Normalizadores para adaptar StoredTradeRow -> EntryTradeRow/ExitTradeRow

function toSideType(raw: any): SideType {
  const s = String(raw ?? "").toLowerCase();

  // si ya viene correcto
  if (s === "short") return "short";
  if (s === "long") return "long";

  // si llega BUY/SELL de import, default long
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
  /** debit = compro prima, credit = vendo prima */
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
/* =========================
   UI -> StoredTradeRow (DB)
========================= */
import type { StoredTradeRow } from "@/lib/journalNotes";

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
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseSPXOptionSymbol(raw: string) {
  const s = (raw || "").trim().toUpperCase().replace(/^[\.\-]/, "");
  // SPXW251121C6565  / SPX251121P6000
  const m = s.match(/^([A-Z]+W?)(\d{6})([CP])(\d+(?:\.\d+)?)$/);
  if (!m) return null;

  const underlying = m[1]; // SPX / SPXW
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
    const expiryUTC = Date.UTC(
      expiry.getFullYear(),
      expiry.getMonth(),
      expiry.getDate()
    );
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((expiryUTC - entryUTC) / msPerDay);
    if (diffDays === 0) return 0;
    return diffDays >= 0 ? diffDays : null;
  } catch {
    return null;
  }
}

/* =========================
   Detect option symbols + safe kind
========================= */
function looksLikeOptionContract(symbol: string) {
  return !!parseSPXOptionSymbol(symbol);
}

function effectiveKind(kind: InstrumentType, symbol: string): InstrumentType {
  if (kind === "option" && !looksLikeOptionContract(symbol)) {
    return "stock";
  }
  return kind || "other";
}

/** Normaliza premium por si viene de sesiones viejas sin ese campo */
function normalizePremiumSide(
  kind: InstrumentType,
  premiumSide?: PremiumSide
): PremiumSide {
  if (kind === "option") {
    return premiumSide || "debit";
  }
  return premiumSide || "none";
}

function normalizeStrategy(optionStrategy?: OptionStrategy): OptionStrategy {
  return optionStrategy || "single";
}

function premiumLabel(kind: InstrumentType, premiumSide?: PremiumSide) {
  const p = normalizePremiumSide(kind, premiumSide);
  if (p === "debit") return "Debit";
  if (p === "credit") return "Credit";
  return "—";
}

function strategyLabel(kind: InstrumentType, strategy?: OptionStrategy) {
  if (kind !== "option") return "—";
  const s = normalizeStrategy(strategy);
  const found = STRATEGY_OPTIONS.find((o) => o.value === s);
  return found?.label ?? "Single / naked";
}

/* =========================
   Contract multipliers
========================= */

// Futures point-value map (expand as you want)
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

function futureRoot(symbol: string) {
  const s = (symbol || "").trim().toUpperCase().replace(/^\//, "");
  const m = s.match(/^([A-Z]{1,4})/);
  return m?.[1] ?? s;
}

function getContractMultiplier(kind: InstrumentType, symbol: string) {
  if (kind === "option") return 100;
  if (kind === "future") {
    const root = futureRoot(symbol);
    return FUTURES_MULTIPLIERS[root] ?? 1;
  }
  return 1;
}

/* =========================
   Averages (UI only)
========================= */
function computeAverages(
  trades: {
    symbol: string;
    kind: InstrumentType;
    price: string;
    quantity: string;
  }[]
) {
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

/* =========================
   PnL helpers
========================= */

/**
 * Para productos lineales (stock/future/crypto/forex):
 *   - long: gana si sale más caro
 *   - short: gana si sale más barato
 * Para options:
 *   - debit (compro prima): gana si sale más caro
 *   - credit (vendo prima): gana si recompro más barato
 */
function pnlSign(
  kind: InstrumentType,
  side: SideType,
  premiumSide: PremiumSide
): number {
  if (kind === "option") {
    const p = normalizePremiumSide(kind, premiumSide);
    if (p === "credit") {
      // venta de prima: entry = crédito, exit = débito
      // profit si exit < entry → (exit - entry) negativo → sign -1
      return -1;
    }
    // debit / none → se comporta como long
    return 1;
  }
  // lineales
  return side === "short" ? -1 : 1;
}

/* =========================
   ✅ AUTO PnL (FIFO + multipliers + premium)
========================= */
function computeAutoPnL(entries: EntryTradeRow[], exits: ExitTradeRow[]) {
  const key = (
    s: string,
    k: InstrumentType,
    side: SideType,
    premiumSide: PremiumSide
  ) => `${s}|${k}|${side}|${premiumSide}`;

  type Lot = {
    price: number;
    qtyLeft: number;
    symbol: string;
    kind: InstrumentType;
    side: SideType;
    premiumSide: PremiumSide;
  };

  const entryLots: Record<string, Lot[]> = {};

  // ---- ENTRIES (open lots) ----
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
    entryLots[k].push({
      price: px,
      qtyLeft: qty,
      symbol: sym,
      kind: kEff,
      side: sideEff,
      premiumSide: premEff,
    });
  }

  // ---- EXITS (close lots) ----
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
    if (!Number.isFinite(exitPx) || !Number.isFinite(exitQty) || exitQty <= 0)
      continue;

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

/* =========================
   Widget shell (scroll-safe)
========================= */
function WidgetCard({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl h-full flex flex-col overflow-hidden shadow-sm min-h-0">
      {/* Header: solo el pequeño handle es draggable */}
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

/* =========================
   Page
========================= */
export default function DailyJournalPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

const userId = user?.id ?? "";


  const dateParam = Array.isArray(params?.date)
    ? params.date[0]
    : (params?.date as string);

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

  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const preRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const postRef = useRef<HTMLDivElement | null>(null);

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [entryTrades, setEntryTrades] = useState<EntryTradeRow[]>([]);
  const [exitTrades, setExitTrades] = useState<ExitTradeRow[]>([]);

  const [newEntryTrade, setNewEntryTrade] =
    useState<Omit<EntryTradeRow, "id">>({
      symbol: "",
      kind: "option",
      side: "long",
      premiumSide: "debit",
      optionStrategy: "single",
      price: "",
      quantity: "",
      time: nowTimeLabel(),
      dte: null,
      expiry: null,
    });

  const [newExitTrade, setNewExitTrade] =
    useState<Omit<ExitTradeRow, "id">>({
      symbol: "",
      kind: "option",
      side: "long",
      premiumSide: "debit",
      optionStrategy: "single",
      price: "",
      quantity: "",
      time: nowTimeLabel(),
      dte: null,
      expiry: null,
    });

  /* ---------------- Widgets active state ---------------- */
  const ALL_WIDGETS: {
    id: JournalWidgetId;
    label: string;
    defaultOn: boolean;
  }[] = [
    { id: "pnl", label: "Day P&L", defaultOn: true },
    { id: "premarket", label: "Premarket Prep", defaultOn: true },
    { id: "inside", label: "Inside the Trade", defaultOn: true },
    { id: "after", label: "After-trade Analysis", defaultOn: true },
    { id: "entries", label: "Entries", defaultOn: true },
    { id: "exits", label: "Exits", defaultOn: true },
    { id: "emotional", label: "Emotional State", defaultOn: true },
    { id: "strategy", label: "Strategy / Probability", defaultOn: true },
    { id: "screenshots", label: "Screenshots", defaultOn: true },
    { id: "templates", label: "Templates", defaultOn: true },
    { id: "actions", label: "Actions", defaultOn: true },
  ];

  const widgetsKey = "journal_widgets_active_v1";
  const [activeWidgets, setActiveWidgets] = useState<JournalWidgetId[]>(() => {
    if (typeof window === "undefined") {
      return ALL_WIDGETS.filter((w) => w.defaultOn).map((w) => w.id);
    }
    try {
      const raw = localStorage.getItem(widgetsKey);
      if (!raw)
        return ALL_WIDGETS.filter((w) => w.defaultOn).map((w) => w.id);
      const parsed = JSON.parse(raw) as JournalWidgetId[];
      return parsed.length
        ? parsed
        : ALL_WIDGETS.filter((w) => w.defaultOn).map((w) => w.id);
    } catch {
      return ALL_WIDGETS.filter((w) => w.defaultOn).map((w) => w.id);
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(widgetsKey, JSON.stringify(activeWidgets));
    } catch {}
  }, [activeWidgets]);

  const toggleWidget = (id: JournalWidgetId) => {
    setActiveWidgets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  /* ---------- Protección de ruta ---------- */
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/signin");
    }
  }, [authLoading, user, router]);

  // Load existing entry + templates (desde Supabase)
  useEffect(() => {
    if (!dateParam || authLoading || !userId) return;

    let active = true;

    async function load() {
      try {
        const existing = await getJournalEntryByDate(userId, dateParam);

        if (!active) return;

        if (existing) {
          setEntry((prev) => ({ ...prev, ...existing, date: dateParam }));
          const existingPnl =
            typeof existing.pnl === "number" ? String(existing.pnl) : "";
          setPnlInput(existingPnl);

          if (typeof existing.notes === "string") {
            try {
              const parsed = JSON.parse(existing.notes);
              if (parsed && typeof parsed === "object") {
                if (preRef.current && parsed.premarket)
                  preRef.current.innerHTML = parsed.premarket;
                if (liveRef.current && parsed.live)
                  liveRef.current.innerHTML = parsed.live;
                if (postRef.current && parsed.post)
                  postRef.current.innerHTML = parsed.post;
                if (Array.isArray(parsed.entries))
                  setEntryTrades(parsed.entries);
                if (Array.isArray(parsed.exits)) setExitTrades(parsed.exits);
              } else if (preRef.current && !preRef.current.innerHTML) {
                preRef.current.innerHTML = existing.notes;
              }
            } catch {
              if (preRef.current && !preRef.current.innerHTML) {
                preRef.current.innerHTML = existing.notes;
              }
            }
          }
        } else {
          setEntry((prev) => ({ ...prev, date: dateParam }));
          setPnlInput("");
        }

        setTemplates(getJournalTemplates());
      } catch (err) {
        console.error("Error loading journal entry:", err);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [dateParam, userId, authLoading]);

  const parsedDate = useMemo(() => {
    try {
      const [y, m, d] = dateParam.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "2-digit",
      });
    } catch {
      return dateParam;
    }
  }, [dateParam]);

  /* ---------- Toolbar helpers ---------- */
  const execCmd = (cmd: string) => document.execCommand(cmd, false);
  const insertQuote = () =>
    insertHtmlAtCaret("<blockquote>Quote…</blockquote>");

  /* ---------- Entries handlers ---------- */
  const handleAddEntryTrade = () => {
    const symbol = newEntryTrade.symbol.trim().toUpperCase();
    if (!symbol || !newEntryTrade.price.trim()) return;

    let finalKind: InstrumentType = newEntryTrade.kind;
    if (finalKind === "option" && !looksLikeOptionContract(symbol)) {
      finalKind = "stock";
    }

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

    setNewEntryTrade((p) => ({
      ...p,
      symbol: "",
      price: "",
      quantity: "",
      time: nowTimeLabel(),
      dte: null,
      expiry: null,
    }));
  };

  const handleDeleteEntryTrade = (id: string) =>
    setEntryTrades((prev) => prev.filter((t) => t.id !== id));

  /* ---------- Open positions ---------- */
  const openPositions = useMemo(() => {
    const key = (
      s: string,
      k: InstrumentType,
      side: SideType,
      premiumSide: PremiumSide,
      strategy: OptionStrategy
    ) => `${s}|${k}|${side}|${premiumSide}|${strategy}`;

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
      totals[k] ||= {
        symbol: sym,
        kind: kEff,
        side: sideEff,
        premiumSide: premEff,
        optionStrategy: stratEff,
        entryQty: 0,
        exitQty: 0,
      };
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
      totals[k] ||= {
        symbol: sym,
        kind: kEff,
        side: sideEff,
        premiumSide: premEff,
        optionStrategy: stratEff,
        entryQty: 0,
        exitQty: 0,
      };
      totals[k].exitQty += Number(x.quantity) || 0;
    }

    return Object.values(totals)
      .map((t) => ({ ...t, remainingQty: Math.max(0, t.entryQty - t.exitQty) }))
      .filter((t) => t.remainingQty > 0);
  }, [entryTrades, exitTrades]);

  /* ---------- Exits handlers ---------- */
  const handlePickOpenPosition = (posKey: string) => {
    if (!posKey) return;
    const [symbol, kind, side, premiumSide, optionStrategy] = posKey.split(
      "|"
    ) as [string, InstrumentType, SideType, PremiumSide, OptionStrategy];

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

    let finalKind: InstrumentType = newExitTrade.kind;
    if (finalKind === "option" && !looksLikeOptionContract(symbol)) {
      finalKind = "stock";
    }

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

    setNewExitTrade((p) => ({
      ...p,
      price: "",
      time: nowTimeLabel(),
      dte: null,
      expiry: null,
    }));
  };

  const handleDeleteExitTrade = (id: string) =>
    setExitTrades((prev) => prev.filter((t) => t.id !== id));

  /* ---------- Averages ---------- */
  const entryAverages = useMemo(
    () => computeAverages(entryTrades),
    [entryTrades]
  );
  const exitAverages = useMemo(() => computeAverages(exitTrades), [exitTrades]);

  /* ---------- ✅ AUTO PNL local ---------- */
  const pnlCalc = useMemo(
    () => computeAutoPnL(entryTrades, exitTrades),
    [entryTrades, exitTrades]
  );

  useEffect(() => {
    const v = Number.isFinite(pnlCalc.total) ? pnlCalc.total : 0;
    setEntry((p) => ({ ...p, pnl: v }));
    setPnlInput(v.toFixed(2));
  }, [pnlCalc.total]);

  /* ---------- Tags ---------- */
  const toggleTag = (tag: string) =>
    setEntry((prev) => {
      const current = prev.tags || [];
      const exists = current.includes(tag);
      const tags = exists
        ? current.filter((t) => t !== tag)
        : [...current, tag];
      return { ...prev, tags };
    });

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

  const exitReasonTags = [
    "Stop Loss Placed",
    "Take Profit Hit",
    "Manual Exit",
    "Moved stop to profit",
    "Stopped out (loss)",
    "Move stop to breakeven",
  ];

  /* ---------- Save (Supabase) ---------- */
  const handleSave = async (): Promise<boolean> => {
    if (!userId) {
      setMsg("Cannot save: no user.");
      return false;
    }

    setSaving(true);
    setMsg("");

    const preHtml = preRef.current?.innerHTML || "";
    const liveHtml = liveRef.current?.innerHTML || "";
    const postHtml = postRef.current?.innerHTML || "";

    const notesPayload = JSON.stringify({
      premarket: preHtml,
      live: liveHtml,
      post: postHtml,
      entries: entryTrades,
      exits: exitTrades,
    });

      // ✅ 1) arma el entry a guardar usando notesPayload
  const entryToSave = {
    ...entry,
    user_id: userId,
    date: dateParam, // o entry.date si ya es el mismo
    notes: notesPayload,
    // ✅ si pnl lo tienes en input/string, fuerza número aquí
    pnl: Number.isFinite(Number(pnlInput)) ? Number(pnlInput) : (entry as any).pnl ?? 0,
  };

  try {
    // ✅ 2) guarda journal_entries
    await saveJournalEntry(userId, entryToSave as any);

    // ✅ 3) guarda journal_trades (filas) desde el STATE actual, no desde notes parseadas
  const storedEntries = entryTrades.map(entryRowToStored);
const storedExits = exitTrades.map(exitRowToStored);

await saveJournalTradesForDay(userId, dateParam, {
  entries: storedEntries,
  exits: storedExits,
});


    setMsg("Saved ✅");
    setTimeout(() => setMsg(""), 2000);
    return true;
  } catch (err: any) {
    console.error(err);
    setMsg(err?.message ?? "Save failed");
    return false;
  } finally {
    setSaving(false);
  }


    const EMOTION_TAGS = [
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

const STRATEGY_CHECKLIST_TAGS = [
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
                "Trend Follow Trade",
                "Reversal trade",
                "Scalping trade",
                "swing trade",
                "Options trade",
                "Stock trade",
                "Futures Trade",
                "Forex Trade",
                " Crypto Trade",
                
];


    const pnlToSave = Number.isFinite(pnlCalc.total) ? pnlCalc.total : 0;
// ✅ Derivados desde el payload de trades (tu notesPayload)
const parsed = parseNotes(notesPayload); // notesPayload es string
const firstEntry = parsed.entries?.[0];
const firstExit = parsed.exits?.[0];

const toNum = (v: any): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
};

// ✅ instrument / entryPrice / exitPrice / size
const clean: JournalEntry = {
  ...entry,

  date: dateParam,
  pnl: pnlToSave,

  // 1) Instrument: prioridad = primer trade (si existe) -> si no, lo que ya tenga entry.instrument
  instrument: (firstEntry?.symbol ?? entry.instrument ?? "").toString().trim(),

  // 2) Entry/Exit/Size: prioridad = lo que ya tenga entry -> si no, lo derivamos del primer row
  entryPrice:
    typeof entry.entryPrice === "number" ? entry.entryPrice : toNum(firstEntry?.price),

  exitPrice:
    typeof entry.exitPrice === "number" ? entry.exitPrice : toNum(firstExit?.price),

  size: typeof entry.size === "number" ? entry.size : toNum(firstEntry?.quantity),

  notes: notesPayload,
  screenshots: entry.screenshots || [],
  tags: entry.tags || [],

  respectedPlan:
    typeof entry.respectedPlan === "boolean" ? entry.respectedPlan : true,
};



    try {

      console.log("SAVING:", {
  instrument: clean.instrument,
  entryPrice: clean.entryPrice,
  exitPrice: clean.exitPrice,
  size: clean.size,
});

      
      await saveJournalEntry(userId, clean);
      const parsed = parseNotes(clean.notes);
      await saveJournalTradesForDay(userId, clean.date, parsed, 
);


      setMsg("Session saved.");
      setTimeout(() => setMsg(""), 2000);
      return true;
    } catch (err: any) {
      console.error(err);
      const supaMsg =
        (err && (err.message || (typeof err === "string" ? err : ""))) ||
        "Unknown Supabase error";
      setMsg(`Error saving session: ${supaMsg}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

const handleSaveAndBack = async () => {
  const ok = await handleSave();
  if (!ok) return; // ✅ si falló, NO navegues
  router.push("/dashboard");
};


  /* =========================
     Import / Sync buttons
  ========================= */
  const [syncing, setSyncing] = useState(false);

  // ✅ Ajusta esta ruta si tu import page se llama distinto (ej: "/import3")
  const IMPORT_PATH = "/import";

  const handleGoToImport = () => {
    router.push(IMPORT_PATH);
  };

  const handleSyncFromImport = async () => {
  if (!userId || !dateParam) {
    setMsg("Cannot sync: missing user/date.");
    return;
  }

  setSyncing(true);
  setMsg("");

  try {
    // ✅ TOKEN CORRECTO
    const {
      data: { session },
      error: sessionErr,
    } = await supabaseBrowser.auth.getSession();

    if (sessionErr || !session?.access_token) {
      setMsg("Cannot sync: not authenticated.");
      return;
    }

    const res = await fetch("/api/journal/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ date: dateParam }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMsg(json?.error ? `Sync error: ${json.error}` : "Sync error.");
      return;
    }

    const found = json?.trades_found ?? 0;
    const groups = json?.groups ?? 0;
    const updated = json?.updated ?? 0;

      setMsg(`Synced ${found} trades → ${groups} groups (${updated} updated).`);
    setTimeout(() => setMsg(""), 2500);

   // ✅ REHIDRATAR ESTADO DESDE SUPABASE (NO router.refresh)
const freshEntry = await getJournalEntryByDate(userId, dateParam);
if (freshEntry) {
  setEntry((prev) => ({ ...prev, ...freshEntry, date: dateParam }));
}

   const freshTrades = await getJournalTradesForDay(userId, dateParam);

// ✅ convertir rows de Supabase (StoredTradeRow) al shape del UI
const normEntry: EntryTradeRow[] = (freshTrades.entries ?? []).map((r: any) => ({
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

const normExit: ExitTradeRow[] = (freshTrades.exits ?? []).map((r: any) => ({
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

    // ✅ si tu entry trae pnl ya guardado, úsalo
const freshPnl =
  freshEntry && typeof (freshEntry as any).pnl === "number"
    ? (freshEntry as any).pnl
    : Number((freshEntry as any)?.pnl) || 0;

// ✅ tu page no tiene setPnl; usa setEntry + setPnlInput
setEntry((prev) => ({ ...prev, pnl: freshPnl }));
setPnlInput(freshPnl ? freshPnl.toFixed(2) : "");


  } catch (err) {
    console.error(err);
    setMsg("Error syncing trades.");
  } finally {
    setSyncing(false);
  }
};


 
  /* ---------- Templates ---------- */
const handleSaveTemplate = () => {
  if (!newTemplateName.trim()) return;

  const preHtml = preRef.current?.innerHTML || "";
  const liveHtml = liveRef.current?.innerHTML || "";
  const postHtml = postRef.current?.innerHTML || "";

  const payload = JSON.stringify({
    premarket: preHtml,
    live: liveHtml,
    post: postHtml,
  });

  addJournalTemplate(newTemplateName.trim(), payload);
  setTemplates(getJournalTemplates());
  setNewTemplateName("");
};


  const handleApplyTemplate = (tpl: JournalTemplate) => {
    if (!tpl.content) return;

    try {
      const parsed = JSON.parse(tpl.content);
      if (parsed && typeof parsed === "object") {
        if (preRef.current && parsed.premarket)
          preRef.current.innerHTML = parsed.premarket;
        if (liveRef.current && parsed.live)
          liveRef.current.innerHTML = parsed.live;
        if (postRef.current && parsed.post)
          postRef.current.innerHTML = parsed.post;
        return;
      }
    } catch {
      if (preRef.current) preRef.current.innerHTML = tpl.content;
    }
  };

  const handleDeleteTemplate = (id: string) => {
    deleteJournalTemplate(id);
    setTemplates(getJournalTemplates());
  };

  /* ---------- Dictation ---------- */
  const toggleDictation = () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      alert("SpeechRecognition is not available in this browser.");
      return;
    }
    if (!recognitionRef.current) {
      const rec = new SR();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let txt = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          txt += e.results[i][0].transcript;
        }
        if (liveRef.current) {
          liveRef.current.focus();
          insertHtmlAtCaret(txt.replace(/\n/g, "<br/>") + " ");
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

  const editorCls =
    "min-h-[280px] w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-[16px] text-slate-100 leading-relaxed focus:outline-none focus:border-emerald-400 overflow-auto";

  /* =========================
     Widgets definitions
  ========================= */
  const WIDGETS: JournalWidgetDef[] = [
    {
      id: "premarket",
      title: "Premarket Prep",
      defaultLayout: {
        i: "premarket",
        x: 0,
        y: 0,
        w: 7,
        h: 8,
        minW: 4,
        minH: 6,
      },
      render: () => (
        <WidgetCard
          title="Premarket Prep"
          right={
            <EditorToolbar
              onBold={() => execCmd("bold")}
              onItalic={() => execCmd("italic")}
              onUnderline={() => execCmd("underline")}
              onUL={() => execCmd("insertUnorderedList")}
              onOL={() => execCmd("insertOrderedList")}
              onQuote={insertQuote}
              onAddRow={addTableRow}
              onAddCol={addTableColumn}
              onInsertTable={insertTable}
            />
          }
        >
          <div
            ref={preRef}
            contentEditable
            suppressContentEditableWarning
            className={editorCls}
          />
        </WidgetCard>
      ),
    },

    {
      id: "pnl",
      title: "Day P&L",
      defaultLayout: { i: "pnl", x: 7, y: 0, w: 5, h: 3, minW: 3, minH: 2 },
      render: () => (
        <WidgetCard title="Day P&L">
          <label className="text-slate-400 text-xs uppercase tracking-wide">
            Day P&L (USD) — AUTO
          </label>
          <input
            type="text"
            value={pnlInput}
            readOnly
            className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-[16px] focus:outline-none focus:border-emerald-400 opacity-90"
            placeholder="Auto-calculated"
          />
          <p className="text-xs text-slate-500 mt-2">
            Calculated from Entries/Exits (FIFO + multipliers + premium).
          </p>
        </WidgetCard>
      ),
    },

    {
      id: "entries",
      title: "Entries",
      defaultLayout: {
        i: "entries",
        x: 7,
        y: 3,
        w: 5,
        h: 7,
        minW: 4,
        minH: 6,
      },
      render: () => (
        <WidgetCard title="Entries">
          <div className="grid grid-cols-1 md:grid-cols-8 gap-2 text-sm">
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Symbol / Contract
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
              <label className="text-xs text-slate-400 block mb-1">Type</label>
              <select
                value={newEntryTrade.kind}
                onChange={(e) =>
                  setNewEntryTrade((p) => ({
                    ...p,
                    kind: e.target.value as InstrumentType,
                  }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Side</label>
              <select
                value={newEntryTrade.side}
                onChange={(e) =>
                  setNewEntryTrade((p) => ({
                    ...p,
                    side: e.target.value as SideType,
                  }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                <option value="long">LONG</option>
                <option value="short">SHORT</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Premium
              </label>
              <select
                value={newEntryTrade.premiumSide}
                onChange={(e) =>
                  setNewEntryTrade((p) => ({
                    ...p,
                    premiumSide: e.target.value as PremiumSide,
                  }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                {PREMIUM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Option strategy
              </label>
              <select
                value={newEntryTrade.optionStrategy}
                onChange={(e) =>
                  setNewEntryTrade((p) => ({
                    ...p,
                    optionStrategy: e.target.value as OptionStrategy,
                  }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                {STRATEGY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Price</label>
              <input
                type="number"
                value={newEntryTrade.price}
                onChange={(e) =>
                  setNewEntryTrade((p) => ({ ...p, price: e.target.value }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Quantity
              </label>
              <input
                type="number"
                value={newEntryTrade.quantity}
                onChange={(e) =>
                  setNewEntryTrade((p) => ({
                    ...p,
                    quantity: e.target.value,
                  }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Time</label>
              <input
                type="text"
                value={newEntryTrade.time}
                onChange={(e) =>
                  setNewEntryTrade((p) => ({ ...p, time: e.target.value }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300"
              />
              <button
                type="button"
                className="text-[11px] text-emerald-300 mt-1"
                onClick={() =>
                  setNewEntryTrade((p) => ({ ...p, time: nowTimeLabel() }))
                }
              >
                use current time
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddEntryTrade}
            className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
          >
            Add entry
          </button>

          {entryTrades.length > 0 && (
            <div className="space-y-2 text-xs mt-3">
              <table className="w-full text-left text-[12px] border border-slate-800 rounded-lg overflow-hidden">
                <thead className="bg-slate-900/80">
                  <tr>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Symbol
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Type
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Side
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Premium
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Strategy
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Price
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Qty
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Time
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">DTE</th>
                    <th className="px-2 py-1 border-b border-slate-800 text-right">
                      –
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entryTrades.map((t) => (
                    <tr key={t.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{t.symbol}</td>
                      <td className="px-2 py-1">{t.kind}</td>
                      <td className="px-2 py-1">{t.side}</td>
                      <td className="px-2 py-1">
                        {premiumLabel(t.kind, t.premiumSide)}
                      </td>
                      <td className="px-2 py-1">
                        {strategyLabel(t.kind, t.optionStrategy)}
                      </td>
                      <td className="px-2 py-1">{t.price}</td>
                      <td className="px-2 py-1">{t.quantity}</td>
                      <td className="px-2 py-1">{t.time}</td>
                      <td className="px-2 py-1">
                        {t.kind === "option" ? (t.dte ?? "—") : "—"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteEntryTrade(t.id)}
                          className="text-slate-500 hover:text-sky-300"
                          title="Delete entry"
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
                  Average entry price per symbol/type
                </p>
                <div className="flex flex-wrap gap-2">
                  {entryAverages.map((a) => (
                    <span
                      key={`${a.symbol}|${a.kind}`}
                      className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px]"
                    >
                      {a.symbol} ({a.kind}): {a.avg.toFixed(2)} · qty {a.qty}
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
      title: "Exits",
      defaultLayout: {
        i: "exits",
        x: 7,
        y: 10,
        w: 5,
        h: 6,
        minW: 4,
        minH: 5,
      },
      render: () => (
        <WidgetCard title="Exits">
          <div className="grid grid-cols-1 md:grid-cols-8 gap-2 text-sm">
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Close position
              </label>
              <select
                value={
                  newExitTrade.symbol
                    ? [
                        newExitTrade.symbol,
                        effectiveKind(newExitTrade.kind, newExitTrade.symbol),
                        newExitTrade.side,
                        normalizePremiumSide(
                          newExitTrade.kind,
                          newExitTrade.premiumSide
                        ),
                        normalizeStrategy(newExitTrade.optionStrategy),
                      ].join("|")
                    : ""
                }
                onChange={(e) => handlePickOpenPosition(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                <option value="">Select…</option>
                {openPositions.map((p) => (
                  <option
                    key={[
                      p.symbol,
                      p.kind,
                      p.side,
                      p.premiumSide,
                      p.optionStrategy,
                    ].join("|")}
                    value={[
                      p.symbol,
                      p.kind,
                      p.side,
                      p.premiumSide,
                      p.optionStrategy,
                    ].join("|")}
                  >
                    {p.symbol} ({p.kind}) {p.side.toUpperCase()} ·{" "}
                    {premiumLabel(p.kind, p.premiumSide)} ·{" "}
                    {strategyLabel(p.kind, p.optionStrategy)} · rem{" "}
                    {p.remainingQty}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Type</label>
              <input
                readOnly
                value={newExitTrade.kind}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Side</label>
              <input
                readOnly
                value={newExitTrade.side}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Premium
              </label>
              <input
                readOnly
                value={premiumLabel(
                  newExitTrade.kind,
                  newExitTrade.premiumSide
                )}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Option strategy
              </label>
              <input
                readOnly
                value={strategyLabel(
                  newExitTrade.kind,
                  newExitTrade.optionStrategy
                )}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Exit price
              </label>
              <input
                type="number"
                value={newExitTrade.price}
                onChange={(e) =>
                  setNewExitTrade((p) => ({ ...p, price: e.target.value }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Qty to close
              </label>
              <input
                type="number"
                value={newExitTrade.quantity}
                onChange={(e) =>
                  setNewExitTrade((p) => ({
                    ...p,
                    quantity: e.target.value,
                  }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Time</label>
              <input
                type="text"
                value={newExitTrade.time}
                onChange={(e) =>
                  setNewExitTrade((p) => ({ ...p, time: e.target.value }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-300"
              />
              <button
                type="button"
                className="text-[11px] text-emerald-300 mt-1"
                onClick={() =>
                  setNewExitTrade((p) => ({ ...p, time: nowTimeLabel() }))
                }
              >
                use current time
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddExitTrade}
            className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
          >
            Add exit
          </button>

          {exitTrades.length > 0 && (
            <div className="space-y-2 text-xs mt-3">
              <table className="w-full text-left text-[12px] border border-slate-800 rounded-lg overflow-hidden">
                <thead className="bg-slate-900/80">
                  <tr>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Symbol
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Type
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Side
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Premium
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Strategy
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Price
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Qty
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">
                      Time
                    </th>
                    <th className="px-2 py-1 border-b border-slate-800">DTE</th>
                    <th className="px-2 py-1 border-b border-slate-800 text-right">
                      –
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {exitTrades.map((t) => (
                    <tr key={t.id} className="border-t border-slate-800">
                      <td className="px-2 py-1">{t.symbol}</td>
                      <td className="px-2 py-1">{t.kind}</td>
                      <td className="px-2 py-1">{t.side}</td>
                      <td className="px-2 py-1">
                        {premiumLabel(t.kind, t.premiumSide)}
                      </td>
                      <td className="px-2 py-1">
                        {strategyLabel(t.kind, t.optionStrategy)}
                      </td>
                      <td className="px-2 py-1">{t.price}</td>
                      <td className="px-2 py-1">{t.quantity}</td>
                      <td className="px-2 py-1">{t.time}</td>
                      <td className="px-2 py-1">
                        {t.kind === "option" ? (t.dte ?? "—") : "—"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteExitTrade(t.id)}
                          className="text-slate-500 hover:text-sky-300"
                          title="Delete exit"
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
                  Average exit price per symbol/type
                </p>
                <div className="flex flex-wrap gap-2">
                  {exitAverages.map((a) => (
                    <span
                      key={`${a.symbol}|${a.kind}`}
                      className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px]"
                    >
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
      title: "Inside the Trade",
      defaultLayout: {
        i: "inside",
        x: 0,
        y: 8,
        w: 7,
        h: 8,
        minW: 4,
        minH: 6,
      },
      render: () => (
        <WidgetCard
          title="Inside the Trade (mic dictation)"
          right={
            <EditorToolbar
              onBold={() => execCmd("bold")}
              onItalic={() => execCmd("italic")}
              onUnderline={() => execCmd("underline")}
              onUL={() => execCmd("insertUnorderedList")}
              onOL={() => execCmd("insertOrderedList")}
              onQuote={insertQuote}
              onAddRow={addTableRow}
              onAddCol={addTableColumn}
              onInsertTable={insertTable}
              extraRight={
                <button
                  type="button"
                  onClick={toggleDictation}
                  className={`px-2 py-1 rounded ${
                    listening
                      ? "bg-sky-500 text-white"
                      : "bg-slate-800 text-slate-200"
                  } text-xs hover:bg-slate-700`}
                >
                  {listening ? "● Stop dictation" : "Start dictation"}
                </button>
              }
            />
          }
        >
          <div
            ref={liveRef}
            contentEditable
            suppressContentEditableWarning
            className={editorCls}
          />
        </WidgetCard>
      ),
    },

    {
      id: "after",
      title: "After-trade Analysis",
      defaultLayout: {
        i: "after",
        x: 0,
        y: 16,
        w: 7,
        h: 8,
        minW: 4,
        minH: 6,
      },
      render: () => (
        <WidgetCard
          title="After-trade Analysis"
          right={
            <EditorToolbar
              onBold={() => execCmd("bold")}
              onItalic={() => execCmd("italic")}
              onUnderline={() => execCmd("underline")}
              onUL={() => execCmd("insertUnorderedList")}
              onOL={() => execCmd("insertOrderedList")}
              onQuote={insertQuote}
              onAddRow={addTableRow}
              onAddCol={addTableColumn}
              onInsertTable={insertTable}
            />
          }
        >
          <div
            ref={postRef}
            contentEditable
            suppressContentEditableWarning
            className={editorCls}
          />
        </WidgetCard>
      ),
    },

    {
      id: "emotional",
      title: "Emotional state",
      defaultLayout: {
        i: "emotional",
        x: 7,
        y: 16,
        w: 5,
        h: 4,
        minW: 3,
        minH: 3,
      },
      render: () => (
        <WidgetCard title="Emotional state & impulses">
          <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
            {[
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
            ].map((t) => (
              <label
                key={t}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-950 border border-slate-700"
              >
                <input
                  type="checkbox"
                  onChange={() => toggleTag(t)}
                  checked={entry.tags?.includes(t)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0"
                />
                <span className="wrap-break-word">{t}</span>
              </label>
            ))}
          </div>
        </WidgetCard>
      ),
    },

    {
      id: "strategy",
      title: "Strategy / Probability",
      defaultLayout: {
        i: "strategy",
        x: 7,
        y: 20,
        w: 5,
        h: 6,
        minW: 3,
        minH: 3,
      },
      render: () => (
        <WidgetCard title="Strategy checklist + Probability">
          {/* Strategy checklist */}
          <div className="mb-4">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              Strategy checklist
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
                <label
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-950 border border-slate-700"
                >
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0"
                  />
                  <span className="wrap-break-word">{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Exit reasons */}
          <div className="border-t border-slate-800 pt-3 mt-2">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              Exit / Stop-loss evidence
            </p>
            <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
              {exitReasonTags.map((t) => (
                <label
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-950 border border-slate-700"
                >
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0"
                  />
                  <span className="wrap-break-word">{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Probability tags */}
          <div className="border-t border-slate-800 pt-3 mt-3">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              Probability & stats flags
            </p>
            <div className="flex flex-wrap gap-2 text-[13px] leading-snug">
              {probabilityTags.map((t) => (
                <label
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-950 border border-slate-700"
                >
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0"
                  />
                  <span className="wrap-break-word">{t}</span>
                </label>
              ))}
            </div>
          </div>
        </WidgetCard>
      ),
    },

    {
      id: "screenshots",
      title: "Screenshots",
      defaultLayout: {
        i: "screenshots",
        x: 0,
        y: 24,
        w: 12,
        h: 6,
        minW: 6,
        minH: 5,
      },
      render: () => (
        <WidgetCard title="Screenshots (links / notes)">
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
            placeholder="Paste here URLs/notes…"
          />
        </WidgetCard>
      ),
    },

    {
      id: "templates",
      title: "Templates",
      defaultLayout: {
        i: "templates",
        x: 0,
        y: 30,
        w: 12,
        h: 5,
        minW: 6,
        minH: 4,
      },
      render: () => (
        <WidgetCard title="Templates (Premarket + Inside + After)">
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1 mb-3">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between gap-2 text-xs bg-slate-950/90 border border-slate-800 rounded-lg px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="px-2 py-1 rounded bg-emerald-500/90 text-slate-950 text-[11px] font-semibold hover:bg-emerald-400"
                  >
                    Apply
                  </button>
                  <span className="text-slate-300">{tpl.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(tpl.id)}
                  className="text-slate-500 hover:text-sky-300"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-2">
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Template name"
              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="px-4 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
            >
              Save current as template
            </button>
          </div>
        </WidgetCard>
      ),
    },

    {
      id: "actions",
      title: "Actions",
      defaultLayout: {
        i: "actions",
        x: 0,
        y: 35,
        w: 12,
        h: 4,
        minW: 6,
        minH: 3,
      },
      render: () => (
          <WidgetCard title="Actions">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500">
              {msg && <span className="text-emerald-400 mr-3">{msg}</span>}
              Your structure, your rules.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleGoToImport}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-sky-400 hover:text-sky-300 transition"
              >
                Import
              </button>

              <button
                type="button"
                onClick={handleSyncFromImport}
                disabled={syncing}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-amber-400 hover:text-amber-300 transition disabled:opacity-50"
              >
                {syncing ? "Syncing…" : "Sync"}
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-emerald-400 hover:text-emerald-300 transition disabled:opacity-50"
              >
                Save
              </button>

              <button
                type="button"
                onClick={handleSaveAndBack}
                disabled={saving}
                className="px-6 py-2 rounded-xl bg-emerald-400 text-slate-950 text-sm font-semibold hover:bg-emerald-300 transition disabled:opacity-50"
              >
                Save & return to dashboard
              </button>
            </div>
          </div>
        </WidgetCard>
      ),
    },
  ];

  const layoutStorageKey = "journal_layout_v1";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 md:px-8 py-6">
      <div className="mx-auto w-full max-w-[1440px] xl:max-w-[1600px]">
        {/* Top */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">
              Daily Journal
            </p>
            <h1 className="text-[28px] md:text-[32px] font-semibold mt-1">
              {parsedDate} — session review
            </h1>
            <p className="text-[15px] text-slate-400 mt-1">
              Log trades, screenshots, emotions and rule compliance.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="shrink-0 px-3 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              ← Back
            </button>
            <Link
              href="/dashboard"
              className="shrink-0 px-3 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              ← Back to dashboard
            </Link>
          </div>
        </div>

        {/* Widget toggles */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 mb-5">
          <p className="text-xs text-slate-400 mb-2">
            Customize this journal page: toggle widgets on/off.
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
        <JournalGrid
          storageKey={layoutStorageKey}
          widgets={WIDGETS}
          activeIds={activeWidgets}
        />
      </div>
    </main>
  );
}
