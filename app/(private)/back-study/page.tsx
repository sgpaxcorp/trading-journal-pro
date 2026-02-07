// app/back-study/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

import type { JournalEntry } from "@/lib/journalLocal";
import { getAllJournalEntries } from "@/lib/journalSupabase";

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
  time: number; // ms since epoch (Yahoo, UTC)
  open: number;
  high: number;
  low: number;
  close: number;
};

type TimeframeId = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type ChartRangeId = "1D" | "5D" | "1W" | "1M" | "3M" | "6M" | "1Y";

const TIMEFRAMES: {
  id: TimeframeId;
  label: string;
  interval: string; // Yahoo interval
}[] = [
  { id: "1m", label: "1m", interval: "1m" },
  { id: "5m", label: "5m", interval: "5m" },
  { id: "15m", label: "15m", interval: "15m" },
  { id: "1h", label: "1h", interval: "60m" },
  // Yahoo no tiene 4h; usamos 60m y el usuario ajusta con zoom.
  { id: "4h", label: "4h", interval: "60m" },
  { id: "1d", label: "1D", interval: "1d" },
];

const CHART_RANGES: {
  id: ChartRangeId;
  label: string;
  yahooRange: string;
}[] = [
  { id: "1D", label: "1 Day", yahooRange: "1d" },
  { id: "5D", label: "5 Days", yahooRange: "5d" },
  { id: "1W", label: "1 Week", yahooRange: "7d" },
  { id: "1M", label: "1 Month", yahooRange: "1mo" },
  { id: "3M", label: "3 Months", yahooRange: "3mo" },
  { id: "6M", label: "6 Months", yahooRange: "6mo" },
  { id: "1Y", label: "1 Year", yahooRange: "1y" },
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

// Local timezone offset (minutes from UTC)
const LOCAL_TZ_OFFSET_MIN = new Date().getTimezoneOffset();

function shiftMsToLocal(ms: number): number {
  // Yahoo timestamps come as UTC. We shift them to local time (browser)
  // so that chart + markers all use the same clock.
  return ms - LOCAL_TZ_OFFSET_MIN * 60 * 1000;
}

/**
 * Parse "9:56 AM", "09:56", "09:56:30" → minutes of day (local time).
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

  return hour * 60 + minutes;
}

/**
 * Convert candle timestamp (Yahoo UTC) → minutes of day in local time.
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
    if (!parsed || typeof parsed !== "object") {
      return { entries: [], exits: [] };
    }

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
 * Normalize symbols for Yahoo Finance
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

function getYahooParams(tfId: TimeframeId, rangeId: ChartRangeId) {
  const tf = TIMEFRAMES.find((t) => t.id === tfId)!;
  const range = CHART_RANGES.find((r) => r.id === rangeId)!;
  return {
    interval: tf.interval,
    range: range.yahooRange,
  };
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
  entryLabel?: string;
  exitLabel?: string;
  zoomInLabel?: string;
  zoomOutLabel?: string;
  zoomResetLabel?: string;
  emptyLabel?: string;
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
  entryLabel = "Entry",
  exitLabel = "Exit",
  zoomInLabel = "Zoom in",
  zoomOutLabel = "Zoom out",
  zoomResetLabel = "Reset zoom",
  emptyLabel = "No chart data for this symbol/timeframe.",
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

    // Map candles to local time for the chart
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
      // Default zoom: show only the last ~60% of the loaded data
      const first = times[0];
      const last = times[times.length - 1];
      const span = last - first;
      const visibleSpan = span * 0.6; // “150% zoom” feel
      const from = Math.max(first, last - visibleSpan);
      timeScale.setVisibleRange({ from, to: last });
    } else {
      timeScale.fitContent();
    }

    // --- Markers (entry/exit) matching by local time ---
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
        const mins = minutesFromMsLocal(c.time);
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
        const mins = minutesFromMsLocal(c.time);
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
        text: `${entryLabel} ${entryPrice != null ? entryPrice.toFixed(2) : ""}`.trim(),
      });
    }

    if (exitIdx != null && exitIdx >= 0) {
      const c = candles[exitIdx];
      markers.push({
        time: Math.floor(shiftMsToLocal(c.time) / 1000),
        position: "aboveBar",
        color: exitColor,
        shape: "arrowDown",
        text: `${exitLabel} ${exitPrice != null ? exitPrice.toFixed(2) : ""}`.trim(),
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
    // Stronger zoom step
    ts.zoomIn();
    ts.zoomIn();
  };

  const handleZoomOut = () => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;
    ts.zoomOut();
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
              <span className="text-slate-300">{entryLabel}</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-4 rounded"
                style={{ backgroundColor: exitColor }}
              />
              <span className="text-slate-300">{exitLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={handleZoomIn}
              className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
              title={zoomInLabel}
            >
              +
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
              title={zoomOutLabel}
            >
              −
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
              title={zoomResetLabel}
            >
              ⟳
            </button>
          </div>
        </div>
      </div>

      {!candles.length ? (
        <p className="text-sm text-slate-400">
          {emptyLabel}
        </p>
      ) : (
        <div
          ref={containerRef}
          className="w-full h-80 rounded-xl border border-slate-800 bg-slate-950"
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
  const { activeAccountId, loading: accountsLoading } = useTradingAccounts();
  const router = useRouter();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const rangeLabels = useMemo<Record<ChartRangeId, string>>(
    () => ({
      "1D": L("1 Day", "1 Día"),
      "5D": L("5 Days", "5 Días"),
      "1W": L("1 Week", "1 Semana"),
      "1M": L("1 Month", "1 Mes"),
      "3M": L("3 Months", "3 Meses"),
      "6M": L("6 Months", "6 Meses"),
      "1Y": L("1 Year", "1 Año"),
    }),
    [lang]
  );

  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  // Load journal sessions from Supabase
  useEffect(() => {
    if (loading || !user || accountsLoading || !activeAccountId) return;

    let isMounted = true;

    const loadEntries = async () => {
      try {
        setEntriesLoading(true);
        setEntriesError(null);

        if (!user?.id) {
          if (isMounted) setEntries([]);
          return;
        }

        const all = await getAllJournalEntries(user.id, activeAccountId);

        if (isMounted) {
          setEntries(all ?? []);
        }
      } catch (err) {
        console.error("Error loading journal entries for back-study:", err);
        if (isMounted) {
          setEntriesError(L("Could not load your journal entries.", "No se pudieron cargar tus entradas del journal."));
        }
      } finally {
        if (isMounted) {
          setEntriesLoading(false);
        }
      }
    };

    void loadEntries();

    return () => {
      isMounted = false;
    };
  }, [loading, user, accountsLoading, activeAccountId]);

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
  const [chartRange, setChartRange] = useState<ChartRangeId>("1Y");

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

  /* -------- Yahoo fetch -------- */

  const fetchCandles = async (
    symbol: string,
    tfId: TimeframeId,
    rangeId: ChartRangeId,
    kind?: InstrumentType
  ): Promise<Candle[]> => {
    const { interval, range } = getYahooParams(tfId, rangeId);
    const yfSymbol = normalizeSymbolForYahoo(symbol, kind);

    const url = `/api/yahoo-chart?symbol=${encodeURIComponent(
      yfSymbol
    )}&interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(
      range
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
      const uc = await fetchCandles(
        underlyingSymbol,
        timeframe,
        chartRange,
        kind
      );
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

    // Contract (if applicable)
    if (contractSymbol) {
      try {
        const cc = await fetchCandles(
          contractSymbol,
          timeframe,
          chartRange,
          "option"
        );
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
            chartRange,
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

  // 🔗 Button to open AI Coach pre-configured for this trade
  const handleAskCoach = () => {
    if (!selectedTrade) return;
    const params = new URLSearchParams({
      symbol: selectedTrade.underlyingSymbol,
      date: selectedTrade.date,
      entryTime: selectedTrade.entryTime,
      exitTime: selectedTrade.exitTime,
      tf: timeframe,
      range: chartRange,
    });
    router.push(`/performance/ai-coaching?${params.toString()}`);
  };

  useEffect(() => {
    if (!selectedTrade) return;
    void loadReplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrade, timeframe, chartRange]);

  if (loading || !user || entriesLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">{L("Loading back-study…", "Cargando back-study…")}</p>
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
                {L("Back-Studying", "Back-Study")}
              </p>
              <h1 className="text-3xl md:text-4xl font-semibold mt-1">
                {L("Chart replays from your journal", "Replays de charts desde tu journal")}
              </h1>
              <p className="text-sm md:text-base text-slate-400 mt-2 max-w-xl">
                {L(
                  "Each entry in the Entries/Exits widgets becomes a trade. The chart marks the exact entry (green arrow) and exit (blue arrow) using the times and prices you saved in the daily journal.",
                  "Cada entrada en los widgets de Entradas/Salidas se convierte en un trade. El chart marca la entrada (flecha verde) y la salida (flecha azul) usando horas y precios guardados en tu journal."
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="self-start md:self-center px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              ← {L("Back to dashboard", "Volver al dashboard")}
            </button>
          </header>

          {entriesError && (
            <section className="rounded-2xl border border-rose-500/60 bg-rose-950/40 p-4 md:p-5">
              <p className="text-sm text-rose-200">{entriesError}</p>
              <p className="text-xs text-rose-300/80 mt-1">
                {L("Check your connection or try again later.", "Revisa tu conexión o intenta más tarde.")}
              </p>
            </section>
          )}

          {!entriesError && trades.length === 0 ? (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
              <p className="text-sm text-slate-200 mb-1">
                {L("No trades found for back-study.", "No se encontraron trades para back-study.")}
              </p>
              <p className="text-sm text-slate-400">
                {L(
                  "Make sure you have Entries and Exits saved in the journal (notes JSON) so they can be replayed here.",
                  "Asegúrate de tener Entradas y Salidas guardadas en el journal (notes JSON) para poder reproducirlas aquí."
                )}
              </p>
            </section>
          ) : (
            !entriesError && (
              <>
                {/* Controls */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5 shadow-[0_0_30px_rgba(15,23,42,0.8)]">
                  <form
                    onSubmit={handleLoad}
                    className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
                  >
                    {/* Session selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-400">{L("Session", "Sesión")}</label>
                      <select
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                        value={selectedDate}
                        onChange={(e) => {
                          const d = e.target.value;
                          setSelectedDate(d);
                          const firstTrade = trades.find(
                            (t) => t.date === d
                          );
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
                        {L("Trade (symbol)", "Trade (símbolo)")}
                      </label>
                      <select
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                        value={selectedTradeId}
                        onChange={(e) => setSelectedTradeId(e.target.value)}
                      >
                        {tradesForDate.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.symbol} ({t.kind}) · {t.entryTime} →{" "}
                            {t.exitTime}
                          </option>
                        ))}
                      </select>
                      {selectedTrade && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          {L("Underlying:", "Underlying:")}{" "}
                          <span className="font-mono text-slate-200">
                            {selectedTrade.underlyingSymbol}
                          </span>
                          {selectedTrade.contractSymbol &&
                            selectedTrade.contractSymbol !==
                              selectedTrade.underlyingSymbol && (
                              <>
                                {" · "}{L("Contract:", "Contrato:")}{" "}
                                <span className="font-mono text-slate-200">
                                  {selectedTrade.contractSymbol}
                                </span>
                              </>
                            )}
                        </p>
                      )}
                    </div>

                    {/* Timeframes + range + load */}
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-slate-400 uppercase tracking-[0.15em]">
                          {L("Timeframe", "Timeframe")}
                        </span>
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
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-slate-400 uppercase tracking-[0.15em]">
                          {L("History range", "Rango histórico")}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {CHART_RANGES.map((r) => {
                            const active = r.id === chartRange;
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setChartRange(r.id)}
                                className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                                  active
                                    ? "bg-sky-400 text-slate-950 border-sky-300"
                                    : "bg-slate-950 text-slate-200 border-slate-700 hover:border-sky-400 hover:text-sky-300"
                                }`}
                              >
                                {rangeLabels[r.id]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          type="submit"
                          className="w-full px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-sm font-semibold shadow-[0_0_20px_rgba(16,185,129,0.45)] hover:bg-emerald-400 transition"
                        >
                          {L("Load replay", "Cargar replay")}
                        </button>

                        <button
                          type="button"
                          onClick={handleAskCoach}
                          className="w-full px-4 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs md:text-sm font-semibold shadow-[0_0_16px_rgba(56,189,248,0.5)] hover:bg-sky-400 transition"
                          disabled={!selectedTrade}
                        >
                          {L("Ask AI Coach about this trade", "Preguntar al coach AI sobre este trade")}
                        </button>
                      </div>
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
                          {L("Loading underlying chart…", "Cargando chart del underlying…")}
                        </p>
                      ) : underlyingState.error ? (
                        <p className="text-sm text-sky-300">
                          {underlyingState.error}
                        </p>
                      ) : (
                        <InteractiveCandleChart
                          title={L("Underlying asset", "Activo subyacente")}
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
                          entryLabel={L("Entry", "Entrada")}
                          exitLabel={L("Exit", "Salida")}
                          zoomInLabel={L("Zoom in", "Acercar")}
                          zoomOutLabel={L("Zoom out", "Alejar")}
                          zoomResetLabel={L("Reset zoom", "Reiniciar zoom")}
                          emptyLabel={L("No chart data for this symbol/timeframe.", "No hay datos de chart para este símbolo/timeframe.")}
                        />
                      )}
                    </div>

                    {/* Contract */}
                    {selectedTrade.contractSymbol && (
                      <div>
                        {contractState.loading ? (
                          <p className="text-sm text-slate-400">
                            {L("Loading contract chart…", "Cargando chart del contrato…")}
                          </p>
                        ) : contractState.error ? (
                          <p className="text-sm text-sky-300">
                            {contractState.error}
                          </p>
                        ) : (
                          <InteractiveCandleChart
                            title={L("Contract used", "Contrato usado")}
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
                            entryLabel={L("Entry", "Entrada")}
                            exitLabel={L("Exit", "Salida")}
                            zoomInLabel={L("Zoom in", "Acercar")}
                            zoomOutLabel={L("Zoom out", "Alejar")}
                            zoomResetLabel={L("Reset zoom", "Reiniciar zoom")}
                            emptyLabel={L("No chart data for this symbol/timeframe.", "No hay datos de chart para este símbolo/timeframe.")}
                          />
                        )}
                      </div>
                    )}
                  </section>
                )}
              </>
            )
          )}
        </div>
      </div>
    </main>
  );
}
