"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
  let node: ChildNode | null;
  let lastNode: ChildNode | null = null;
  // eslint-disable-next-line no-cond-assign
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

/* =========================
   UI: 1–6 × 1–6 table picker
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

        {/* Table */}
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

        {/* quick row/col */}
        <button
          className={btn}
          type="button"
          onClick={onAddRow}
          title="Add row"
        >
          +row
        </button>
        <button
          className={btn}
          type="button"
          onClick={onAddCol}
          title="Add column"
        >
          +col
        </button>
      </div>

      <div className="ml-auto">{extraRight}</div>
    </div>
  );
}

/* =========================
   Trade rows
========================= */
type EntryTradeRow = {
  id: string;
  asset: string;
  price: string;
  quantity: string;
  time: string;
};

type ExitTradeRow = {
  id: string;
  asset: string;
  price: string;
  quantity: string;
  time: string;
};

function computeAverages(trades: { asset: string; price: string }[]) {
  const map: Record<string, { sum: number; count: number }> = {};
  for (const t of trades) {
    const asset = t.asset.trim().toUpperCase();
    const price = parseFloat(t.price);
    if (!asset || !Number.isFinite(price)) continue;
    if (!map[asset]) map[asset] = { sum: 0, count: 0 };
    map[asset].sum += price;
    map[asset].count += 1;
  }
  return Object.entries(map).map(([asset, { sum, count }]) => ({
    asset,
    avg: sum / count,
  }));
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
    direction: undefined,
    entryPrice: undefined,
    exitPrice: undefined,
    size: undefined,
    screenshots: [],
    notes: "",
    emotion: "",
    tags: [],
    respectedPlan: true, // puedes dejarlo, solo ya no hay UI
  });

  // P&L as string so user can delete 0 and type negatives
  const [pnlInput, setPnlInput] = useState<string>("");

  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Rich text refs
  const preRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const postRef = useRef<HTMLDivElement | null>(null);

  // Dictation
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Trades
  const [entryTrades, setEntryTrades] = useState<EntryTradeRow[]>([]);
  const [exitTrades, setExitTrades] = useState<ExitTradeRow[]>([]);
  const [newEntryTrade, setNewEntryTrade] = useState<
    Omit<EntryTradeRow, "id">
  >({
    asset: "",
    price: "",
    quantity: "",
    time: "",
  });
  const [newExitTrade, setNewExitTrade] = useState<
    Omit<ExitTradeRow, "id">
  >({
    asset: "",
    price: "",
    quantity: "",
    time: "",
  });

  const entryAverages = useMemo(
    () => computeAverages(entryTrades),
    [entryTrades]
  );
  const exitAverages = useMemo(
    () => computeAverages(exitTrades),
    [exitTrades]
  );

  // SOLO dejamos probabilityTags (quick tags se eliminó)
  const probabilityTags = [
    "A+ playbook setup",
    "B-setup (secondary quality)",
    "Exploratory / data-gathering trade",
    "Trade aligned with my stats edge",
    "Outside my proven statistics",
    "Within high-probability session window",
    "Outside my usual session window",
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
  const exec = (cmd: string) => document.execCommand(cmd, false);
  const insertQuote = () =>
    insertHtmlAtCaret("<blockquote>Quote…</blockquote>");

  /* ---------- Trades handlers ---------- */
  const handleAddEntryTrade = () => {
    if (!newEntryTrade.asset.trim() || !newEntryTrade.price.trim()) return;
    setEntryTrades((prev) => [
      ...prev,
      { id: crypto.randomUUID(), ...newEntryTrade },
    ]);
    setNewEntryTrade({ asset: "", price: "", quantity: "", time: "" });
  };

  const handleAddExitTrade = () => {
    if (!newExitTrade.asset.trim() || !newExitTrade.price.trim()) return;
    setExitTrades((prev) => [
      ...prev,
      { id: crypto.randomUUID(), ...newExitTrade },
    ]);
    setNewExitTrade({ asset: "", price: "", quantity: "", time: "" });
  };

  const handleDeleteEntryTrade = (id: string) =>
    setEntryTrades((prev) => prev.filter((t) => t.id !== id));

  const handleDeleteExitTrade = (id: string) =>
    setExitTrades((prev) => prev.filter((t) => t.id !== id));

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

    const parsedPnl = parseFloat(pnlInput);
    const finalPnl = Number.isFinite(parsedPnl) ? parsedPnl : 0;

    const clean: JournalEntry = {
      ...entry,
      date: dateParam,
      pnl: finalPnl,
      entryPrice:
        entry.entryPrice !== undefined && entry.entryPrice !== null
          ? Number(entry.entryPrice)
          : undefined,
      exitPrice:
        entry.exitPrice !== undefined && entry.exitPrice !== null
          ? Number(entry.exitPrice)
          : undefined,
      notes: notesPayload,
      screenshots: entry.screenshots || [],
      tags: entry.tags || [],
      direction: entry.direction,
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

  /* ---------- Styles ---------- */
  const editorCls =
    "min-h-[280px] w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-[16px] text-slate-100 leading-relaxed focus:outline-none focus:border-emerald-400 overflow-auto";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-4 md:px-8 py-6">
      <div className="mx-auto w-full max-w-[1440px] xl:max-w-[1600px]">
        {/* Top */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-5">
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

        {/* Compact summary */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 text-sm">
          {/* Day P&L */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 text-xs uppercase tracking-wide">
              Day P&L (USD)
            </label>
            <input
              type="number"
              value={pnlInput}
              onChange={(e) => {
                const value = e.target.value;
                setPnlInput(value);
                const parsed = parseFloat(value);
                setEntry((prev) => ({
                  ...prev,
                  pnl: Number.isFinite(parsed) ? parsed : prev.pnl,
                }));
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-[16px] focus:outline-none focus:border-emerald-400"
              placeholder="e.g. 250, -150, 0"
            />
            <p className="text-xs text-slate-500">
              Flat days and small learning days are part of a healthy curve.
            </p>
          </div>

          {/* Main instrument */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-slate-400 text-xs uppercase tracking-wide">
              Main instrument
            </label>
            <input
              type="text"
              placeholder="e.g. NQ, ES, SPX, AAPL"
              value={entry.instrument || ""}
              onChange={(e) =>
                setEntry((p) => ({ ...p, instrument: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-[16px] focus:outline-none focus:border-emerald-400"
            />
            <div className="flex gap-2 mt-2 items-center">
              <span className="text-slate-400 text-xs">Direction</span>
              <button
                type="button"
                onClick={() =>
                  setEntry((p) => ({ ...p, direction: "long" }))
                }
                className={`px-3 py-1 rounded-full text-xs border ${
                  entry.direction === "long"
                    ? "bg-emerald-400 text-slate-950 border-emerald-400"
                    : "bg-slate-900 text-slate-300 border-slate-700"
                }`}
              >
                LONG
              </button>
              <button
                type="button"
                onClick={() =>
                  setEntry((p) => ({ ...p, direction: "short" }))
                }
                className={`px-3 py-1 rounded-full text-xs border ${
                  entry.direction === "short"
                    ? "bg-sky-400 text-slate-950 border-sky-400"
                    : "bg-slate-900 text-slate-300 border-slate-700"
                }`}
              >
                SHORT
              </button>
            </div>
          </div>
        </section>

        {/* ======= 2 columns layout ======= */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Premarket + Inside + After */}
          <div className="flex flex-col gap-6">
            {/* Premarket */}
            <section>
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-slate-200 text-sm font-medium">
                    Premarket Prep
                  </p>
                  <EditorToolbar
                    onBold={() => exec("bold")}
                    onItalic={() => exec("italic")}
                    onUnderline={() => exec("underline")}
                    onUL={() => exec("insertUnorderedList")}
                    onOL={() => exec("insertOrderedList")}
                    onQuote={insertQuote}
                    onAddRow={addTableRow}
                    onAddCol={addTableColumn}
                    onInsertTable={(r, c) => insertTable(r, c)}
                  />
                </div>
                <div
                  ref={preRef}
                  contentEditable
                  suppressContentEditableWarning
                  className={editorCls}
                />
                <p className="text-[11px] text-slate-500 mt-2">
                  Use bullet lists, numbered lists and the ▦ button for tables
                  (up to 6×6). +row/+col expand the nearest table.
                </p>
              </div>
            </section>

            {/* Inside the Trade */}
            <section>
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-slate-200 text-sm font-medium">
                    Inside the Trade (mic dictation)
                  </p>
                  <EditorToolbar
                    onBold={() => exec("bold")}
                    onItalic={() => exec("italic")}
                    onUnderline={() => exec("underline")}
                    onUL={() => exec("insertUnorderedList")}
                    onOL={() => exec("insertOrderedList")}
                    onQuote={insertQuote}
                    onAddRow={addTableRow}
                    onAddCol={addTableColumn}
                    onInsertTable={(r, c) => insertTable(r, c)}
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

            {/* After-trade */}
            <section>
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-slate-200 text-sm font-medium">
                    After-trade Analysis
                  </p>
                  <EditorToolbar
                    onBold={() => exec("bold")}
                    onItalic={() => exec("italic")}
                    onUnderline={() => exec("underline")}
                    onUL={() => exec("insertUnorderedList")}
                    onOL={() => exec("insertOrderedList")}
                    onQuote={insertQuote}
                    onAddRow={addTableRow}
                    onAddCol={addTableColumn}
                    onInsertTable={(r, c) => insertTable(r, c)}
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
          </div>

          {/* Right column: Entries + Exits + Emotional / Screenshots */}
          <div className="flex flex-col gap-6">
            {/* Entries */}
            <section>
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-slate-200 text-sm font-medium">Entries</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Symbol / Contract
                    </label>
                    <input
                      type="text"
                      value={newEntryTrade.asset}
                      onChange={(e) =>
                        setNewEntryTrade((p) => ({
                          ...p,
                          asset: e.target.value,
                        }))
                      }
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                      placeholder="SPX, AAPL, ESU5..."
                    />
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
                          <th className="px-2 py-1 border-b border-slate-800">
                            Symbol
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
                          <th className="px-2 py-1 border-b border-slate-800 text-right">
                            –
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {entryTrades.map((t) => (
                          <tr key={t.id} className="border-t border-slate-800">
                            <td className="px-2 py-1">{t.asset}</td>
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
                        Average entry price per asset
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {entryAverages.map((a) => (
                          <span
                            key={a.asset}
                            className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px]"
                          >
                            {a.asset}: {a.avg.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Exits */}
            <section>
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-slate-200 text-sm font-medium">Exits</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Symbol / Contract
                    </label>
                    <input
                      type="text"
                      value={newExitTrade.asset}
                      onChange={(e) =>
                        setNewExitTrade((p) => ({
                          ...p,
                          asset: e.target.value,
                        }))
                      }
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[14px] text-slate-100 focus:outline-none focus:border-emerald-400"
                      placeholder="SPX, AAPL, ESU5..."
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Price
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
                      placeholder="e.g. 5128.0"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      Quantity
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
                          <th className="px-2 py-1 border-b border-slate-800">
                            Symbol
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
                          <th className="px-2 py-1 border-b border-slate-800 text-right">
                            –
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {exitTrades.map((t) => (
                          <tr key={t.id} className="border-t border-slate-800">
                            <td className="px-2 py-1">{t.asset}</td>
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
                        Average exit price per asset
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {exitAverages.map((a) => (
                          <span
                            key={a.asset}
                            className="px-2 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px]"
                          >
                            {a.asset}: {a.avg.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Emotional + Strategy + Probability + Screenshots */}
            <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Emotional state */}
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4">
                <p className="text-slate-200 text-sm font-semibold mb-2">
                  Emotional state & impulses
                </p>
                <p className="text-[11px] text-slate-500 mb-3">
                  Check what emotions and impulses were present during today&apos;s
                  session.
                </p>

                <div className="grid grid-cols-1 gap-2 text-[13px] mb-4">
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

                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      onChange={() => toggleTag("FOMO")}
                      checked={entry.tags?.includes("FOMO")}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                    />
                    <span>FOMO (fear of missing out)</span>
                  </label>

                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      onChange={() => toggleTag("Fear of being wrong")}
                      checked={entry.tags?.includes("Fear of being wrong")}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                    />
                    <span>Fear of being wrong</span>
                  </label>

                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      onChange={() => toggleTag("Revenge trade")}
                      checked={entry.tags?.includes("Revenge trade")}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                    />
                    <span>Revenge impulse present</span>
                  </label>
                </div>
              </div>

              {/* Strategy & probability flags */}
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4">
                <p className="text-slate-200 text-sm font-semibold mb-2">
                  Strategy checklist
                </p>
                <p className="text-[11px] text-slate-500 mb-3">
                  Track how well you executed your written plan and risk rules.
                </p>

                <div className="grid grid-cols-1 gap-2 text-[13px] mb-4">
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
                        className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                      />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>

                <div className="border-t border-slate-800 pt-3">
                  <p className="text-slate-200 text-sm font-semibold mb-2">
                    Probability & stats flags
                  </p>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Use these to mark if today&apos;s trades were aligned or not
                    with your historical edge and usual trading windows.
                  </p>

                  <div className="grid grid-cols-1 gap-2 text-[13px]">
                    {probabilityTags.map((t) => (
                      <label
                        key={t}
                        className="inline-flex items-center gap-2"
                      >
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

                  <p className="text-[11px] text-slate-500 mt-3">
                    These flags are used by Analytics and AI suggestions to
                    track high-probability vs exploratory sessions.
                  </p>
                </div>
              </div>
            </section>

            {/* Screenshots textbox */}
            <section>
              <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4">
                <p className="text-slate-200 text-sm font-medium mb-2">
                  Screenshots (links / notes, one per line)
                </p>
                <textarea
                  rows={12}
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
          </div>
        </div>

        {/* Templates */}
        <section className="mt-6">
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4">
            <p className="text-slate-200 text-sm font-medium mb-3">
              Templates (Premarket + Inside + After)
            </p>

            {templates.length === 0 && (
              <p className="text-xs text-slate-500 mb-2">
                No templates yet. Configure your blocks and save them as a
                preset.
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
                placeholder="Template name (e.g. SPX London session)"
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
    </main>
  );
}
