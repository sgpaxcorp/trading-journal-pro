"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

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
import { useAuth } from "@/context/AuthContext";
import TopNav from "@/app/components/TopNav";
import DashboardGrid from "@/app/components/DashboardGrid";

/* =========================================================
   Dynamic grid (same as dashboard, no SSR)
========================================================= */
const DynamicGrid = dynamic(() => Promise.resolve(DashboardGrid as any), {
  ssr: false,
}) as any;

/* =========================================================
   Helpers: editor / tables
========================================================= */
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
            .map(
              () =>
                `<td class="border border-slate-800 px-2 py-1">Cell</td>`
            )
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

/* =========================================================
   UI: 1–6 × 1–6 table picker
========================================================= */
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

/* =========================================================
   Toolbar
========================================================= */
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

/* =========================================================
   Trading types / direction
========================================================= */
type TradeType = "stock" | "option" | "future" | "crypto" | "forex" | "other";
type Direction = "long" | "short";

const TYPE_LABEL: Record<TradeType, string> = {
  stock: "Stocks",
  option: "Options",
  future: "Futures",
  crypto: "Crypto",
  forex: "Forex",
  other: "Other",
};

const DIR_LABEL: Record<Direction, string> = {
  long: "Long",
  short: "Short",
};

/* =========================================================
   Trade rows
========================================================= */
type EntryTradeRow = {
  id: string;
  symbol: string;
  type: TradeType;
  direction: Direction;
  price: string;     // entry price
  quantity: string;  // contracts/shares
  time: string;      // HH:MM
};

type ExitTradeRow = {
  id: string;
  entryKey: string;  // link to entry group (symbol|type|direction)
  symbol: string;
  type: TradeType;
  direction: Direction;
  price: string;     // exit price
  quantity: string;  // qty closed
  time: string;
};

/* =========================================================
   Time helpers
========================================================= */
function nowTimeHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* =========================================================
   Averages / grouping
========================================================= */
function keyOf(symbol: string, type: TradeType, direction: Direction) {
  return `${symbol.trim().toUpperCase()}|${type}|${direction}`;
}

function computeAvgByGroup(entries: EntryTradeRow[]) {
  const map: Record<
    string,
    { symbol: string; type: TradeType; direction: Direction; sumPxQty: number; sumQty: number }
  > = {};

  for (const e of entries) {
    const symbol = (e.symbol || "").trim().toUpperCase();
    const qty = Number(e.quantity);
    const px = Number(e.price);
    if (!symbol || !Number.isFinite(qty) || !Number.isFinite(px) || qty <= 0) continue;

    const k = keyOf(symbol, e.type, e.direction);
    if (!map[k]) {
      map[k] = { symbol, type: e.type, direction: e.direction, sumPxQty: 0, sumQty: 0 };
    }
    map[k].sumPxQty += px * qty;
    map[k].sumQty += qty;
  }

  const groups = Object.entries(map).map(([k, v]) => ({
    key: k,
    symbol: v.symbol,
    type: v.type,
    direction: v.direction,
    avgEntry: v.sumQty > 0 ? v.sumPxQty / v.sumQty : 0,
    totalQty: v.sumQty,
  }));

  return groups;
}

/* =========================================================
   PnL multipliers (simple safe defaults)
   Puedes expandir luego.
========================================================= */
function futureMultiplier(symbol: string) {
  const s = symbol.toUpperCase();
  if (s.startsWith("ES") || s === "SPX") return 50;
  if (s.startsWith("NQ")) return 20;
  if (s.startsWith("MES")) return 5;
  if (s.startsWith("MNQ")) return 2;
  if (s.startsWith("CL")) return 1000;
  if (s.startsWith("GC")) return 100;
  return 1;
}

function multiplierFor(type: TradeType, symbol: string) {
  if (type === "option") return 100;
  if (type === "future") return futureMultiplier(symbol);
  return 1;
}

function computePnL(entries: EntryTradeRow[], exits: ExitTradeRow[]) {
  const groups = computeAvgByGroup(entries);
  const groupMap = new Map(groups.map((g) => [g.key, g]));

  let total = 0;

  for (const x of exits) {
    const g = groupMap.get(x.entryKey);
    if (!g) continue;

    const exitPx = Number(x.price);
    const qty = Number(x.quantity);
    if (!Number.isFinite(exitPx) || !Number.isFinite(qty) || qty <= 0) continue;

    const dirSign = x.direction === "long" ? 1 : -1;
    const mult = multiplierFor(x.type, x.symbol);
    const pnlPerUnit = (exitPx - g.avgEntry) * dirSign;

    total += pnlPerUnit * qty * mult;
  }

  return total;
}

/* =========================================================
   Widgets
========================================================= */
type JournalWidgetId =
  | "premarket"
  | "inside"
  | "after"
  | "entries"
  | "exits"
  | "emotional"
  | "strategy"
  | "probability"
  | "screenshots"
  | "templates";

const ALL_JOURNAL_WIDGETS: { id: JournalWidgetId; label: string }[] = [
  { id: "premarket", label: "Premarket" },
  { id: "inside", label: "Inside the Trade" },
  { id: "after", label: "After-trade Analysis" },
  { id: "entries", label: "Entries" },
  { id: "exits", label: "Exits" },
  { id: "emotional", label: "Emotional state" },
  { id: "strategy", label: "Strategy checklist" },
  { id: "probability", label: "Probability flags" },
  { id: "screenshots", label: "Screenshots" },
  { id: "templates", label: "Templates" },
];

function formatDateFriendly(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/* =========================================================
   PAGE
========================================================= */
export default function DailyJournalPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();

  const dateParam = Array.isArray(params?.date)
    ? params.date[0]
    : (params?.date as string);

  /* ---------------- Core entry ---------------- */
  const [entry, setEntry] = useState<JournalEntry>({
    date: dateParam || "",
    pnl: 0,
    instrument: "",
    direction: undefined,
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

  /* ---------------- Templates ---------------- */
  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");

  /* ---------------- Saving ---------------- */
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  /* ---------------- Editors refs ---------------- */
  const preRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const postRef = useRef<HTMLDivElement | null>(null);

  /* ---------------- Dictation ---------------- */
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  /* ---------------- Entries / Exits ---------------- */
  const [entryTrades, setEntryTrades] = useState<EntryTradeRow[]>([]);
  const [exitTrades, setExitTrades] = useState<ExitTradeRow[]>([]);

  const [newEntryTrade, setNewEntryTrade] = useState<Omit<EntryTradeRow, "id">>({
    symbol: "",
    type: "option",
    direction: "long",
    price: "",
    quantity: "",
    time: nowTimeHHMM(),
  });

  const [newExitTrade, setNewExitTrade] = useState<Omit<ExitTradeRow, "id">>({
    entryKey: "",
    symbol: "",
    type: "option",
    direction: "long",
    price: "",
    quantity: "",
    time: nowTimeHHMM(),
  });

  /* ---------------- Widget library ---------------- */
  const [activeWidgets, setActiveWidgets] = useState<JournalWidgetId[]>(
    ALL_JOURNAL_WIDGETS.map((w) => w.id)
  );
  const [widgetsLoaded, setWidgetsLoaded] = useState(false);

  /* ---------------- Auth guard ---------------- */
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  /* ---------------- Load existing journal + templates ---------------- */
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
            if (Array.isArray(parsed.exits))
              setExitTrades(parsed.exits);
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

  /* ---------------- Persist journal widgets per user ---------------- */
  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const storageKey =
      (user as any).uid
        ? `tjpro_journal_widgets_${(user as any).uid}`
        : "tjpro_journal_widgets_default";

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((id: any) =>
            ALL_JOURNAL_WIDGETS.some((w) => w.id === id)
          ) as JournalWidgetId[];
          if (valid.length > 0) setActiveWidgets(valid);
        }
      }
    } catch (err) {
      console.warn("[journal] error loading widget toggles", err);
    } finally {
      setWidgetsLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !widgetsLoaded || typeof window === "undefined") return;

    const storageKey =
      (user as any).uid
        ? `tjpro_journal_widgets_${(user as any).uid}`
        : "tjpro_journal_widgets_default";

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(activeWidgets));
    } catch (err) {
      console.warn("[journal] error saving widget toggles", err);
    }
  }, [user, activeWidgets, widgetsLoaded]);

  /* ---------------- Derived groups for exits dropdown ---------------- */
  const entryGroups = useMemo(() => computeAvgByGroup(entryTrades), [entryTrades]);

  const exitOptions = entryGroups.map((g) => ({
    key: g.key,
    label: `${g.symbol} (${TYPE_LABEL[g.type]} · ${DIR_LABEL[g.direction]}) · qty ${g.totalQty}`,
    symbol: g.symbol,
    type: g.type,
    direction: g.direction,
  }));

  /* ---------------- Auto-PnL ---------------- */
  const totalPnL = useMemo(
    () => computePnL(entryTrades, exitTrades),
    [entryTrades, exitTrades]
  );

  useEffect(() => {
    const v = Number.isFinite(totalPnL) ? totalPnL : 0;
    setEntry((p) => ({ ...p, pnl: v }));
    setPnlInput(v.toFixed(2));
  }, [totalPnL]);

  /* ---------------- UI helpers ---------------- */
  const execCmd = (cmd: string) => document.execCommand(cmd, false);
  const insertQuote = () =>
    insertHtmlAtCaret("<blockquote>Quote…</blockquote>");

  const editorCls =
    "min-h-[260px] w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-[16px] text-slate-100 leading-relaxed focus:outline-none focus:border-emerald-400 overflow-auto";

  const parsedDate = formatDateFriendly(dateParam);

  /* ---------------- Add / delete entries ---------------- */
  const handleAddEntryTrade = () => {
    const symbol = newEntryTrade.symbol.trim();
    const price = newEntryTrade.price.trim();
    if (!symbol || !price) return;

    setEntryTrades((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ...newEntryTrade,
        symbol,
        time: newEntryTrade.time || nowTimeHHMM(),
      },
    ]);

    setNewEntryTrade((p) => ({
      ...p,
      symbol: "",
      price: "",
      quantity: "",
      time: nowTimeHHMM(),
    }));
  };

  const handleDeleteEntryTrade = (id: string) =>
    setEntryTrades((prev) => prev.filter((t) => t.id !== id));

  /* ---------------- Add / delete exits ---------------- */
  const handleAddExitTrade = () => {
    if (!newExitTrade.entryKey || !newExitTrade.price.trim()) return;

    setExitTrades((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ...newExitTrade,
        time: newExitTrade.time || nowTimeHHMM(),
      },
    ]);

    setNewExitTrade((p) => ({
      ...p,
      entryKey: "",
      symbol: "",
      price: "",
      quantity: "",
      time: nowTimeHHMM(),
    }));
  };

  const handleDeleteExitTrade = (id: string) =>
    setExitTrades((prev) => prev.filter((t) => t.id !== id));

  /* ---------------- Dictation ---------------- */
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

  /* ---------------- Tags (strategy / emotional / probability) ---------------- */
  const probabilityTags = [
    "A+ playbook setup",
    "B-setup (secondary quality)",
    "Exploratory / data-gathering trade",
    "Trade aligned with my stats edge",
    "Outside my proven statistics",
    "Within high-probability session window",
    "Outside my usual session window",
  ];

  const strategyTags = [
    "Respect Strategy",
    "Planned stop was in place",
    "Stop Loss",
    "Take Profit",
    "Manual exit",
    "Moved stop to BE (gain)",
    "Stopped out (loss)",
    "Used planned position sizing",
    "Risk-to-reward ≥ 2R (planned)",
    "Risk-to-reward < 1.5R (tight)",
  ];

  const toggleTag = (tag: string) =>
    setEntry((prev) => {
      const current = prev.tags || [];
      const exists = current.includes(tag);
      const tags = exists
        ? current.filter((t) => t !== tag)
        : [...current, tag];
      return { ...prev, tags };
    });

  /* ---------------- Save ---------------- */
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

  /* ---------------- Templates ---------------- */
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

  /* ---------------- Layout storage key (per user) ---------------- */
  const layoutStorageKey =
    user && (user as any).uid
      ? `tjpro_journal_layout_${(user as any).uid}`
      : "tjpro_journal_layout_default";

  /* =========================================================
     Render widgets
  ========================================================= */
  const renderWidget = (id: JournalWidgetId) => {
    if (id === "premarket") {
      return (
        <section className="h-full">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 h-full">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-200 text-sm font-medium">
                Premarket Prep
              </p>
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
            </div>
            <div
              ref={preRef}
              contentEditable
              suppressContentEditableWarning
              className={editorCls}
            />
            <p className="text-[11px] text-slate-500 mt-2">
              Use bullet lists, numbered lists and the ▦ button for tables.
            </p>
          </div>
        </section>
      );
    }

    if (id === "inside") {
      return (
        <section className="h-full">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 h-full">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-200 text-sm font-medium">
                Inside the Trade (mic dictation)
              </p>
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
            </div>
            <div
              ref={liveRef}
              contentEditable
              suppressContentEditableWarning
              className={editorCls}
            />
          </div>
        </section>
      );
    }

    if (id === "after") {
      return (
        <section className="h-full">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 h-full">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-200 text-sm font-medium">
                After-trade Analysis
              </p>
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
            </div>
            <div
              ref={postRef}
              contentEditable
              suppressContentEditableWarning
              className={editorCls}
            />
          </div>
        </section>
      );
    }

    if (id === "entries") {
      const averages = entryGroups;

      return (
        <section className="h-full">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 space-y-3 h-full">
            <p className="text-slate-200 text-sm font-medium">Entries</p>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">
                  Symbol / Contract
                </label>
                <input
                  type="text"
                  value={newEntryTrade.symbol}
                  onChange={(e) =>
                    setNewEntryTrade((p) => ({
                      ...p,
                      symbol: e.target.value,
                    }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                  placeholder="SPX, TSLA, ESU5..."
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Type
                </label>
                <select
                  value={newEntryTrade.type}
                  onChange={(e) =>
                    setNewEntryTrade((p) => ({
                      ...p,
                      type: e.target.value as TradeType,
                    }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                >
                  {(Object.keys(TYPE_LABEL) as TradeType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Direction
                </label>
                <select
                  value={newEntryTrade.direction}
                  onChange={(e) =>
                    setNewEntryTrade((p) => ({
                      ...p,
                      direction: e.target.value as Direction,
                    }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                >
                  {(Object.keys(DIR_LABEL) as Direction[]).map((d) => (
                    <option key={d} value={d}>
                      {DIR_LABEL[d]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Price
                </label>
                <input
                  type="number"
                  value={newEntryTrade.price}
                  onChange={(e) =>
                    setNewEntryTrade((p) => ({
                      ...p,
                      price: e.target.value,
                    }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                  placeholder="e.g. 5120.5"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Qty
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
                  placeholder="Size"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={newEntryTrade.time}
                  onChange={(e) =>
                    setNewEntryTrade((p) => ({
                      ...p,
                      time: e.target.value,
                    }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={() =>
                    setNewEntryTrade((p) => ({
                      ...p,
                      time: nowTimeHHMM(),
                    }))
                  }
                  className="text-[11px] text-emerald-300 mt-1 underline"
                >
                  use current time
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddEntryTrade}
              className="mt-1 px-3 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
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
                      <th className="px-2 py-1 border-b border-slate-800">Dir</th>
                      <th className="px-2 py-1 border-b border-slate-800">Price</th>
                      <th className="px-2 py-1 border-b border-slate-800">Qty</th>
                      <th className="px-2 py-1 border-b border-slate-800">Time</th>
                      <th className="px-2 py-1 border-b border-slate-800 text-right">–</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entryTrades.map((t) => (
                      <tr key={t.id} className="border-t border-slate-800">
                        <td className="px-2 py-1">{t.symbol}</td>
                        <td className="px-2 py-1">{TYPE_LABEL[t.type]}</td>
                        <td className="px-2 py-1">{DIR_LABEL[t.direction]}</td>
                        <td className="px-2 py-1">{t.price}</td>
                        <td className="px-2 py-1">{t.quantity}</td>
                        <td className="px-2 py-1">{t.time}</td>
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
                    Average entry price per symbol/type/direction
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {averages.map((a) => (
                      <span
                        key={a.key}
                        className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px]"
                      >
                        {a.symbol} ({a.type}/{a.direction}): {a.avgEntry.toFixed(2)} · qty {a.totalQty}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      );
    }

    if (id === "exits") {
      const averages = entryGroups;

      return (
        <section className="h-full">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 space-y-3 h-full">
            <p className="text-slate-200 text-sm font-medium">Exits</p>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">
                  Close position
                </label>
                <select
                  value={newExitTrade.entryKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    const opt = exitOptions.find((x) => x.key === key);
                    if (!opt) {
                      setNewExitTrade((p) => ({ ...p, entryKey: "" }));
                      return;
                    }
                    setNewExitTrade((p) => ({
                      ...p,
                      entryKey: opt.key,
                      symbol: opt.symbol,
                      type: opt.type,
                      direction: opt.direction,
                    }));
                  }}
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                >
                  <option value="">Select…</option>
                  {exitOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Type</label>
                <input
                  value={newExitTrade.type ? TYPE_LABEL[newExitTrade.type] : ""}
                  readOnly
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-400"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Dir</label>
                <input
                  value={newExitTrade.direction ? DIR_LABEL[newExitTrade.direction] : ""}
                  readOnly
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[14px] text-slate-400"
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
                    setNewExitTrade((p) => ({
                      ...p,
                      price: e.target.value,
                    }))
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
                  placeholder="Size"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={newExitTrade.time}
                  onChange={(e) =>
                    setNewExitTrade((p) => ({
                      ...p,
                      time: e.target.value,
                    }))
                  }
                  className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={() =>
                    setNewExitTrade((p) => ({
                      ...p,
                      time: nowTimeHHMM(),
                    }))
                  }
                  className="text-[11px] text-emerald-300 mt-1 underline"
                >
                  use current time
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddExitTrade}
              className="mt-1 px-3 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
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
                      <th className="px-2 py-1 border-b border-slate-800">Dir</th>
                      <th className="px-2 py-1 border-b border-slate-800">Price</th>
                      <th className="px-2 py-1 border-b border-slate-800">Qty</th>
                      <th className="px-2 py-1 border-b border-slate-800">Time</th>
                      <th className="px-2 py-1 border-b border-slate-800 text-right">–</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exitTrades.map((t) => (
                      <tr key={t.id} className="border-t border-slate-800">
                        <td className="px-2 py-1">{t.symbol}</td>
                        <td className="px-2 py-1">{TYPE_LABEL[t.type]}</td>
                        <td className="px-2 py-1">{DIR_LABEL[t.direction]}</td>
                        <td className="px-2 py-1">{t.price}</td>
                        <td className="px-2 py-1">{t.quantity}</td>
                        <td className="px-2 py-1">{t.time}</td>
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
                    Average exit price per symbol/type/direction
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {averages.map((a) => {
                      const xs = exitTrades.filter((x) => x.entryKey === a.key);
                      if (xs.length === 0) return null;
                      const sumPxQty = xs.reduce(
                        (s, x) => s + Number(x.price || 0) * Number(x.quantity || 0),
                        0
                      );
                      const sumQty = xs.reduce((s, x) => s + Number(x.quantity || 0), 0);
                      const avgExit = sumQty > 0 ? sumPxQty / sumQty : 0;
                      return (
                        <span
                          key={a.key}
                          className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px]"
                        >
                          {a.symbol} ({a.type}/{a.direction}): {avgExit.toFixed(2)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      );
    }

    if (id === "emotional") {
      return (
        <section className="h-full">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 h-full">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              Emotional state & impulses
            </p>
            <p className="text-[11px] text-slate-500 mb-3">
              Check what emotions and impulses were present during today&apos;s session.
            </p>

            <div className="grid grid-cols-1 gap-2 text-[13px]">
              {["Calm & focused", "Greedy", "Desperate"].map((t) => (
                <label key={t} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                  />
                  <span>{t}</span>
                </label>
              ))}

              {[
                "FOMO",
                "Fear of being wrong",
                "Revenge trade",
              ].map((t) => (
                <label key={t} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (id === "strategy") {
      return (
        <section className="h-full">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 h-full">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              Strategy checklist
            </p>
            <p className="text-[11px] text-slate-500 mb-3">
              Track execution, risk rules and exit outcome.
            </p>

            <div className="grid grid-cols-1 gap-2 text-[13px]">
              {strategyTags.map((t) => (
                <label key={t} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (id === "probability") {
      return (
        <section className="h-full">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 h-full">
            <p className="text-slate-200 text-sm font-semibold mb-2">
              Probability & stats flags
            </p>
            <p className="text-[11px] text-slate-500 mb-3">
              Mark alignment with your historical edge.
            </p>

            <div className="grid grid-cols-1 gap-2 text-[13px]">
              {probabilityTags.map((t) => (
                <label key={t} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    onChange={() => toggleTag(t)}
                    checked={entry.tags?.includes(t)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
      );
    }

    if (id === "screenshots") {
      return (
        <section className="h-full">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 h-full">
            <p className="text-slate-200 text-sm font-medium mb-2">
              Screenshots (links / notes, one per line)
            </p>
            <textarea
              rows={10}
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
              placeholder="Paste here URLs/notes for your images…"
            />
          </div>
        </section>
      );
    }

    if (id === "templates") {
      return (
        <section className="h-full">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 h-full">
            <p className="text-slate-200 text-sm font-medium mb-3">
              Templates (Premarket + Inside + After)
            </p>

            {templates.length === 0 && (
              <p className="text-xs text-slate-500 mb-2">
                No templates yet.
              </p>
            )}

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
          </div>
        </section>
      );
    }

    return (
      <div className="text-xs text-slate-400">
        Unknown widget: {id}
      </div>
    );
  };

  /* =========================================================
     Render Page
  ========================================================= */
  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading journal…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-4 md:px-8 py-6">
        <div className="mx-auto w-full max-w-[1600px]">
          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between gap-4 mb-6">
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
            <div className="flex flex-col items-start md:items-end gap-2">
              <Link
                href="/dashboard"
                className="shrink-0 px-3 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                ← Back to dashboard
              </Link>

              <p className="text-[11px] text-slate-500">
                Auto P&amp;L:{" "}
                <span
                  className={
                    entry.pnl >= 0
                      ? "text-emerald-300 font-semibold"
                      : "text-sky-300 font-semibold"
                  }
                >
                  {entry.pnl >= 0 ? "+" : "-"}${Math.abs(entry.pnl).toFixed(2)}
                </span>
              </p>
            </div>
          </header>

          {/* PnL box */}
          <section className="mb-5 bg-slate-900/95 border border-slate-800 rounded-2xl p-4">
            <label className="text-slate-400 text-xs uppercase tracking-wide">
              Day P&amp;L (USD) — auto
            </label>
            <input
              type="text"
              value={pnlInput}
              readOnly
              className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-[16px] focus:outline-none focus:border-emerald-400 opacity-90"
              placeholder="Auto-calculated from entries/exits"
            />
            <p className="text-xs text-slate-500 mt-2">
              Calculated automatically per symbol/type/direction.
            </p>
          </section>

          {/* Widget Library / Picker */}
          <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-[13px] text-slate-400 mb-2">
              Customize your journal: toggle widgets on/off.
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_JOURNAL_WIDGETS.map((w) => {
                const isActive = activeWidgets.includes(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() =>
                      setActiveWidgets((prev) =>
                        prev.includes(w.id)
                          ? prev.filter((x) => x !== w.id)
                          : [...prev, w.id]
                      )
                    }
                    className={`px-3 py-1.5 rounded-full text-[12px] border transition ${
                      isActive
                        ? "bg-emerald-400 text-slate-950 border-emerald-300"
                        : "bg-slate-950 text-slate-300 border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
                    }`}
                  >
                    {isActive ? "✓ " : "+ "}
                    {w.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* GRID of widgets */}
          <DynamicGrid
            items={activeWidgets as any}
            renderItem={renderWidget as any}
            storageKey={layoutStorageKey}
          />

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
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
        </div>
      </div>
    </main>
  );
}
