// app/back-study/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import {
  getAllJournalEntries,
  type JournalEntry,
} from "@/lib/journalLocal";
import { type InstrumentType } from "@/lib/journalNotes";
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
} from "lightweight-charts";

/* =========================
   Types
========================= */

type Candle = {
  time: number; // ms since epoch (Yahoo)
  open: number;
  high: number;
  low: number;
  close: number;
};

type TimeframeId = "1m" | "5m" | "15m" | "1h" | "1d";

const TIMEFRAMES: {
  id: TimeframeId;
  label: string;
  interval: string;
  range: string;
}[] = [
  { id: "1m", label: "1m", interval: "1m", range: "7d" },
  { id: "5m", label: "5m", interval: "5m", range: "30d" },
  { id: "15m", label: "15m", interval: "15m", range: "60d" },
  { id: "1h", label: "1h", interval: "60m", range: "60d" },
  { id: "1d", label: "1D", interval: "1d", range: "6mo" },
];

type SideType = "long" | "short";

type EntryTradeRow = {
  id?: string;
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  price: string;
  quantity: string;
  time: string;
  dte?: number | null;
  expiry?: string | null;
};

type ExitTradeRow = EntryTradeRow;

type SessionWithTrades = JournalEntry & {
  entries: EntryTradeRow[];
  exits: ExitTradeRow[];
};

type TradeView = {
  id: string;
  date: string; // YYYY-MM-DD
  symbol: string;
  kind: InstrumentType;
  entryTime: string;
  exitTime: string;
  entryPrice: number | null;
  exitPrice: number | null;
  underlyingSymbol: string;
  contractSymbol?: string;
};

type ChartState = {
  loading: boolean;
  error: string | null;
  candles: Candle[];
};

/* =========================
   Helpers
========================= */

function safeUpper(s: string | undefined | null): string {
  return (s || "").trim().toUpperCase();
}

// Offset actual de tu zona horaria (minutos que hay que restar a UTC para llegar a local)
const LOCAL_TZ_OFFSET_MIN = new Date().getTimezoneOffset(); // p.ej. 300 en EST (UTC-5)

function shiftMsToLocal(ms: number): number {
  // Los timestamps de Yahoo vienen como UTC.
  // Para que el chart y las comparaciones usen hora local (EST),
  // restamos ese offset (en ms).
  return ms - LOCAL_TZ_OFFSET_MIN * 60 * 1000;
}

/**
 * Parse "9:56 AM", "09:56", "09:56:30" → minutos del día (hora local).
 * NO hacemos conversión a UTC aquí; esto se interpreta como EST tal cual tú lo escribes.
 */
function parseTimeToMinutesFlexible(t: string): number | null {
  if (!t) return null;
  const cleaned = t.trim().toUpperCase();

  const m = cleaned.match(
    /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/
  );
  if (!m) return null;

  let hour = Number(m[1]);
  const minutes = Number(m[2]);
  const ampm = m[3];

  if (!Number.isFinite(hour) || !Number.isFinite(minutes)) return null;

  if (ampm === "AM" && hour === 12) hour = 0;
  if (ampm === "PM" && hour !== 12) hour += 12;

  if (hour < 0 || hour > 23 || minutes < 0 || minutes > 59) return null;

  // Hora local en minutos (ej. 9:56 AM -> 596)
  return hour * 60 + minutes;
}

/**
 * Convierte un timestamp de candle (UTC de Yahoo) a minutos del día
 * en hora local (EST), usando el mismo shift que el chart.
 */
function minutesFromMsLocal(ms: number): number {
  const d = new Date(shiftMsToLocal(ms));
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function parseNotesTrades(notesRaw: unknown): {
  entries: EntryTradeRow[];
  exits: ExitTradeRow[];
} {
  if (typeof notesRaw !== "string") return { entries: [], exits: [] };
  try {
    const parsed = JSON.parse(notesRaw);
    if (!parsed || typeof parsed !== "object") return { entries: [], exits: [] };

    const entries = Array.isArray((parsed as any).entries)
      ? (parsed as any).entries
      : [];
    const exits = Array.isArray((parsed as any).exits)
      ? (parsed as any).exits
      : [];

    return { entries, exits };
  } catch {
    return { entries: [], exits: [] };
  }
}

function parseSPXOptionSymbol(raw: string) {
  const s = safeUpper(raw).replace(/^[\.\-]/, "");
  // Example: SPXW251121C6565 / SPX251121P6000
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

/**
 * Normalize symbols for Yahoo Finance:
 * - SPX, NDX, RUT → ^SPX, ^NDX, ^RUT
 * - Futures like ES, MES → ES=F, MES=F
 * - Options SPXW/SPX: we use ^SPX as underlying when needed
 */
function normalizeSymbolForYahoo(
  symbol: string,
  kind?: InstrumentType
): string {
  const raw = safeUpper(symbol).replace(/\s+/g, "");
  if (!raw) return raw;

  let s = raw.replace(/^[\.\-]/, "").replace(/^\//, "");

  if (kind === "option") {
    const parsed = parseSPXOptionSymbol(s);
    if (parsed) {
      let base = parsed.underlying.replace(/W$/, ""); // SPXW → SPX
      if (base === "SPX") return "^SPX";
      if (base === "NDX") return "^NDX";
      if (base === "RUT") return "^RUT";
      return base;
    }
    return s;
  }

  const idxMap: Record<string, string> = {
    SPX: "^SPX",
    SP500: "^GSPC",
    SP: "^GSPC",
    GSPC: "^GSPC",
    NDX: "^NDX",
    RUT: "^RUT",
    VIX: "^VIX",
  };
  if (idxMap[s]) return idxMap[s];

  const FUT_ROOTS = [
    "ES",
    "MES",
    "NQ",
    "MNQ",
    "YM",
    "MYM",
    "RTY",
    "M2K",
    "CL",
    "MCL",
    "GC",
    "MGC",
    "SI",
  ];

  if (kind === "future" || FUT_ROOTS.some((r) => s.startsWith(r))) {
    if (!s.endsWith("=F")) return `${s}=F`;
    return s;
  }

  return s;
}

/* =========================
   Interactive chart
========================= */

type InteractiveCandleChartProps = {
  title: string;
  symbol: string;
  candles: Candle[];
  selectedDate: string;
  entryTime: string;
  exitTime: string;
  entryPrice?: number | null;
  exitPrice?: number | null;
  entryColor?: string;
  exitColor?: string;
};

function InteractiveCandleChart({
  title,
  symbol,
  candles,
  selectedDate,
  entryTime,
  exitTime,
  entryPrice,
  exitPrice,
  entryColor = "#22c55e",
  exitColor = "#38bdf8",
}: InteractiveCandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const markersPluginRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#020617" },
        textColor: "#e5e7eb",
      },
      rightPriceScale: {
        borderColor: "#1f2937",
      },
      timeScale: {
        borderColor: "#1f2937",
        timeVisible: true,
        secondsVisible: false,
      },
      grid: {
        vertLines: { color: "#0f172a" },
        horzLines: { color: "#0f172a" },
      },
      width: containerRef.current.clientWidth,
      height: 320,
      crosshair: {
        mode: 1,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
    } as any);

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#9ca3af",
      wickDownColor: "#9ca3af",
    } as any);

    const markersPlugin = createSeriesMarkers(series);

    chartRef.current = chart;
    seriesRef.current = series;
    markersPluginRef.current = markersPlugin;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        chartRef.current?.applyOptions({ width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersPluginRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || !candles.length) return;

    // Convertimos todos los candles a hora local (EST) para el chart
    const data = candles.map((c) => ({
      time: Math.floor(shiftMsToLocal(c.time) / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    seriesRef.current.setData(data);

    const timeScale = chartRef.current.timeScale();
    const times = data.map((d) => d.time as number);

    if (times.length) {
      const last = times[times.length - 1];
      const THREE_MONTHS_SEC = 60 * 60 * 24 * 90;
      const from = last - THREE_MONTHS_SEC;
      timeScale.setVisibleRange({ from, to: last });
    } else {
      timeScale.fitContent();
    }

    // --- Markers: matching por hora local (EST) ---
    const entryMinutesLocal = parseTimeToMinutesFlexible(entryTime);
    const exitMinutesLocal = parseTimeToMinutesFlexible(exitTime);

    let entryIdx: number | null = null;
    let exitIdx: number | null = null;

    const filtered = candles
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => {
        const d = new Date(shiftMsToLocal(c.time));
        const isoDay = d.toISOString().slice(0, 10);
        return isoDay === selectedDate;
      });

    if (entryMinutesLocal != null) {
      let bestDiff = Infinity;
      filtered.forEach(({ c, idx }) => {
        const mins = minutesFromMsLocal(c.time); // EST minutos del día
        const diff = Math.abs(mins - entryMinutesLocal);
        if (diff < bestDiff) {
          bestDiff = diff;
          entryIdx = idx;
        }
      });
    }

    if (exitMinutesLocal != null) {
      let bestDiff = Infinity;
      filtered.forEach(({ c, idx }) => {
        const mins = minutesFromMsLocal(c.time); // EST
        const diff = Math.abs(mins - exitMinutesLocal);
        if (diff < bestDiff) {
          bestDiff = diff;
          exitIdx = idx;
        }
      });
    }

    const markers: any[] = [];

    if (entryIdx != null && entryIdx >= 0) {
      const c = candles[entryIdx];
      markers.push({
        time: Math.floor(shiftMsToLocal(c.time) / 1000),
        position: "belowBar",
        color: entryColor,
        shape: "arrowUp",
        text: `Entry ${entryPrice != null ? entryPrice.toFixed(2) : ""}`,
      });
    }

    if (exitIdx != null && exitIdx >= 0) {
      const c = candles[exitIdx];
      markers.push({
        time: Math.floor(shiftMsToLocal(c.time) / 1000),
        position: "aboveBar",
        color: exitColor,
        shape: "arrowDown",
        text: `Exit ${exitPrice != null ? exitPrice.toFixed(2) : ""}`,
      });
    }

    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers(markers);
    }
  }, [
    candles,
    selectedDate,
    entryTime,
    exitTime,
    entryPrice,
    exitPrice,
    entryColor,
    exitColor,
  ]);

  const handleZoomIn = () => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    ts.zoomIn();
  };

  const handleZoomOut = () => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    ts.zoomOut();
  };

  const handleReset = () => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    ts.fitContent();
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div>
          <p className="text-sm font-medium text-slate-100">{title}</p>
          <p className="text-xs text-slate-400 font-mono">{symbol}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-4 rounded"
                style={{ backgroundColor: entryColor }}
              />
              <span className="text-slate-300">Entry</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-4 rounded"
                style={{ backgroundColor: exitColor }}
              />
              <span className="text-slate-300">Exit</span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={handleZoomIn}
              className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
              title="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
              title="Reset zoom"
            >
              ⟳
            </button>
          </div>
        </div>
      </div>

      {!candles.length ? (
        <p className="text-sm text-slate-400">
          No chart data for this symbol/timeframe.
        </p>
      ) : (
        <div
          ref={containerRef}
          className="w-full h-[320px] rounded-xl border border-slate-800 bg-slate-950"
        />
      )}
    </div>
  );
}

/* =========================
   Main Back-Study page
========================= */

export default function BackStudyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    if (loading || !user) return;
    setEntries(getAllJournalEntries());
  }, [loading, user]);

  const sessions: SessionWithTrades[] = useMemo(() => {
    return entries.map((s) => {
      const { entries: ent, exits: ex } = parseNotesTrades(s.notes);
      return {
        ...s,
        entries: ent || [],
        exits: ex || [],
      };
    });
  }, [entries]);

  const trades: TradeView[] = useMemo(() => {
    const list: TradeView[] = [];

    sessions.forEach((session) => {
      const ent = session.entries || [];
      const ex = session.exits || [];

      const symKindSet = new Set<string>();
      ent.forEach((t) =>
        symKindSet.add(`${safeUpper(t.symbol)}|${t.kind || "stock"}`)
      );
      ex.forEach((t) =>
        symKindSet.add(`${safeUpper(t.symbol)}|${t.kind || "stock"}`)
      );
      symKindSet.delete("|");

      symKindSet.forEach((key) => {
        const [sym, kindRaw] = key.split("|");
        if (!sym) return;

        const entList = ent.filter(
          (t) => safeUpper(t.symbol) === sym && (t.kind || "stock") === kindRaw
        );
        const exList = ex.filter(
          (t) => safeUpper(t.symbol) === sym && (t.kind || "stock") === kindRaw
        );
        if (!entList.length && !exList.length) return;

        const entryRow = entList[0] || exList[0];
        const exitRow =
          exList[exList.length - 1] ||
          entList[entList.length - 1] ||
          entryRow;

        const kind =
          ((entryRow?.kind ||
            exList[0]?.kind ||
            "stock") as InstrumentType) || "stock";

        const entryTime = entryRow?.time || "09:30";
        const exitTime = exitRow?.time || entryTime;

        const entryPriceNum = Number.parseFloat(entryRow?.price ?? "");
        const exitPriceNum = Number.parseFloat(exitRow?.price ?? "");

        const entryPrice = Number.isFinite(entryPriceNum)
          ? entryPriceNum
          : null;
        const exitPrice = Number.isFinite(exitPriceNum)
          ? exitPriceNum
          : null;

        let underlyingSymbol = sym;
        let contractSymbol: string | undefined;

        if ((kind as string) === "option") {
          const parsed = parseSPXOptionSymbol(sym);
          if (parsed) {
            underlyingSymbol = parsed.underlying;
            contractSymbol = sym;
          } else {
            underlyingSymbol = sym;
            contractSymbol = sym;
          }
        }

        const id = `${session.date}-${sym}-${kind}-${entryTime}-${exitTime}`;

        list.push({
          id,
          date: session.date,
          symbol: sym,
          kind,
          entryTime,
          exitTime,
          entryPrice,
          exitPrice,
          underlyingSymbol,
          contractSymbol,
        });
      });
    });

    return list.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [sessions]);

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTradeId, setSelectedTradeId] = useState<string>("");
  const [timeframe, setTimeframe] = useState<TimeframeId>("5m");

  useEffect(() => {
    if (!trades.length) {
      setSelectedDate("");
      setSelectedTradeId("");
      return;
    }
    const first = trades[0];
    setSelectedDate(first.date);
    setSelectedTradeId(first.id);
  }, [trades]);

  const datesAvailable = Array.from(new Set(trades.map((t) => t.date))).sort(
    (a, b) => (a < b ? 1 : -1)
  );

  const tradesForDate = trades.filter((t) => t.date === selectedDate);
  const selectedTrade = trades.find((t) => t.id === selectedTradeId) || null;

  const [underlyingState, setUnderlyingState] = useState<ChartState>({
    loading: false,
    error: null,
    candles: [],
  });

  const [contractState, setContractState] = useState<ChartState>({
    loading: false,
    error: null,
    candles: [],
  });

  /* -------- Yahoo fetch (sin errores duros) -------- */

  const fetchCandles = async (
    symbol: string,
    tfId: TimeframeId,
    kind?: InstrumentType
  ): Promise<Candle[]> => {
    const tf = TIMEFRAMES.find((t) => t.id === tfId)!;
    const yfSymbol = normalizeSymbolForYahoo(symbol, kind);

    const url = `/api/yahoo-chart?symbol=${encodeURIComponent(
      yfSymbol
    )}&interval=${encodeURIComponent(tf.interval)}&range=${encodeURIComponent(
      tf.range
    )}`;

    try {
      const res = await fetch(url);

      if (!res.ok) {
        let msg = "";
        try {
          msg = await res.text();
        } catch {
          // ignore
        }
        if (msg) {
          console.warn("Yahoo chart warning:", msg);
        }
        return [];
      }

      const data = await res.json();
      return Array.isArray((data as any).candles) ? (data as any).candles : [];
    } catch (err) {
      console.warn("Yahoo Finance request failed:", err);
      return [];
    }
  };

  const loadReplay = async () => {
    if (!selectedTrade) return;

    const { underlyingSymbol, contractSymbol, kind } = selectedTrade;

    setUnderlyingState({ loading: true, error: null, candles: [] });
    setContractState({
      loading: !!contractSymbol,
      error: null,
      candles: [],
    });

    // Underlying
    try {
      const uc = await fetchCandles(underlyingSymbol, timeframe, kind);
      setUnderlyingState({
        loading: false,
        error: null,
        candles: uc,
      });
    } catch (err) {
      console.warn("Underlying chart error:", err);
      setUnderlyingState({
        loading: false,
        error: "Could not load underlying chart.",
        candles: [],
      });
    }

    // Contract
    if (contractSymbol) {
      try {
        const cc = await fetchCandles(contractSymbol, timeframe, "option");
        if (cc.length) {
          setContractState({
            loading: false,
            error: null,
            candles: cc,
          });
        } else {
          const fallback = await fetchCandles(
            underlyingSymbol,
            timeframe,
            kind
          );
          setContractState({
            loading: false,
            error:
              "No specific contract data found. Showing underlying instead.",
            candles: fallback,
          });
        }
      } catch (err) {
        console.warn("Contract chart error:", err);
        setContractState({
          loading: false,
          error: "Could not load contract chart.",
          candles: [],
        });
      }
    } else {
      setContractState({ loading: false, error: null, candles: [] });
    }
  };

  const handleLoad = async (e: FormEvent) => {
    e.preventDefault();
    await loadReplay();
  };

  useEffect(() => {
    if (!selectedTrade) return;
    loadReplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrade, timeframe]);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading back-study…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="px-4 md:px-8 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between gap-4 mb-2">
            <div>
              <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">
                Back-Studying
              </p>
              <h1 className="text-3xl md:text-4xl font-semibold mt-1">
                Chart replays from your journal
              </h1>
              <p className="text-sm md:text-base text-slate-400 mt-2 max-w-xl">
                Each entry in the Entries/Exits widgets becomes a trade. The
                chart marks the exact entry (green arrow) and exit (blue arrow)
                using the times and prices you saved in the daily journal.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="self-start md:self-center px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              ← Back to dashboard
            </button>
          </header>

          {trades.length === 0 ? (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
              <p className="text-sm text-slate-200 mb-1">
                No trades found for back-study.
              </p>
              <p className="text-sm text-slate-400">
                Make sure you have Entries and Exits saved in the journal
                (notes JSON) so they can be replayed here.
              </p>
            </section>
          ) : (
            <>
              {/* Controls */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5 shadow-[0_0_30px_rgba(15,23,42,0.8)]">
                <form
                  onSubmit={handleLoad}
                  className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
                >
                  {/* Session selector */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400">Session</label>
                    <select
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      value={selectedDate}
                      onChange={(e) => {
                        const d = e.target.value;
                        setSelectedDate(d);
                        const firstTrade = trades.find((t) => t.date === d);
                        if (firstTrade) {
                          setSelectedTradeId(firstTrade.id);
                        } else {
                          setSelectedTradeId("");
                        }
                      }}
                    >
                      {datesAvailable.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Trade selector */}
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-xs text-slate-400">
                      Trade (symbol)
                    </label>
                    <select
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      value={selectedTradeId}
                      onChange={(e) => setSelectedTradeId(e.target.value)}
                    >
                      {tradesForDate.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.symbol} ({t.kind}) · {t.entryTime} → {t.exitTime}
                        </option>
                      ))}
                    </select>
                    {selectedTrade && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Underlying:{" "}
                        <span className="font-mono text-slate-200">
                          {selectedTrade.underlyingSymbol}
                        </span>
                        {selectedTrade.contractSymbol &&
                          selectedTrade.contractSymbol !==
                            selectedTrade.underlyingSymbol && (
                            <>
                              {" · "}Contract:{" "}
                              <span className="font-mono text-slate-200">
                                {selectedTrade.contractSymbol}
                              </span>
                            </>
                          )}
                      </p>
                    )}
                  </div>

                  {/* Timeframes + load */}
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1">
                      {TIMEFRAMES.map((tf) => {
                        const active = tf.id === timeframe;
                        return (
                          <button
                            key={tf.id}
                            type="button"
                            onClick={() => setTimeframe(tf.id)}
                            className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                              active
                                ? "bg-emerald-400 text-slate-950 border-emerald-300"
                                : "bg-slate-950 text-slate-200 border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
                            }`}
                          >
                            {tf.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="submit"
                      className="w-full px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-sm font-semibold shadow-[0_0_20px_rgba(16,185,129,0.45)] hover:bg-emerald-400 transition"
                    >
                      Load replay
                    </button>
                  </div>
                </form>
              </section>

              {/* Charts */}
              {selectedTrade && (
                <section className="space-y-4">
                  {/* Underlying */}
                  <div>
                    {underlyingState.loading ? (
                      <p className="text-sm text-slate-400">
                        Loading underlying chart…
                      </p>
                    ) : underlyingState.error ? (
                      <p className="text-sm text-sky-300">
                        {underlyingState.error}
                      </p>
                    ) : (
                      <InteractiveCandleChart
                        title="Underlying asset"
                        symbol={normalizeSymbolForYahoo(
                          selectedTrade.underlyingSymbol,
                          selectedTrade.kind
                        )}
                        candles={underlyingState.candles}
                        selectedDate={selectedTrade.date}
                        entryTime={selectedTrade.entryTime}
                        exitTime={selectedTrade.exitTime}
                        entryPrice={selectedTrade.entryPrice ?? undefined}
                        exitPrice={selectedTrade.exitPrice ?? undefined}
                        entryColor="#22c55e"
                        exitColor="#38bdf8"
                      />
                    )}
                  </div>

                  {/* Contract */}
                  {selectedTrade.contractSymbol && (
                    <div>
                      {contractState.loading ? (
                        <p className="text-sm text-slate-400">
                          Loading contract chart…
                        </p>
                      ) : contractState.error ? (
                        <p className="text-sm text-sky-300">
                          {contractState.error}
                        </p>
                      ) : (
                        <InteractiveCandleChart
                          title="Contract used"
                          symbol={normalizeSymbolForYahoo(
                            selectedTrade.contractSymbol,
                            "option"
                          )}
                          candles={contractState.candles}
                          selectedDate={selectedTrade.date}
                          entryTime={selectedTrade.entryTime}
                          exitTime={selectedTrade.exitTime}
                          entryPrice={selectedTrade.entryPrice ?? undefined}
                          exitPrice={selectedTrade.exitPrice ?? undefined}
                          entryColor="#22c55e"
                          exitColor="#38bdf8"
                        />
                      )}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
