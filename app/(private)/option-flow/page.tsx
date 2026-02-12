"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { hasEntitlement } from "@/lib/entitlementsSupabase";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type ProviderId = "unusualwhales" | "optionstrat" | "cheddarflow" | "quantdata" | "other";

type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  title?: string;
  body?: string;
  meta?: string;
  html?: string;
  keyTrades?: any[];
};

type ExpirationStrike = {
  strike?: number;
  type?: string;
  prints?: number;
  sizeTotal?: number;
  premiumTotal?: string;
  oiMax?: number;
  side?: string;
  read?: string;
};

type ExpirationBucket = {
  expiry?: string;
  tenor?: string;
  range?: string;
  strikes?: ExpirationStrike[];
  notes?: string;
  keyTakeaways?: string[];
};

type SqueezeScenario = {
  condition?: string;
  candidates?: string[];
  brakes?: string;
};

type AnalysisData = {
  summary?: string;
  flowBias?: string | null;
  keyLevels?: { price?: number; label?: string; reason?: string; side?: string }[];
  keyTrades?: any[];
  expirations?: ExpirationBucket[];
  contractsWithPotential?: {
    gamma?: string[];
    directional?: string[];
    stress?: string[];
  };
  positioningStress?: {
    contract?: string;
    underlying?: string;
    expiry?: string;
    strike?: number;
    type?: string;
    firstTime?: string | null;
    lastTime?: string | null;
    firstOi?: number;
    lastOi?: number;
    firstPrice?: number;
    lastPrice?: number;
    oiChange?: number;
    priceChange?: number;
  }[];
  squeezeScenarios?: {
    upside?: SqueezeScenario;
    downside?: SqueezeScenario;
  };
  tradingPlan?: {
    headline?: string;
    steps?: string[];
    invalidation?: string;
    risk?: string;
  };
  riskNotes?: string[];
  suggestedFocus?: string[];
  dataQuality?: {
    totalRows?: number;
    withSide?: number;
    withPremium?: number;
    withOi?: number;
    latestExpiry?: string | null;
    latestTimestamp?: string | null;
    isStale?: boolean;
  };
  meta?: {
    underlying?: string;
    provider?: string;
    tradeIntent?: string;
    previousClose?: number | null;
    createdAt?: string;
  };
};

type OptionFlowArchive = {
  id: string;
  title?: string | null;
  file_path?: string | null;
  created_at: string;
  expires_at: string;
};

type PastedShot = {
  id: string;
  file: File;
  preview: string;
};

type TradeIntent = "0dte" | "daytrade" | "scalp" | "swing";

type ParseProgress = {
  percent: number;
  scanned: number;
  matched: number;
};

type Lang = "en" | "es";
const LOCALE_TAG: Record<Lang, string> = {
  en: "en-US",
  es: "es-ES",
};

const MAX_ROWS_BASE = 400;
const MAX_ROWS_WITH_IMAGES = 150;
const MAX_SCREENSHOTS_FOR_MODEL = 2;
const MAX_CSV_MB = 12;
const MAX_CSV_BYTES = MAX_CSV_MB * 1024 * 1024;

const ROW_KEYWORDS = [
  "underlying",
  "underlying symbol",
  "underlier",
  "underlier symbol",
  "symbol",
  "ticker",
  "root",
  "root symbol",
  "option symbol",
  "contract",
  "expiry",
  "expiration",
  "expiration date",
  "exp date",
  "exp",
  "strike",
  "strike price",
  "type",
  "option type",
  "put",
  "call",
  "call/put",
  "put/call",
  "cp",
  "side",
  "trade side",
  "aggressor",
  "at",
  "print",
  "premium",
  "notional",
  "value",
  "price",
  "trade price",
  "bid",
  "ask",
  "size",
  "qty",
  "quantity",
  "volume",
  "open interest",
  "oi",
  "timestamp",
  "date",
  "time",
  "trade",
  "delta",
  "iv",
  "implied vol",
];

const PROVIDERS: { id: ProviderId; label: string; hint: string }[] = [
  { id: "unusualwhales", label: "Unusual Whales", hint: "Unusual Whales CSV export" },
  { id: "optionstrat", label: "Option Strat", hint: "OptionStrat flow export" },
  { id: "cheddarflow", label: "Cheddar Flow", hint: "Cheddar Flow CSV export" },
  { id: "quantdata", label: "Quantdata", hint: "Quantdata flow export" },
  { id: "other", label: "Other", hint: "Generic CSV with options flow data" },
];

type ProviderColumnMap = Record<string, string[]>;

const COMMON_FLOW_COLUMNS: ProviderColumnMap = {
  underlying: [
    "underlying",
    "underlying_symbol",
    "underlying symbol",
    "underlier",
    "underlier_symbol",
    "underlier symbol",
    "root",
    "root_symbol",
    "root symbol",
    "ticker",
    "symbol",
  ],
  symbol: ["symbol", "option_symbol", "option symbol", "contract", "ticker", "root"],
  expiry: ["expiry", "expiration", "expiration date", "exp", "exp date", "date"],
  strike: ["strike", "strike price", "strk"],
  type: ["type", "option type", "call_put", "put_call", "call/put", "put/call", "cp"],
  side: ["side", "trade side", "at", "aggressor", "print"],
  size: ["size", "qty", "quantity", "volume"],
  premium: ["premium", "notional", "value", "cost", "total premium"],
  oi: ["oi", "open interest"],
  bid: ["bid", "bid price"],
  ask: ["ask", "ask price"],
  trade: ["trade", "trade_price", "trade price", "price", "fill", "executed"],
  time: ["time", "timestamp", "date/time", "datetime"],
};

const PROVIDER_COLUMN_MAP: Record<ProviderId, ProviderColumnMap> = {
  unusualwhales: COMMON_FLOW_COLUMNS,
  optionstrat: COMMON_FLOW_COLUMNS,
  cheddarflow: COMMON_FLOW_COLUMNS,
  quantdata: COMMON_FLOW_COLUMNS,
  other: {},
};

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSymbol(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function extractUnderlyingFromValue(raw: string): string | null {
  const cleaned = normalizeSymbol(raw);
  if (!cleaned) return null;
  const optionMatch = cleaned.match(/^([A-Z]+W?)(\d{6})([CP])(\d+(?:\.\d+)?)$/);
  if (optionMatch) return optionMatch[1];
  const prefixMatch = cleaned.match(/^([A-Z]{1,8}W?)/);
  if (prefixMatch) return prefixMatch[1];
  return null;
}

function findUnderlyingInRow(row: Record<string, any>): string | null {
  const keys = Object.keys(row);
  const candidateKeys = [
    "underlying",
    "underlying_symbol",
    "underlying symbol",
    "ticker",
    "symbol",
    "root",
    "stock",
    "asset",
    "instrument",
    "security",
    "ticker symbol",
    "underlyingticker",
    "underlying ticker",
    "product",
    "contract",
    "option",
  ];

  for (const key of keys) {
    const lowered = key.toLowerCase();
    if (!candidateKeys.some((k) => lowered.includes(k))) continue;
    const value = row[key];
    if (value == null) continue;
    const raw = String(value);
    const extracted = extractUnderlyingFromValue(raw);
    if (extracted) return extracted;
  }

  // fallback: try any string value that looks like a symbol
  for (const key of keys) {
    const value = row[key];
    if (typeof value !== "string") continue;
    const extracted = extractUnderlyingFromValue(value);
    if (extracted) return extracted;
  }
  return null;
}

function filterRowsByUnderlying(rows: any[], underlying: string): any[] {
  const target = normalizeSymbol(underlying);
  if (!target) return rows;
  return rows.filter((row) => {
    const match = findUnderlyingInRow(row);
    if (!match) return false;
    const candidate = normalizeSymbol(match);
    if (!candidate) return false;
    if (candidate === target) return true;
    if (candidate.startsWith(target)) return true;
    if (target.startsWith(candidate)) return true;
    return false;
  });
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatTemplate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const ALLOWED_HTML_TAGS = new Set([
  "h3",
  "h4",
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "div",
  "span",
  "br",
  "hr",
  "img",
  "a",
]);

const ALLOWED_HTML_ATTRS = new Set([
  "href",
  "target",
  "rel",
  "src",
  "alt",
  "width",
  "height",
  "colspan",
  "rowspan",
  "style",
]);

const ALLOWED_STYLE_PROPS = new Set([
  "width",
  "border",
  "border-bottom",
  "border-collapse",
  "margin",
  "margin-top",
  "margin-bottom",
  "padding",
  "text-align",
  "color",
  "background",
  "background-color",
  "font-weight",
  "font-size",
  "line-height",
]);

function sanitizeStyle(styleValue: string): string {
  return styleValue
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawProp, ...rest] = part.split(":");
      const prop = rawProp?.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (!prop || !value) return "";
      if (!ALLOWED_STYLE_PROPS.has(prop)) return "";
      if (/expression\s*\(|javascript\s*:/i.test(value)) return "";
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join("; ");
}

function isSafeUrl(value: string) {
  return /^(?:(?:https?|mailto|tel):|data:image\/)/i.test(value);
}

function sanitizeOptionFlowHtml(html: string) {
  if (typeof window === "undefined") return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
    const nodes: Element[] = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode as Element);
    }

    nodes.forEach((node) => {
      const tag = node.tagName.toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(tag)) {
        const text = doc.createTextNode(node.textContent || "");
        node.replaceWith(text);
        return;
      }

      [...node.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (!ALLOWED_HTML_ATTRS.has(name)) {
          node.removeAttribute(attr.name);
          return;
        }

        if ((name === "href" || name === "src") && !isSafeUrl(attr.value)) {
          node.removeAttribute(attr.name);
          return;
        }

        if (name === "style") {
          const cleanStyle = sanitizeStyle(attr.value);
          if (cleanStyle) {
            node.setAttribute("style", cleanStyle);
          } else {
            node.removeAttribute("style");
          }
        }
      });

      if (tag === "a") {
        const target = node.getAttribute("target");
        if (target === "_blank") {
          node.setAttribute("rel", "noopener noreferrer");
        }
      }
    });

    return doc.body.innerHTML;
  } catch {
    return escapeHtml(html);
  }
}

function extractPlanLines(html?: string | null): string[] {
  if (!html) return [];
  try {
    const container = document.createElement("div");
    container.innerHTML = html;
    const lines: string[] = [];
    const nodes = container.querySelectorAll("h1,h2,h3,h4,p,li");
    nodes.forEach((node) => {
      const text = node.textContent?.trim();
      if (!text) return;
      if (node.tagName.toLowerCase() === "li") {
        lines.push(`• ${text}`);
      } else {
        lines.push(text);
      }
    });
    return lines.filter(Boolean);
  } catch {
    return [];
  }
}

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Image load failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadSvgAsPngDataUrl(
  url: string,
  width: number,
  height: number,
  scale = 3
): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const svgText = await res.text();
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const blobUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.src = blobUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG load failed"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(blobUrl);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function cropImageDataUrl(
  dataUrl: string
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image load failed"));
    });
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const { data } = imageData;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const idx = (y * width + x) * 4;
        if (data[idx + 3] > 10) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) {
      return { dataUrl, width, height };
    }
    const pad = 4;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const cropWidth = Math.max(1, maxX - minX + 2);
    const cropHeight = Math.max(1, maxY - minY + 2);
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) return null;
    cropCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return { dataUrl: cropCanvas.toDataURL("image/png"), width: cropWidth, height: cropHeight };
  } catch {
    return null;
  }
}

async function loadLogoData() {
  const png = await loadImageDataUrl("/neurotrade-logo.png");
  if (!png) return null;
  return await cropImageDataUrl(png);
}

function fitSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function parsePremiumValue(raw?: string): number {
  if (!raw) return 0;
  const cleaned = raw
    .toString()
    .replace(/[,\s]/g, "")
    .replace(/~|\$/g, "")
    .toUpperCase();
  const match = cleaned.match(/([0-9.]+)([KMB])?/);
  if (!match) return 0;
  const num = Number(match[1]);
  const mult =
    match[2] === "B" ? 1_000_000_000 : match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  return num * mult;
}

function normalizeSide(value?: string): "ASK" | "BID" | "MIXED" | "UNKNOWN" {
  if (!value) return "UNKNOWN";
  const upper = value.toUpperCase();
  if (upper.includes("ASK")) return "ASK";
  if (upper.includes("BID")) return "BID";
  if (upper.includes("MID") || upper.includes("MIX")) return "MIXED";
  return "UNKNOWN";
}

function collectFlowBuckets(expirations?: ExpirationBucket[]) {
  const buckets = {
    callsAsk: [] as ExpirationStrike[],
    putsAsk: [] as ExpirationStrike[],
    callsBid: [] as ExpirationStrike[],
    putsBid: [] as ExpirationStrike[],
    mixed: [] as ExpirationStrike[],
  };
  if (!expirations?.length) return buckets;
  expirations.forEach((exp) => {
    (exp.strikes ?? []).forEach((row) => {
      const side = normalizeSide(row.side || row.read);
      const type = (row.type || "").toUpperCase();
      if (side === "ASK" && type === "C") buckets.callsAsk.push(row);
      else if (side === "ASK" && type === "P") buckets.putsAsk.push(row);
      else if (side === "BID" && type === "C") buckets.callsBid.push(row);
      else if (side === "BID" && type === "P") buckets.putsBid.push(row);
      else buckets.mixed.push(row);
    });
  });
  return buckets;
}

function deriveKeyLevelsFromExpirations(
  expirations: ExpirationBucket[],
  limit = 6,
  lang: Lang = "en",
  spot?: number | null
): { price?: number; label?: string; reason?: string; side?: string }[] {
  const isEs = lang === "es";
  const rows = expirations.flatMap((exp) => exp.strikes ?? []);
  if (!rows.length) return [];
  let filteredRows = rows;
  if (Number.isFinite(Number(spot))) {
    const strikes = Array.from(
      new Set(
        rows
          .map((row) => Number(row.strike))
          .filter((n) => Number.isFinite(n))
      )
    ).sort((a, b) => a - b);
    const spotVal = Number(spot);
    const below = strikes.filter((s) => s <= spotVal).slice(-10);
    const above = strikes.filter((s) => s >= spotVal).slice(0, 10);
    const allowed = new Set([...below, ...above]);
    filteredRows = rows.filter((row) => allowed.has(Number(row.strike)));
  }
  const scored = filteredRows
    .map((row) => {
      const premium = parsePremiumValue(row.premiumTotal);
      const size = Number(row.sizeTotal ?? 0);
      const prints = Number(row.prints ?? 0);
      const score =
        premium +
        (Number.isFinite(size) ? size * 100 : 0) +
        (Number.isFinite(prints) ? prints * 10 : 0);
      return { row, score };
    })
    .filter((item) => Number.isFinite(item.row?.strike))
    .sort((a, b) => b.score - a.score);

  const levels: { price?: number; label?: string; reason?: string; side?: string }[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    const row = item.row as ExpirationStrike;
    const strike = Number(row.strike);
    const side = normalizeSide(row.side || row.read);
    const type = (row.type || "").toUpperCase();
    const key = `${strike}|${side}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let label = "pivot";
    if (side === "ASK" && type === "C") label = "demand";
    else if (side === "ASK" && type === "P") label = "put demand";
    else if (side === "BID" && type === "P") label = "put wall";
    else if (side === "BID" && type === "C") label = "call supply";
    levels.push({
      price: strike,
      label,
      side,
      reason: isEs ? "Acumulación de prints en el strike." : "Concentrated prints at the strike.",
    });
    if (levels.length >= limit) break;
  }
  return levels;
}

async function renderPremiumBarChartDataUrl(
  strikes: { strike?: number; premiumTotal?: string }[],
  lang: Lang = "en"
): Promise<string | null> {
  const isEs = lang === "es";
  if (!strikes?.length) return null;
  const rows = strikes
    .map((row) => ({
      strike: row.strike,
      premium: parsePremiumValue(row.premiumTotal),
    }))
    .filter((row) => Number.isFinite(row.premium) && row.premium > 0 && row.strike != null)
    .sort((a, b) => b.premium - a.premium)
    .slice(0, 8);
  if (!rows.length) return null;

  const width = 820;
  const height = 280;
  const padding = { left: 50, right: 30, top: 24, bottom: 40 };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const maxVal = Math.max(...rows.map((r) => r.premium)) || 1;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = chartWidth / rows.length - 12;

  ctx.fillStyle = "#0f172a";
  ctx.font = "12px Helvetica";
  ctx.fillText(
    isEs ? "Concentración de premium (Top strikes)" : "Premium concentration (Top strikes)",
    padding.left,
    padding.top - 8
  );

  rows.forEach((row, idx) => {
    const x = padding.left + idx * (barWidth + 12);
    const barHeight = (row.premium / maxVal) * chartHeight;
    const y = padding.top + (chartHeight - barHeight);
    ctx.fillStyle = "#0ea5e9";
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#0f172a";
    ctx.font = "10px Helvetica";
    ctx.fillText(String(row.strike), x, height - 18);
  });

  return canvas.toDataURL("image/png");
}

async function renderLevelsMapDataUrl(
  levels: { price: number; side?: string }[],
  lang: Lang = "en"
): Promise<string | null> {
  const isEs = lang === "es";
  const clean = levels.filter((lvl) => Number.isFinite(lvl.price));
  if (!clean.length) return null;
  const width = 820;
  const height = 160;
  const padding = { left: 60, right: 40, top: 24, bottom: 30 };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const prices = clean.map((lvl) => lvl.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, height / 2);
  ctx.lineTo(width - padding.right, height / 2);
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = "12px Helvetica";
  ctx.fillText(
    isEs ? "Mapa visual de niveles clave" : "Key Levels Visual Map",
    padding.left,
    padding.top - 8
  );

  clean.forEach((lvl) => {
    const side = normalizeSide(lvl.side);
    const color =
      side === "BID" ? "#2563eb" : side === "ASK" ? "#16a34a" : "#94a3b8";
    const x =
      padding.left + ((lvl.price - min) / range) * (width - padding.left - padding.right);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, height / 2 - 20);
    ctx.lineTo(x, height / 2 + 20);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "10px Helvetica";
    ctx.fillText(lvl.price.toFixed(0), x - 10, height / 2 - 26);
  });

  return canvas.toDataURL("image/png");
}

async function renderPriceChartDataUrl(
  symbol: string,
  levels: { price: number; side?: string }[],
  lang: Lang = "en"
): Promise<string | null> {
  if (!symbol) return null;
  const isEs = lang === "es";
  const upper = symbol.trim().toUpperCase();
  const symbolMap: Record<string, string> = {
    SPX: "^SPX",
    SPXW: "^SPX",
    NDX: "^NDX",
    NDXW: "^NDX",
    RUT: "^RUT",
    VIX: "^VIX",
    ES: "ES=F",
    NQ: "NQ=F",
    YM: "YM=F",
    RTY: "RTY=F",
  };
  const yahooSymbol = symbolMap[upper] ?? (upper.startsWith("^") ? upper : upper);
  try {
    const res = await fetch(
      `/api/yahoo-chart?symbol=${encodeURIComponent(yahooSymbol)}&range=1mo&interval=1d`
    );
    if (!res.ok) return null;
    const body = await res.json();
    const candles = Array.isArray(body?.candles) ? body.candles : [];
    if (!candles.length) return null;

    const width = 820;
    const height = 360;
    const padding = { left: 50, right: 70, top: 24, bottom: 30 };
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const closes = candles
      .map((c: any) => Number(c.close))
      .filter((n: number) => Number.isFinite(n));
    const lastClose = closes[closes.length - 1];
    let filteredLevels = levels;
    if (Number.isFinite(lastClose)) {
      filteredLevels = levels.filter(
        (level) =>
          Number.isFinite(level.price) && Math.abs(Number(level.price) - Number(lastClose)) <= 500
      );
    }
    const levelPrices = filteredLevels
      .map((l) => l.price)
      .filter((n: number) => Number.isFinite(n));
    const allPrices = closes.concat(levelPrices.length ? levelPrices : []);
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    const range = max - min || 1;

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const xForIndex = (idx: number) =>
      padding.left + (idx / Math.max(1, closes.length - 1)) * plotWidth;
    const yForPrice = (price: number) =>
      padding.top + ((max - price) / range) * plotHeight;

    // grid
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (i / 4) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // price line
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    closes.forEach((price: number, idx: number) => {
      const x = xForIndex(idx);
      const y = yForPrice(price);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (Number.isFinite(lastClose)) {
      const yLast = yForPrice(lastClose);
      ctx.strokeStyle = "rgba(15,23,42,0.4)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yLast);
      ctx.lineTo(width - padding.right, yLast);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#0f172a";
      ctx.font = "10px Inter, Arial";
      ctx.fillText(
        `${isEs ? "Último" : "Last"} ${lastClose.toFixed(2)}`,
        width - padding.right + 6,
        yLast + 3
      );
    }

    // levels
    filteredLevels.forEach((level) => {
      if (!Number.isFinite(level.price)) return;
      const side = (level.side || "").toUpperCase();
      let color = "rgba(148,163,184,0.7)";
      if (side.includes("BID")) color = "rgba(59,130,246,0.9)";
      if (side.includes("ASK") || side.includes("CALL")) color = "rgba(34,197,94,0.9)";
      const y = yForPrice(level.price);
      ctx.strokeStyle = color;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = "11px Inter, Arial";
      ctx.fillText(level.price.toFixed(2), width - padding.right + 6, y + 4);
    });

    // labels
    ctx.fillStyle = "#0f172a";
    ctx.font = "12px Inter, Arial";
    ctx.fillText(
      `${symbol.toUpperCase()} (${isEs ? "cierres diarios" : "daily closes"})`,
      padding.left,
      padding.top - 8
    );

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function compressScreenshot(file: File, maxWidth = 1400, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Screenshot read failed"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Screenshot load failed"));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function compactRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  const keys = Object.keys(row);
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (!ROW_KEYWORDS.some((kw) => lower.includes(kw))) continue;
    const value = row[key];
    if (value === "" || value == null) continue;
    out[key] = value;
  }
  if (!Object.keys(out).length) {
    // fallback: keep first 8 fields
    keys.slice(0, 8).forEach((key) => {
      const value = row[key];
      if (value === "" || value == null) return;
      out[key] = value;
    });
  }
  return out;
}

function pickValueByAliases(row: Record<string, any>, aliases: string[]) {
  const entries = Object.entries(row);
  const exact = aliases.find((alias) =>
    entries.some(([key]) => key.toLowerCase() === alias)
  );
  if (exact) {
    const match = entries.find(([key]) => key.toLowerCase() === exact);
    return match ? match[1] : undefined;
  }
  const fuzzy = aliases.find((alias) =>
    entries.some(([key]) => key.toLowerCase().includes(alias))
  );
  if (fuzzy) {
    const match = entries.find(([key]) => key.toLowerCase().includes(fuzzy));
    return match ? match[1] : undefined;
  }
  return undefined;
}

function normalizeRowsByProvider(rows: any[], providerId: ProviderId): any[] {
  const map = PROVIDER_COLUMN_MAP[providerId];
  if (!map || Object.keys(map).length === 0) return rows;
  return rows.map((row) => {
    const normalized: Record<string, any> = { ...row };
    const lowerKeys = new Set(Object.keys(row).map((k) => k.toLowerCase()));
    Object.entries(map).forEach(([canonical, aliases]) => {
      if (lowerKeys.has(canonical.toLowerCase())) return;
      const value = pickValueByAliases(row, aliases.map((a) => a.toLowerCase()));
      if (value !== undefined && value !== null && value !== "") {
        normalized[canonical] = value;
      }
    });
    return normalized;
  });
}

async function parseCsvWithWorker(
  file: File,
  underlying: string,
  onProgress: (progress: ParseProgress) => void,
  maxRows = 2000
): Promise<{ rows: any[]; scanned: number; matched: number }> {
  return new Promise((resolve, reject) => {
    const workerCode = `
      const normalizeSymbol = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const HEADER_HINTS = [
        "date",
        "time",
        "underlying",
        "symbol",
        "ticker",
        "strike",
        "type",
        "expiry",
        "exp",
        "side",
        "bid",
        "ask",
        "premium",
        "size",
        "volume",
        "open interest",
        "oi",
      ];
      const scoreHeader = (cols) => {
        const lower = cols.map((c) => String(c || "").trim().toLowerCase());
        let score = 0;
        for (const col of lower) {
          if (!col) continue;
          if (HEADER_HINTS.some((hint) => col.includes(hint))) score += 1;
        }
        return score;
      };
      const extractUnderlyingFromValue = (raw) => {
        const cleaned = normalizeSymbol(String(raw || ""));
        if (!cleaned) return null;
        const opt = cleaned.match(/^([A-Z]+W?)(\\d{6})([CP])(\\d+(?:\\.\\d+)?)$/);
        if (opt) return opt[1];
        const prefix = cleaned.match(/^([A-Z]{1,8}W?)/);
        return prefix ? prefix[1] : null;
      };
      const findUnderlying = (row) => {
        const keys = Object.keys(row || {});
        const candidates = [
          "underlying",
          "underlying_symbol",
          "underlying symbol",
          "ticker",
          "symbol",
          "root",
          "stock",
          "asset",
          "instrument",
          "security",
          "ticker symbol",
          "underlyingticker",
          "underlying ticker",
          "product",
          "contract",
          "option",
        ];
        for (const key of keys) {
          const lowered = key.toLowerCase();
          if (!candidates.some((c) => lowered.includes(c))) continue;
          const extracted = extractUnderlyingFromValue(row[key]);
          if (extracted) return extracted;
        }
        for (const key of keys) {
          const value = row[key];
          if (typeof value !== "string") continue;
          const extracted = extractUnderlyingFromValue(value);
          if (extracted) return extracted;
        }
        return null;
      };
      const parseLine = (line) => {
        const out = [];
        let cur = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (ch === "," && !inQuotes) {
            out.push(cur);
            cur = "";
          } else {
            cur += ch;
          }
        }
        out.push(cur);
        return out;
      };
      self.onmessage = async (event) => {
        const { file, underlying, maxRows } = event.data;
        const decoder = new TextDecoder();
        const chunkSize = 1024 * 512;
        let offset = 0;
        let header = null;
        let pendingHeader = null;
        let pendingScore = 0;
        let buffer = "";
        let rows = [];
        let scanned = 0;
        let matched = 0;
        const target = underlying ? normalizeSymbol(underlying) : "";
        while (offset < file.size && rows.length < maxRows) {
          const slice = file.slice(offset, offset + chunkSize);
          const buf = await slice.arrayBuffer();
          buffer += decoder.decode(buf, { stream: true });
          offset += chunkSize;

          let lines = buffer.split(/\\r?\\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const cols = parseLine(line);
            if (!header) {
              const cleaned = cols.map((c) => (c ?? "").trim());
              const nonEmpty = cleaned.filter((c) => c);
              if (nonEmpty.length <= 1) {
                continue;
              }
              const score = scoreHeader(cleaned);
              if (!pendingHeader) {
                pendingHeader = cleaned;
                pendingScore = score;
                continue;
              }
              if (score >= Math.max(3, pendingScore + 2)) {
                header = cleaned;
                pendingHeader = null;
                continue;
              }
              header = pendingHeader;
              pendingHeader = null;
              // fall through to treat this line as data row
            }
            const row = {};
            header.forEach((key, idx) => {
              row[key] = cols[idx] ?? "";
            });
            scanned += 1;
            if (target) {
              const found = findUnderlying(row);
              if (!found) continue;
              const candidate = normalizeSymbol(found);
              if (!candidate) continue;
              if (candidate === target || candidate.startsWith(target) || target.startsWith(candidate)) {
                matched += 1;
                rows.push(row);
              }
            } else {
              matched += 1;
              rows.push(row);
            }
            if (rows.length >= maxRows) break;
          }
          const percent = Math.min(100, Math.round((offset / file.size) * 100));
          self.postMessage({ type: "progress", percent, scanned, matched });
        }
        if (buffer && header && rows.length < maxRows) {
          const cols = parseLine(buffer);
          if (cols.length) {
            const row = {};
            header.forEach((key, idx) => {
              row[key] = cols[idx] ?? "";
            });
            scanned += 1;
            if (target) {
              const found = findUnderlying(row);
              if (found) {
                const candidate = normalizeSymbol(found);
                if (candidate && (candidate === target || candidate.startsWith(target) || target.startsWith(candidate))) {
                  matched += 1;
                  rows.push(row);
                }
              }
            } else {
              matched += 1;
              rows.push(row);
            }
          }
        }
        self.postMessage({ type: "complete", rows, scanned, matched });
      };
    `;

    const blob = new Blob([workerCode], { type: "text/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    worker.onmessage = (event) => {
      if (event.data?.type === "progress") {
        onProgress({
          percent: event.data.percent || 0,
          scanned: event.data.scanned || 0,
          matched: event.data.matched || 0,
        });
        return;
      }
      if (event.data?.type === "complete") {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        resolve({
          rows: event.data.rows || [],
          scanned: event.data.scanned || 0,
          matched: event.data.matched || 0,
        });
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      reject(err);
    };
    worker.postMessage({ file, underlying, maxRows });
  });
}

async function parseExcelFile(
  file: File,
  maxRows = 2000
): Promise<{ rows: any[]; scanned: number; matched: number }> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
  const trimmed = grid.filter((row) =>
    Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== "")
  );
  if (!trimmed.length) {
    return { rows: [], scanned: 0, matched: 0 };
  }

  const scoreHeader = (row: any[]) => {
    const hints = [
      "date",
      "time",
      "underlying",
      "symbol",
      "ticker",
      "strike",
      "type",
      "expiry",
      "exp",
      "side",
      "bid",
      "ask",
      "premium",
      "size",
      "volume",
      "open interest",
      "oi",
    ];
    let score = 0;
    row.forEach((cell) => {
      const text = String(cell ?? "").trim().toLowerCase();
      if (!text) return;
      if (hints.some((hint) => text.includes(hint))) score += 1;
    });
    return score;
  };

  let headerRow = trimmed[0] ?? [];
  let dataRows = trimmed.slice(1);

  // Quantdata exports sometimes include a title row before headers.
  if (headerRow.length <= 1 && dataRows.length) {
    headerRow = dataRows[0] ?? [];
    dataRows = dataRows.slice(1);
  }
  if (dataRows.length) {
    const baseScore = scoreHeader(headerRow);
    const nextScore = scoreHeader(dataRows[0]);
    if (nextScore >= Math.max(3, baseScore + 2)) {
      headerRow = dataRows[0] ?? headerRow;
      dataRows = dataRows.slice(1);
    }
  }

  const header = headerRow.map((cell) => String(cell ?? "").trim());
  const objects = dataRows.map((row) => {
    const out: Record<string, any> = {};
    header.forEach((key, idx) => {
      if (!key) return;
      out[key] = row[idx] ?? "";
    });
    return out;
  });

  const sliced = objects.slice(0, Math.max(1, maxRows));
  return {
    rows: sliced,
    scanned: objects.length,
    matched: sliced.length,
  };
}

async function parseFlowFile(
  file: File,
  providerId: ProviderId,
  underlying: string,
  onProgress: (progress: ParseProgress) => void,
  maxRows = 2000
): Promise<{ rows: any[]; scanned: number; matched: number }> {
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
  if (isCsv) {
    const parsed = await parseCsvWithWorker(file, underlying, onProgress, maxRows);
    const normalized = normalizeRowsByProvider(parsed.rows, providerId);
    return { ...parsed, rows: normalized };
  }
  if (isExcel) {
    onProgress({ percent: 10, scanned: 0, matched: 0 });
    const parsed = await parseExcelFile(file, maxRows);
    const normalized = normalizeRowsByProvider(parsed.rows, providerId);
    const filtered = underlying ? filterRowsByUnderlying(normalized, underlying) : normalized;
    onProgress({
      percent: 100,
      scanned: parsed.scanned,
      matched: filtered.length,
    });
    return { rows: filtered, scanned: parsed.scanned, matched: filtered.length };
  }
  return { rows: [], scanned: 0, matched: 0 };
}

export default function OptionFlowPage() {
  const { user } = useAuth() as any;
  const { activeAccountId } = useTradingAccounts();
  const userId: string = user?.id ?? "";
  const email: string = user?.email ?? "";
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale) as Lang;
  const isEs = lang === "es";
  const localeTag = LOCALE_TAG[lang];

  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [checking, setChecking] = useState<boolean>(true);
  const paywallEnabled =
    String(process.env.NEXT_PUBLIC_OPTIONFLOW_PAYWALL_ENABLED ?? "").toLowerCase() === "true";
  const bypassPaywall =
    !paywallEnabled ||
    String(process.env.NEXT_PUBLIC_OPTIONFLOW_BYPASS ?? "").toLowerCase() === "true" ||
    String(process.env.NEXT_PUBLIC_OPTIONFLOW_BYPASS ?? "") === "1";
  const showPaywall = paywallEnabled && !bypassPaywall && !entitled;

  const [provider, setProvider] = useState<ProviderId>("optionstrat");
  const [tradeIntent, setTradeIntent] = useState<TradeIntent>("0dte");
  const [underlying, setUnderlying] = useState<string>("");
  const [analyzeAll, setAnalyzeAll] = useState<boolean>(false);
  const [previousClose, setPreviousClose] = useState<number | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [pastedShots, setPastedShots] = useState<PastedShot[]>([]);
  const shotsRef = useRef<PastedShot[]>([]);

  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [summary, setSummary] = useState<string>("");
  const [keyTrades, setKeyTrades] = useState<any[]>([]);
  const [flowBias, setFlowBias] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [analysisHtml, setAnalysisHtml] = useState<string>("");
  const [analysisRows, setAnalysisRows] = useState<any[]>([]);
  const [chartDataUrl, setChartDataUrl] = useState<string | null>(null);
  const [archives, setArchives] = useState<OptionFlowArchive[]>([]);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState<string>("");
  const [archiveFilePath, setArchiveFilePath] = useState<string | null>(null);
  const [analysisNotes, setAnalysisNotes] = useState<string>("");
  const [parsing, setParsing] = useState<boolean>(false);
  const [parseProgress, setParseProgress] = useState<ParseProgress>({
    percent: 0,
    scanned: 0,
    matched: 0,
  });

  const [planHtml, setPlanHtml] = useState<string>("");
  const [planNotes, setPlanNotes] = useState<string>("");
  const [planning, setPlanning] = useState<boolean>(false);
  const [journalDate, setJournalDate] = useState<string>(isoDate(new Date()));
  const [savingToJournal, setSavingToJournal] = useState<boolean>(false);

  const [message, setMessage] = useState<string>("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [typingState, setTypingState] = useState<null | "analyzing" | "planning">(null);
  const [fullScreenChat, setFullScreenChat] = useState<boolean>(false);
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);
  const canAnalyze = Boolean(csvFile || pastedShots.length);
  const [outcomeText, setOutcomeText] = useState<string>("");
  const [outcomeFile, setOutcomeFile] = useState<File | null>(null);
  const [outcomePreview, setOutcomePreview] = useState<string | null>(null);
  const [outcomeSaving, setOutcomeSaving] = useState<boolean>(false);
  const [postMortem, setPostMortem] = useState<any | null>(null);
  const [outcomeNotice, setOutcomeNotice] = useState<string>("");
  const outcomeDue = useMemo(() => {
    const createdAt = analysisData?.meta?.createdAt;
    if (!createdAt) return false;
    const diff = Date.now() - new Date(createdAt).getTime();
    return diff >= 6 * 60 * 60 * 1000;
  }, [analysisData?.meta?.createdAt]);

  const providerMeta = useMemo(
    () => PROVIDERS.find((item) => item.id === provider),
    [provider]
  );

  useEffect(() => {
    if (!fullScreenChat) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullScreenChat]);

  useEffect(() => {
    if (provider === "quantdata") {
      setAnalyzeAll(true);
    }
  }, [provider]);

  const statusLabel = paywallEnabled
    ? entitled
      ? isEs
        ? "Add-on activo"
        : "Add-on active"
      : isEs
      ? "Add-on requerido"
      : "Add-on required"
    : isEs
    ? "Acceso temprano"
    : "Early access";

  function appendMessage(msg: Omit<ChatMessage, "id"> & { id?: string }) {
    setChatLog((prev) => [...prev, { id: msg.id ?? makeId(), ...msg }]);
  }

  function buildAnalysisHtml(data: AnalysisData): string {
    const sections: string[] = [];
    const summary = data.summary ? escapeHtml(data.summary) : "";
    const bias = data.flowBias ? escapeHtml(data.flowBias) : "";

    sections.push(
      `<h3>1) ${isEs ? "Resumen ejecutivo" : "Executive summary"}</h3>`
    );
    sections.push(
      `<p>${summary || (isEs ? "Sin resumen disponible." : "No summary available.")}</p>`
    );
    if (bias) {
      sections.push(
        `<p><strong>${isEs ? "Sesgo macro" : "Macro bias"}:</strong> ${bias}</p>`
      );
    }

    if (data.expirations && data.expirations.length) {
      sections.push(
        `<h3>2) ${
          isEs
            ? "Organización de los últimos prints por expiración"
            : "Latest prints organized by expiration"
        }</h3>`
      );
      data.expirations.forEach((exp) => {
        const expiry = exp.expiry ? escapeHtml(exp.expiry) : "—";
        const tenor = exp.tenor ? ` (${escapeHtml(exp.tenor)})` : "";
        const range = exp.range ? ` · Spot: ${escapeHtml(exp.range)}` : "";
        sections.push(`<h4>Exp ${expiry}${tenor}${range}</h4>`);
        if (exp.strikes && exp.strikes.length) {
          sections.push(
            `<table style="width:100%;border-collapse:collapse;margin-top:8px;">` +
              `<thead><tr>` +
              `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "Strike" : "Strike"}</th>` +
              `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "Tipo (C/P)" : "Type (C/P)"}</th>` +
              `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "Prints" : "Prints"}</th>` +
              `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "Size" : "Size"}</th>` +
              `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "Premium" : "Premium"}</th>` +
              `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "OI máx" : "Max OI"}</th>` +
              `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "Lectura" : "Read"}</th>` +
              `</tr></thead><tbody>` +
              exp.strikes
                .map((row) => {
                  const strike = row.strike != null ? row.strike : "";
                  const type = row.type ? escapeHtml(row.type) : "";
                  const prints = row.prints ?? "";
                  const size = row.sizeTotal ?? "";
                  const prem = row.premiumTotal ? escapeHtml(row.premiumTotal) : "";
                  const oi = row.oiMax ?? "";
                  const read = row.read ? escapeHtml(row.read) : row.side ? escapeHtml(row.side) : "";
                  return `<tr>` +
                    `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${strike}</td>` +
                    `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${type}</td>` +
                    `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${prints}</td>` +
                    `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${size}</td>` +
                    `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${prem}</td>` +
                    `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${oi}</td>` +
                    `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${read}</td>` +
                  `</tr>`;
                })
                .join("") +
              `</tbody></table>`
          );
        }
        if (exp.notes) {
          sections.push(
            `<p><strong>${isEs ? "Lectura" : "Read"}:</strong> ${escapeHtml(exp.notes)}</p>`
          );
        }
        if (exp.keyTakeaways && exp.keyTakeaways.length) {
          sections.push(
            `<ul>` + exp.keyTakeaways.map((t) => `<li>${escapeHtml(t)}</li>`).join("") + `</ul>`
          );
        }
      });
    }

    if (data.keyLevels && data.keyLevels.length) {
      sections.push(
        `<h3>3) ${isEs ? "Niveles clave (priorizados)" : "Key levels (prioritized)"}</h3>`
      );
      sections.push(
        `<ul>` +
          data.keyLevels
            .map((level, idx) => {
              const price = level.price != null ? level.price.toFixed(2) : "";
              const label = level.label ? ` · ${escapeHtml(level.label)}` : "";
              const side = level.side ? ` · ${escapeHtml(level.side)}` : "";
              const reason = level.reason ? ` — ${escapeHtml(level.reason)}` : "";
              return `<li><strong>${isEs ? "Nivel" : "Level"} ${idx + 1}</strong> — ${price}${label}${side}${reason}</li>`;
            })
            .join("") +
          `</ul>`
      );
    }

    if (data.expirations && data.expirations.length) {
      const buckets = collectFlowBuckets(data.expirations);
      const renderBucket = (title: string, rows: ExpirationStrike[]) => {
        if (!rows.length) return "";
        const top = rows.slice(0, 8);
        const lines = top
          .map((row) => {
            const strike = row.strike != null ? row.strike : "";
            const type = row.type ?? "";
            const prem = row.premiumTotal ? escapeHtml(row.premiumTotal) : "";
            const prints = row.prints ?? "";
            const size = row.sizeTotal ?? "";
            return `<tr><td style="padding:4px;">${strike}</td><td style="padding:4px;">${type}</td><td style="padding:4px;">${prints}</td><td style="padding:4px;">${size}</td><td style="padding:4px;">${prem}</td></tr>`;
          })
          .join("");
        return (
          `<h4>${title}</h4>` +
          `<table style="width:100%;border-collapse:collapse;margin-top:6px;">` +
          `<thead><tr>` +
          `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:4px;">${isEs ? "Strike" : "Strike"}</th>` +
          `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:4px;">${isEs ? "Tipo (C/P)" : "Type (C/P)"}</th>` +
          `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:4px;">${isEs ? "Prints" : "Prints"}</th>` +
          `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:4px;">${isEs ? "Size" : "Size"}</th>` +
          `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:4px;">${isEs ? "Premium" : "Premium"}</th>` +
          `</tr></thead><tbody>${lines}</tbody></table>`
        );
      };
      sections.push(
        `<h3>4) ${isEs ? "Mapa de flujo agresivo (ASK/BID)" : "Aggressive flow map (ASK/BID)"}</h3>`
      );
      sections.push(
        renderBucket(
          isEs ? "Calls agresivos (ASK)" : "Aggressive calls (ASK)",
          buckets.callsAsk
        ) +
          renderBucket(
            isEs ? "Puts agresivos (ASK)" : "Aggressive puts (ASK)",
            buckets.putsAsk
          ) +
          renderBucket(
            isEs ? "Calls venta agresiva (BID)" : "Call selling (BID)",
            buckets.callsBid
          ) +
          renderBucket(
            isEs ? "Puts venta agresiva (BID)" : "Put selling (BID)",
            buckets.putsBid
          )
      );
      if (
        !buckets.callsAsk.length &&
        !buckets.putsAsk.length &&
        !buckets.callsBid.length &&
        !buckets.putsBid.length
      ) {
        sections.push(
          `<p>${
            isEs
              ? "Sin señales agresivas claras (ASK/BID). La mayoría está en MID/mixto."
              : "No clear aggressive signals (ASK/BID). Most flow is MID/mixed."
          }</p>`
        );
      }
    }

    if (data.contractsWithPotential) {
      sections.push(
        `<h3>5) ${isEs ? "Contratos con mayor potencial" : "Contracts with the most potential"}</h3>`
      );
      const gamma = data.contractsWithPotential.gamma ?? [];
      const directional = data.contractsWithPotential.directional ?? [];
      const stress = data.contractsWithPotential.stress ?? [];
      if (gamma.length) {
        sections.push(
          `<p><strong>${isEs ? "Gamma (ATM / corto plazo)" : "Gamma (short-term ATM)"}:</strong></p><ul>` +
            gamma.map((item) => `<li>${escapeHtml(item)}</li>`).join("") +
            `</ul>`
        );
      }
      if (directional.length) {
        sections.push(
          `<p><strong>${isEs ? "Direccionales (techo/piso)" : "Directional (ceiling/floor)"}:</strong></p><ul>` +
            directional.map((item) => `<li>${escapeHtml(item)}</li>`).join("") +
            `</ul>`
        );
      }
      if (stress.length) {
        sections.push(
          `<p><strong>${isEs ? "Zona de estrés" : "Stress zone"}:</strong></p><ul>` +
            stress.map((item) => `<li>${escapeHtml(item)}</li>`).join("") +
            `</ul>`
        );
      }
    }

    sections.push(
      `<h3>6) ${isEs ? "Posibles squeezes (OI sube / precio baja)" : "Potential squeezes (OI up / price down)"}</h3>`
    );
    if (data.positioningStress && data.positioningStress.length) {
      sections.push(
        `<table style="width:100%;border-collapse:collapse;margin-top:8px;">` +
          `<thead><tr>` +
          `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "Contrato" : "Contract"}</th>` +
          `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "OI (ini→fin)" : "OI (start→end)"}</th>` +
          `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "Precio (ini→fin)" : "Price (start→end)"}</th>` +
          `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "Inicio (hora)" : "First (time)"}</th>` +
          `<th style="text-align:left;border-bottom:1px solid rgba(148,163,184,0.4);padding:6px 4px;">${isEs ? "Final (hora)" : "Last (time)"}</th>` +
          `</tr></thead><tbody>` +
          data.positioningStress
            .map((row) => {
              const contract = row.contract ? escapeHtml(row.contract) : "—";
              const firstOi = Number.isFinite(Number(row.firstOi)) ? Number(row.firstOi).toFixed(0) : "—";
              const lastOi = Number.isFinite(Number(row.lastOi)) ? Number(row.lastOi).toFixed(0) : "—";
              const oiDelta =
                Number.isFinite(Number(row.oiChange)) ? Number(row.oiChange).toFixed(0) : "—";
              const oi = `${firstOi}→${lastOi} (${oiDelta})`;
              const firstPrice =
                Number.isFinite(Number(row.firstPrice)) ? Number(row.firstPrice).toFixed(2) : "—";
              const lastPrice =
                Number.isFinite(Number(row.lastPrice)) ? Number(row.lastPrice).toFixed(2) : "—";
              const priceDelta =
                Number.isFinite(Number(row.priceChange)) ? Number(row.priceChange).toFixed(2) : "—";
              const price = `${firstPrice}→${lastPrice} (${priceDelta})`;
              const first = row.firstTime ? new Date(row.firstTime).toLocaleString(localeTag) : "—";
              const last = row.lastTime ? new Date(row.lastTime).toLocaleString(localeTag) : "—";
              return `<tr>` +
                `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${contract}</td>` +
                `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${oi}</td>` +
                `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${price}</td>` +
                `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${first}</td>` +
                `<td style="padding:4px;border-bottom:1px solid rgba(30,41,59,0.6);">${last}</td>` +
              `</tr>`;
            })
            .join("") +
          `</tbody></table>`
      );
    } else {
      sections.push(
        `<p>${isEs ? "No se detectaron contratos con OI subiendo y precio bajando en la data enviada." : "No contracts found with rising OI and falling price in the provided data."}</p>`
      );
    }

    if (data.squeezeScenarios) {
      sections.push(
        `<h3>7) ${isEs ? "Squeeze (condiciones y frenos)" : "Squeeze (conditions & brakes)"}</h3>`
      );
      const upside = data.squeezeScenarios.upside;
      const downside = data.squeezeScenarios.downside;
      if (upside) {
        sections.push(
          `<p><strong>${isEs ? "Alza" : "Upside"}:</strong> ${escapeHtml(
            upside.condition || ""
          )}</p>`
        );
        if (upside.candidates?.length) {
          sections.push(
            `<ul>` + upside.candidates.map((c) => `<li>${escapeHtml(c)}</li>`).join("") + `</ul>`
          );
        }
        if (upside.brakes) {
          sections.push(
            `<p><strong>${isEs ? "Freno principal" : "Main brake"}:</strong> ${escapeHtml(
              upside.brakes
            )}</p>`
          );
        }
      }
      if (downside) {
        sections.push(
          `<p><strong>${isEs ? "Baja" : "Downside"}:</strong> ${escapeHtml(
            downside.condition || ""
          )}</p>`
        );
        if (downside.candidates?.length) {
          sections.push(
            `<ul>` + downside.candidates.map((c) => `<li>${escapeHtml(c)}</li>`).join("") + `</ul>`
          );
        }
        if (downside.brakes) {
          sections.push(
            `<p><strong>${isEs ? "Freno principal" : "Main brake"}:</strong> ${escapeHtml(
              downside.brakes
            )}</p>`
          );
        }
      }
    }

    if (data.tradingPlan) {
      sections.push(
        `<h3>8) ${
          isEs ? "Conclusión / Plan de trading (educativo)" : "Conclusion / Trading plan (educational)"
        }</h3>`
      );
      if (data.tradingPlan.headline) {
        sections.push(`<p><strong>${escapeHtml(data.tradingPlan.headline)}</strong></p>`);
      }
      if (data.tradingPlan.steps && data.tradingPlan.steps.length) {
        sections.push(
          `<ul>` +
            data.tradingPlan.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("") +
            `</ul>`
        );
      }
      if (data.tradingPlan.invalidation) {
        sections.push(
          `<p><strong>${isEs ? "Invalidación" : "Invalidation"}:</strong> ${escapeHtml(
            data.tradingPlan.invalidation
          )}</p>`
        );
      }
      if (data.tradingPlan.risk) {
        sections.push(
          `<p><strong>${isEs ? "Riesgo" : "Risk"}:</strong> ${escapeHtml(
            data.tradingPlan.risk
          )}</p>`
        );
      }
      sections.push(
        `<p><em>${
          isEs
            ? "Este plan es educativo y debe validarse con tu propio análisis y contexto de riesgo."
            : "This plan is educational and must be validated with your own analysis and risk context."
        }</em></p>`
      );
    }

    if (data.riskNotes && data.riskNotes.length) {
      sections.push(
        `<h3>9) ${isEs ? "Riesgos / notas" : "Risks / notes"}</h3>`
      );
      sections.push(
        `<ul>` + data.riskNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("") + `</ul>`
      );
    }

    if (data.suggestedFocus && data.suggestedFocus.length) {
      sections.push(
        `<h3>10) ${isEs ? "Enfoque sugerido" : "Suggested focus"}</h3>`
      );
      sections.push(
        `<ul>` +
          data.suggestedFocus.map((item) => `<li>${escapeHtml(item)}</li>`).join("") +
          `</ul>`
      );
    }

    return sections.join("");
  }

  async function buildPdfDoc(payload: AnalysisData, planHtmlOverride?: string) {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    doc.setLineHeightFactor(1.5);
    const margin = 40;
    const headerHeight = 64;
    const footerHeight = 24;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentTop = margin + headerHeight;
    const contentBottom = pageHeight - footerHeight - margin;
    const tableMargin = {
      left: margin,
      right: margin,
      top: contentTop,
      bottom: footerHeight + margin,
    };
    let y = contentTop;

    const logo = await loadLogoData();
    const headerTitle = isEs ? "Option Flow Intelligence - Reporte" : "Option Flow Intelligence - Report";
    const generatedLine = `${isEs ? "Generado" : "Generated"}: ${new Date().toLocaleString(localeTag)}`;

    doc.setFontSize(16);
    doc.text(headerTitle, margin, y);
    y += 22;

    const meta = payload.meta ?? {};
    let metaUnderlying = meta.underlying || underlying;
    const metaProvider = meta.provider || provider;
    const metaIntent = meta.tradeIntent || tradeIntent;
    const metaClose =
      typeof meta.previousClose === "number" ? meta.previousClose : previousClose;
    const providerLabel =
      PROVIDERS.find((item) => item.id === metaProvider)?.label ?? metaProvider;
    const metaLine = [
      metaUnderlying
        ? `${isEs ? "Activo" : "Underlying"}: ${metaUnderlying.trim().toUpperCase()}`
        : null,
      metaProvider ? `${isEs ? "Proveedor" : "Provider"}: ${providerLabel}` : null,
      metaIntent ? `${isEs ? "Intento" : "Intent"}: ${metaIntent.toUpperCase()}` : null,
      metaClose ? `${isEs ? "Cierre previo" : "Previous close"}: ${metaClose.toFixed(2)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (metaLine) {
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      const metaLines = doc.splitTextToSize(metaLine, 520);
      doc.text(metaLines, margin, y);
      y += metaLines.length * 14 + 8;
      doc.setTextColor(0, 0, 0);
    }

    const keyStats = [
      [isEs ? "Activo" : "Asset", metaUnderlying ? metaUnderlying.trim().toUpperCase() : "—"],
      [isEs ? "Intento" : "Intent", metaIntent ? metaIntent.toUpperCase() : "—"],
      [isEs ? "Sesgo" : "Bias", payload.flowBias ?? "—"],
    ];
    autoTable(doc, {
      startY: y,
      head: [[isEs ? "Datos clave" : "Key Stats", isEs ? "Valor" : "Value"]],
      body: keyStats,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [17, 24, 39] },
      margin: tableMargin,
    });
    y = (doc as any).lastAutoTable.finalY + 16;

    const summary = payload.summary || (isEs ? "Sin resumen disponible." : "No summary available.");
    doc.setFontSize(12);
    doc.text(`1) ${isEs ? "Resumen ejecutivo" : "Executive summary"}`, margin, y);
    y += 16;
    doc.setFontSize(10);
    const summaryLines = doc.splitTextToSize(summary, 520);
    doc.text(summaryLines, margin, y);
    y += summaryLines.length * 15 + 16;

    if (payload.expirations && payload.expirations.length) {
      doc.setFontSize(12);
      doc.text(
        `2) ${isEs ? "Organización por expiración" : "Expiration breakdown"}`,
        margin,
        y
      );
      y += 16;
      payload.expirations.forEach((exp) => {
        doc.setFontSize(11);
        doc.text(`Exp ${exp.expiry || "—"} ${exp.tenor ? `(${exp.tenor})` : ""}`, margin, y);
        y += 14;
        const strikes = exp.strikes ?? [];
        if (strikes.length) {
          autoTable(doc, {
            startY: y,
            head: [
              [
                "Strike",
                isEs ? "Tipo (C/P)" : "Type (C/P)",
                "Prints",
                "Size",
                "Premium",
                "OI",
                isEs ? "Lectura" : "Read",
              ],
            ],
            body: strikes.map((row) => [
              row.strike ?? "",
              row.type ?? "",
              row.prints ?? "",
              row.sizeTotal ?? "",
              row.premiumTotal ?? "",
              row.oiMax ?? "",
              row.read ?? row.side ?? "",
            ]),
            styles: { fontSize: 8 },
            headStyles: { fillColor: [17, 24, 39] },
            margin: tableMargin,
          });
          y = (doc as any).lastAutoTable.finalY + 14;
        }
        if (exp.notes) {
          doc.setFontSize(9);
          const noteLines = doc.splitTextToSize(
            `${isEs ? "Lectura" : "Read"}: ${exp.notes}`,
            520
          );
          doc.text(noteLines, margin, y);
          y += noteLines.length * 13 + 8;
        }
      });
      y += 4;
    }

    if (payload.keyLevels && payload.keyLevels.length) {
      doc.setFontSize(12);
      doc.text(
        `3) ${isEs ? "Niveles clave (priorizados)" : "Key levels (prioritized)"}`,
        margin,
        y
      );
      y += 16;
      autoTable(doc, {
        startY: y,
        head: [
          [
            isEs ? "Nivel" : "Level",
            isEs ? "Precio" : "Price",
            isEs ? "Etiqueta" : "Label",
            isEs ? "Lado" : "Side",
            isEs ? "Razón" : "Reason",
          ],
        ],
        body: payload.keyLevels.map((lvl, idx) => [
          `#${idx + 1}`,
          lvl.price != null ? Number(lvl.price).toFixed(2) : "",
          lvl.label ?? "",
          lvl.side ?? "",
          lvl.reason ?? "",
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [17, 24, 39] },
        margin: tableMargin,
      });
      y = (doc as any).lastAutoTable.finalY + 14;
      y += 4;
    }

    if (!metaUnderlying) {
      const guess =
        extractUnderlyingFromValue(payload.summary || "") ||
        extractUnderlyingFromValue(
          payload.keyTrades?.find((t) => t?.details?.symbol)?.details?.symbol || ""
        );
      if (guess) metaUnderlying = guess;
    }
    const normalizedUnderlying = (metaUnderlying || "").trim();
    let levelLines =
      payload.keyLevels?.filter((lvl) => Number.isFinite(Number(lvl.price))) ?? [];
    if (!levelLines.length && payload.expirations?.length) {
      levelLines = deriveKeyLevelsFromExpirations(payload.expirations, 6, lang, metaClose ?? null);
    }
    if (normalizedUnderlying && levelLines.length) {
      const chartUrl = await renderPriceChartDataUrl(
        normalizedUnderlying,
        levelLines.map((lvl) => ({
          price: Number(lvl.price),
          side: lvl.side,
        })),
        lang
      );
      if (chartUrl) {
        const chartHeight = 240;
        if (y + chartHeight + 30 > contentBottom) {
          doc.addPage();
          y = contentTop;
        }
        doc.setFontSize(12);
        doc.text(
          isEs
            ? "Gráfica con niveles (BID azul / CALL verde)"
            : "Chart with levels (BID blue / CALL green)",
          margin,
          y
        );
        y += 10;
        doc.addImage(chartUrl, "PNG", margin, y, 520, chartHeight);
        y += chartHeight + 18;
      }
    }


    if (payload.expirations && payload.expirations.length) {
      doc.setFontSize(12);
      doc.text(
        `4) ${isEs ? "Mapa de flujo agresivo (ASK/BID)" : "Aggressive flow map (ASK/BID)"}`,
        margin,
        y
      );
      y += 14;
      const buckets = collectFlowBuckets(payload.expirations);
      const makeRows = (rows: ExpirationStrike[]) =>
        rows.slice(0, 8).map((row) => [
          row.strike ?? "",
          row.type ?? "",
          row.prints ?? "",
          row.sizeTotal ?? "",
          row.premiumTotal ?? "",
        ]);
      const addBucket = (title: string, rows: ExpirationStrike[]) => {
        if (!rows.length) return;
        autoTable(doc, {
          startY: y,
          head: [[title, isEs ? "Tipo (C/P)" : "Type (C/P)", "Prints", "Size", "Premium"]],
          body: makeRows(rows),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [17, 24, 39] },
          margin: tableMargin,
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      };
      addBucket(isEs ? "Calls agresivos (ASK)" : "Aggressive calls (ASK)", buckets.callsAsk);
      addBucket(isEs ? "Puts agresivos (ASK)" : "Aggressive puts (ASK)", buckets.putsAsk);
      addBucket(isEs ? "Calls venta agresiva (BID)" : "Call selling (BID)", buckets.callsBid);
      addBucket(isEs ? "Puts venta agresiva (BID)" : "Put selling (BID)", buckets.putsBid);
      if (
        !buckets.callsAsk.length &&
        !buckets.putsAsk.length &&
        !buckets.callsBid.length &&
        !buckets.putsBid.length
      ) {
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(
          isEs
            ? "Sin señales agresivas claras (ASK/BID). Mayoría en MID/mixto."
            : "No clear aggressive signals (ASK/BID). Majority is MID/mixed.",
          margin,
          y
        );
        doc.setTextColor(0, 0, 0);
        y += 14;
      }
      y += 4;
    }

    if (payload.contractsWithPotential) {
      doc.setFontSize(12);
      doc.text(
        `5) ${isEs ? "Contratos con mayor potencial" : "Contracts with the most potential"}`,
        margin,
        y
      );
      y += 16;
      const gamma = payload.contractsWithPotential.gamma ?? [];
      const directional = payload.contractsWithPotential.directional ?? [];
      const stress = payload.contractsWithPotential.stress ?? [];
      const addList = (title: string, items: string[]) => {
        if (!items.length) return;
        doc.setFontSize(10);
        doc.text(title, margin, y);
        y += 14;
        const lines = items.flatMap((item) => doc.splitTextToSize(`• ${item}`, 520));
        doc.text(lines, margin, y);
        y += lines.length * 15 + 8;
      };
      addList(isEs ? "Gamma / ATM corto plazo" : "Gamma / short-term ATM", gamma);
      addList(isEs ? "Direccionales / techo-piso" : "Directional / ceiling-floor", directional);
      addList(isEs ? "Zona de estrés" : "Stress zone", stress);
      y += 4;
    }

    doc.setFontSize(12);
    doc.text(
      `6) ${
        isEs ? "Posibles squeezes (OI sube / precio baja)" : "Potential squeezes (OI up / price down)"
      }`,
      margin,
      y
    );
    y += 16;
    if (payload.positioningStress && payload.positioningStress.length) {
      autoTable(doc, {
        startY: y,
        head: [
          [
            isEs ? "Contrato" : "Contract",
            isEs ? "OI (ini->fin)" : "OI (start->end)",
            isEs ? "Precio (ini->fin)" : "Price (start->end)",
            isEs ? "Inicio (hora)" : "First (time)",
            isEs ? "Final (hora)" : "Last (time)",
          ],
        ],
        body: payload.positioningStress.map((row) => {
          const firstOi = Number.isFinite(Number(row.firstOi)) ? Number(row.firstOi).toFixed(0) : "";
          const lastOi = Number.isFinite(Number(row.lastOi)) ? Number(row.lastOi).toFixed(0) : "";
          const oiDelta = Number.isFinite(Number(row.oiChange)) ? Number(row.oiChange).toFixed(0) : "";
          const oiText = firstOi && lastOi ? `${firstOi}->${lastOi} (${oiDelta})` : "";
          const firstPrice =
            Number.isFinite(Number(row.firstPrice)) ? Number(row.firstPrice).toFixed(2) : "";
          const lastPrice =
            Number.isFinite(Number(row.lastPrice)) ? Number(row.lastPrice).toFixed(2) : "";
          const priceDelta =
            Number.isFinite(Number(row.priceChange)) ? Number(row.priceChange).toFixed(2) : "";
          const priceText =
            firstPrice && lastPrice ? `${firstPrice}->${lastPrice} (${priceDelta})` : "";
          return [
            row.contract ?? "",
            oiText,
            priceText,
            row.firstTime ? new Date(row.firstTime).toLocaleString(localeTag) : "",
            row.lastTime ? new Date(row.lastTime).toLocaleString(localeTag) : "",
          ];
        }),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [17, 24, 39] },
        margin: tableMargin,
      });
      y = (doc as any).lastAutoTable.finalY + 14;
      y += 4;
    } else {
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        isEs
          ? "No se detectaron contratos con OI subiendo y precio bajando en la data enviada."
          : "No contracts found with rising OI and falling price in the provided data.",
        margin,
        y
      );
      doc.setTextColor(0, 0, 0);
      y += 16;
    }

    if (payload.squeezeScenarios) {
      doc.setFontSize(12);
      doc.text(
        `7) ${isEs ? "Squeeze (condiciones y frenos)" : "Squeeze (conditions & brakes)"}`,
        margin,
        y
      );
      y += 16;
      const formatScenario = (label: string, scenario?: SqueezeScenario) => {
        if (!scenario) return;
        doc.setFontSize(10);
        doc.text(label, margin, y);
        y += 14;
        if (scenario.condition) {
          const lines = doc.splitTextToSize(
            `${isEs ? "Condición" : "Condition"}: ${scenario.condition}`,
            520
          );
          doc.text(lines, margin, y);
          y += lines.length * 15;
        }
        if (scenario.candidates && scenario.candidates.length) {
          const lines = scenario.candidates.flatMap((item) =>
            doc.splitTextToSize(`• ${item}`, 520)
          );
          doc.text(lines, margin, y);
          y += lines.length * 15;
        }
        if (scenario.brakes) {
          const lines = doc.splitTextToSize(
            `${isEs ? "Freno" : "Brake"}: ${scenario.brakes}`,
            520
          );
          doc.text(lines, margin, y);
          y += lines.length * 15;
        }
        y += 8;
      };
      formatScenario(isEs ? "Alza" : "Upside", payload.squeezeScenarios.upside);
      formatScenario(isEs ? "Baja" : "Downside", payload.squeezeScenarios.downside);
      y += 4;
    }

    const planLines = extractPlanLines(planHtmlOverride);
    if (planLines.length || payload.tradingPlan) {
      if (y + 120 > contentBottom) {
        doc.addPage();
        y = contentTop;
      }
      doc.setFontSize(12);
      doc.text(
        `8) ${
          isEs ? "Conclusión / Plan de trading (educativo)" : "Conclusion / Trading plan (educational)"
        }`,
        margin,
        y
      );
      y += 16;
      doc.setFontSize(10);
      if (planLines.length) {
        for (const line of planLines) {
          const chunks = doc.splitTextToSize(line, 520);
          doc.text(chunks, margin, y);
          y += chunks.length * 15 + 4;
          if (y + 24 > contentBottom) {
            doc.addPage();
            y = contentTop;
          }
        }
      } else if (payload.tradingPlan) {
        if (payload.tradingPlan.headline) {
          const lines = doc.splitTextToSize(payload.tradingPlan.headline, 520);
          doc.text(lines, margin, y);
          y += lines.length * 15 + 6;
        }
        if (payload.tradingPlan.steps && payload.tradingPlan.steps.length) {
          const lines = payload.tradingPlan.steps.flatMap((step) =>
            doc.splitTextToSize(`• ${step}`, 520)
          );
          doc.text(lines, margin, y);
          y += lines.length * 15 + 6;
        }
        if (payload.tradingPlan.invalidation) {
          const lines = doc.splitTextToSize(
            `${isEs ? "Invalidación" : "Invalidation"}: ${payload.tradingPlan.invalidation}`,
            520
          );
          doc.text(lines, margin, y);
          y += lines.length * 15 + 6;
        }
        if (payload.tradingPlan.risk) {
          const lines = doc.splitTextToSize(
            `${isEs ? "Riesgo" : "Risk"}: ${payload.tradingPlan.risk}`,
            520
          );
          doc.text(lines, margin, y);
          y += lines.length * 15 + 6;
        }
      }
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        isEs
          ? "Este plan es educativo y debe validarse con tu propio análisis y contexto de riesgo."
          : "This plan is educational and must be validated with your own analysis and risk context.",
        margin,
        y + 6
      );
      doc.setTextColor(0, 0, 0);
      y += 18;
    }

    const disclaimer = isEs
      ? "DISCLAIMER: Este reporte y el plan de trading son únicamente educativos e informativos. " +
        "No constituyen asesoría financiera, recomendación de inversión ni invitación a operar. " +
        "El trading de opciones implica alto riesgo y puede resultar en pérdidas significativas. " +
        "Cada trader es responsable de sus decisiones."
      : "DISCLAIMER: This report and trading plan are for educational and informational purposes only. " +
        "They are not financial advice, investment recommendations, or an invitation to trade. " +
        "Options trading involves high risk and can result in significant losses. " +
        "Each trader is responsible for their own decisions.";
    doc.setFontSize(8);
    const disclaimerLines = doc.splitTextToSize(disclaimer, 520);
    if (y + disclaimerLines.length * 12 + 20 > contentBottom) {
      doc.addPage();
      y = contentTop;
    }
    doc.setTextColor(71, 85, 105);
    doc.text(disclaimerLines, margin, y + 10);
    doc.setTextColor(0, 0, 0);

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      if (logo) {
        const fitted = fitSize(logo.width, logo.height, 160, 44);
        doc.addImage(logo.dataUrl, "PNG", margin, margin - 6, fitted.width, fitted.height);
      }
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(headerTitle, margin + 170, margin + 4);
      doc.text(generatedLine, pageWidth - margin, margin + 4, { align: "right" });
      doc.text(
        `${isEs ? "Página" : "Page"} ${page} ${isEs ? "de" : "of"} ${pageCount}`,
        pageWidth - margin,
        pageHeight - 10,
        { align: "right" }
      );
      doc.text("Neuro Trader Journal", margin, pageHeight - 10);
      doc.setTextColor(0, 0, 0);
    }

    return doc;
  }

  async function handleDownloadPdf(override?: AnalysisData) {
    const payload = override ?? analysisData;
    if (!payload) return;
    const doc = await buildPdfDoc(payload, planHtml);
    doc.save(`option-flow-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function storePdfArchive(payload: AnalysisData, planHtmlOverride?: string) {
    if (!userId) return;
    const doc = await buildPdfDoc(payload, planHtmlOverride);
    const blob = doc.output("blob");
    const fileName = `option-flow-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
    const path = `${userId}/${fileName}`;
    const { error: uploadErr } = await supabaseBrowser.storage
      .from("option_flow_reports")
      .upload(path, blob, { contentType: "application/pdf", upsert: true });
    if (uploadErr) {
      console.warn("[option-flow] pdf upload failed", uploadErr);
      return;
    }
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const titleParts = [
      payload.meta?.underlying ? payload.meta.underlying.toUpperCase() : null,
      payload.meta?.tradeIntent ? payload.meta.tradeIntent.toUpperCase() : null,
    ].filter(Boolean);
    const title = titleParts.length
      ? `Option Flow ${titleParts.join(" · ")}`
      : isEs
      ? "Option Flow Reporte"
      : "Option Flow Report";
    const { data, error } = await supabaseBrowser
      .from("option_flow_archives")
      .insert({
        user_id: userId,
        title,
        file_path: path,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (!error && data?.id) {
      setArchiveId(String(data.id));
      setArchiveFilePath(path);
      await loadArchives();
    }
  }

  async function updatePdfArchive(payload: AnalysisData, planHtmlOverride?: string) {
    if (!userId || !archiveId || !archiveFilePath)
      return storePdfArchive(payload, planHtmlOverride);
    const doc = await buildPdfDoc(payload, planHtmlOverride);
    const blob = doc.output("blob");
    const { error: uploadErr } = await supabaseBrowser.storage
      .from("option_flow_reports")
      .upload(archiveFilePath, blob, { contentType: "application/pdf", upsert: true });
    if (uploadErr) {
      console.warn("[option-flow] pdf update failed", uploadErr);
      return;
    }
    await loadArchives();
  }

  async function downloadArchivePdf(path?: string | null) {
    if (!path) return;
    const { data, error } = await supabaseBrowser.storage
      .from("option_flow_reports")
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return;
    window.open(data.signedUrl, "_blank");
  }

  async function cleanupArchives() {
    if (!userId) return;
    const now = new Date().toISOString();
    const { data } = await supabaseBrowser
      .from("option_flow_archives")
      .select("file_path")
      .eq("user_id", userId)
      .lt("expires_at", now);
    const paths = (data ?? [])
      .map((row: any) => row.file_path)
      .filter(Boolean) as string[];
    for (const path of paths) {
      await supabaseBrowser.storage.from("option_flow_reports").remove([path]);
    }
    await supabaseBrowser.from("option_flow_archives").delete().eq("user_id", userId).lt("expires_at", now);
  }

  async function loadArchives() {
    if (!userId) return;
    const now = new Date().toISOString();
    const { data } = await supabaseBrowser
      .from("option_flow_archives")
      .select("id,title,file_path,created_at,expires_at")
      .eq("user_id", userId)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(12);
    setArchives((data as OptionFlowArchive[]) ?? []);
  }


  useEffect(() => {
    let alive = true;
    async function checkEntitlement() {
      if (!userId) {
        if (alive) {
          setEntitled(false);
          setChecking(false);
        }
        return;
      }
      if (bypassPaywall) {
        if (alive) {
          setEntitled(true);
          setChecking(false);
        }
        return;
      }
      setChecking(true);
      const ok = await hasEntitlement(userId, "option_flow");
      if (!alive) return;
      setEntitled(ok);
      setChecking(false);
    }
    checkEntitlement();
    return () => {
      alive = false;
    };
  }, [userId, checkoutStatus, bypassPaywall]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setCheckoutStatus(params.get("checkout"));
  }, []);

  useEffect(() => {
    if (chatLog.length) return;
    setChatLog([
      {
        id: makeId(),
        role: "assistant",
      title: isEs ? "Inteligencia de Flujo de Opciones" : "Option Flow Intelligence",
        body: isEs
          ? "¿Cómo quieres analizar el flujo de órdenes? Puedes pegar screenshots o subir un CSV/XLS/XLSX (máx 12MB)."
          : "How do you want to analyze the order flow? Paste screenshots or upload a CSV/XLS/XLSX (max 12MB).",
      },
    ]);
  }, [chatLog.length, isEs]);

  useEffect(() => {
    if (!userId) return;
    void cleanupArchives().then(loadArchives);
  }, [userId]);

  useEffect(() => {
    shotsRef.current = pastedShots;
  }, [pastedShots]);

  useEffect(() => {
    return () => {
      shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.preview));
    };
  }, []);

  useEffect(() => {
    return () => {
      if (outcomePreview) URL.revokeObjectURL(outcomePreview);
    };
  }, [outcomePreview]);

  function addPastedShots(files: File[]) {
    if (!files.length) return;
    setPastedShots((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: makeId(),
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
  }

  function handlePasteScreenshots(event: React.ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (!imageItems.length) return;
    event.preventDefault();
    const files = imageItems
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    addPastedShots(files);
  }

  function removeShot(id: string) {
    setPastedShots((prev) => {
      const target = prev.find((shot) => shot.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((shot) => shot.id !== id);
    });
  }

  function clearShots() {
    setPastedShots((prev) => {
      prev.forEach((shot) => URL.revokeObjectURL(shot.preview));
      return [];
    });
  }

  async function handleCheckout() {
    if (!userId) return;
    setMessage("");
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error(isEs ? "Sesión no disponible" : "Session not available");
      }

      const res = await fetch("/api/stripe/create-addon-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          addonKey: "option_flow",
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || (isEs ? "Checkout falló" : "Checkout failed"));
      }
      if (body?.url) window.location.href = body.url;
    } catch (e: any) {
      setMessage(e?.message || (isEs ? "No se pudo iniciar el checkout." : "Unable to start checkout."));
    }
  }

  async function fetchPreviousClose(): Promise<number | null> {
    const symbol = underlying.trim();
    if (!symbol) return null;
    try {
      const res = await fetch(
        `/api/yahoo-chart?symbol=${encodeURIComponent(symbol)}&range=5d&interval=1d`
      );
      if (!res.ok) throw new Error("Yahoo request failed");
      const body = await res.json();
      const candles = Array.isArray(body?.candles) ? body.candles : [];
      if (!candles.length) return null;
      const last = candles[candles.length - 1];
      const close = Number(last?.close ?? 0) || null;
      setPreviousClose(close);
      return close;
    } catch {
      return null;
    }
  }

  async function handleAnalyze(noteOverride?: string) {
    setMessage("");
    const hasCsv = Boolean(csvFile);
    const hasShots = pastedShots.length > 0;
    const csvTooLarge = csvFile ? csvFile.size > MAX_CSV_BYTES : false;
    let normalizedUnderlying = underlying.trim();
    const fileName = csvFile?.name.toLowerCase() ?? "";
    const isCsv = fileName.endsWith(".csv");
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    const note = (noteOverride ?? analysisNotes).trim();
    if (noteOverride !== undefined) {
      setAnalysisNotes(noteOverride);
    }
    if (hasCsv && !isCsv && !isExcel) {
      appendMessage({
        role: "system",
        body: isEs
          ? "Solo se admiten archivos CSV/XLS/XLSX por ahora."
          : "Only CSV/XLS/XLSX files are supported for now.",
      });
      if (!hasShots) return;
    }
    if (csvTooLarge) {
      appendMessage({
        role: "system",
        body: formatTemplate(
          isEs
            ? "El archivo es muy grande ({size}). El máximo es {max} MB. Usa screenshots o exporta un archivo más pequeño."
            : "File is too large ({size}). Max size is {max} MB. Use screenshots or export a smaller file.",
          { size: formatBytes(csvFile?.size || 0), max: MAX_CSV_MB }
        ),
      });
    }
    if (!hasCsv && !hasShots) {
      appendMessage({
        role: "system",
        body: isEs
          ? "Pega screenshots o sube un CSV/XLS/XLSX (máx 12MB) para iniciar el análisis."
          : "Paste screenshots or upload a CSV/XLS/XLSX (max 12MB) to start the analysis.",
      });
      return;
    }
    if (!analyzeAll && !normalizedUnderlying && note) {
      const guess = extractUnderlyingFromValue(note);
      if (guess) {
        normalizedUnderlying = guess;
        setUnderlying(guess);
      }
    }
    if (analyzeAll) {
      normalizedUnderlying = "";
    }

    // Underlying is optional; only fetch previous close if available.

    setAnalyzing(true);
    setSummary("");
    setKeyTrades([]);
    setFlowBias(null);
    setAnalysisId(null);
    setAnalysisData(null);
    setAnalysisHtml("");
    setAnalysisRows([]);
    setPlanHtml("");
    setArchiveId(null);
    setArchiveFilePath(null);
    setChartDataUrl(null);
    setTypingState("analyzing");
    setParsing(false);
    setParseProgress({ percent: 0, scanned: 0, matched: 0 });
    setOutcomeText("");
    setPostMortem(null);
    setOutcomeNotice("");
    if (outcomePreview) {
      URL.revokeObjectURL(outcomePreview);
    }
    setOutcomePreview(null);
    setOutcomeFile(null);

    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error(isEs ? "Sesión no disponible" : "Session not available");

      let prevClose = previousClose;
      if (!prevClose && normalizedUnderlying) {
        prevClose = await fetchPreviousClose();
      }

      let rows: any[] = [];
      let rowsForAnalysis: any[] = [];
      let scanned = 0;
      let matched = 0;

      const useFile = Boolean(hasCsv && csvFile && !csvTooLarge && (isCsv || isExcel));

      if (useFile && csvFile) {
        setParsing(true);
        const maxRows = pastedShots.length > 0 ? MAX_ROWS_WITH_IMAGES : MAX_ROWS_BASE;
        const parsed = await parseFlowFile(
          csvFile,
          provider,
          normalizedUnderlying,
          (progress) => setParseProgress(progress),
          maxRows
        );
        rows = parsed.rows;
        rowsForAnalysis = parsed.rows;
        scanned = parsed.scanned;
        matched = parsed.matched;
        setParsing(false);

        if (!normalizedUnderlying && rowsForAnalysis.length) {
          const found = rowsForAnalysis.map((row) => findUnderlyingInRow(row)).find(Boolean);
          if (found) {
            normalizedUnderlying = found;
            setUnderlying(found);
          }
        }

        if (normalizedUnderlying && rowsForAnalysis.length === 0 && scanned > 0) {
          setParsing(true);
          const fallback = await parseFlowFile(
            csvFile,
            provider,
            "",
            (progress) => setParseProgress(progress),
            maxRows
          );
          rows = fallback.rows;
          rowsForAnalysis = fallback.rows;
          scanned = fallback.scanned;
          matched = fallback.matched;
          setParsing(false);

          const found = rowsForAnalysis.map((row) => findUnderlyingInRow(row)).find(Boolean);
          if (found) {
            normalizedUnderlying = found;
            setUnderlying(found);
          }

          appendMessage({
            role: "system",
            body: isEs
              ? "No encontré filas que coincidan con el activo. Analizaré todo el archivo."
              : "No rows matched the selected underlying. I'll analyze the entire file.",
          });
        }

        if (normalizedUnderlying && rowsForAnalysis.length === 0) {
          appendMessage({
            role: "system",
            body: isEs
              ? "No hay filas suficientes para analizar. Verifica el archivo o usa screenshots."
              : "Not enough rows to analyze. Check the file or use screenshots.",
          });
          if (!hasShots) {
            setAnalyzing(false);
            setTypingState(null);
            return;
          }
        }
      }

      if (!useFile && csvTooLarge && !hasShots) {
        setAnalyzing(false);
        setTypingState(null);
        return;
      }

      const screenshots = pastedShots.map((shot) => shot.file);
      const maxShots = MAX_SCREENSHOTS_FOR_MODEL;
      const shotsForModel = screenshots.slice(0, maxShots);
      const screenshotDataUrls = await Promise.all(
        shotsForModel.map((file) => compressScreenshot(file))
      );

      const compactRows = rowsForAnalysis.map((row) => compactRow(row));
      setAnalysisRows(compactRows.slice(0, 200));
      const res = await fetch("/api/option-flow/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider,
          underlying: normalizedUnderlying,
          previousClose: prevClose,
          tradeIntent,
          rows: compactRows,
          screenshotDataUrls,
          analystNotes: note || null,
          language: lang,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || (isEs ? "El análisis falló" : "Analysis failed"));

      const analysisPayload: AnalysisData = {
        ...(body ?? {}),
        meta: {
          underlying: normalizedUnderlying || undefined,
          provider,
          tradeIntent,
          previousClose: prevClose ?? null,
          createdAt: new Date().toISOString(),
        },
      };
      if ((!analysisPayload.keyLevels || !analysisPayload.keyLevels.length) && analysisPayload.expirations) {
        analysisPayload.keyLevels = deriveKeyLevelsFromExpirations(
          analysisPayload.expirations,
          6,
          lang,
          prevClose ?? null
        );
      }

      setSummary(analysisPayload.summary ?? "");
      setKeyTrades(Array.isArray(analysisPayload.keyTrades) ? analysisPayload.keyTrades : []);
      setFlowBias(analysisPayload.flowBias ?? null);
      setAnalysisId(body?.uploadId ?? null);
      setAnalysisData(analysisPayload);
      const formatted = buildAnalysisHtml(analysisPayload);
      setAnalysisHtml(formatted);

      appendMessage({
        role: "assistant",
        title: isEs ? "Análisis completo" : "Full analysis",
        html: formatted,
      });

      if (!normalizedUnderlying) {
        const tradeSymbol = body?.keyTrades?.find((t: any) => t?.details?.symbol)?.details?.symbol;
        const guess =
          extractUnderlyingFromValue(tradeSymbol || "") ||
          extractUnderlyingFromValue(body?.summary || "");
        if (guess) {
          normalizedUnderlying = guess;
          setUnderlying(guess);
          analysisPayload.meta = { ...(analysisPayload.meta ?? {}), underlying: guess };
        }
      }

      if (normalizedUnderlying && analysisPayload.keyLevels && analysisPayload.keyLevels.length) {
        const chartUrl = await renderPriceChartDataUrl(
          normalizedUnderlying,
          analysisPayload.keyLevels.map((lvl: any) => ({
            price: Number(lvl?.price),
            side: lvl?.side,
          })),
          lang
        );
        if (chartUrl) {
          setChartDataUrl(chartUrl);
          appendMessage({
            role: "assistant",
            title: isEs
              ? "Gráfica con niveles (BID azul / CALL verde)"
              : "Chart with levels (BID blue / CALL green)",
            html: `<img src="${chartUrl}" alt="levels chart" style="width:100%;border-radius:12px;border:1px solid rgba(148,163,184,0.2);" />`,
          });
        }
      }

      await storePdfArchive(analysisPayload);

      appendMessage({
        role: "assistant",
        title: isEs ? "Siguiente paso" : "Next step",
        body: isEs
          ? "¿Quieres que arme el plan de premarket y lo envíe directo a tu journal?"
          : "Want me to build the premarket plan and send it directly to your journal?",
      });
    } catch (e: any) {
      appendMessage({
        role: "system",
        body: e?.message || (isEs ? "El análisis falló." : "Analysis failed."),
      });
    } finally {
      setAnalyzing(false);
      setTypingState(null);
      setParsing(false);
      clearShots();
    }
  }

  async function handlePremarketPlan(noteOverride?: string) {
    if (!summary) return;
    setPlanning(true);
    setPlanHtml("");
    setTypingState("planning");
    const normalizedUnderlying = underlying.trim();
    const note = (noteOverride ?? planNotes).trim();
    if (noteOverride !== undefined) {
      setPlanNotes(noteOverride);
    }
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error(isEs ? "Sesión no disponible" : "Session not available");

      const res = await fetch("/api/option-flow/premarket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          summary,
          keyTrades,
          underlying: normalizedUnderlying,
          previousClose,
          uploadId: analysisId,
          notes: note || null,
          tradeIntent,
          language: lang,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || (isEs ? "El plan falló" : "Plan failed"));
      }
      setPlanHtml(body?.planHtml ?? "");

      appendMessage({
        role: "assistant",
        title: isEs ? "Plan de premarket" : "Premarket plan",
        html: body?.planHtml ?? "",
      });

      appendMessage({
        role: "assistant",
        title: isEs ? "Siguiente paso" : "Next step",
        body: isEs
          ? "¿Quieres que lo envíe al journal (premarket widget)?"
          : "Do you want me to send it to the journal (premarket widget)?",
      });

      if (analysisData && body?.planHtml) {
        await updatePdfArchive(analysisData, body.planHtml);
      }
    } catch (e: any) {
      appendMessage({
        role: "system",
        body: e?.message || (isEs ? "No se pudo generar el plan." : "Couldn't generate the plan."),
      });
    } finally {
      setPlanning(false);
      setTypingState(null);
    }
  }

  async function handleChat(question: string) {
    if (!analysisData) {
      appendMessage({
        role: "system",
        body: isEs
          ? "Primero necesito un análisis cargado para responder preguntas."
          : "I need a loaded analysis before I can answer questions.",
      });
      return;
    }
    setTypingState("analyzing");
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error(isEs ? "Sesión no disponible" : "Session not available");

      const history = chatLog.slice(-6).map((msg) => ({
        role: msg.role,
        text: msg.body || msg.title || "",
      }));

      const res = await fetch("/api/option-flow/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: question,
          analysis: analysisData,
          rows: analysisRows,
          meta: {
            provider,
            underlying: underlying.trim() || analysisData?.meta?.underlying || null,
            previousClose,
            tradeIntent,
          },
          chatHistory: history,
          language: lang,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || (isEs ? "No se pudo responder." : "Couldn't respond."));
      }

      appendMessage({
        role: "assistant",
        body: body?.reply || (isEs ? "No tengo respuesta todavía." : "No response yet."),
      });
    } catch (e: any) {
      appendMessage({
        role: "system",
        body: e?.message || (isEs ? "No se pudo responder." : "Couldn't respond."),
      });
    } finally {
      setTypingState(null);
    }
  }

  async function handleAnalyzeClick() {
    const note = chatInput.trim();
    await handleAnalyze(note);
    setChatInput("");
  }

  function handleOutcomeFileChange(file: File | null) {
    if (outcomePreview) URL.revokeObjectURL(outcomePreview);
    if (!file) {
      setOutcomeFile(null);
      setOutcomePreview(null);
      return;
    }
    setOutcomeFile(file);
    setOutcomePreview(URL.createObjectURL(file));
  }

  async function handleOutcomeSubmit() {
    if (!analysisData) return;
    const text = outcomeText.trim();
    if (!text) {
      setOutcomeNotice(isEs ? "Describe lo que pasó en el mercado." : "Describe what happened.");
      return;
    }
    setOutcomeNotice("");
    setOutcomeSaving(true);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error(isEs ? "Sesión no disponible" : "Session not available");

      const chartDataUrl = outcomeFile ? await compressScreenshot(outcomeFile, 1400, 0.7) : null;

      const res = await fetch("/api/option-flow/outcome", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          outcomeText: text,
          analysis: analysisData,
          chartDataUrl,
          memoryId: analysisId,
          meta: {
            provider,
            underlying: analysisData?.meta?.underlying || underlying.trim(),
            tradeIntent,
            createdAt: analysisData?.meta?.createdAt,
          },
          language: lang,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || (isEs ? "No se pudo guardar." : "Save failed."));
      }
      setPostMortem(body?.postMortem ?? null);
      setOutcomeNotice(
        isEs ? "Post‑mortem guardado." : "Post‑mortem saved."
      );
    } catch (e: any) {
      setOutcomeNotice(e?.message || (isEs ? "No se pudo guardar." : "Save failed."));
    } finally {
      setOutcomeSaving(false);
    }
  }

  async function handleSaveToJournal() {
    if (!planHtml) return;
    setSavingToJournal(true);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error(isEs ? "Sesión no disponible" : "Session not available");

      const res = await fetch("/api/journal/premarket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: journalDate,
          premarket: planHtml,
          accountId: activeAccountId,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || (isEs ? "No se pudo guardar." : "Save failed"));
      }

      appendMessage({
        role: "assistant",
        title: isEs ? "Journal actualizado" : "Journal updated",
        body: isEs
          ? `Plan de premarket guardado para ${journalDate}.`
          : `Premarket plan saved for ${journalDate}.`,
      });
    } catch (e: any) {
      appendMessage({
        role: "system",
        body:
          e?.message ||
          (isEs ? "No se pudo guardar en el journal." : "Couldn't save to the journal."),
      });
    } finally {
      setSavingToJournal(false);
    }
  }

  async function handleSend() {
    const text = chatInput.trim();
    const lower = text.toLowerCase();
    const wantsJournal =
      /journal|jorunal|premarket widget|envia|enviar|mandar/.test(lower);
    const wantsPlan = /plan|premarket|pre-market|pre market/.test(lower);
    const hasNewData = Boolean(csvFile || pastedShots.length);

    if (text) {
      if (lower.includes("unusual whales")) setProvider("unusualwhales");
      else if (lower.includes("option strat") || lower.includes("optionstrat"))
        setProvider("optionstrat");
      else if (lower.includes("cheddar")) setProvider("cheddarflow");
      else if (lower.includes("quantdata")) setProvider("quantdata");

      if (/(0dte|0 dte)/.test(lower)) setTradeIntent("0dte");
      else if (/scalp/.test(lower)) setTradeIntent("scalp");
      else if (/day\s*trade|daytrade/.test(lower)) setTradeIntent("daytrade");
      else if (/swing/.test(lower)) setTradeIntent("swing");

      const guess = extractUnderlyingFromValue(text);
      if (guess && !analyzeAll && !underlying.trim()) setUnderlying(guess);
    }

    if (!text && !csvFile && pastedShots.length === 0) {
      appendMessage({
        role: "system",
        body: isEs
          ? "Escribe qué quieres analizar o adjunta un CSV/XLS/XLSX o screenshots."
          : "Type what you want to analyze or attach a CSV/XLS/XLSX or screenshots.",
      });
      return;
    }

    if (text) {
      appendMessage({ role: "user", body: text });
    } else {
      appendMessage({
        role: "user",
        body: isEs ? "Analiza los archivos adjuntos." : "Analyze the attached files.",
      });
    }

    if (wantsJournal) {
      if (!planHtml) {
        appendMessage({
          role: "system",
          body: isEs
            ? "Primero necesito un plan generado para enviarlo al journal."
            : "I need a plan generated before sending it to the journal.",
        });
        return;
      }
      await handleSaveToJournal();
      setChatInput("");
      return;
    }

    if (wantsPlan) {
      if (!summary) {
        appendMessage({
          role: "system",
          body: isEs
            ? "Primero necesito correr un análisis del flujo."
            : "I need to run a flow analysis first.",
        });
        return;
      }
      await handlePremarketPlan(text);
      setChatInput("");
      return;
    }

    if (text && analysisData && !hasNewData) {
      await handleChat(text);
      setChatInput("");
      return;
    }
    if (hasNewData && !analysisData) {
      appendMessage({
        role: "system",
        body: isEs
          ? "Para generar el reporte con el CSV, usa el botón “Analizar”."
          : "To generate the report from the CSV, use the “Analyze” button.",
      });
      return;
    }

    if (!analysisData) {
      appendMessage({
        role: "system",
        body: isEs
          ? "Primero necesito un análisis cargado para responder preguntas."
          : "I need a loaded analysis before I can answer questions.",
      });
      return;
    }
    if (text) {
      await handleChat(text);
      setChatInput("");
    }
  }

  const renderChatPanel = (isFullScreen = false) => (
    <div
      className={`rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-950/70 via-slate-950/40 to-slate-950/70 p-4 sm:p-6 flex flex-col min-h-0 ${
        isFullScreen ? "flex-1 h-full" : "min-h-[70vh] sm:min-h-[78vh]"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">
          {isEs ? "Chat de Option Flow" : "Option Flow Chat"}
        </h2>
        <button
          type="button"
          onClick={() => void handleDownloadPdf()}
          disabled={!analysisData}
          className="rounded-full border border-slate-700 px-3 py-1 text-[10.5px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-50"
        >
          {isEs ? "Descargar PDF" : "Download PDF"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2">
        {chatLog.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-2xl border px-4 py-3 ${
              msg.role === "assistant"
                ? "border-emerald-500/20 bg-emerald-500/10"
                : msg.role === "user"
                ? "border-slate-700 bg-slate-900/60"
                : "border-amber-400/30 bg-amber-400/10"
            }`}
          >
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">
              {msg.role === "assistant"
                ? isEs
                  ? "Asistente"
                  : "Assistant"
                : msg.role === "user"
                ? isEs
                  ? "Tú"
                  : "You"
                : isEs
                ? "Sistema"
                : "System"}
            </p>
            {msg.title && <p className="text-[12px] font-semibold text-slate-100 mt-1">{msg.title}</p>}
            {msg.body && <p className="text-[11.5px] text-slate-200 mt-2 leading-relaxed">{msg.body}</p>}
            {msg.meta && <p className="text-[10.5px] text-emerald-200 mt-2">{msg.meta}</p>}
            {msg.keyTrades && msg.keyTrades.length > 0 && (
              <div className="mt-3 space-y-2 text-[11px]">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  {isEs ? "Trades clave" : "Key trades"}
                </p>
                {msg.keyTrades.slice(0, 6).map((trade, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <p className="text-slate-100 font-semibold">
                      {trade?.headline || `Trade ${idx + 1}`}
                    </p>
                    <p className="text-slate-400">{trade?.whyItMatters || ""}</p>
                  </div>
                ))}
              </div>
            )}
            {msg.html && (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-[11.5px] text-slate-100 [&_h3]:mt-4 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:text-[11.5px] [&_h4]:font-semibold [&_p]:mt-2 [&_ul]:mt-2 [&_li]:ml-4 [&_table]:text-[10.5px]">
                <div dangerouslySetInnerHTML={{ __html: sanitizeOptionFlowHtml(msg.html) }} />
              </div>
            )}
          </div>
        ))}

        {typingState && (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-[12.5px] text-slate-200">
            <span className="font-semibold">
              {typingState === "analyzing"
                ? isEs
                  ? "Analizando"
                  : "Analyzing"
                : isEs
                ? "Armando plan"
                : "Building plan"}
            </span>
            <span className="inline-flex ml-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-bounce" />
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-bounce ml-1"
                style={{ animationDelay: "120ms" }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-bounce ml-1"
                style={{ animationDelay: "240ms" }}
              />
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onPaste={(e) => handlePasteScreenshots(e as any)}
            className="w-full bg-transparent text-[11.5px] text-slate-100 outline-none"
            rows={4}
            placeholder={
              isEs
                ? "Escribe aquí: 'Analiza este flujo', 'Genera plan', 'Envía al journal'..."
                : "Type here: 'Analyze this flow', 'Generate plan', 'Send to journal'..."
            }
          />
        </div>

        {pastedShots.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {pastedShots.map((shot) => (
              <div key={shot.id} className="relative rounded-xl border border-slate-800 bg-slate-950/60">
                <img src={shot.preview} alt="Screenshot preview" className="h-20 w-full rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => removeShot(shot.id)}
                  className="absolute right-1 top-1 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-200"
                >
                  {isEs ? "Quitar" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-[11px] text-slate-400">
            {isEs ? "Proveedor" : "Provider"}
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderId)}
              className="ml-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-100"
            >
              {PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-slate-400">
            {isEs ? "Ticker (opcional)" : "Ticker (optional)"}
            <input
              type="text"
              value={underlying}
              disabled={analyzeAll}
              onChange={(e) => {
                const next = e.target.value.toUpperCase();
                setUnderlying(next);
                if (next.trim()) setAnalyzeAll(false);
              }}
              placeholder={isEs ? "Ej: SPX" : "e.g. SPX"}
              className="ml-2 w-24 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-600 disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={analyzeAll}
              onChange={(e) => {
                const next = e.target.checked;
                setAnalyzeAll(next);
                if (next) setUnderlying("");
              }}
              className="h-3 w-3 rounded border border-slate-700 bg-slate-950 text-emerald-400"
            />
            {isEs
              ? "Analizar todo el archivo (ignorar ticker)"
              : "Analyze entire file (ignore ticker)"}
          </label>
          {providerMeta?.hint && (
            <span className="text-[10.5px] text-slate-500">{providerMeta.hint}</span>
          )}
          <label className="text-[11px] text-slate-400">
            {isEs ? "CSV/XLS/XLSX (opcional, 12MB máx)" : "CSV/XLS/XLSX (optional, 12MB max)"}
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              className="ml-2 text-[11px]"
            />
          </label>
          {csvFile && (
            <span className="text-[11px] text-slate-500">
              {csvFile.name} · {formatBytes(csvFile.size)}
            </span>
          )}
          <button
            type="button"
            onClick={clearShots}
            className="text-[11px] text-slate-400 hover:text-emerald-200"
          >
            {isEs ? "Limpiar screenshots" : "Clear screenshots"}
          </button>
          <button
            type="button"
            onClick={() => setCsvFile(null)}
            className="text-[11px] text-slate-400 hover:text-emerald-200"
          >
            {isEs ? "Quitar archivo" : "Remove file"}
          </button>
          <div className="relative group ml-auto">
            <span className="pointer-events-none absolute -top-9 right-0 whitespace-nowrap rounded-lg border border-emerald-400/40 bg-slate-950/90 px-2 py-1 text-[10px] text-emerald-200 opacity-0 shadow-lg shadow-emerald-500/20 transition group-hover:opacity-100">
              {isEs
                ? "Generar reporte con el CSV (usa tu texto como notas)"
                : "Generate report from CSV (uses your text as notes)"}
            </span>
            <button
              type="button"
              onClick={handleAnalyzeClick}
              disabled={!canAnalyze || analyzing || parsing || planning || savingToJournal}
              className="rounded-2xl bg-emerald-400 px-5 py-2 text-[12.5px] font-semibold text-slate-950 shadow hover:bg-emerald-300 disabled:opacity-60"
            >
              {parsing
                ? isEs
                  ? "Procesando archivo…"
                  : "Processing file…"
                : analyzing
                ? isEs
                  ? "Analizando…"
                  : "Analyzing…"
                : isEs
                ? "Analizar"
                : "Analyze"}
            </button>
          </div>
          <div className="relative group">
            <span className="pointer-events-none absolute -top-9 right-0 whitespace-nowrap rounded-lg border border-emerald-400/40 bg-slate-950/90 px-2 py-1 text-[10px] text-emerald-200 opacity-0 shadow-lg shadow-emerald-500/20 transition group-hover:opacity-100">
              {isEs ? "Preguntar sobre el reporte" : "Ask about the report"}
            </span>
            <button
              type="button"
              onClick={handleSend}
              disabled={analyzing || parsing || planning || savingToJournal}
              className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-2 text-[14px] font-semibold text-slate-100 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-60"
              aria-label={isEs ? "Enviar mensaje" : "Send message"}
            >
              →
            </button>
          </div>
        </div>

        {(parsing || parseProgress.percent > 0) && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{isEs ? "Progreso de parsing" : "Parsing progress"}</span>
              <span>{parseProgress.percent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800">
              <div
                className="h-1.5 rounded-full bg-emerald-400"
                style={{ width: `${parseProgress.percent}%` }}
              />
            </div>
            {(parseProgress.scanned > 0 || parseProgress.matched > 0) && (
              <p className="text-[11px] text-slate-500">
                {isEs ? "Escaneado" : "Scanned"}{" "}
                {parseProgress.scanned.toLocaleString(localeTag)} ·{" "}
                {isEs ? "Coincidencias" : "Matches"}{" "}
                {parseProgress.matched.toLocaleString(localeTag)}
              </p>
            )}
          </div>
        )}
      </div>

      {analysisData && (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
              {isEs ? "Resultado real (post‑mortem)" : "Real outcome (post‑mortem)"}
            </p>
            <span
              className={`text-[10px] px-2 py-1 rounded-full border ${
                outcomeDue
                  ? "border-emerald-400/60 text-emerald-200 bg-emerald-500/10"
                  : "border-slate-700 text-slate-400"
              }`}
            >
              {outcomeDue
                ? isEs
                  ? "Recomendado ahora"
                  : "Recommended now"
                : isEs
                ? "Opcional"
                : "Optional"}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {isEs
              ? "Envía lo que pasó en el mercado para evaluar objetivamente el reporte."
              : "Send what happened in the market to objectively evaluate the report."}
          </p>
          <textarea
            value={outcomeText}
            onChange={(e) => setOutcomeText(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11.5px] text-slate-100 outline-none"
            placeholder={
              isEs
                ? "Ej: SPX 6995 → 5913 → 6960, caída fuerte y rebote rápido."
                : "e.g., SPX 6995 → 5913 → 6960, sharp drop and fast rebound."
            }
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[11px] text-slate-400">
              {isEs ? "Screenshot (opcional)" : "Screenshot (optional)"}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleOutcomeFileChange(e.target.files?.[0] ?? null)}
                className="ml-2 text-[11px]"
              />
            </label>
            {outcomePreview && (
              <img
                src={outcomePreview}
                alt="Outcome preview"
                className="h-12 w-20 rounded-lg border border-slate-800 object-cover"
              />
            )}
            <button
              type="button"
              onClick={handleOutcomeSubmit}
              disabled={outcomeSaving}
              className="ml-auto rounded-xl border border-emerald-400/60 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-200 hover:border-emerald-400 hover:text-emerald-100 disabled:opacity-60"
            >
              {outcomeSaving
                ? isEs
                  ? "Guardando…"
                  : "Saving…"
                : isEs
                ? "Analizar resultado"
                : "Analyze outcome"}
            </button>
          </div>
          {outcomeNotice && <p className="text-[11px] text-amber-200">{outcomeNotice}</p>}
          {postMortem && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-[11px] text-slate-200 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                {isEs ? "Post‑mortem" : "Post‑mortem"}
              </p>
              {postMortem.verdict && (
                <p>
                  <span className="text-slate-400">{isEs ? "Veredicto" : "Verdict"}:</span>{" "}
                  <span className="text-emerald-200">{String(postMortem.verdict)}</span>
                </p>
              )}
              {Array.isArray(postMortem.whatMatched) && postMortem.whatMatched.length > 0 && (
                <div>
                  <p className="text-slate-400">{isEs ? "Lo que sí coincidió" : "What matched"}:</p>
                  <ul className="list-disc ml-4">
                    {postMortem.whatMatched.map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(postMortem.whatMissed) && postMortem.whatMissed.length > 0 && (
                <div>
                  <p className="text-slate-400">{isEs ? "Lo que no se vio" : "What was missed"}:</p>
                  <ul className="list-disc ml-4">
                    {postMortem.whatMissed.map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(postMortem.missingData) && postMortem.missingData.length > 0 && (
                <div>
                  <p className="text-slate-400">{isEs ? "Data faltante" : "Missing data"}:</p>
                  <ul className="list-disc ml-4">
                    {postMortem.missingData.map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {postMortem.improvement && (
                <p>
                  <span className="text-slate-400">{isEs ? "Mejora" : "Improvement"}:</span>{" "}
                  {String(postMortem.improvement)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {archives.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
              {isEs ? "Historial (5 días)" : "History (5 days)"}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {archives.map((archive) => (
              <div key={archive.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-[12px] font-semibold text-slate-100">
                  {archive.title || (isEs ? "Option Flow Reporte" : "Option Flow Report")}
                </p>
                <p className="text-[11px] text-slate-500">
                  {new Date(archive.created_at).toLocaleString(localeTag)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void downloadArchivePdf(archive.file_path)}
                    className="rounded-xl border border-slate-700 px-3 py-1 text-[10.5px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
                  >
                    PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            {isEs
              ? "Los reportes se archivan por 5 días y luego se eliminan automáticamente."
              : "Reports are stored for 5 days and then automatically deleted."}
          </p>
        </div>
      )}
    </div>
  );

  if (checking) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">
          {isEs ? "Verificando acceso…" : "Checking access…"}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="w-full max-w-none mx-auto px-4 sm:px-6 md:px-16 py-6 sm:py-8 space-y-7">
        {fullScreenChat && (
          <div className="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur">
            <div className="w-full max-w-none px-4 sm:px-8 py-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-emerald-300">
                    {isEs ? "Inteligencia de Flujo de Opciones" : "Option Flow Intelligence"}
                  </p>
                  <h2 className="text-2xl font-semibold mt-2">
                    {isEs ? "Modo enfoque" : "Focus mode"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setFullScreenChat(false)}
                  className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
                >
                  {isEs ? "Salir de pantalla completa" : "Exit full screen"}
                </button>
              </div>
              {renderChatPanel(true)}
            </div>
          </div>
        )}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-emerald-300">
              {isEs ? "Inteligencia de Flujo de Opciones" : "Option Flow Intelligence"}
            </p>
            <h1 className="text-xl sm:text-2xl font-semibold mt-2">
              {isEs ? "Inteligencia de Flujo de Opciones" : "Option Flow Intelligence"}
            </h1>
            <p className="text-[12px] sm:text-[13px] text-slate-400 mt-2 max-w-3xl">
              {isEs
                ? "Pega screenshots o sube un CSV/XLS/XLSX (máx 12MB) para extraer prints relevantes y armar un plan de premarket."
                : "Paste screenshots or upload a CSV/XLS/XLSX (max 12MB) to extract key prints and build a premarket plan."}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            {!showPaywall && (
              <button
                type="button"
                onClick={() => setFullScreenChat(true)}
                className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-slate-300 hover:border-emerald-400 hover:text-emerald-200"
              >
                {isEs ? "Chat pantalla completa" : "Full screen chat"}
              </button>
            )}
            <span className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-emerald-200 text-xs">
              {statusLabel}
            </span>
          </div>
        </header>

        {showPaywall ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold">
              {isEs ? "Desbloquear Option Flow Intelligence" : "Unlock Option Flow Intelligence"}
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              {isEs
                ? "Obtén análisis avanzado del flujo, resúmenes de IA y planes premarket basados en la actividad más relevante."
                : "Get advanced flow analysis, AI summaries, and premarket plans based on the most meaningful options activity."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCheckout}
                className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow hover:bg-emerald-300"
              >
                {isEs ? "Desbloquear por $5/mes" : "Unlock for $5/mo"}
              </button>
              <Link
                href="/billing"
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-200"
              >
                {isEs ? "Administrar facturación" : "Manage billing"}
              </Link>
            </div>
            {message && <p className="mt-3 text-xs text-amber-200">{message}</p>}
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-6">
            {renderChatPanel(false)}
          </section>
        )}
      </div>
    </main>
  );
}
