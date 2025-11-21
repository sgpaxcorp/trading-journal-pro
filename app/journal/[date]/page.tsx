"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import JournalGrid, {
  type JournalWidgetId,
  type JournalWidgetDef,
} from "@/app/components/JournalGrid";

import {
  JournalEntry,
  getJournalEntryByDate,
  saveJournalEntry,
} from "@/lib/journalLocal";
import {
  getJournalTemplates,
  addJournalTemplate,
  deleteJournalTemplate,
  JournalTemplate,
} from "@/lib/journalTemplatesLocal";
import { type InstrumentType } from "@/lib/journalNotes";

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

type EntryTradeRow = {
  id: string;
  symbol: string;
  kind: InstrumentType;
  side: SideType;
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
  price: string;
  quantity: string;
  time: string;
  dte?: number | null;
  expiry?: string | null;
};

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

    // 🔒 Normaliza a medianoche UTC para evitar inflar días por timezone
    const entryUTC = Date.UTC(y, m - 1, d);
    const expiryUTC = Date.UTC(
      expiry.getFullYear(),
      expiry.getMonth(),
      expiry.getDate()
    );

    const msPerDay = 24 * 60 * 60 * 1000;

    // ✅ diferencia simple en días calendario
    const diffDays = Math.round((expiryUTC - entryUTC) / msPerDay);

    // Si es el mismo día => 0DTE
    if (diffDays === 0) return 0;

    return diffDays >= 0 ? diffDays : null;
  } catch {
    return null;
  }
}



function computeAverages(
  trades: { symbol: string; kind: InstrumentType; price: string; quantity: string }[]
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

function computeAutoPnL(entries: EntryTradeRow[], exits: ExitTradeRow[]) {
  const key = (s: string, k: InstrumentType, side: SideType) =>
    `${s}|${k}|${side}`;

  const entryAgg: Record<string, { sumPxQty: number; sumQty: number }> = {};
  const exitAgg: Record<string, { sumPxQty: number; sumQty: number }> = {};

  for (const e of entries) {
    const sym = (e.symbol || "").trim().toUpperCase();
    if (!sym) continue;
    const k = key(sym, e.kind || "other", e.side || "long");
    const px = parseFloat(e.price);
    const qty = parseFloat(e.quantity);
    if (!Number.isFinite(px) || !Number.isFinite(qty) || qty <= 0) continue;
    entryAgg[k] ||= { sumPxQty: 0, sumQty: 0 };
    entryAgg[k].sumPxQty += px * qty;
    entryAgg[k].sumQty += qty;
  }

  for (const x of exits) {
    const sym = (x.symbol || "").trim().toUpperCase();
    if (!sym) continue;
    const k = key(sym, x.kind || "other", x.side || "long");
    const px = parseFloat(x.price);
    const qty = parseFloat(x.quantity);
    if (!Number.isFinite(px) || !Number.isFinite(qty) || qty <= 0) continue;
    exitAgg[k] ||= { sumPxQty: 0, sumQty: 0 };
    exitAgg[k].sumPxQty += px * qty;
    exitAgg[k].sumQty += qty;
  }

  let total = 0;

  for (const k of Object.keys(exitAgg)) {
    const e = entryAgg[k];
    const x = exitAgg[k];
    if (!e || !x) continue;

    const avgEntry = e.sumPxQty / e.sumQty;
    const avgExit = x.sumPxQty / x.sumQty;
    const closedQty = Math.min(e.sumQty, x.sumQty);

    const [, , side] = k.split("|") as [string, string, SideType];
    const sign = side === "short" ? -1 : 1;

    total += (avgExit - avgEntry) * closedQty * sign;
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
      <div className="drag-handle cursor-move select-none flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/40">
        <p className="text-slate-200 text-sm font-medium">{title}</p>
        <div>{right}</div>
      </div>

      {/* ✅ permite achicar sin perder texto */}
      <div className="p-4 flex-1 min-h-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}

/* =========================
   Page
========================= */
export default function DailyJournalPage() {
  const params = useParams();
  const router = useRouter();

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
      price: "",
      quantity: "",
      time: nowTimeLabel(),
      dte: null,
      expiry: null,
    });

  /* ---------------- Widgets active state ---------------- */
  const ALL_WIDGETS: { id: JournalWidgetId; label: string; defaultOn: boolean }[] =
    [
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

  // Load existing entry + templates
  useEffect(() => {
    if (!dateParam) return;

    const existing = getJournalEntryByDate(dateParam);
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
  }, [dateParam]);

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

    let dte: number | null = null;
    let expiryStr: string | null = null;

    if (newEntryTrade.kind === "option") {
      const parsed = parseSPXOptionSymbol(symbol);
      if (parsed) {
        dte = calcDTE(dateParam, parsed.expiry);
        expiryStr = parsed.expiry.toISOString().slice(0, 10);
      }
    }

    setEntryTrades((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ...newEntryTrade,
        symbol,
        time: nowTimeLabel(),
        dte,
        expiry: expiryStr,
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
    const key = (s: string, k: InstrumentType, side: SideType) =>
      `${s}|${k}|${side}`;
    const totals: Record<
      string,
      {
        symbol: string;
        kind: InstrumentType;
        side: SideType;
        entryQty: number;
        exitQty: number;
      }
    > = {};

    for (const e of entryTrades) {
      const sym = (e.symbol || "").trim().toUpperCase();
      if (!sym) continue;
      const k = key(sym, e.kind || "other", e.side || "long");
      totals[k] ||= {
        symbol: sym,
        kind: e.kind || "other",
        side: e.side || "long",
        entryQty: 0,
        exitQty: 0,
      };
      totals[k].entryQty += Number(e.quantity) || 0;
    }

    for (const x of exitTrades) {
      const sym = (x.symbol || "").trim().toUpperCase();
      if (!sym) continue;
      const k = key(sym, x.kind || "other", x.side || "long");
      totals[k] ||= {
        symbol: sym,
        kind: x.kind || "other",
        side: x.side || "long",
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
    const [symbol, kind, side] = posKey.split("|") as [
      string,
      InstrumentType,
      SideType
    ];
    const pos = openPositions.find(
      (p) => p.symbol === symbol && p.kind === kind && p.side === side
    );
    if (!pos) return;

    setNewExitTrade({
      symbol: pos.symbol,
      kind: pos.kind,
      side: pos.side,
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

    let dte: number | null = null;
    let expiryStr: string | null = null;

    if (newExitTrade.kind === "option") {
      const parsed = parseSPXOptionSymbol(symbol);
      if (parsed) {
        dte = calcDTE(dateParam, parsed.expiry);
        expiryStr = parsed.expiry.toISOString().slice(0, 10);
      }
    }

    setExitTrades((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ...newExitTrade,
        symbol,
        time: nowTimeLabel(),
        dte,
        expiry: expiryStr,
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

  /* ---------- AUTO PNL local ---------- */
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
      const tags = exists ? current.filter((t) => t !== tag) : [...current, tag];
      return { ...prev, tags };
    });

  const probabilityTags = [
    "A+ playbook setup",
    "B-setup (secondary quality)",
    "Exploratory / data-gathering trade",
    "Trade aligned with my stats edge",
    "Outside my proven statistics",
    "Within high-probability session window",
    "Outside my usual session window",
  ];

  const exitReasonTags = [
    "Stop Loss",
    "Take Profit Hit",
    "Manual Exit",
    "Moved stop to profit",
    "Stopped out (loss)",
  ];

  /* ---------- Save ---------- */
  const handleSave = () => {
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

    const clean: JournalEntry = {
      ...entry,
      date: dateParam,
      pnl: Number.isFinite(entry.pnl) ? entry.pnl : 0,
      notes: notesPayload,
      screenshots: entry.screenshots || [],
      tags: entry.tags || [],
    };

    saveJournalEntry(clean);
    setSaving(false);
    setMsg("Session saved.");
    setTimeout(() => setMsg(""), 2000);
  };

  const handleSaveAndBack = () => {
    handleSave();
    router.push("/dashboard");
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
            Day P&L (USD) — auto
          </label>
          <input
            type="text"
            value={pnlInput}
            readOnly
            className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-[16px] focus:outline-none focus:border-emerald-400 opacity-90"
            placeholder="Auto-calculated"
          />
          <p className="text-xs text-slate-500 mt-2">
            Calculated from Entries/Exits.
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
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
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
                readOnly
                value={newEntryTrade.time}
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
                    <th className="px-2 py-1 border-b border-slate-800">Symbol</th>
                    <th className="px-2 py-1 border-b border-slate-800">Type</th>
                    <th className="px-2 py-1 border-b border-slate-800">Side</th>
                    <th className="px-2 py-1 border-b border-slate-800">Price</th>
                    <th className="px-2 py-1 border-b border-slate-800">Qty</th>
                    <th className="px-2 py-1 border-b border-slate-800">Time</th>
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
                          className="text-slate-500 hover:text-red-400"
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
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Close position
              </label>
              <select
                value={`${newExitTrade.symbol}|${newExitTrade.kind}|${newExitTrade.side}`}
                onChange={(e) => handlePickOpenPosition(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                <option value="">Select…</option>
                {openPositions.map((p) => (
                  <option
                    key={`${p.symbol}|${p.kind}|${p.side}`}
                    value={`${p.symbol}|${p.kind}|${p.side}`}
                  >
                    {p.symbol} ({p.kind}) {p.side.toUpperCase()} · rem{" "}
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
                readOnly
                value={newExitTrade.time}
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
                    <th className="px-2 py-1 border-b border-slate-800">Symbol</th>
                    <th className="px-2 py-1 border-b border-slate-800">Type</th>
                    <th className="px-2 py-1 border-b border-slate-800">Side</th>
                    <th className="px-2 py-1 border-b border-slate-800">Price</th>
                    <th className="px-2 py-1 border-b border-slate-800">Qty</th>
                    <th className="px-2 py-1 border-b border-slate-800">Time</th>
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
                          className="text-slate-500 hover:text-red-400"
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
                      ? "bg-rose-500 text-white"
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
          <div className="grid grid-cols-1 gap-2 text-[13px] leading-snug">
            {["Calm & focused", "Greedy", "Desperate", "FOMO", "Revenge trade"].map(
              (t) => (
                <label key={t} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0"
                  />
                  <span className="break-words">{t}</span>
                </label>
              )
            )}
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
          <div className="grid grid-cols-1 gap-2 text-[13px] leading-snug mb-4">
            {[
              "Respect Strategy",
              "Planned stop was in place",
              "Used planned position sizing",
              "Risk-to-reward ≥ 2R (planned)",
              "Risk-to-reward < 1.5R (tight)",
            ].map((t) => (
              <label key={t} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  onChange={() => toggleTag(t)}
                  checked={entry.tags?.includes(t)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0"
                />
                <span className="break-words">{t}</span>
              </label>
            ))}
          </div>

          <div className="border-t border-slate-800 pt-3">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              Exit / Stop-loss evidence
            </p>
            <div className="grid grid-cols-1 gap-2 text-[13px] leading-snug">
              {exitReasonTags.map((t) => (
                <label key={t} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0"
                  />
                  <span className="break-words">{t}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 mt-3">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              Probability & stats flags
            </p>
            <div className="grid grid-cols-1 gap-2 text-[13px] leading-snug">
              {probabilityTags.map((t) => (
                <label key={t} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 shrink-0"
                  />
                  <span className="break-words">{t}</span>
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
                  className="text-slate-500 hover:text-red-400"
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
          <Link
            href="/dashboard"
            className="shrink-0 px-3 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
          >
            ← Back to dashboard
          </Link>
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
