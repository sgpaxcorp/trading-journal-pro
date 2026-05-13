// app/back-study/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

import type { JournalEntry } from "@/lib/journalLocal";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import { getJournalTradesForDates } from "@/lib/journalTradesSupabase";
import type { TradesPayload } from "@/lib/journalNotes";

import { type InstrumentType } from "@/lib/journalNotes";
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import OrderHistoryAuditPanel from "../audit/order-history/OrderHistoryAuditPanel";

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
  price: string | number;
  quantity: string | number;
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
  entryAvgPrice: number | null;
  exitAvgPrice: number | null;
  entryQty: number;
  exitQty: number;
  entries: EntryTradeRow[];
  exits: ExitTradeRow[];
  underlyingSymbol: string;
  contractSymbol?: string;
};

type ChartState = {
  loading: boolean;
  error: string | null;
  candles: Candle[];
};

type AuditTradeSequence = {
  index: number;
  entry_ts: string | null;
  exit_ts: string | null;
  entry_count: number;
  exit_count: number;
  entry_qty: number;
  exit_qty: number;
  stop_mod_count: number;
  time_to_first_stop_sec: number | null;
  oco_used: boolean;
  manual_market_exit: boolean;
  stop_market_filled: boolean;
  summary: string;
};

type AuditMetrics = {
  oco_used?: boolean;
  stop_present?: boolean;
  stop_mod_count?: number;
  cancel_count?: number;
  replace_count?: number;
  manual_market_exit?: boolean;
  stop_market_filled?: boolean;
  time_to_first_stop_sec?: number | null;
  evidence?: {
    stop_events?: Array<{ ts_utc?: string | null; stop_price?: number | null; oco_id?: string | null }>;
    cancel_events?: Array<{ ts_utc?: string | null; status?: string | null; replace_id?: string | null }>;
    fills?: Array<{ ts_utc?: string | null; side?: string | null; pos_effect?: string | null; order_type?: string | null }>;
  };
  insights?: string[];
  summary?: string | null;
  trades?: AuditTradeSequence[];
};

type AuditCompliance = {
  score: number | null;
  checklist: {
    total: number;
    completed: number;
    completion_pct: number | null;
    missing_items: string[];
  };
  rules: Array<{ label: string; status: "pass" | "fail" | "unknown"; reason: string }>;
  respected_plan: boolean | null;
  plan_present: boolean;
};

type ExecutionDiscipline = {
  score: number | null;
  checks: Array<{ label: string; status: "pass" | "fail" | "unknown"; reason: string }>;
  metrics: {
    stop_present: boolean | null;
    oco_used: boolean | null;
    stop_mod_count: number;
    cancel_count: number;
    replace_count: number;
    manual_market_exit: boolean | null;
    stop_market_filled: boolean | null;
    time_to_first_stop_sec: number | null;
  };
};

type AuditResponse = {
  date: string;
  symbol: string | null;
  instrument_key: string | null;
  events: any[];
  audit: AuditMetrics;
  process_review: AuditCompliance;
  execution_discipline: ExecutionDiscipline;
  plan_compliance?: AuditCompliance;
};

/* =========================
   Helpers
========================= */

function safeUpper(s: string | undefined | null): string {
  return (s || "").trim().toUpperCase();
}

type TimeMode = "local" | "et";

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const v: Record<string, string> = {};
  parts.forEach((p) => {
    if (p.type !== "literal") v[p.type] = p.value;
  });

  const utcTs = Date.UTC(
    Number(v.year),
    Number(v.month) - 1,
    Number(v.day),
    Number(v.hour),
    Number(v.minute),
    Number(v.second)
  );

  return (utcTs - date.getTime()) / 60000;
}

function shiftMsByMode(ms: number, mode: TimeMode): number {
  if (mode === "local") {
    const offset = new Date(ms).getTimezoneOffset();
    return ms - offset * 60 * 1000;
  }
  const offset = getTimeZoneOffsetMinutes(new Date(ms), "America/New_York");
  return ms + offset * 60 * 1000;
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

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function getSessionLabel(timeStr: string): "RTH" | "ETH" | null {
  const mins = parseTimeToMinutesFlexible(timeStr);
  if (mins == null) return null;
  const rthStart = 9 * 60 + 30;
  const rthEnd = 16 * 60;
  return mins >= rthStart && mins <= rthEnd ? "RTH" : "ETH";
}

function formatSecondsForReview(sec: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const min = Math.round((sec / 60) * 10) / 10;
  return `${min} min`;
}

function formatUtcDateLabel(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

/**
 * Convert candle timestamp (Yahoo UTC) → minutes of day in local time.
 */
function minutesFromMsWithMode(ms: number, mode: TimeMode): number {
  const d = new Date(shiftMsByMode(ms, mode));
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
      ? normalizeTradeRows((parsed as any).entries)
      : [];
    const exits = Array.isArray((parsed as any).exits)
      ? normalizeTradeRows((parsed as any).exits)
      : [];

    return { entries, exits };
  } catch {
    return { entries: [], exits: [] };
  }
}

function normalizeSide(raw: any): SideType {
  const s = String(raw ?? "").toLowerCase();
  if (s === "short") return "short";
  return "long";
}

function normalizeTradeRows(rows: any[]): EntryTradeRow[] {
  return rows.map((r) => ({
    id: r?.id ?? crypto.randomUUID(),
    symbol: String(r?.symbol ?? ""),
    kind: (r?.kind ?? "stock") as InstrumentType,
    side: normalizeSide(r?.side),
    price: r?.price ?? "",
    quantity: r?.quantity ?? "",
    time: String(r?.time ?? ""),
    dte: r?.dte ?? null,
    expiry: r?.expiry ?? null,
  }));
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

function parseGenericOptionUnderlying(raw: string) {
  const s = safeUpper(raw).replace(/\s+/g, "");
  const m = s.match(/^([A-Z]{1,6})\d{6}[CP]\d+/);
  if (!m) return null;
  return m[1];
}

function buildInstrumentKeyFromTrade(trade: TradeView): string | null {
  if (trade.kind !== "option") return null;

  const parsed = parseSPXOptionSymbol(trade.symbol);
  if (parsed) {
    const expiry = parsed.expiry.toISOString().slice(0, 10);
    const strike = Number.isInteger(parsed.strike) ? String(parsed.strike) : String(parsed.strike);
    return `${parsed.underlying.replace(/W$/, "")}|${expiry}|${parsed.right}|${strike}`;
  }

  return null;
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

const RANGE_DAYS: Record<ChartRangeId, number> = {
  "1D": 1,
  "5D": 5,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
};

function getPeriodWindow(anchorDate: string, rangeId: ChartRangeId) {
  if (!anchorDate) return null;
  const base = new Date(`${anchorDate}T00:00:00Z`);
  if (!Number.isFinite(base.getTime())) return null;
  const days = RANGE_DAYS[rangeId] ?? 30;
  const span = days * 86400000;
  const period1 = Math.floor((base.getTime() - span) / 1000);
  const period2 = Math.floor((base.getTime() + span) / 1000);
  return { period1, period2 };
}

/* =========================
   Interactive chart
========================= */

type InteractiveCandleChartProps = {
  title: string;
  symbol: string;
  candles: Candle[];
  selectedDate: string;
  entryPoints: Array<{ time: string; price?: number | null; label?: string }>;
  exitPoints: Array<{ time: string; price?: number | null; label?: string }>;
  timeMode: TimeMode;
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
  entryPoints,
  exitPoints,
  timeMode,
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
      time: Math.floor(shiftMsByMode(c.time, timeMode) / 1000),
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
    const filtered = candles
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => {
        const d = new Date(shiftMsByMode(c.time, timeMode));
        const isoDay = d.toISOString().slice(0, 10);
        return isoDay === selectedDate;
      });

    const findNearest = (targetMinutes: number | null) => {
      if (targetMinutes == null) return null;
      let bestDiff = Infinity;
      let bestIdx: number | null = null;
      filtered.forEach(({ c, idx }) => {
        const mins = minutesFromMsWithMode(c.time, timeMode);
        const diff = Math.abs(mins - targetMinutes);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = idx;
        }
      });
      return bestIdx;
    };

    const markers: any[] = [];

    entryPoints.forEach((pt, i) => {
      const mins = parseTimeToMinutesFlexible(pt.time || "");
      const idx = findNearest(mins);
      if (idx == null) return;
      const c = candles[idx];
      markers.push({
        time: Math.floor(shiftMsByMode(c.time, timeMode) / 1000),
        position: "belowBar",
        color: entryColor,
        shape: "arrowUp",
        text: [
          pt.label || entryLabel,
          pt.price != null ? `@ ${pt.price.toFixed(2)}` : null,
          pt.time || null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    });

    exitPoints.forEach((pt, i) => {
      const mins = parseTimeToMinutesFlexible(pt.time || "");
      const idx = findNearest(mins);
      if (idx == null) return;
      const c = candles[idx];
      markers.push({
        time: Math.floor(shiftMsByMode(c.time, timeMode) / 1000),
        position: "aboveBar",
        color: exitColor,
        shape: "arrowDown",
        text: [
          pt.label || exitLabel,
          pt.price != null ? `@ ${pt.price.toFixed(2)}` : null,
          pt.time || null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    });

    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers(markers);
    }
  }, [
    candles,
    selectedDate,
    entryPoints,
    exitPoints,
    timeMode,
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

function ReviewMetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald" | "sky" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
      : tone === "sky"
      ? "border-sky-400/20 bg-sky-500/10 text-sky-100"
      : tone === "rose"
      ? "border-rose-400/20 bg-rose-500/10 text-rose-100"
      : "border-slate-800 bg-slate-950/70 text-slate-100";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

/* =========================
   Main Back-Study page
========================= */

function BackStudyPageInner() {
  const { user, loading } = useAuth();
  const { activeAccountId, loading: accountsLoading } = useTradingAccounts();
  const { plan, loading: planLoading } = useUserPlan();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const canAccessAudit = plan === "advanced";

  const activeTab =
    searchParams.get("tab") === "audit" ? "audit" : "backtest";
  const isAuditTab = activeTab === "audit";

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
  const [journalTradesMap, setJournalTradesMap] = useState<Record<string, TradesPayload>>({});

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  // Load journal sessions from Supabase
  useEffect(() => {
    if (isAuditTab) return;
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

        const dates = (all ?? []).map((e) => String((e as any)?.date || "").slice(0, 10)).filter(Boolean);
        if (dates.length) {
          try {
            const tradesMap = await getJournalTradesForDates(user.id, dates, activeAccountId);
            if (isMounted) setJournalTradesMap(tradesMap ?? {});
          } catch (err) {
            console.warn("Error loading journal_trades for back-study:", err);
            if (isMounted) setJournalTradesMap({});
          }
        } else {
          if (isMounted) setJournalTradesMap({});
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
  }, [loading, user, accountsLoading, activeAccountId, isAuditTab]);

  const sessions: SessionWithTrades[] = useMemo(() => {
    return entries.map((s) => {
      const dateKey = String((s as any)?.date || "").slice(0, 10);
      const fromDb = journalTradesMap[dateKey] ?? {};
      const fromNotes = parseNotesTrades(s.notes);

      const entRaw = (fromDb.entries && fromDb.entries.length ? fromDb.entries : fromNotes.entries) || [];
      const exRaw = (fromDb.exits && fromDb.exits.length ? fromDb.exits : fromNotes.exits) || [];
      const ent = normalizeTradeRows(entRaw);
      const ex = normalizeTradeRows(exRaw);

      return {
        ...s,
        entries: ent,
        exits: ex,
      };
    });
  }, [entries, journalTradesMap]);

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

        const sortByTime = (a: EntryTradeRow, b: EntryTradeRow) => {
          const ta = parseTimeToMinutesFlexible(a.time || "") ?? 0;
          const tb = parseTimeToMinutesFlexible(b.time || "") ?? 0;
          return ta - tb;
        };

        const entSorted = [...entList].sort(sortByTime);
        const exSorted = [...exList].sort(sortByTime);

        const entryRow = entSorted[0] || exSorted[0];
        const exitRow =
          exSorted[exSorted.length - 1] ||
          entSorted[entSorted.length - 1] ||
          entryRow;

        const kind =
          ((entryRow?.kind ||
            exList[0]?.kind ||
            "stock") as InstrumentType) || "stock";

        const entryTime = entryRow?.time || "09:30";
        const exitTime = exitRow?.time || entryTime;

        const entryPrice = toNumber(entryRow?.price);
        const exitPrice = toNumber(exitRow?.price);

        const entryPrices = entSorted
          .map((t) => toNumber(t.price))
          .filter((v): v is number => Number.isFinite(v));
        const exitPrices = exSorted
          .map((t) => toNumber(t.price))
          .filter((v): v is number => Number.isFinite(v));

        const entryAvgPrice = entryPrices.length
          ? entryPrices.reduce((a, b) => a + b, 0) / entryPrices.length
          : entryPrice;
        const exitAvgPrice = exitPrices.length
          ? exitPrices.reduce((a, b) => a + b, 0) / exitPrices.length
          : exitPrice;

        const entryQty = entSorted
          .map((t) => toNumber(t.quantity))
          .filter((v): v is number => Number.isFinite(v))
          .reduce((a, b) => a + b, 0);
        const exitQty = exSorted
          .map((t) => toNumber(t.quantity))
          .filter((v): v is number => Number.isFinite(v))
          .reduce((a, b) => a + b, 0);

        let underlyingSymbol = sym;
        let contractSymbol: string | undefined;

        if ((kind as string) === "option") {
          const parsed = parseSPXOptionSymbol(sym);
          const generic = parseGenericOptionUnderlying(sym);
          if (parsed) {
            underlyingSymbol = parsed.underlying;
            contractSymbol = sym;
          } else if (generic) {
            underlyingSymbol = generic;
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
          entryAvgPrice: Number.isFinite(entryAvgPrice) ? entryAvgPrice : null,
          exitAvgPrice: Number.isFinite(exitAvgPrice) ? exitAvgPrice : null,
          entryQty: Number.isFinite(entryQty) ? entryQty : 0,
          exitQty: Number.isFinite(exitQty) ? exitQty : 0,
          entries: entSorted,
          exits: exSorted,
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
  const [timeMode, setTimeMode] = useState<TimeMode>("et");
  const candleCacheRef = useRef<Map<string, Candle[]>>(new Map());

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

  const entryPoints = useMemo(() => {
    if (!selectedTrade) return [];
    return (selectedTrade.entries ?? []).map((e, i) => ({
      time: e.time || "",
      price: toNumber(e.price),
      label: `${L("Entry", "Entrada")} ${i + 1}`,
    }));
  }, [selectedTrade, lang]);

  const exitPoints = useMemo(() => {
    if (!selectedTrade) return [];
    return (selectedTrade.exits ?? []).map((e, i) => ({
      time: e.time || "",
      price: toNumber(e.price),
      label: `${L("Exit", "Salida")} ${i + 1}`,
    }));
  }, [selectedTrade, lang]);

  const entrySessionLabel = selectedTrade ? getSessionLabel(selectedTrade.entryTime) : null;

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
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);

  /* -------- Yahoo fetch -------- */

  const fetchCandles = async (
    symbol: string,
    tfId: TimeframeId,
    rangeId: ChartRangeId,
    kind?: InstrumentType,
    anchorDate?: string
  ): Promise<Candle[]> => {
    const { interval, range } = getYahooParams(tfId, rangeId);
    const yfSymbol = normalizeSymbolForYahoo(symbol, kind);
    const window = anchorDate ? getPeriodWindow(anchorDate, rangeId) : null;

    const cacheKey = [
      yfSymbol,
      interval,
      window?.period1 ?? "",
      window?.period2 ?? "",
      range,
    ].join("|");

    const cached = candleCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const url =
      window && window.period1 && window.period2
        ? `/api/yahoo-chart?symbol=${encodeURIComponent(
            yfSymbol
          )}&interval=${encodeURIComponent(interval)}&period1=${window.period1}&period2=${window.period2}`
        : `/api/yahoo-chart?symbol=${encodeURIComponent(
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
      const candles = Array.isArray((data as any).candles) ? (data as any).candles : [];
      candleCacheRef.current.set(cacheKey, candles);
      return candles;
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
        kind,
        selectedTrade.date
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
          "option",
          selectedTrade.date
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
            kind,
            selectedTrade.date
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

  const loadAuditForTrade = async (trade: TradeView) => {
    if (!canAccessAudit) return;
    if (!user?.id || !activeAccountId) return;

    setAuditLoading(true);
    setAuditError(null);

    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setAuditError(L("Session expired. Sign in again.", "La sesión expiró. Inicia sesión de nuevo."));
        setAuditResult(null);
        return;
      }

      const params = new URLSearchParams();
      params.set("date", trade.date);
      params.set("accountId", activeAccountId);

      const instrumentKey = buildInstrumentKeyFromTrade(trade);
      if (instrumentKey) {
        params.set("instrument_key", instrumentKey);
      } else {
        params.set("symbol", trade.symbol);
      }

      const res = await fetch(`/api/broker-import/order-history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuditError(
          data?.error ??
            L("Could not load execution audit.", "No se pudo cargar la auditoría de ejecución.")
        );
        setAuditResult(null);
        return;
      }

      setAuditResult(data as AuditResponse);
    } catch (err: any) {
      setAuditError(
        err?.message ??
          L("Could not load execution audit.", "No se pudo cargar la auditoría de ejecución.")
      );
      setAuditResult(null);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleLoad = async (e: FormEvent) => {
    e.preventDefault();
    await loadReplay();
    if (canAccessAudit && selectedTrade) {
      await loadAuditForTrade(selectedTrade);
    }
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
    if (isAuditTab) return;
    if (!selectedTrade) return;
    void loadReplay();
    if (canAccessAudit) {
      void loadAuditForTrade(selectedTrade);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrade, timeframe, chartRange, canAccessAudit, isAuditTab]);

  useEffect(() => {
    if (selectedTrade && canAccessAudit) return;
    setAuditResult(null);
    setAuditError(null);
    setAuditLoading(false);
  }, [selectedTrade, canAccessAudit]);

  const auditMetrics = auditResult?.audit ?? null;
  const auditProcessReview = auditResult?.process_review ?? auditResult?.plan_compliance ?? null;
  const auditExecutionDiscipline = auditResult?.execution_discipline ?? null;
  const auditTrades = auditMetrics?.trades ?? [];
  const auditInsights = auditMetrics?.insights ?? [];
  const auditEvidence = auditMetrics?.evidence ?? null;
  const selectedInstrumentKey = selectedTrade ? buildInstrumentKeyFromTrade(selectedTrade) : null;

  if (loading || planLoading || !user || (!isAuditTab && entriesLoading)) {
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
                {isAuditTab
                  ? L("Order history audit", "Auditoría de órdenes")
                  : L("Unified trade review", "Revisión unificada del trade")}
              </h1>
              <p className="text-sm md:text-base text-slate-400 mt-2 max-w-xl">
                {isAuditTab
                  ? L(
                      "Analyze your imported order history with deterministic checks (no AI).",
                      "Analiza tu historial de órdenes importado con reglas determinísticas (sin AI)."
                    )
                  : canAccessAudit
                  ? L(
                      "Back-Study now works as a trade review workspace: chart replay, execution truth from audit, process compliance, and direct handoff to AI Coach.",
                      "Back-Study ahora funciona como un workspace de revisión del trade: replay visual, verdad de ejecución desde audit, cumplimiento del proceso y handoff directo al AI Coach."
                    )
                  : L(
                      "Use Trade review to replay the chart, review entries and exits, and document what happened in the trade.",
                      "Usa Trade review para repetir el chart, revisar entradas y salidas, y documentar qué pasó en el trade."
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/back-study?tab=backtest")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition border ${
                !isAuditTab
                  ? "bg-emerald-500 text-slate-950 border-emerald-400"
                  : "border-slate-700 text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
              }`}
              aria-pressed={!isAuditTab}
            >
              {L("Trade review", "Trade review")}
            </button>
            {canAccessAudit ? (
              <button
                type="button"
                onClick={() => router.push("/back-study?tab=audit")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition border ${
                  isAuditTab
                    ? "bg-emerald-500 text-slate-950 border-emerald-400"
                    : "border-slate-700 text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
                }`}
                aria-pressed={isAuditTab}
              >
                {L("Audit workbench", "Audit workbench")}
              </button>
            ) : (
              <Link
                href="/plans-comparison"
                className="rounded-full px-4 py-2 text-sm font-semibold transition border border-slate-700 text-slate-400 hover:border-emerald-400 hover:text-emerald-300"
              >
                {L("Audit workbench · Advanced", "Audit workbench · Advanced")}
              </Link>
            )}
          </div>

          {isAuditTab ? (
            canAccessAudit ? (
              <OrderHistoryAuditPanel
                wrapperClassName="w-full"
                innerClassName="max-w-6xl mx-auto space-y-6"
              />
            ) : (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                <p className="text-emerald-300 text-[11px] uppercase tracking-[0.3em]">
                  {L("Advanced feature", "Función Advanced")}
                </p>
                <h2 className="text-2xl font-semibold mt-2">
                  {L("Audit workbench is included in Advanced", "Audit workbench está incluido en Advanced")}
                </h2>
                <p className="text-sm text-slate-400 mt-2 max-w-2xl">
                  {L(
                    "Core keeps Trade review. Advanced unlocks deterministic order-history audit, execution sequencing, and deeper process validation.",
                    "Core mantiene Trade review. Advanced desbloquea la auditoría determinística de órdenes, la secuencia de ejecución y una validación más profunda del proceso."
                  )}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href="/billing"
                    className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
                  >
                    {L("Upgrade to Advanced", "Actualizar a Advanced")}
                  </Link>
                  <Link
                    href="/plans-comparison"
                    className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-emerald-400 transition"
                  >
                    {L("Compare plans", "Comparar planes")}
                  </Link>
                </div>
              </section>
            )
          ) : (
            <>
              {entriesError && (
                <section className="rounded-2xl border border-rose-500/60 bg-rose-950/40 p-4 md:p-5">
                  <p className="text-sm text-rose-200">{entriesError}</p>
                  <p className="text-xs text-rose-300/80 mt-1">
                    {L("Check your connection or try again later.", "Revisa tu conexión o intenta más tarde.")}
                  </p>
                </section>
              )}

              {!entriesError && trades.length === 0 && (
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
              )}

              {!entriesError && trades.length > 0 && (
                <div className="space-y-6">
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
                        <div className="mt-1 space-y-1 text-[11px] text-slate-400">
                          <p>
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
                          <p>
                            {L("Entries:", "Entradas:")}{" "}
                            <span className="text-slate-200">{selectedTrade.entries.length}</span>
                            {" · "}
                            {L("Exits:", "Salidas:")}{" "}
                            <span className="text-slate-200">{selectedTrade.exits.length}</span>
                            {" · "}
                            {L("Session:", "Sesión:")}{" "}
                            <span className="text-slate-200">
                              {entrySessionLabel ?? "—"} {timeMode === "et" ? "(ET)" : "(Local)"}
                            </span>
                          </p>
                          <p>
                            {L("Saved entry avg:", "Promedio de entrada guardado:")}{" "}
                            <span className="text-emerald-200">
                              {selectedTrade.entryAvgPrice != null
                                ? selectedTrade.entryAvgPrice.toFixed(2)
                                : "—"}
                            </span>
                            {" · "}
                            {L("Saved exit avg:", "Promedio de salida guardado:")}{" "}
                            <span className="text-sky-200">
                              {selectedTrade.exitAvgPrice != null
                                ? selectedTrade.exitAvgPrice.toFixed(2)
                                : "—"}
                            </span>
                            {" · "}
                            {L("Qty:", "Qty:")}{" "}
                            <span className="text-slate-200">
                              {selectedTrade.entryQty || selectedTrade.exitQty || 0}
                            </span>
                          </p>
                        </div>
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

                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-slate-400 uppercase tracking-[0.15em]">
                          {L("Time mode", "Modo horario")}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {[
                            { id: "et", label: L("Market time (ET)", "Hora mercado (ET)") },
                            { id: "local", label: L("My local time", "Mi hora local") },
                          ].map((opt) => {
                            const active = timeMode === (opt.id as TimeMode);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setTimeMode(opt.id as TimeMode)}
                                className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                                  active
                                    ? "bg-violet-400 text-slate-950 border-violet-300"
                                    : "bg-slate-950 text-slate-200 border-slate-700 hover:border-violet-400 hover:text-violet-300"
                                }`}
                              >
                                {opt.label}
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

                  {selectedTrade && (
                    <section className="grid gap-4 xl:grid-cols-4">
                      <ReviewMetricCard
                        label={L("Trade identity", "Identidad del trade")}
                        value={`${selectedTrade.symbol} · ${selectedTrade.entryTime} → ${selectedTrade.exitTime}`}
                        tone="default"
                      />
                      <ReviewMetricCard
                        label={L("Replay scope", "Scope del replay")}
                        value={`${timeframe} · ${rangeLabels[chartRange]} · ${timeMode === "et" ? "ET" : L("Local", "Local")}`}
                        tone="sky"
                      />
                      {canAccessAudit ? (
                        <>
                          <ReviewMetricCard
                            label={L("Execution audit", "Auditoría de ejecución")}
                            value={
                              auditLoading
                                ? L("Loading…", "Cargando…")
                                : auditError
                                ? L("Audit error", "Error de auditoría")
                                : auditResult?.events?.length
                                ? `${auditResult.events.length} ${L("events", "eventos")}`
                                : L("No broker events", "Sin eventos del broker")
                            }
                            tone={auditError ? "rose" : "emerald"}
                          />
                          <ReviewMetricCard
                            label={L("Process review", "Revisión del proceso")}
                            value={
                              auditProcessReview?.score != null
                                ? `${auditProcessReview.score}%`
                                : L("Pending", "Pendiente")
                            }
                            tone={
                              auditProcessReview?.score != null && auditProcessReview.score < 70
                                ? "rose"
                                : "default"
                            }
                          />
                        </>
                      ) : null}
                    </section>
                  )}

                  {/* Charts */}
                  {selectedTrade && (
                    <section
                      className={`grid gap-4 ${
                        canAccessAudit ? "xl:grid-cols-[minmax(0,1.35fr),minmax(320px,0.65fr)]" : "grid-cols-1"
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400">
                                {L("Trade review workspace", "Workspace de revisión")}
                              </p>
                              <h2 className="mt-2 text-xl font-semibold text-slate-100">
                                {selectedTrade.symbol} · {selectedTrade.date}
                              </h2>
                              <p className="mt-2 text-sm text-slate-400">
                                {L(
                                  "Read the chart as context, then confirm the execution truth in the audit panel on the right.",
                                  "Lee el chart como contexto y luego confirma la verdad de ejecución en el panel de auditoría a la derecha."
                                )}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-slate-300">
                              <p>
                                {L("Underlying", "Underlying")}:{" "}
                                <span className="font-mono text-slate-100">{selectedTrade.underlyingSymbol}</span>
                              </p>
                              {selectedTrade.contractSymbol ? (
                                <p className="mt-1">
                                  {L("Contract", "Contrato")}:{" "}
                                  <span className="font-mono text-slate-100">{selectedTrade.contractSymbol}</span>
                                </p>
                              ) : null}
                              <p className="mt-1">
                                {L("Trade rows", "Rows del trade")}:{" "}
                                <span className="text-slate-100">{selectedTrade.entries.length + selectedTrade.exits.length}</span>
                              </p>
                              {canAccessAudit ? (
                                <p className="mt-1">
                                  {L("Audit filter", "Filtro de audit")}:{" "}
                                  <span className="font-mono text-slate-100">
                                    {selectedInstrumentKey || selectedTrade.symbol}
                                  </span>
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div>
                          {underlyingState.loading ? (
                            <p className="text-sm text-slate-400">
                              {L("Loading underlying chart…", "Cargando chart del underlying…")}
                            </p>
                          ) : underlyingState.error ? (
                            <p className="text-sm text-sky-300">{underlyingState.error}</p>
                          ) : (
                            <InteractiveCandleChart
                              title={L("Underlying asset", "Activo subyacente")}
                              symbol={normalizeSymbolForYahoo(
                                selectedTrade.underlyingSymbol,
                                selectedTrade.kind
                              )}
                              candles={underlyingState.candles}
                              selectedDate={selectedTrade.date}
                              entryPoints={entryPoints}
                              exitPoints={exitPoints}
                              timeMode={timeMode}
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

                        {selectedTrade.contractSymbol && (
                          <div>
                            {contractState.loading ? (
                              <p className="text-sm text-slate-400">
                                {L("Loading contract chart…", "Cargando chart del contrato…")}
                              </p>
                            ) : contractState.candles.length ? (
                              <div className="space-y-2">
                                {contractState.error ? (
                                  <p className="text-xs text-sky-300">
                                    {contractState.error}{" "}
                                    {L(
                                      "Treat this panel as a proxy and not as the exact instrument truth.",
                                      "Trata este panel como proxy y no como la verdad exacta del instrumento."
                                    )}
                                  </p>
                                ) : null}
                                <InteractiveCandleChart
                                  title={L("Contract used", "Contrato usado")}
                                  symbol={normalizeSymbolForYahoo(
                                    selectedTrade.contractSymbol,
                                    "option"
                                  )}
                                  candles={contractState.candles}
                                  selectedDate={selectedTrade.date}
                                  entryPoints={entryPoints}
                                  exitPoints={exitPoints}
                                  timeMode={timeMode}
                                  entryColor="#22c55e"
                                  exitColor="#38bdf8"
                                  entryLabel={L("Entry", "Entrada")}
                                  exitLabel={L("Exit", "Salida")}
                                  zoomInLabel={L("Zoom in", "Acercar")}
                                  zoomOutLabel={L("Zoom out", "Alejar")}
                                  zoomResetLabel={L("Reset zoom", "Reiniciar zoom")}
                                  emptyLabel={L("No chart data for this symbol/timeframe.", "No hay datos de chart para este símbolo/timeframe.")}
                                />
                              </div>
                            ) : contractState.error ? (
                              <div className="space-y-2">
                                <p className="text-sm text-sky-300">{contractState.error}</p>
                                <p className="text-xs text-slate-500">
                                  {L(
                                    "If the contract chart is missing, treat this panel as a proxy and not as the exact instrument truth.",
                                    "Si falta el chart del contrato, trata este panel como proxy y no como la verdad exacta del instrumento."
                                  )}
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400">
                                {L("No contract chart data available.", "No hay datos del chart del contrato.")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {canAccessAudit ? (
                        <aside className="space-y-4">
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.2em] text-sky-400">
                                  {L("Execution truth", "Verdad de ejecución")}
                                </p>
                                <h3 className="mt-2 text-lg font-semibold text-slate-100">
                                  {L("Selected trade audit", "Auditoría del trade seleccionado")}
                                </h3>
                              </div>
                              <button
                                type="button"
                                onClick={() => router.push("/back-study?tab=audit")}
                                className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-200"
                              >
                                {L("Open full audit", "Abrir audit completo")}
                              </button>
                            </div>

                            {auditLoading ? (
                              <p className="mt-4 text-sm text-slate-400">
                                {L("Loading execution audit…", "Cargando auditoría de ejecución…")}
                              </p>
                            ) : auditError ? (
                              <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-3 text-sm text-rose-200">
                                {auditError}
                              </div>
                            ) : (
                              <>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                  <ReviewMetricCard
                                    label={L("OCO used", "OCO usado")}
                                    value={auditMetrics ? (auditMetrics.oco_used ? "Yes" : "No") : "—"}
                                    tone="default"
                                  />
                                  <ReviewMetricCard
                                    label={L("Stop present", "Stop presente")}
                                    value={auditMetrics ? (auditMetrics.stop_present ? "Yes" : "No") : "—"}
                                    tone="default"
                                  />
                                  <ReviewMetricCard
                                    label={L("Time to first stop", "Tiempo al primer stop")}
                                    value={formatSecondsForReview(auditMetrics?.time_to_first_stop_sec ?? null)}
                                    tone="default"
                                  />
                                  <ReviewMetricCard
                                    label={L("Manual market exit", "Salida manual")}
                                    value={auditMetrics ? (auditMetrics.manual_market_exit ? "Yes" : "No") : "—"}
                                    tone={auditMetrics?.manual_market_exit ? "rose" : "default"}
                                  />
                                </div>

                                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                    {L("Execution summary", "Resumen de ejecución")}
                                  </p>
                                  <p className="mt-2 text-sm text-slate-200">
                                    {auditMetrics?.summary ||
                                      L("No deterministic summary available yet.", "Aún no hay resumen determinístico.")}
                                  </p>
                                </div>

                                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                    {L("Execution discipline", "Disciplina de ejecución")}
                                  </p>
                                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <ReviewMetricCard
                                      label={L("Execution score", "Score de ejecución")}
                                      value={
                                        auditExecutionDiscipline?.score != null
                                          ? `${auditExecutionDiscipline.score}%`
                                          : "—"
                                      }
                                      tone={
                                        auditExecutionDiscipline?.score != null &&
                                        auditExecutionDiscipline.score < 70
                                          ? "rose"
                                          : "emerald"
                                      }
                                    />
                                    <ReviewMetricCard
                                      label={L("Stop / OCO discipline", "Disciplina de stop / OCO")}
                                      value={
                                        auditExecutionDiscipline
                                          ? `${auditExecutionDiscipline.metrics.stop_present ? "STOP" : "NO STOP"} · ${
                                              auditExecutionDiscipline.metrics.oco_used ? "OCO" : "NO OCO"
                                            }`
                                          : "—"
                                      }
                                      tone="default"
                                    />
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-violet-400">
                              {L("Coach handoff", "Handoff al coach")}
                            </p>
                            <p className="mt-3 text-sm text-slate-300">
                              {L(
                                "When you ask AI Coach from here, it already receives the selected symbol, date, trade window, timeframe, and chart range as context.",
                                "Cuando preguntas al AI Coach desde aquí, ya recibe como contexto el símbolo, la fecha, la ventana del trade, el timeframe y el rango del chart."
                              )}
                            </p>
                          </div>
                        </aside>
                      ) : null}
                    </section>
                  )}

                  {selectedTrade && canAccessAudit && (
                    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr),minmax(0,0.7fr)]">
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400">
                              {L("Order timeline", "Timeline de órdenes")}
                            </p>
                            <h3 className="mt-2 text-lg font-semibold text-slate-100">
                              {L("Trade sequence from audit", "Secuencia del trade desde audit")}
                            </h3>
                          </div>
                          <span className="text-xs text-slate-500">
                            {auditResult?.events?.length
                              ? `${auditResult.events.length} ${L("broker events", "eventos del broker")}`
                              : L("No broker events", "Sin eventos del broker")}
                          </span>
                        </div>

                        {auditLoading ? (
                          <p className="mt-4 text-sm text-slate-400">
                            {L("Building execution sequence…", "Construyendo secuencia de ejecución…")}
                          </p>
                        ) : auditTrades.length ? (
                          <div className="mt-4 space-y-3">
                            {auditTrades.map((tradeSeq) => (
                              <div
                                key={tradeSeq.index}
                                className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-sm font-semibold text-slate-100">
                                    {L("Trade", "Trade")} {tradeSeq.index}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {formatUtcDateLabel(tradeSeq.entry_ts)} → {formatUtcDateLabel(tradeSeq.exit_ts)}
                                  </p>
                                </div>
                                <div className="mt-3 grid gap-2 md:grid-cols-3 text-xs text-slate-200">
                                  <div>{L("Entries", "Entradas")}: {tradeSeq.entry_count} ({tradeSeq.entry_qty})</div>
                                  <div>{L("Exits", "Salidas")}: {tradeSeq.exit_count} ({tradeSeq.exit_qty})</div>
                                  <div>{L("Stop mods", "Stops mod.")}: {tradeSeq.stop_mod_count}</div>
                                  <div>{L("Time to stop", "Tiempo al stop")}: {formatSecondsForReview(tradeSeq.time_to_first_stop_sec ?? null)}</div>
                                  <div>{L("OCO", "OCO")}: {tradeSeq.oco_used ? "Yes" : "No"}</div>
                                  <div>{L("Manual MKT exit", "Salida MKT manual")}: {tradeSeq.manual_market_exit ? "Yes" : "No"}</div>
                                </div>
                                <p className="mt-3 text-xs text-slate-400">{tradeSeq.summary}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-slate-400">
                            {L(
                              "No trade sequence was detected for the selected replay. This usually means there is no imported order history for that exact trade yet.",
                              "No se detectó una secuencia de trade para el replay seleccionado. Normalmente significa que todavía no hay order history importado para ese trade exacto."
                            )}
                          </p>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-sky-400">
                            {L("Deterministic insights", "Insights determinísticos")}
                          </p>
                          {auditInsights.length ? (
                            <ul className="mt-4 space-y-2 text-sm text-slate-200">
                              {auditInsights.map((item, idx) => (
                                <li
                                  key={`${item}-${idx}`}
                                  className="rounded-xl border border-slate-800/70 bg-slate-950/60 px-3 py-2"
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-4 text-sm text-slate-400">
                              {L("No deterministic insights available yet.", "Aún no hay insights determinísticos.")}
                            </p>
                          )}
                        </div>

                        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-400">
                            {L("Process review", "Revisión del proceso")}
                          </p>
                          {auditProcessReview ? (
                            <div className="mt-4 space-y-3 text-sm">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <ReviewMetricCard
                                  label={L("Process score", "Score del proceso")}
                                  value={
                                    auditProcessReview.score != null ? `${auditProcessReview.score}%` : "—"
                                  }
                                  tone={
                                    auditProcessReview.score != null && auditProcessReview.score < 70
                                      ? "rose"
                                      : "emerald"
                                  }
                                />
                                <ReviewMetricCard
                                  label={L("Checklist completion", "Checklist completado")}
                                  value={`${auditProcessReview.checklist.completed}/${auditProcessReview.checklist.total}`}
                                  tone="default"
                                />
                              </div>

                              {auditProcessReview.checklist.missing_items?.length ? (
                                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                  <p className="font-semibold text-slate-100">
                                    {L("Missing checklist items", "Checklist pendiente")}
                                  </p>
                                  <ul className="mt-2 space-y-1 text-slate-300">
                                    {auditProcessReview.checklist.missing_items.map((item, idx) => (
                                      <li key={`${item}-${idx}`}>• {item}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}

                              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <p className="font-semibold text-slate-100">
                                  {L("Non-negotiable rules", "Reglas no negociables")}
                                </p>
                                {auditProcessReview.rules?.length ? (
                                  <ul className="mt-2 space-y-2">
                                    {auditProcessReview.rules.map((rule, idx) => (
                                      <li key={`${rule.label}-${idx}`}>
                                        <p
                                          className={
                                            rule.status === "pass"
                                              ? "text-emerald-300"
                                              : rule.status === "fail"
                                              ? "text-rose-300"
                                              : "text-slate-300"
                                          }
                                        >
                                          {rule.status.toUpperCase()} · {rule.label}
                                        </p>
                                        <p className="text-xs text-slate-500">{rule.reason}</p>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-2 text-slate-400">
                                    {L("No active rules found in Growth Plan.", "No hay reglas activas en el Growth Plan.")}
                                  </p>
                                )}
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <p className="font-semibold text-slate-100">
                                  {L("Execution discipline checks", "Checks de disciplina de ejecución")}
                                </p>
                                {auditExecutionDiscipline?.checks?.length ? (
                                  <ul className="mt-2 space-y-2">
                                    {auditExecutionDiscipline.checks.map((check, idx) => (
                                      <li key={`${check.label}-${idx}`}>
                                        <p
                                          className={
                                            check.status === "pass"
                                              ? "text-emerald-300"
                                              : check.status === "fail"
                                              ? "text-rose-300"
                                              : "text-slate-300"
                                          }
                                        >
                                          {check.status.toUpperCase()} · {check.label}
                                        </p>
                                        <p className="text-xs text-slate-500">{check.reason}</p>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-2 text-slate-400">
                                    {L("No execution-discipline checks available yet.", "Aún no hay checks de disciplina de ejecución.")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="mt-4 text-sm text-slate-400">
                              {L("Process review will appear after audit data loads.", "La revisión del proceso aparecerá cuando cargue la auditoría.")}
                            </p>
                          )}
                        </div>
                      </div>
                    </section>
                  )}

                  {selectedTrade && auditEvidence ? (
                    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                        {L("Raw execution evidence", "Evidencia cruda de ejecución")}
                      </p>
                      <div className="mt-4 grid gap-4 lg:grid-cols-3">
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            {L("Stop events", "Eventos de stop")}
                          </p>
                          <div className="mt-3 space-y-2 text-xs text-slate-200 max-h-64 overflow-y-auto">
                            {auditEvidence.stop_events?.length ? (
                              auditEvidence.stop_events.map((s, idx) => (
                                <div key={`stop-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/80 px-2 py-2">
                                  <div>{formatUtcDateLabel(s.ts_utc ?? null)}</div>
                                  <div>{L("Stop", "Stop")}: {s.stop_price ?? "—"}</div>
                                  <div>{L("OCO", "OCO")}: {s.oco_id ?? "—"}</div>
                                </div>
                              ))
                            ) : (
                              <div className="text-slate-500">{L("None", "Ninguno")}</div>
                            )}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            {L("Cancel events", "Cancelaciones")}
                          </p>
                          <div className="mt-3 space-y-2 text-xs text-slate-200 max-h-64 overflow-y-auto">
                            {auditEvidence.cancel_events?.length ? (
                              auditEvidence.cancel_events.map((c, idx) => (
                                <div key={`cancel-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/80 px-2 py-2">
                                  <div>{formatUtcDateLabel(c.ts_utc ?? null)}</div>
                                  <div>{L("Status", "Estado")}: {c.status ?? "—"}</div>
                                  <div>{L("Replace", "Reemplazo")}: {c.replace_id ?? "—"}</div>
                                </div>
                              ))
                            ) : (
                              <div className="text-slate-500">{L("None", "Ninguno")}</div>
                            )}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            {L("Fill events", "Ejecuciones")}
                          </p>
                          <div className="mt-3 space-y-2 text-xs text-slate-200 max-h-64 overflow-y-auto">
                            {auditEvidence.fills?.length ? (
                              auditEvidence.fills.map((f, idx) => (
                                <div key={`fill-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/80 px-2 py-2">
                                  <div>{formatUtcDateLabel(f.ts_utc ?? null)}</div>
                                  <div>{L("Side", "Lado")}: {f.side ?? "—"} / {f.pos_effect ?? "—"}</div>
                                  <div>{L("Order", "Orden")}: {f.order_type ?? "—"}</div>
                                </div>
                              ))
                            ) : (
                              <div className="text-slate-500">{L("None", "Ninguno")}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function BackStudyPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-50">
          <TopNav />
          <div className="flex min-h-[60vh] items-center justify-center px-6">
            <p className="text-slate-400 text-sm">Loading back-study…</p>
          </div>
        </main>
      }
    >
      <BackStudyPageInner />
    </Suspense>
  );
}
