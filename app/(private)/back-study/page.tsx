// app/back-study/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import TopNav from "@/app/components/TopNav";
import NotebookCaptureButton from "@/app/components/NotebookCaptureButton";
import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

import type { JournalEntry } from "@/lib/journalLocal";
import { getAllJournalEntries, saveJournalEntry } from "@/lib/journalSupabase";
import { getJournalTradesForDates } from "@/lib/journalTradesSupabase";
import type { TradesPayload } from "@/lib/journalNotes";
import {
  getGrowthPlanSupabaseByAccount,
  type GrowthPlan,
} from "@/lib/growthPlanSupabase";
import {
  buildStrategyReview,
  createStrategySnapshot,
  normalizeStrategyAssignment,
  strategyTradeKey,
  type StrategyCriterionAssessment,
  type StrategyReviewAssignment,
  type StrategyReviewResult,
  type StrategySnapshot,
} from "@/lib/strategyReview";

import { type InstrumentType } from "@/lib/journalNotes";
import {
  buildInstrumentKeyFromTrade,
  buildTradeViewsForSession,
  normalizeBackStudyTradeRows as normalizeTradeRows,
  parseOptionSymbol,
  type BackStudyTradeRow,
  type BackStudyTradeView,
} from "@/lib/backStudy/tradeReconstruction";
import {
  findContainingCandleIndex,
  getReplayPeriodWindow,
  inferCandleIntervalMs,
  timeframeIntervalMs,
} from "@/lib/backStudy/chartTimeline";
import type { NormalizedOrderEvent } from "@/lib/brokers/types";
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

type EntryTradeRow = BackStudyTradeRow;
type ExitTradeRow = BackStudyTradeRow;

type SessionWithTrades = JournalEntry & {
  entries: EntryTradeRow[];
  exits: ExitTradeRow[];
};

type TradeView = BackStudyTradeView;

type ChartState = {
  loading: boolean;
  error: string | null;
  candles: Candle[];
  effectiveTimeframe: TimeframeId | null;
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
  event_window?: {
    from_utc: string;
    to_utc: string;
    time_zone: string;
    entry_time: string | null;
    exit_time: string | null;
    pre_buffer_minutes: number;
    post_buffer_minutes: number;
    matched_events: number;
    total_events_before_window: number;
  } | null;
  events: NormalizedOrderEvent[];
  audit: AuditMetrics;
  process_review: AuditCompliance;
  execution_discipline: ExecutionDiscipline;
  plan_compliance?: AuditCompliance;
};

const BACK_STUDY_AUDIT_HANDOFF_PREFIX = "ntj:back-study:audit-handoff";

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
 * Parse "9:56 AM", "09:56", "09:56:30" into seconds of the trading day.
 */
function parseTimeToSecondsFlexible(t: string): number | null {
  if (!t) return null;
  const cleaned = t.trim().toUpperCase();

  const m = cleaned.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/
  );
  if (!m) return null;

  let hour = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3] || 0);
  const ampm = m[4];

  if (!Number.isFinite(hour) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;

  if (ampm === "AM" && hour === 12) hour = 0;
  if (ampm === "PM" && hour !== 12) hour += 12;

  if (hour < 0 || hour > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;

  return hour * 3600 + minutes * 60 + seconds;
}

function parseTimeToMinutesFlexible(t: string): number | null {
  const seconds = parseTimeToSecondsFlexible(t);
  return seconds == null ? null : Math.floor(seconds / 60);
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

function formatAuditWindowTimeLabel(value: string | null | undefined, timeZone?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "America/New_York",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(new Date(value));
  } catch {
    return formatUtcDateLabel(value);
  }
}

/**
 * Convert candle timestamp (Yahoo UTC) → minutes of day in local time.
 */
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

function parseJournalNotesObject(notesRaw: unknown): Record<string, any> {
  if (typeof notesRaw !== "string" || !notesRaw.trim()) return {};
  try {
    const parsed = JSON.parse(notesRaw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return { premarket: String(notesRaw) };
  }
}

function getSavedStrategyAssignment(
  notesRaw: unknown,
  tradeKey: string,
  tradeAssignmentRaw?: unknown
): StrategyReviewAssignment | null {
  const notes = parseJournalNotesObject(notesRaw);
  const raw = notes?.strategy_review?.assignments?.[tradeKey];
  return (
    normalizeStrategyAssignment(raw) ||
    normalizeStrategyAssignment(tradeAssignmentRaw) ||
    normalizeStrategyAssignment(notes?.strategy_review?.planned_strategy)
  );
}

function mergeBackStudyRowsWithNotes(
  databaseRows: EntryTradeRow[],
  noteRows: EntryTradeRow[]
): EntryTradeRow[] {
  if (!databaseRows.length) return noteRows;
  if (!noteRows.length) return databaseRows;
  const signature = (row: EntryTradeRow) =>
    [
      String(row.symbol ?? "").trim().toUpperCase(),
      String(row.kind ?? "").trim().toLowerCase(),
      String(row.side ?? "").trim().toLowerCase(),
      String(row.time ?? "").trim().toUpperCase(),
      String(row.price ?? "").trim(),
      String(row.quantity ?? "").trim(),
    ].join("|");
  const queues = new Map<string, EntryTradeRow[]>();
  noteRows.forEach((row) => {
    const key = signature(row);
    queues.set(key, [...(queues.get(key) ?? []), row]);
  });
  return databaseRows.map((row) => {
    const key = signature(row);
    const queue = queues.get(key) ?? [];
    const noteRow = queue.shift();
    queues.set(key, queue);
    return noteRow?.playbookStrategyAssignment
      ? { ...row, playbookStrategyAssignment: noteRow.playbookStrategyAssignment }
      : row;
  });
}

function buildAuditHandoffPayload(
  trade: TradeView,
  auditResult: AuditResponse | null,
  strategyContext?: {
    assignment: StrategyReviewAssignment | null;
    review: StrategyReviewResult | null;
  }
) {
  const metrics = auditResult?.audit ?? {};
  const processReview = auditResult?.process_review ?? auditResult?.plan_compliance ?? null;
  const executionDiscipline = auditResult?.execution_discipline ?? null;

  return {
    generatedAt: new Date().toISOString(),
    trade: {
      id: trade.id,
      sequence: trade.sequence,
      date: trade.date,
      symbol: trade.symbol,
      underlyingSymbol: trade.underlyingSymbol,
      contractSymbol: trade.contractSymbol ?? null,
      instrumentKey: trade.instrumentKey,
      instrumentKeySource: trade.instrumentKeySource,
      instrumentKeyAmbiguous: trade.instrumentKeyAmbiguous,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      entryAvgPrice: trade.entryAvgPrice,
      exitAvgPrice: trade.exitAvgPrice,
      entryQty: trade.entryQty,
      exitQty: trade.exitQty,
      sourceRowIds: trade.sourceRowIds,
      entries: trade.entries.map((row) => ({
        id: row.id ?? null,
        symbol: row.symbol,
        kind: row.kind,
        side: row.side,
        price: row.price,
        quantity: row.quantity,
        time: row.time,
        premiumSide: row.premiumSide ?? null,
        optionStrategy: row.optionStrategy ?? null,
        expiry: row.expiry ?? null,
      })),
      exits: trade.exits.map((row) => ({
        id: row.id ?? null,
        symbol: row.symbol,
        kind: row.kind,
        side: row.side,
        price: row.price,
        quantity: row.quantity,
        time: row.time,
        premiumSide: row.premiumSide ?? null,
        optionStrategy: row.optionStrategy ?? null,
        expiry: row.expiry ?? null,
      })),
    },
    eventWindow: auditResult?.event_window ?? null,
    audit: {
      brokerEventsCount: Array.isArray(auditResult?.events) ? auditResult.events.length : 0,
      summary: metrics.summary ?? null,
      insights: Array.isArray(metrics.insights) ? metrics.insights.slice(0, 8) : [],
      ocoUsed: metrics.oco_used ?? null,
      stopPresent: metrics.stop_present ?? null,
      stopModCount: metrics.stop_mod_count ?? null,
      manualMarketExit: metrics.manual_market_exit ?? null,
      stopMarketFilled: metrics.stop_market_filled ?? null,
      timeToFirstStopSec: metrics.time_to_first_stop_sec ?? null,
      tradeSequences: Array.isArray(metrics.trades)
        ? metrics.trades.slice(0, 6).map((seq) => ({
            index: seq.index,
            entryTs: seq.entry_ts,
            exitTs: seq.exit_ts,
            entryCount: seq.entry_count,
            exitCount: seq.exit_count,
            entryQty: seq.entry_qty,
            exitQty: seq.exit_qty,
            stopModCount: seq.stop_mod_count,
            timeToFirstStopSec: seq.time_to_first_stop_sec,
            ocoUsed: seq.oco_used,
            manualMarketExit: seq.manual_market_exit,
            stopMarketFilled: seq.stop_market_filled,
            summary: seq.summary,
          }))
        : [],
    },
    processReview: processReview
      ? {
          score: processReview.score,
          respectedPlan: processReview.respected_plan,
          planPresent: processReview.plan_present,
          checklist: processReview.checklist,
          rules: Array.isArray(processReview.rules) ? processReview.rules.slice(0, 8) : [],
        }
      : null,
    executionDiscipline: executionDiscipline
      ? {
          score: executionDiscipline.score,
          metrics: executionDiscipline.metrics,
          checks: Array.isArray(executionDiscipline.checks) ? executionDiscipline.checks.slice(0, 8) : [],
        }
      : null,
    strategyReview: strategyContext
      ? {
          assignment: strategyContext.assignment,
          score: strategyContext.review?.score ?? null,
          evidenceCoverage: strategyContext.review?.evidenceCoverage ?? 0,
          passed: strategyContext.review?.passed ?? 0,
          failed: strategyContext.review?.failed ?? 0,
          unverified: strategyContext.review?.unverified ?? 0,
          criteria: strategyContext.review?.criteria ?? [],
        }
      : null,
  };
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
    const parsed = parseOptionSymbol(s);
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

/* =========================
   Interactive chart
========================= */

type InteractiveCandleChartProps = {
  title: string;
  symbol: string;
  candles: Candle[];
  selectedDate: string;
  timeframe: TimeframeId;
  entryPoints: Array<{ time: string; price?: number | null; label?: string }>;
  exitPoints: Array<{ time: string; price?: number | null; label?: string }>;
  auditPoints?: Array<{
    timestampMs: number;
    price?: number | null;
    label: string;
    tone: "fill" | "stop" | "cancel" | "order" | "replace";
  }>;
  timeMode: TimeMode;
  entryColor?: string;
  exitColor?: string;
  entryLabel?: string;
  exitLabel?: string;
  auditLabel?: string;
  zoomInLabel?: string;
  zoomOutLabel?: string;
  zoomResetLabel?: string;
  emptyLabel?: string;
  dailyMarkerWarningLabel?: string;
};

function InteractiveCandleChart({
  title,
  symbol,
  candles,
  selectedDate,
  timeframe,
  entryPoints,
  exitPoints,
  auditPoints = [],
  timeMode,
  entryColor = "#22c55e",
  exitColor = "#38bdf8",
  entryLabel = "Entry",
  exitLabel = "Exit",
  auditLabel = "Broker",
  zoomInLabel = "Zoom in",
  zoomOutLabel = "Zoom out",
  zoomResetLabel = "Reset zoom",
  emptyLabel = "No chart data for this symbol/timeframe.",
  dailyMarkerWarningLabel = "Exact execution markers require intraday candles.",
}: InteractiveCandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const markersPluginRef = useRef<any>(null);
  const inferredIntervalMs = useMemo(
    () => inferCandleIntervalMs(candles, timeframeIntervalMs(timeframe)),
    [candles, timeframe]
  );
  const supportsTimedMarkers = inferredIntervalMs < 12 * 60 * 60_000;

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

    // --- Timed markers anchored to the candle interval that contains them ---
    const filtered = candles
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => {
        const d = new Date(shiftMsByMode(c.time, timeMode));
        const isoDay = d.toISOString().slice(0, 10);
        return isoDay === selectedDate;
      });

    const findSessionCandle = (targetSeconds: number | null) => {
      if (targetSeconds == null || !supportsTimedMarkers) return null;
      const intervalSeconds = inferredIntervalMs / 1000;
      for (const { c, idx } of filtered) {
        const shifted = new Date(shiftMsByMode(c.time, timeMode));
        const candleSeconds =
          shifted.getUTCHours() * 3600 + shifted.getUTCMinutes() * 60 + shifted.getUTCSeconds();
        if (targetSeconds >= candleSeconds && targetSeconds < candleSeconds + intervalSeconds) {
          return idx;
        }
      }
      return null;
    };

    const findTimestampCandle = (targetMs: number | null) => {
      if (targetMs == null || !supportsTimedMarkers) return null;
      return findContainingCandleIndex(candles, targetMs, inferredIntervalMs);
    };

    const markers: any[] = [];
    const markerTimes: number[] = [];
    const pushMarker = (marker: Record<string, unknown>) => {
      const time = Number(marker.time);
      if (Number.isFinite(time)) markerTimes.push(time);
      markers.push({ ...marker, __order: markers.length });
    };

    entryPoints.forEach((pt, i) => {
      const seconds = parseTimeToSecondsFlexible(pt.time || "");
      const idx = findSessionCandle(seconds);
      if (idx == null) return;
      const c = candles[idx];
      pushMarker({
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
      const seconds = parseTimeToSecondsFlexible(pt.time || "");
      const idx = findSessionCandle(seconds);
      if (idx == null) return;
      const c = candles[idx];
      pushMarker({
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

    auditPoints.forEach((pt) => {
      const idx = findTimestampCandle(pt.timestampMs);
      if (idx == null) return;
      const c = candles[idx];
      const tone =
        pt.tone === "stop"
          ? { color: "#fb7185", shape: "square", position: "aboveBar" }
          : pt.tone === "cancel"
          ? { color: "#fbbf24", shape: "circle", position: "aboveBar" }
          : pt.tone === "replace"
          ? { color: "#f97316", shape: "square", position: "aboveBar" }
          : pt.tone === "order"
          ? { color: "#a78bfa", shape: "circle", position: "belowBar" }
          : { color: "#c084fc", shape: "circle", position: "belowBar" };
      const eventTime = new Intl.DateTimeFormat("en-US", {
        timeZone: timeMode === "et" ? "America/New_York" : undefined,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(pt.timestampMs));
      pushMarker({
        time: Math.floor(shiftMsByMode(c.time, timeMode) / 1000),
        position: tone.position,
        color: tone.color,
        shape: tone.shape,
        text: [
          pt.label,
          pt.price != null ? `@ ${pt.price.toFixed(2)}` : null,
          `${eventTime}${timeMode === "et" ? " ET" : ""}`,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    });

    if (markersPluginRef.current) {
      const orderedMarkers = markers
        .sort((a, b) => Number(a.time) - Number(b.time) || Number(a.__order) - Number(b.__order))
        .map(({ __order, ...marker }) => marker);
      markersPluginRef.current.setMarkers(orderedMarkers);
    }

    if (markerTimes.length && supportsTimedMarkers) {
      const firstMarker = Math.min(...markerTimes);
      const lastMarker = Math.max(...markerTimes);
      const paddingSeconds = Math.max((inferredIntervalMs / 1000) * 8, 5 * 60);
      timeScale.setVisibleRange({
        from: Math.max(times[0], firstMarker - paddingSeconds),
        to: Math.min(times[times.length - 1], lastMarker + paddingSeconds),
      });
    }
  }, [
    candles,
    selectedDate,
    entryPoints,
    exitPoints,
    auditPoints,
    timeMode,
    entryColor,
    exitColor,
    timeframe,
    inferredIntervalMs,
    supportsTimedMarkers,
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
            {auditPoints.length ? (
              <div className="flex items-center gap-1">
                <span className="inline-block h-2 w-4 rounded bg-violet-400" />
                <span className="text-slate-300">{auditLabel}</span>
              </div>
            ) : null}
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
        <>
          {!supportsTimedMarkers && (entryPoints.length || exitPoints.length || auditPoints.length) ? (
            <p className="mb-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {dailyMarkerWarningLabel}
            </p>
          ) : null}
          <div
            ref={containerRef}
            className="w-full h-80 rounded-xl border border-slate-800 bg-slate-950"
          />
        </>
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
  const yesNo = (value: boolean) => (value ? L("Yes", "Sí") : L("No", "No"));
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
  const [growthPlan, setGrowthPlan] = useState<GrowthPlan | null>(null);
  const [growthPlanError, setGrowthPlanError] = useState<string | null>(null);

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
          setEntriesError(L("Could not load your execution records.", "No se pudieron cargar tus registros de ejecución."));
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

  useEffect(() => {
    if (isAuditTab || loading || accountsLoading || !user || !activeAccountId) return;
    let active = true;
    setGrowthPlanError(null);
    void getGrowthPlanSupabaseByAccount(activeAccountId)
      .then((value) => {
        if (active) setGrowthPlan(value);
      })
      .catch((error) => {
        console.warn("[Back-Study] Could not load strategy playbook:", error);
        if (active) {
          setGrowthPlan(null);
          setGrowthPlanError(
            L("Could not load the Trading Business Plan strategies.", "No se pudieron cargar las estrategias del Plan de Empresa de Trading.")
          );
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuditTab, loading, accountsLoading, user?.id, activeAccountId]);

  const sessions: SessionWithTrades[] = useMemo(() => {
    return entries.map((s) => {
      const dateKey = String((s as any)?.date || "").slice(0, 10);
      const fromDb = journalTradesMap[dateKey] ?? {};
      const fromNotes = parseNotesTrades(s.notes);

      const dbEntries = normalizeTradeRows(fromDb.entries ?? []);
      const dbExits = normalizeTradeRows(fromDb.exits ?? []);
      const noteEntries = normalizeTradeRows(fromNotes.entries ?? []);
      const noteExits = normalizeTradeRows(fromNotes.exits ?? []);
      const ent = mergeBackStudyRowsWithNotes(dbEntries, noteEntries);
      const ex = mergeBackStudyRowsWithNotes(dbExits, noteExits);

      return {
        ...s,
        entries: ent,
        exits: ex,
      };
    });
  }, [entries, journalTradesMap]);

  const trades: TradeView[] = useMemo(() => {
    return sessions
      .flatMap((session) => buildTradeViewsForSession(session))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        const at = parseTimeToMinutesFlexible(a.entryTime) ?? 24 * 60;
        const bt = parseTimeToMinutesFlexible(b.entryTime) ?? 24 * 60;
        return at - bt;
      });
  }, [sessions]);

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTradeId, setSelectedTradeId] = useState<string>("");
  const [timeframe, setTimeframe] = useState<TimeframeId>("1m");
  const [chartRange, setChartRange] = useState<ChartRangeId>("1D");
  const [timeMode, setTimeMode] = useState<TimeMode>("et");
  const candleCacheRef = useRef<Map<string, Candle[]>>(new Map());

  useEffect(() => {
    if (!trades.length) {
      setSelectedDate("");
      setSelectedTradeId("");
      return;
    }
    if (selectedTradeId && trades.some((trade) => trade.id === selectedTradeId)) {
      const current = trades.find((trade) => trade.id === selectedTradeId);
      if (current && current.date !== selectedDate) setSelectedDate(current.date);
      return;
    }
    const sameDateFirst = selectedDate ? trades.find((trade) => trade.date === selectedDate) : null;
    const first = sameDateFirst ?? trades[0];
    setSelectedDate(first.date);
    setSelectedTradeId(first.id);
  }, [trades, selectedDate, selectedTradeId]);

  const datesAvailable = Array.from(new Set(trades.map((t) => t.date))).sort(
    (a, b) => (a < b ? 1 : -1)
  );

  const tradesForDate = trades.filter((t) => t.date === selectedDate);
  const selectedTrade = trades.find((t) => t.id === selectedTradeId) || null;
  const selectedSession = selectedTrade
    ? sessions.find((session) => String(session.date).slice(0, 10) === selectedTrade.date) ?? null
    : null;

  const playbookSnapshots = useMemo<StrategySnapshot[]>(() => {
    const strategies = growthPlan?.steps?.strategy?.strategies ?? [];
    return strategies
      .filter((strategy) => String(strategy?.name ?? "").trim())
      .map((strategy, index) =>
        createStrategySnapshot(strategy, {
          index,
          capturedAt: growthPlan?.updatedAt || new Date().toISOString(),
          planVersion: growthPlan?.version ?? null,
          planUpdatedAt: growthPlan?.updatedAt ?? null,
        })
      );
  }, [growthPlan]);

  const selectedStrategyTradeKey = selectedTrade ? strategyTradeKey(selectedTrade) : "";
  const savedStrategyAssignment = useMemo(
    () =>
      selectedSession && selectedStrategyTradeKey
        ? getSavedStrategyAssignment(
            selectedSession.notes,
            selectedStrategyTradeKey,
            selectedTrade?.playbookStrategyAssignment
          )
        : null,
    [selectedSession, selectedStrategyTradeKey]
  );
  const [selectedStrategyId, setSelectedStrategyId] = useState("");
  const [strategyAssessments, setStrategyAssessments] = useState<
    Record<string, StrategyCriterionAssessment>
  >({});
  const [strategySaving, setStrategySaving] = useState(false);
  const [strategySaveMessage, setStrategySaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedStrategyId(savedStrategyAssignment?.strategyId ?? "");
    setStrategyAssessments(savedStrategyAssignment?.assessments ?? {});
    setStrategySaveMessage(null);
  }, [selectedStrategyTradeKey, savedStrategyAssignment?.assignedAt]);

  const selectedStrategySnapshot = useMemo(() => {
    if (!selectedStrategyId) return null;
    if (savedStrategyAssignment?.strategyId === selectedStrategyId) {
      return savedStrategyAssignment.snapshot;
    }
    return playbookSnapshots.find((strategy) => strategy.id === selectedStrategyId) ?? null;
  }, [selectedStrategyId, savedStrategyAssignment, playbookSnapshots]);

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
    effectiveTimeframe: null,
  });

  const [contractState, setContractState] = useState<ChartState>({
    loading: false,
    error: null,
    candles: [],
    effectiveTimeframe: null,
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
    const window = anchorDate
      ? getReplayPeriodWindow(anchorDate, RANGE_DAYS[rangeId] ?? 30, tfId)
      : null;

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

  const loadBestAvailableCandles = async (
    symbol: string,
    requestedTimeframe: TimeframeId,
    rangeId: ChartRangeId,
    kind: InstrumentType | undefined,
    anchorDate: string
  ): Promise<{ candles: Candle[]; effectiveTimeframe: TimeframeId }> => {
    const fallbackOrder: Record<TimeframeId, TimeframeId[]> = {
      "1m": ["1m", "5m", "15m", "1h", "1d"],
      "5m": ["5m", "15m", "1h", "1d"],
      "15m": ["15m", "1h", "1d"],
      "1h": ["1h", "1d"],
      "4h": ["4h", "1d"],
      "1d": ["1d"],
    };

    for (const candidate of fallbackOrder[requestedTimeframe]) {
      const candles = await fetchCandles(symbol, candidate, rangeId, kind, anchorDate);
      if (candles.length) return { candles, effectiveTimeframe: candidate };
    }

    return { candles: [], effectiveTimeframe: requestedTimeframe };
  };

  const loadReplay = async () => {
    if (!selectedTrade) return;

    const { underlyingSymbol, contractSymbol, kind } = selectedTrade;

    setUnderlyingState({ loading: true, error: null, candles: [], effectiveTimeframe: null });
    setContractState({
      loading: !!contractSymbol,
      error: null,
      candles: [],
      effectiveTimeframe: null,
    });

    // Underlying
    try {
      const underlyingResult = await loadBestAvailableCandles(
        underlyingSymbol,
        timeframe,
        chartRange,
        kind,
        selectedTrade.date
      );
      const underlyingFallbackMessage =
        underlyingResult.candles.length && underlyingResult.effectiveTimeframe !== timeframe
          ? underlyingResult.effectiveTimeframe === "1d"
            ? L(
                "Intraday candles were unavailable for this session. Showing daily context without exact-time markers.",
                "No hubo velas intradía para esta sesión. Se muestra contexto diario sin marcadores de hora exacta."
              )
            : L(
                `${timeframe} candles were unavailable. Showing the closest intraday resolution: ${underlyingResult.effectiveTimeframe}.`,
                `No hubo velas de ${timeframe}. Se muestra la resolución intradía más cercana: ${underlyingResult.effectiveTimeframe}.`
              )
          : null;
      setUnderlyingState({
        loading: false,
        error: underlyingFallbackMessage,
        candles: underlyingResult.candles,
        effectiveTimeframe: underlyingResult.effectiveTimeframe,
      });
    } catch (err) {
      console.warn("Underlying chart error:", err);
      setUnderlyingState({
        loading: false,
        error: "Could not load underlying chart.",
        candles: [],
        effectiveTimeframe: null,
      });
    }

    // Contract (if applicable)
    if (contractSymbol) {
      try {
        const contractResult = await loadBestAvailableCandles(
          contractSymbol,
          timeframe,
          chartRange,
          "option",
          selectedTrade.date
        );
        if (contractResult.candles.length) {
          setContractState({
            loading: false,
            error:
              contractResult.effectiveTimeframe !== timeframe
                ? contractResult.effectiveTimeframe === "1d"
                  ? L(
                      "Intraday contract candles were unavailable. Showing daily contract context without exact-time markers.",
                      "No hubo velas intradía del contrato. Se muestra contexto diario del contrato sin marcadores de hora exacta."
                    )
                  : L(
                      `${timeframe} contract candles were unavailable. Showing ${contractResult.effectiveTimeframe}.`,
                      `No hubo velas del contrato en ${timeframe}. Se muestra ${contractResult.effectiveTimeframe}.`
                    )
                : null,
            candles: contractResult.candles,
            effectiveTimeframe: contractResult.effectiveTimeframe,
          });
        } else {
          const proxyResult = await loadBestAvailableCandles(
            underlyingSymbol,
            timeframe,
            chartRange,
            kind,
            selectedTrade.date
          );
          const fallbackMessage = proxyResult.effectiveTimeframe === "1d"
            ? L(
                "No intraday contract or underlying candles were available. Showing daily underlying context without exact-time markers.",
                "No hubo velas intradía del contrato ni del underlying. Se muestra contexto diario del underlying sin marcadores de hora exacta."
              )
            : L(
            "No specific contract data found. Showing underlying instead.",
            "No se encontro data exacta del contrato. Mostrando el underlying."
          );
          setContractState({
            loading: false,
            error: fallbackMessage,
            candles: proxyResult.candles,
            effectiveTimeframe: proxyResult.effectiveTimeframe,
          });
        }
      } catch (err) {
        console.warn("Contract chart error:", err);
        setContractState({
          loading: false,
          error: "Could not load contract chart.",
          candles: [],
          effectiveTimeframe: null,
        });
      }
    } else {
      setContractState({ loading: false, error: null, candles: [], effectiveTimeframe: null });
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
      params.set("entryTime", trade.entryTime);
      params.set("exitTime", trade.exitTime);
      params.set("windowTz", "America/New_York");
      params.set("preBufferMinutes", "30");
      params.set("postBufferMinutes", "90");

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
      tradeId: selectedTrade.id,
      timeMode,
      windowTz: "America/New_York",
    });
    if (selectedTrade.instrumentKey) params.set("instrumentKey", selectedTrade.instrumentKey);
    if (selectedTrade.instrumentKeyAmbiguous) params.set("instrumentAmbiguous", "1");

    const auditHandoff = buildAuditHandoffPayload(selectedTrade, auditResult, {
      assignment:
        selectedStrategySnapshot
          ? {
              strategyId: selectedStrategySnapshot.id,
              snapshot: selectedStrategySnapshot,
              assignedAt: savedStrategyAssignment?.assignedAt ?? new Date().toISOString(),
              assignmentTiming: savedStrategyAssignment?.assignmentTiming ?? "retrospective",
              assessments: strategyAssessments,
            }
          : null,
      review: strategyReviewResult,
    });
    if (typeof window !== "undefined") {
      const handoffKey = `${BACK_STUDY_AUDIT_HANDOFF_PREFIX}:${selectedTrade.id}`;
      try {
        window.sessionStorage.setItem(handoffKey, JSON.stringify(auditHandoff));
        params.set("handoffKey", handoffKey);
      } catch (err) {
        console.warn("[Back-Study] Could not store audit handoff:", err);
      }
    }

    router.push(`/performance/ai-coaching?${params.toString()}`);
  };

  const handleDownloadSnapshot = () => {
    if (!selectedTrade || typeof window === "undefined") return;
    const payload = {
      generatedAt: new Date().toISOString(),
      replay: {
        timeframe,
        chartRange,
        timeMode,
      },
      trade: {
        id: selectedTrade.id,
        sequence: selectedTrade.sequence,
        date: selectedTrade.date,
        symbol: selectedTrade.symbol,
        kind: selectedTrade.kind,
        underlyingSymbol: selectedTrade.underlyingSymbol,
        contractSymbol: selectedTrade.contractSymbol ?? null,
        instrumentKey: selectedTrade.instrumentKey,
        instrumentKeySource: selectedTrade.instrumentKeySource,
        instrumentKeyAmbiguous: selectedTrade.instrumentKeyAmbiguous,
        entryTime: selectedTrade.entryTime,
        exitTime: selectedTrade.exitTime,
        entryAvgPrice: selectedTrade.entryAvgPrice,
        exitAvgPrice: selectedTrade.exitAvgPrice,
        entryQty: selectedTrade.entryQty,
        exitQty: selectedTrade.exitQty,
        sourceRowIds: selectedTrade.sourceRowIds,
        entries: selectedTrade.entries,
        exits: selectedTrade.exits,
      },
      audit: auditResult,
      strategyReview: strategyReviewResult,
      strategyAssignment: selectedStrategySnapshot
        ? {
            strategyId: selectedStrategySnapshot.id,
            snapshot: selectedStrategySnapshot,
            assignedAt: savedStrategyAssignment?.assignedAt ?? null,
            assignmentTiming: savedStrategyAssignment?.assignmentTiming ?? "retrospective",
            assessments: strategyAssessments,
          }
        : null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `back-study-${selectedTrade.date}-${selectedTrade.symbol}-${selectedTrade.sequence}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
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
  const auditEventWindow = auditResult?.event_window ?? null;
  const selectedJournalNotes = useMemo(
    () => parseJournalNotesObject(selectedSession?.notes),
    [selectedSession?.notes]
  );
  const strategyReviewResult = useMemo<StrategyReviewResult | null>(() => {
    if (!selectedTrade || !selectedStrategySnapshot) return null;
    const neuroLayer = selectedJournalNotes?.neuro_layer ?? selectedJournalNotes?.neuroLayer ?? {};
    const checklists = selectedJournalNotes?.checklists ?? {};
    return buildStrategyReview({
      strategy: selectedStrategySnapshot,
      assessments: strategyAssessments,
      locale: isEs ? "es" : "en",
      evidence: {
        symbol: selectedTrade.underlyingSymbol || selectedTrade.symbol,
        kind: selectedTrade.kind,
        respectedPlan:
          typeof selectedSession?.respectedPlan === "boolean" ? selectedSession.respectedPlan : null,
        stopPresent: typeof auditMetrics?.stop_present === "boolean" ? auditMetrics.stop_present : null,
        ocoUsed: typeof auditMetrics?.oco_used === "boolean" ? auditMetrics.oco_used : null,
        manualMarketExit:
          typeof auditMetrics?.manual_market_exit === "boolean" ? auditMetrics.manual_market_exit : null,
        timeToFirstStopSec: auditMetrics?.time_to_first_stop_sec ?? null,
        stopModificationCount: auditMetrics?.stop_mod_count ?? null,
        journalStrategyChecks: Array.isArray(checklists?.strategy) ? checklists.strategy : [],
        premarketThesis: Array.isArray(neuroLayer?.premarket?.thesis)
          ? neuroLayer.premarket.thesis
          : [],
        premarketConfirmation: Array.isArray(neuroLayer?.premarket?.confirmation)
          ? neuroLayer.premarket.confirmation
          : [],
        premarketInvalidation: Array.isArray(neuroLayer?.premarket?.invalidation)
          ? neuroLayer.premarket.invalidation
          : [],
      },
    });
  }, [
    selectedTrade,
    selectedStrategySnapshot,
    strategyAssessments,
    selectedJournalNotes,
    selectedSession?.respectedPlan,
    auditMetrics,
  ]);

  const saveStrategyReview = async () => {
    if (
      !user?.id ||
      !activeAccountId ||
      !selectedSession ||
      !selectedStrategyTradeKey ||
      !selectedStrategySnapshot
    ) {
      setStrategySaveMessage(
        L("Select a playbook strategy first.", "Selecciona primero una estrategia del playbook.")
      );
      return;
    }
    setStrategySaving(true);
    setStrategySaveMessage(null);
    try {
      const notes = parseJournalNotesObject(selectedSession.notes);
      const previousRoot =
        notes.strategy_review && typeof notes.strategy_review === "object"
          ? notes.strategy_review
          : {};
      const previousAssignments =
        previousRoot.assignments && typeof previousRoot.assignments === "object"
          ? previousRoot.assignments
          : {};
      const now = new Date().toISOString();
      const previous = getSavedStrategyAssignment(selectedSession.notes, selectedStrategyTradeKey);
      const assignment: StrategyReviewAssignment = {
        strategyId: selectedStrategySnapshot.id,
        snapshot: selectedStrategySnapshot,
        assignedAt:
          previous?.strategyId === selectedStrategySnapshot.id ? previous.assignedAt : now,
        assignmentTiming:
          previous?.strategyId === selectedStrategySnapshot.id
            ? previous.assignmentTiming
            : "retrospective",
        assessments: strategyAssessments,
      };
      const nextNotes = {
        ...notes,
        strategy_review: {
          ...previousRoot,
          version: 1,
          assignments: {
            ...previousAssignments,
            [selectedStrategyTradeKey]: assignment,
          },
          updated_at: now,
        },
      };
      const nextEntry: JournalEntry = {
        ...selectedSession,
        notes: JSON.stringify(nextNotes),
      };
      await saveJournalEntry(user.id, nextEntry, activeAccountId);
      setEntries((current) =>
        current.map((entry) =>
          String(entry.date).slice(0, 10) === selectedTrade?.date
            ? { ...entry, notes: nextEntry.notes }
            : entry
        )
      );
      setStrategySaveMessage(L("Strategy comparison saved.", "Comparación de estrategia guardada."));
    } catch (error: any) {
      console.error("[Back-Study] Could not save strategy review:", error);
      setStrategySaveMessage(
        error?.message || L("Could not save the strategy comparison.", "No se pudo guardar la comparación de estrategia.")
      );
    } finally {
      setStrategySaving(false);
    }
  };
  const auditChartPoints = useMemo(() => {
    const brokerEvents = Array.isArray(auditResult?.events) ? auditResult.events.slice(0, 60) : [];
    const points: Array<{
      timestampMs: number;
      price?: number | null;
      label: string;
      tone: "fill" | "stop" | "cancel" | "order" | "replace";
    }> = [];
    brokerEvents.forEach((event) => {
      const timestampMs = Date.parse(String(event.ts_utc ?? ""));
      if (!Number.isFinite(timestampMs)) return;

      const eventType = String(event.event_type || "").toUpperCase();
      const orderType = String(event.order_type || "").toUpperCase();
      const status = String(event.status || "").toUpperCase();
      const isStop =
        event.stop_price != null || orderType.includes("STP") || status.includes("STOP");
      const isEntry = String(event.pos_effect || "").toUpperCase() === "TO_OPEN";
      let tone: "fill" | "stop" | "cancel" | "order" | "replace" = "order";
      let label = L("Order placed", "Orden colocada");

      if (isStop) {
        tone = "stop";
        label = eventType === "ORDER_FILLED"
          ? L("Stop filled", "Stop ejecutado")
          : eventType === "ORDER_CANCELED"
          ? L("Stop canceled", "Stop cancelado")
          : eventType === "ORDER_REPLACED"
          ? L("Stop modified", "Stop modificado")
          : L("Stop placed", "Stop colocado");
      } else if (eventType === "ORDER_FILLED") {
        tone = "fill";
        label = isEntry
          ? L("Broker entry fill", "Fill de entrada del broker")
          : L("Broker exit fill", "Fill de salida del broker");
      } else if (eventType === "ORDER_CANCELED") {
        tone = "cancel";
        label = L("Order canceled", "Orden cancelada");
      } else if (eventType === "ORDER_REPLACED") {
        tone = "replace";
        label = L("Order modified", "Orden modificada");
      }

      const price = toNumber(event.stop_price) ?? toNumber(event.limit_price);
      points.push({
        timestampMs,
        price,
        label: `${label}${orderType ? ` (${orderType})` : ""}`,
        tone,
      });
    });
    return points.sort((a, b) => a.timestampMs - b.timestampMs);
  }, [auditResult, lang]);
  const auditWindowHasNoMatches =
    !auditLoading &&
    !auditError &&
    !!auditEventWindow &&
    auditEventWindow.matched_events === 0 &&
    auditEventWindow.total_events_before_window > 0;
  const selectedInstrumentKey = selectedTrade ? buildInstrumentKeyFromTrade(selectedTrade) : null;
  const coachButtonDisabled = !selectedTrade || auditLoading;

  if (loading || planLoading || !user || (!isAuditTab && (accountsLoading || entriesLoading))) {
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
                      "Back-Study now works as a trade review workspace: chart replay, execution truth from audit, process compliance, and direct handoff to Business AI Coach.",
                      "Back-Study ahora funciona como un workspace de revisión del trade: replay visual, verdad de ejecución desde audit, cumplimiento del proceso y handoff directo al Coach Empresarial IA."
                    )
                  : L(
                      "Use Trade review to replay the chart, review entries and exits, and document what happened in the trade.",
                      "Usa Trade review para repetir el chart, revisar entradas y salidas, y documentar qué pasó en el trade."
                    )}
              </p>
            </div>

            <div className="flex flex-wrap items-start gap-2 md:self-center">
              {selectedTrade ? (
                <NotebookCaptureButton
                  accountId={activeAccountId}
                  sourceType="back_study"
                  sourceId={selectedTrade.id}
                  pageType="lesson"
                  title={L(`Trade review · ${selectedTrade.underlyingSymbol} · ${selectedTrade.date}`, `Revisión de trade · ${selectedTrade.underlyingSymbol} · ${selectedTrade.date}`)}
                  content={`${L("<h2>Trade evidence</h2>", "<h2>Evidencia del trade</h2>")}<p>${selectedTrade.underlyingSymbol} · ${selectedTrade.date} · ${selectedTrade.kind}</p>${L("<h2>Observed execution window</h2>", "<h2>Ventana de ejecución observada</h2>")}<p>${selectedTrade.entryTime || "—"} - ${selectedTrade.exitTime || "—"}</p>${L("<h2>Review conclusion</h2><p></p><h2>What would disprove the lesson?</h2><p></p><h2>Next test</h2><p></p>", "<h2>Conclusión del review</h2><p></p><h2>¿Qué refutaría la lección?</h2><p></p><h2>Próxima prueba</h2><p></p>")}`}
                />
              ) : null}
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                ← {L("Back to dashboard", "Volver al dashboard")}
              </button>
            </div>
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
              {!activeAccountId && (
                <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 md:p-5">
                  <p className="text-sm font-semibold text-amber-100">
                    {L("Select an active trading account first.", "Selecciona una cuenta de trading activa primero.")}
                  </p>
                  <p className="mt-1 text-sm text-amber-100/75">
                    {L(
                      "Back-Study needs an active account so it can load the correct execution trades and broker audit data.",
                      "Back-Study necesita una cuenta activa para cargar los trades correctos del registro de ejecución y la auditoría del broker."
                    )}
                  </p>
                </section>
              )}

              {activeAccountId && entriesError && (
                <section className="rounded-2xl border border-rose-500/60 bg-rose-950/40 p-4 md:p-5">
                  <p className="text-sm text-rose-200">{entriesError}</p>
                  <p className="text-xs text-rose-300/80 mt-1">
                    {L("Check your connection or try again later.", "Revisa tu conexión o intenta más tarde.")}
                  </p>
                </section>
              )}

              {activeAccountId && !entriesError && trades.length === 0 && (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-5">
                  <p className="text-sm text-slate-200 mb-1">
                    {L("No trades found for back-study.", "No se encontraron trades para back-study.")}
                  </p>
                  <p className="text-sm text-slate-400">
                    {L(
                      "Make sure you have Entries and Exits saved in the execution record so they can be replayed here.",
                      "Asegúrate de tener Entradas y Salidas guardadas en el registro de ejecución para poder reproducirlas aquí."
                    )}
                  </p>
                </section>
              )}

              {activeAccountId && !entriesError && trades.length > 0 && (
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
                            {L("Trade", "Trade")} {t.sequence} · {t.symbol} ({t.kind}) · {t.entryTime} →{" "}
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
                          className={`w-full px-4 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs md:text-sm font-semibold transition ${
                            coachButtonDisabled
                              ? "cursor-not-allowed opacity-60 shadow-none"
                              : "shadow-[0_0_16px_rgba(56,189,248,0.5)] hover:bg-sky-400"
                          }`}
                          disabled={coachButtonDisabled}
                        >
                          {auditLoading
                            ? L("Preparing audit handoff…", "Preparando handoff del audit…")
                            : L("Ask Business AI Coach about this trade", "Preguntar al Coach Empresarial IA sobre este trade")}
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadSnapshot}
                          className="w-full rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200"
                          disabled={!selectedTrade}
                        >
                          {L("Export review snapshot", "Exportar snapshot de revisión")}
                        </button>
                      </div>
                    </div>
                    </form>
                  </section>

                  {selectedTrade && (
                    <section className="rounded-2xl border border-cyan-400/25 bg-slate-900/80 p-4 shadow-[0_0_28px_rgba(34,211,238,0.08)] md:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="max-w-2xl">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">
                            {L("Strategy comparison contract", "Contrato de comparación estratégica")}
                          </p>
                          <h2 className="mt-2 text-xl font-semibold text-slate-100">
                            {L(
                              "Tell the system which playbook strategy this trade was meant to execute",
                              "Indica cuál estrategia del playbook se suponía que ejecutara este trade"
                            )}
                          </h2>
                          <p className="mt-2 text-sm leading-relaxed text-slate-400">
                            {L(
                              "The platform does not infer intent from P&L. It compares a saved strategy snapshot against broker evidence, journal evidence, and your explicit review.",
                              "La plataforma no infiere la intención por el P&L. Compara un snapshot guardado de la estrategia contra evidencia del broker, evidencia del journal y tu revisión explícita."
                            )}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          {[L("1 · Select baseline", "1 · Selecciona base"), L("2 · Verify evidence", "2 · Verifica evidencia"), L("3 · Save verdict", "3 · Guarda veredicto")].map((item) => (
                            <span key={item} className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-slate-300">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>

                      {growthPlanError ? (
                        <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                          {growthPlanError}
                        </p>
                      ) : playbookSnapshots.length === 0 ? (
                        <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
                          <p className="text-sm font-semibold text-amber-100">
                            {L("There is no strategy baseline to compare yet.", "Todavía no existe una estrategia base para comparar.")}
                          </p>
                          <p className="mt-1 text-sm text-amber-100/75">
                            {L(
                              "Create at least one setup with entry, exit, management, and invalidation rules in the Trading Business Plan.",
                              "Crea al menos un setup con reglas de entrada, salida, manejo e invalidación en el Plan de Empresa de Trading."
                            )}
                          </p>
                          <Link
                            href="/growth-plan"
                            className="mt-3 inline-flex rounded-xl border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10"
                          >
                            {L("Open Strategy & Rules", "Abrir Estrategia y reglas")}
                          </Link>
                        </div>
                      ) : (
                        <>
                          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                            <label className="block">
                              <span className="text-xs font-semibold text-slate-300">
                                {L("Expected playbook strategy", "Estrategia esperada del playbook")}
                              </span>
                              <select
                                value={selectedStrategyId}
                                onChange={(event) => {
                                  const nextId = event.target.value;
                                  setSelectedStrategyId(nextId);
                                  setStrategyAssessments(
                                    nextId === savedStrategyAssignment?.strategyId
                                      ? savedStrategyAssignment?.assessments ?? {}
                                      : {}
                                  );
                                  setStrategySaveMessage(null);
                                }}
                                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400"
                              >
                                <option value="">
                                  {L("Select the strategy this trade intended to execute…", "Selecciona la estrategia que este trade intentaba ejecutar…")}
                                </option>
                                {playbookSnapshots.map((strategy) => (
                                  <option key={strategy.id} value={strategy.id}>
                                    {strategy.name}{strategy.timeframe ? ` · ${strategy.timeframe}` : ""}
                                  </option>
                                ))}
                                {savedStrategyAssignment && !playbookSnapshots.some((item) => item.id === savedStrategyAssignment.strategyId) ? (
                                  <option value={savedStrategyAssignment.strategyId}>
                                    {savedStrategyAssignment.snapshot.name} · {L("saved historical version", "versión histórica guardada")}
                                  </option>
                                ) : null}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => void saveStrategyReview()}
                              disabled={!selectedStrategySnapshot || strategySaving}
                              className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {strategySaving
                                ? L("Saving…", "Guardando…")
                                : savedStrategyAssignment?.strategyId === selectedStrategyId
                                  ? L("Save review", "Guardar revisión")
                                  : L("Lock baseline & save", "Fijar base y guardar")}
                            </button>
                          </div>

                          {strategySaveMessage ? (
                            <p className="mt-2 text-xs text-cyan-200">{strategySaveMessage}</p>
                          ) : null}
                          {selectedTrade.mixedPlaybookStrategies ? (
                            <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                              {L(
                                "This reconstructed trade contains entry fills assigned to different playbook strategies. Confirm the correct baseline before saving the review.",
                                "Este trade reconstruido contiene fills de entrada asignados a estrategias distintas. Confirma la base correcta antes de guardar la revisión."
                              )}
                            </p>
                          ) : null}

                          {selectedStrategySnapshot ? (
                            <>
                              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                {[
                                  [L("Setup / context", "Setup / contexto"), selectedStrategySnapshot.setup],
                                  [L("Entry", "Entrada"), selectedStrategySnapshot.entryRules],
                                  [L("Risk / exit", "Riesgo / salida"), selectedStrategySnapshot.exitRules],
                                  [L("Management", "Manejo"), selectedStrategySnapshot.managementRules],
                                  [L("Invalidation", "Invalidación"), selectedStrategySnapshot.invalidation],
                                ].map(([label, value]) => (
                                  <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/65 p-3">
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
                                    <p className="mt-2 text-xs leading-relaxed text-slate-200">
                                      {value || L("Not defined", "No definido")}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              {savedStrategyAssignment?.strategyId === selectedStrategyId ? (
                                <p className="mt-3 text-xs text-slate-500">
                                  {savedStrategyAssignment.assignmentTiming === "pre_trade"
                                    ? L("This strategy was declared before the trade.", "Esta estrategia fue declarada antes del trade.")
                                    : L(
                                        "This baseline was assigned during review, so it is labeled retrospective and not treated as pre-trade proof.",
                                        "Esta base fue asignada durante la revisión, por eso queda marcada como retrospectiva y no cuenta como evidencia pre-trade."
                                      )}
                                </p>
                              ) : null}

                              {strategyReviewResult ? (
                                <div className="mt-5">
                                  <div className="grid gap-3 sm:grid-cols-4">
                                    <ReviewMetricCard
                                      label={L("Strategy adherence", "Adherencia estratégica")}
                                      value={strategyReviewResult.score == null ? L("Not scorable", "No evaluable") : `${strategyReviewResult.score}%`}
                                      tone={strategyReviewResult.score != null && strategyReviewResult.score < 70 ? "rose" : "emerald"}
                                    />
                                    <ReviewMetricCard
                                      label={L("Evidence coverage", "Cobertura de evidencia")}
                                      value={`${strategyReviewResult.evidenceCoverage}%`}
                                      tone="sky"
                                    />
                                    <ReviewMetricCard
                                      label={L("Met / missed", "Cumplidas / falladas")}
                                      value={`${strategyReviewResult.passed} / ${strategyReviewResult.failed}`}
                                      tone="default"
                                    />
                                    <ReviewMetricCard
                                      label={L("Unverified", "Sin verificar")}
                                      value={String(strategyReviewResult.unverified)}
                                      tone="default"
                                    />
                                  </div>

                                  <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-800">
                                    <table className="min-w-[900px] w-full text-left text-xs">
                                      <thead className="bg-slate-950/90 text-slate-400">
                                        <tr>
                                          <th className="px-3 py-3 font-semibold">{L("Phase", "Fase")}</th>
                                          <th className="px-3 py-3 font-semibold">{L("Expected", "Esperado")}</th>
                                          <th className="px-3 py-3 font-semibold">{L("Actual evidence", "Evidencia real")}</th>
                                          <th className="px-3 py-3 font-semibold">{L("Verdict", "Veredicto")}</th>
                                          <th className="px-3 py-3 font-semibold">{L("Source", "Fuente")}</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-800 bg-slate-950/45">
                                        {strategyReviewResult.criteria.map((criterion) => (
                                          <tr key={criterion.id} className="align-top">
                                            <td className="px-3 py-3 uppercase tracking-[0.12em] text-slate-500">
                                              {criterion.phase === "eligibility"
                                                ? L("Eligibility", "Elegibilidad")
                                                : criterion.phase === "setup"
                                                  ? L("Setup", "Setup")
                                                  : criterion.phase === "entry"
                                                    ? L("Entry", "Entrada")
                                                    : criterion.phase === "risk"
                                                      ? L("Risk", "Riesgo")
                                                      : criterion.phase === "management"
                                                        ? L("Management", "Manejo")
                                                        : L("Exit", "Salida")}
                                            </td>
                                            <td className="max-w-xs px-3 py-3 text-slate-200">{criterion.expected}</td>
                                            <td className="max-w-xs px-3 py-3 text-slate-400">
                                              {criterion.actual}
                                              <p className="mt-1 text-[10px] text-slate-600">{criterion.reason}</p>
                                            </td>
                                            <td className="px-3 py-3">
                                              {criterion.automatic ? (
                                                <span
                                                  className={`inline-flex rounded-full border px-2 py-1 font-semibold ${
                                                    criterion.status === "pass"
                                                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                                                      : criterion.status === "fail"
                                                        ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                                                        : "border-slate-600 bg-slate-800/60 text-slate-300"
                                                  }`}
                                                >
                                                  {criterion.status === "pass"
                                                    ? L("MET", "CUMPLE")
                                                    : criterion.status === "fail"
                                                      ? L("MISSED", "FALLÓ")
                                                      : L("UNVERIFIED", "SIN VERIFICAR")}
                                                </span>
                                              ) : (
                                                <div className="min-w-52 space-y-2">
                                                  <div className="flex flex-wrap gap-1.5">
                                                    {(["pass", "fail", "unverified"] as const).map((status) => {
                                                      const active = criterion.status === status;
                                                      return (
                                                        <button
                                                          key={status}
                                                          type="button"
                                                          onClick={() => {
                                                            setStrategyAssessments((current) => ({
                                                              ...current,
                                                              [criterion.id]: {
                                                                ...current[criterion.id],
                                                                status,
                                                                updatedAt: new Date().toISOString(),
                                                              },
                                                            }));
                                                            setStrategySaveMessage(null);
                                                          }}
                                                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition ${
                                                            active
                                                              ? status === "pass"
                                                                ? "border-emerald-300 bg-emerald-400 text-slate-950"
                                                                : status === "fail"
                                                                  ? "border-rose-300 bg-rose-400 text-slate-950"
                                                                  : "border-slate-400 bg-slate-500 text-white"
                                                              : "border-slate-700 text-slate-400 hover:border-slate-500"
                                                          }`}
                                                        >
                                                          {status === "pass"
                                                            ? L("Met", "Cumple")
                                                            : status === "fail"
                                                              ? L("Missed", "Falló")
                                                              : L("No evidence", "Sin evidencia")}
                                                        </button>
                                                      );
                                                    })}
                                                  </div>
                                                  <input
                                                    value={strategyAssessments[criterion.id]?.note ?? ""}
                                                    onChange={(event) => {
                                                      const note = event.target.value;
                                                      setStrategyAssessments((current) => ({
                                                        ...current,
                                                        [criterion.id]: {
                                                          status: current[criterion.id]?.status ?? "unverified",
                                                          note,
                                                          updatedAt: new Date().toISOString(),
                                                        },
                                                      }));
                                                      setStrategySaveMessage(null);
                                                    }}
                                                    placeholder={L("Evidence or review note…", "Evidencia o nota de revisión…")}
                                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400"
                                                  />
                                                </div>
                                              )}
                                            </td>
                                            <td className="px-3 py-3 text-slate-400">
                                              {criterion.source === "broker"
                                                ? L("Broker audit", "Audit del broker")
                                                : criterion.source === "trader"
                                                  ? L("Trader review", "Revisión del trader")
                                                  : L("System", "Sistema")}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <p className="mt-3 text-xs leading-relaxed text-slate-500">
                                    {L(
                                      "The adherence score uses only verified criteria. Evidence coverage shows how much of the strategy could actually be proven, so unknowns never become invented passes or failures.",
                                      "El score de adherencia usa solo criterios verificados. La cobertura indica cuánto se pudo probar realmente, para que lo desconocido nunca se convierta en cumplimientos o fallas inventadas."
                                    )}
                                  </p>
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </>
                      )}
                    </section>
                  )}

                  {selectedTrade && (
                    <section className="grid gap-4 xl:grid-cols-4">
                      <ReviewMetricCard
                        label={L("Trade identity", "Identidad del trade")}
                        value={`${L("Trade", "Trade")} ${selectedTrade.sequence} · ${selectedTrade.symbol} · ${selectedTrade.entryTime} → ${selectedTrade.exitTime}`}
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
                                : auditEventWindow
                                ? `${auditEventWindow.matched_events}/${auditEventWindow.total_events_before_window} ${L("events", "eventos")}`
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
                              {canAccessAudit && selectedTrade.instrumentKeyAmbiguous ? (
                                <p className="mt-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-100">
                                  {L(
                                    "Option contract is ambiguous, so broker audit may fall back to symbol-level matching.",
                                    "El contrato de opcion esta ambiguo; el audit del broker puede caer a matching por simbolo."
                                  )}
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
                              timeframe={underlyingState.effectiveTimeframe ?? timeframe}
                              entryPoints={entryPoints}
                              exitPoints={exitPoints}
                              auditPoints={auditChartPoints}
                              timeMode={timeMode}
                              entryColor="#22c55e"
                              exitColor="#38bdf8"
                              entryLabel={L("Entry", "Entrada")}
                              exitLabel={L("Exit", "Salida")}
                              auditLabel={L("Broker", "Bróker")}
                              zoomInLabel={L("Zoom in", "Acercar")}
                              zoomOutLabel={L("Zoom out", "Alejar")}
                              zoomResetLabel={L("Reset zoom", "Reiniciar zoom")}
                              emptyLabel={L("No chart data for this symbol/timeframe.", "No hay datos de chart para este símbolo/timeframe.")}
                              dailyMarkerWarningLabel={L(
                                "Exact event times are hidden because only daily candles are available. Choose an intraday timeframe to place each event on its real candle.",
                                "Las horas exactas están ocultas porque solo hay velas diarias. Elige un timeframe intradía para colocar cada evento en su vela real."
                              )}
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
                                  timeframe={contractState.effectiveTimeframe ?? timeframe}
                                  entryPoints={entryPoints}
                                  exitPoints={exitPoints}
                                  auditPoints={auditChartPoints}
                                  timeMode={timeMode}
                                  entryColor="#22c55e"
                                  exitColor="#38bdf8"
                                  entryLabel={L("Entry", "Entrada")}
                                  exitLabel={L("Exit", "Salida")}
                                  auditLabel={L("Broker", "Bróker")}
                                  zoomInLabel={L("Zoom in", "Acercar")}
                                  zoomOutLabel={L("Zoom out", "Alejar")}
                                  zoomResetLabel={L("Reset zoom", "Reiniciar zoom")}
                                  emptyLabel={L("No chart data for this symbol/timeframe.", "No hay datos de chart para este símbolo/timeframe.")}
                                  dailyMarkerWarningLabel={L(
                                    "Exact event times are hidden because only daily candles are available. Choose an intraday timeframe to place each event on its real candle.",
                                    "Las horas exactas están ocultas porque solo hay velas diarias. Elige un timeframe intradía para colocar cada evento en su vela real."
                                  )}
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
                                {auditWindowHasNoMatches ? (
                                  <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
                                    <p className="font-semibold">
                                      {L(
                                        "Broker events exist, but none matched this selected trade window.",
                                        "Hay eventos del broker, pero ninguno cayó dentro de la ventana de este trade seleccionado."
                                      )}
                                    </p>
                                    <p className="mt-1 text-xs text-amber-100/75">
                                      {L(
                                        "Check the execution record entry/exit times or open the full audit to inspect the broader day.",
                                        "Verifica las horas de entrada/salida del registro de ejecución o abre el audit completo para inspeccionar el día más amplio."
                                      )}
                                    </p>
                                  </div>
                                ) : null}

                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                  <ReviewMetricCard
                                    label={L("OCO used", "OCO usado")}
                                    value={auditMetrics ? yesNo(!!auditMetrics.oco_used) : "—"}
                                    tone="default"
                                  />
                                  <ReviewMetricCard
                                    label={L("Stop present", "Stop presente")}
                                    value={auditMetrics ? yesNo(!!auditMetrics.stop_present) : "—"}
                                    tone="default"
                                  />
                                  <ReviewMetricCard
                                    label={L("Time to first stop", "Tiempo al primer stop")}
                                    value={formatSecondsForReview(auditMetrics?.time_to_first_stop_sec ?? null)}
                                    tone="default"
                                  />
                                  <ReviewMetricCard
                                    label={L("Manual market exit", "Salida manual")}
                                    value={auditMetrics ? yesNo(!!auditMetrics.manual_market_exit) : "—"}
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
                                  {auditEventWindow ? (
                                    <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-3 text-xs">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="font-semibold text-sky-100">
                                          {L("Audited trade window", "Ventana auditada del trade")}
                                        </p>
                                        <span className="rounded-full border border-sky-300/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-200">
                                          {auditEventWindow.time_zone === "America/New_York" ? "ET" : auditEventWindow.time_zone}
                                        </span>
                                      </div>
                                      <p className="mt-2 text-slate-200">
                                        {formatAuditWindowTimeLabel(auditEventWindow.from_utc, auditEventWindow.time_zone)} →{" "}
                                        {formatAuditWindowTimeLabel(auditEventWindow.to_utc, auditEventWindow.time_zone)}
                                      </p>
                                      <div className="mt-2 grid gap-1 text-slate-400 sm:grid-cols-2">
                                        <p>
                                          {L("Buffer", "Margen")}: {auditEventWindow.pre_buffer_minutes}m{" "}
                                          {L("before", "antes")} · {auditEventWindow.post_buffer_minutes}m{" "}
                                          {L("after", "después")}
                                        </p>
                                        <p>
                                          {L("Events used", "Eventos usados")}: {auditEventWindow.matched_events}/
                                          {auditEventWindow.total_events_before_window}
                                        </p>
                                      </div>
                                    </div>
                                  ) : null}
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
                                "When you ask Business AI Coach from here, it receives the selected trade, chart window, execution details, and the execution audit when available.",
                                "Cuando preguntas al Coach Empresarial IA desde aquí, recibe el trade seleccionado, la ventana del chart, el detalle de ejecución y la auditoría cuando existe."
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
                                  <div>{L("OCO", "OCO")}: {yesNo(!!tradeSeq.oco_used)}</div>
                                  <div>{L("Manual MKT exit", "Salida MKT manual")}: {yesNo(!!tradeSeq.manual_market_exit)}</div>
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
                                    {L("No active rules found in the Trading Business Plan.", "No hay reglas activas en el Plan de Empresa de Trading.")}
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
                      <p className="mt-2 max-w-3xl text-sm text-slate-400">
                        {L(
                          "These are the broker events used to explain the deterministic audit: stops, cancels/replaces, and fills inside the selected trade window.",
                          "Estos son los eventos del broker usados para explicar la auditoría determinística: stops, cancelaciones/reemplazos y fills dentro de la ventana del trade."
                        )}
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
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-50">
          <TopNav />
          <div className="flex min-h-[60vh] items-center justify-center px-6">
            <p className="text-slate-400 text-sm">
              {lang === "es" ? "Cargando revisión estratégica…" : "Loading back-study…"}
            </p>
          </div>
        </main>
      }
    >
      <BackStudyPageInner />
    </Suspense>
  );
}
