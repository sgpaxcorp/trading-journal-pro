"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TopNav from "@/app/components/TopNav";
import { supabase } from "@/lib/supaBaseClient";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type BrokerId =
  | "thinkorswim"
  | "interactive_brokers"
  | "tradovate"
  | "ninjatrader"
  | "webull"
  | "binance"
  | "coinbase";

type ImportHistoryItem = {
  id: string;
  broker: string;
  filename: string | null;
  comment: string | null;
  status: "success" | "failed" | "processing";
  imported_rows: number | null; // statement trades inserted
  updated_rows: number | null;  // statement trades updated
  duplicates: number | null;    // statement trade duplicates
  order_history_events?: number | null;
  order_history_duplicates?: number | null;
  order_history_import_id?: string | null;
  started_at: string; // ISO
  finished_at: string | null; // ISO
  duration_ms: number | null;
};

const BROKERS: { id: BrokerId; name: string; hint: { en: string; es: string } }[] = [
  {
    id: "thinkorswim",
    name: "Thinkorswim (Schwab/TOS)",
    hint: {
      en: "Export: Account Statement / Trade History / Account Order History (Excel/CSV).",
      es: "Exporta: Account Statement / Trade History / Account Order History (Excel/CSV).",
    },
  },
  {
    id: "interactive_brokers",
    name: "Interactive Brokers (IBKR)",
    hint: {
      en: "Export: Trades / Executions (CSV).",
      es: "Exporta: Trades / Executions (CSV).",
    },
  },
  {
    id: "tradovate",
    name: "Tradovate",
    hint: { en: "Export: Fills / Trade History (CSV).", es: "Exporta: Fills / Trade History (CSV)." },
  },
  {
    id: "ninjatrader",
    name: "NinjaTrader",
    hint: { en: "Export: Executions / Trades (CSV).", es: "Exporta: Executions / Trades (CSV)." },
  },
  {
    id: "webull",
    name: "Webull",
    hint: { en: "Export: Trade History (CSV).", es: "Exporta: Trade History (CSV)." },
  },
  {
    id: "binance",
    name: "Binance",
    hint: { en: "Export: Trade History (CSV).", es: "Exporta: Trade History (CSV)." },
  },
  {
    id: "coinbase",
    name: "Coinbase",
    hint: { en: "Export: Fills/Transactions (CSV).", es: "Exporta: Fills/Transactions (CSV)." },
  },
];

function formatDateTime(iso: string, locale: string) {
  const d = new Date(iso);
  return d.toLocaleString(locale);
}

function formatDuration(ms: number | null, locale: string) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 100) / 10;
  return locale.startsWith("es") ? `${s} s` : `${s} s`;
}

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatDateShort(input?: string | number | null) {
  if (!input) return "—";
  const d =
    typeof input === "number"
      ? new Date(input)
      : input.length === 10
        ? new Date(`${input}T00:00:00Z`)
        : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function pickText(...vals: Array<string | number | null | undefined>) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "—";
}

function pickBalanceObject(raw: any) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (Array.isArray(raw?.data)) return raw.data[0] ?? null;
  if (Array.isArray(raw?.balances)) return raw.balances[0] ?? null;
  if (raw?.balances && typeof raw.balances === "object") return raw.balances;
  if (raw?.data && typeof raw.data === "object") return raw.data;
  if (raw?.balance && typeof raw.balance === "object") return raw.balance;
  return raw;
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractPositions(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (Array.isArray(item?.positions)) return item.positions;
      if (Array.isArray(item?.holdings)) return item.holdings;
      return item ? [item] : [];
    });
  }
  if (Array.isArray(raw?.positions)) return raw.positions;
  if (Array.isArray(raw?.holdings)) return raw.holdings;
  if (Array.isArray(raw?.accounts)) {
    return raw.accounts.flatMap((acc: any) => acc?.positions ?? acc?.holdings ?? []);
  }
  return [];
}

function StatusPill({ status, label }: { status: ImportHistoryItem["status"]; label: string }) {
  const cls =
    status === "success"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : status === "failed"
        ? "border-red-400/30 bg-red-500/10 text-red-200"
        : "border-slate-600/50 bg-slate-800/40 text-slate-200";

  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const localeTag = isEs ? "es-ES" : "en-US";

  const [broker, setBroker] = useState<BrokerId>("thinkorswim");
  const [comment, setComment] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceTz, setSourceTz] = useState<string>("America/New_York");
  const [activeImportTab, setActiveImportTab] = useState<"csv" | "broker">("csv");
  const [brokerSyncProvider, setBrokerSyncProvider] = useState<"snaptrade" | "webull">("snaptrade");

  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [snaptradeStatus, setSnaptradeStatus] = useState<string | null>(null);
  const [snaptradeError, setSnaptradeError] = useState<string | null>(null);
  const [snaptradeConnecting, setSnaptradeConnecting] = useState(false);
  const [snaptradeAccounts, setSnaptradeAccounts] = useState<any[] | null>(null);
  const [snaptradeAccountId, setSnaptradeAccountId] = useState<string>("");
  const [snaptradeHoldings, setSnaptradeHoldings] = useState<any[] | null>(null);
  const [snaptradeActivities, setSnaptradeActivities] = useState<any[] | null>(null);
  const [snaptradeBalances, setSnaptradeBalances] = useState<any | null>(null);
  const [snaptradeOrders, setSnaptradeOrders] = useState<any[] | null>(null);
  const [snaptradeTradePreview, setSnaptradeTradePreview] = useState<any[] | null>(null);
  const [snaptradePreviewMeta, setSnaptradePreviewMeta] = useState<{
    total: number;
    inserted: number;
    updated: number;
    duplicates: number;
  } | null>(null);
  const [snaptradePreviewSelection, setSnaptradePreviewSelection] = useState<Record<string, boolean>>({});
  const [snaptradePreviewLoading, setSnaptradePreviewLoading] = useState(false);
  const [snaptradeBroker, setSnaptradeBroker] = useState<string>("");
  const [snaptradeImporting, setSnaptradeImporting] = useState(false);
  const [showSnaptradeHelp, setShowSnaptradeHelp] = useState(true);
  const [snaptradeResetting, setSnaptradeResetting] = useState(false);
  const [snaptradeSyncing, setSnaptradeSyncing] = useState(false);

  const [webullStatus, setWebullStatus] = useState<string | null>(null);
  const [webullError, setWebullError] = useState<string | null>(null);
  const [webullConnecting, setWebullConnecting] = useState(false);
  const [webullAccounts, setWebullAccounts] = useState<any[] | null>(null);
  const [webullAccountId, setWebullAccountId] = useState<string>("");
  const [webullPositions, setWebullPositions] = useState<any[] | null>(null);
  const [webullBalances, setWebullBalances] = useState<any | null>(null);
  const [webullOrders, setWebullOrders] = useState<any[] | null>(null);
  const [webullActivities, setWebullActivities] = useState<any[] | null>(null);
  const [webullSyncing, setWebullSyncing] = useState(false);

  const [syncHoldings, setSyncHoldings] = useState(true);
  const [syncBalances, setSyncBalances] = useState(true);
  const [syncActivities, setSyncActivities] = useState(true);
  const [syncOrders, setSyncOrders] = useState(false);
  const [syncImportTrades, setSyncImportTrades] = useState(false);

  const [webullSyncHoldings, setWebullSyncHoldings] = useState(true);
  const [webullSyncBalances, setWebullSyncBalances] = useState(true);
  const [webullSyncActivities, setWebullSyncActivities] = useState(true);
  const [webullSyncOrders, setWebullSyncOrders] = useState(false);

  const brokerMeta = useMemo(() => BROKERS.find((b) => b.id === broker), [broker]);
  const snaptradePositions = useMemo(() => {
    const positions = extractPositions(snaptradeHoldings);
    return positions.slice(0, 10);
  }, [snaptradeHoldings]);
  const snaptradeBalancesSummary = useMemo(() => {
    if (!snaptradeBalances || typeof snaptradeBalances !== "object") return null;
    const cash = (snaptradeBalances as any)?.cash ?? (snaptradeBalances as any)?.total_cash;
    const buyingPower =
      (snaptradeBalances as any)?.buying_power ??
      (snaptradeBalances as any)?.buyingPower ??
      (snaptradeBalances as any)?.available_cash;
    const equity =
      (snaptradeBalances as any)?.equity ??
      (snaptradeBalances as any)?.total_equity ??
      (snaptradeBalances as any)?.net_liquidation_value;
    return { cash, buyingPower, equity };
  }, [snaptradeBalances]);

  const snaptradeActivitiesPreview = useMemo(() => {
    const rows = Array.isArray(snaptradeActivities) ? snaptradeActivities : [];
    return rows.slice(0, 20).map((a) => ({
      date: pickText(a?.trade_date, a?.settlement_date, a?.created_at, a?.timestamp),
      type: pickText(a?.type, a?.action, a?.side),
      symbol: pickText(a?.option_symbol, a?.symbol, a?.ticker),
      qty: a?.units ?? a?.quantity ?? a?.qty,
      price: a?.price ?? a?.avg_price ?? a?.average_price,
      amount: a?.amount ?? a?.net_amount,
    }));
  }, [snaptradeActivities]);

  const snaptradeOrdersPreview = useMemo(() => {
    const rows = Array.isArray(snaptradeOrders) ? snaptradeOrders : [];
    return rows.slice(0, 20).map((o) => ({
      date: pickText(o?.created_at, o?.placed_at, o?.trade_date, o?.timestamp),
      symbol: pickText(o?.symbol, o?.option_symbol, o?.ticker),
      side: pickText(o?.side, o?.action, o?.order_type),
      qty: o?.units ?? o?.quantity ?? o?.qty ?? o?.filled_quantity,
      price: o?.price ?? o?.avg_price ?? o?.average_price,
      status: pickText(o?.status, o?.order_status),
    }));
  }, [snaptradeOrders]);

  const snaptradeSelectedCount = useMemo(
    () => Object.values(snaptradePreviewSelection).filter(Boolean).length,
    [snaptradePreviewSelection]
  );

  const webullPositionsPreview = useMemo(() => {
    const positions = extractPositions(webullPositions);
    return positions.slice(0, 10);
  }, [webullPositions]);

  const webullBalancesSummary = useMemo(() => {
    const base = pickBalanceObject(webullBalances);
    if (!base || typeof base !== "object") return null;
    const nested = pickBalanceObject(
      (base as any)?.balance ??
        (base as any)?.balances ??
        (base as any)?.accountBalance ??
        (base as any)?.account_balance ??
        (base as any)?.account ??
        null
    );
    const source = nested && typeof nested === "object" ? { ...base, ...nested } : base;
    const cash = toNumber(
      (source as any)?.cash ??
        (source as any)?.cashBalance ??
        (source as any)?.available_cash ??
        (source as any)?.availableCash ??
        (source as any)?.available_cash_balance ??
        (source as any)?.settledCash ??
        (source as any)?.settled_cash
    );
    const buyingPower = toNumber(
      (source as any)?.buying_power ??
        (source as any)?.buyingPower ??
        (source as any)?.bp ??
        (source as any)?.total_buying_power ??
        (source as any)?.availableBuyingPower ??
        (source as any)?.available_buying_power
    );
    const equity = toNumber(
      (source as any)?.equity ??
        (source as any)?.netAccountValue ??
        (source as any)?.netLiquidation ??
        (source as any)?.total_equity ??
        (source as any)?.accountValue ??
        (source as any)?.account_value ??
        (source as any)?.totalAccountValue
    );
    if (cash === null && buyingPower === null && equity === null) return null;
    return { cash, buyingPower, equity };
  }, [webullBalances]);

  const webullActivitiesPreview = useMemo(() => {
    const rows = Array.isArray(webullActivities) ? webullActivities : [];
    return rows.slice(0, 20).map((a) => ({
      date: pickText(a?.tradeDate, a?.date, a?.createdAt, a?.timestamp, a?.time),
      type: pickText(a?.action, a?.side, a?.type),
      symbol: pickText(a?.symbol, a?.ticker, a?.instrument?.symbol),
      qty: a?.quantity ?? a?.qty ?? a?.filledQuantity,
      price: a?.price ?? a?.avgPrice ?? a?.averagePrice,
      amount: a?.amount ?? a?.netAmount ?? a?.value,
    }));
  }, [webullActivities]);

  const webullOrdersPreview = useMemo(() => {
    const rows = Array.isArray(webullOrders) ? webullOrders : [];
    return rows.slice(0, 20).map((o) => ({
      date: pickText(o?.createdAt, o?.placedTime, o?.time, o?.timestamp),
      symbol: pickText(o?.symbol, o?.ticker, o?.instrument?.symbol),
      side: pickText(o?.side, o?.action, o?.orderType),
      qty: o?.totalQty ?? o?.quantity ?? o?.qty ?? o?.filledQty,
      price: o?.price ?? o?.avgPrice ?? o?.averagePrice,
      status: pickText(o?.status, o?.orderStatus),
    }));
  }, [webullOrders]);

  const router = useRouter();

  async function getToken(): Promise<string | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  }

  async function loadHistory() {
    try {
      setHistoryLoading(true);

      const token = await getToken();

      const res = await fetch("/api/broker-import/history", {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        setHistory([]);
        return;
      }

      const data = (await res.json()) as { items?: ImportHistoryItem[] };
      setHistory(Array.isArray(data.items) ? data.items : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function callSnaptrade(path: string, opts?: RequestInit) {
    const token = await getToken();
    if (!token) {
      throw new Error(L("Unauthorized. Please log out and log in again.", "No autorizado. Cierra sesión e inicia de nuevo."));
    }
    const res = await fetch(path, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts?.headers ?? {}),
      },
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const detail = data?.detail || data?.error || data?.message || "SnapTrade error";
      const code = data?.code || data?.status_code;
      const msg = code ? `${detail} (${code})` : detail;
      throw new Error(msg);
    }
    return data;
  }

  async function callWebull(path: string, opts?: RequestInit) {
    const token = await getToken();
    if (!token) {
      throw new Error(L("Unauthorized. Please log out and log in again.", "No autorizado. Cierra sesión e inicia de nuevo."));
    }
    const res = await fetch(path, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts?.headers ?? {}),
      },
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const detail = data?.detail || data?.error || data?.message || "Webull error";
      const code = data?.code || data?.status_code;
      const msg = code ? `${detail} (${code})` : detail;
      throw new Error(msg);
    }
    return data;
  }

  async function onSnaptradeConnect() {
    try {
      setSnaptradeError(null);
      setSnaptradeStatus(null);
      setSnaptradeConnecting(true);
      const redirectUrl = `${window.location.origin}/import?snaptrade=connected`;
      await callSnaptrade("/api/snaptrade/register", { method: "POST" });
      const loginData = await callSnaptrade("/api/snaptrade/login", {
        method: "POST",
        body: JSON.stringify({
          broker: snaptradeBroker.trim() || undefined,
          connectionType: "read",
          immediateRedirect: true,
          darkMode: true,
          customRedirect: redirectUrl,
        }),
      });
      const url = loginData?.url || loginData?.redirectURI || loginData?.redirectUri || "";
      if (!url) {
        throw new Error(L("Missing SnapTrade redirect URL.", "Falta el enlace de conexión de SnapTrade."));
      }
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        window.location.href = url;
        return;
      }
      setSnaptradeStatus(
        L(
          "Connection Portal opened in a new tab. Complete the broker login, then return to refresh accounts.",
          "Portal abierto en otra pestaña. Completa el login del bróker y vuelve para refrescar cuentas."
        )
      );
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    } finally {
      setSnaptradeConnecting(false);
    }
  }

  async function onSnaptradeReset() {
    const ok = window.confirm(
      L(
        "This will remove your SnapTrade link and let you connect again. Continue?",
        "Esto eliminará tu enlace de SnapTrade y te permitirá conectar de nuevo. ¿Deseas continuar?"
      )
    );
    if (!ok) return;
    try {
      setSnaptradeError(null);
      setSnaptradeStatus(null);
      setSnaptradeResetting(true);
      await callSnaptrade("/api/snaptrade/reset", { method: "POST" });
      setSnaptradeAccounts(null);
      setSnaptradeAccountId("");
      setSnaptradeStatus(
        L(
          "SnapTrade link reset. Click “Connect broker” to start again.",
          "Enlace SnapTrade reiniciado. Presiona “Conectar bróker” para comenzar de nuevo."
        )
      );
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    } finally {
      setSnaptradeResetting(false);
    }
  }

  async function onSnaptradeLoadAccounts() {
    try {
      setSnaptradeError(null);
      setSnaptradeStatus(null);
      const data = await callSnaptrade("/api/snaptrade/accounts", { method: "GET" });
      const list = Array.isArray(data?.accounts) ? data.accounts : Array.isArray(data) ? data : [];
      setSnaptradeAccounts(list);
      if (!snaptradeAccountId && list.length > 0) {
        setSnaptradeAccountId(String(list[0]?.id ?? ""));
      }
      setSnaptradeStatus(
        list.length
          ? L(`Loaded ${list.length} account(s).`, `Cargadas ${list.length} cuenta(s).`)
          : L("No accounts found yet.", "Aún no hay cuentas conectadas.")
      );
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    }
  }

  async function onSnaptradeLoadHoldings() {
    if (!snaptradeAccountId) return;
    try {
      setSnaptradeError(null);
      const data = await callSnaptrade(`/api/snaptrade/accounts/${snaptradeAccountId}/holdings`, {
        method: "GET",
      });
      setSnaptradeHoldings(Array.isArray(data?.holdings) ? data.holdings : data?.data ?? data);
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    }
  }

  async function onSnaptradeLoadBalances() {
    if (!snaptradeAccountId) return;
    try {
      setSnaptradeError(null);
      const data = await callSnaptrade(`/api/snaptrade/accounts/${snaptradeAccountId}/balances`, {
        method: "GET",
      });
      setSnaptradeBalances(data?.balances ?? data);
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    }
  }

  async function onSnaptradeLoadActivities() {
    if (!snaptradeAccountId) return;
    try {
      setSnaptradeError(null);
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      const qs = new URLSearchParams({
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      });
      const data = await callSnaptrade(
        `/api/snaptrade/accounts/${snaptradeAccountId}/activities?${qs.toString()}`,
        { method: "GET" }
      );
      setSnaptradeActivities(Array.isArray(data?.activities) ? data.activities : data?.data ?? data);
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    }
  }

  async function onSnaptradeLoadOrders() {
    if (!snaptradeAccountId) return;
    try {
      setSnaptradeError(null);
      const data = await callSnaptrade(`/api/snaptrade/accounts/${snaptradeAccountId}/orders/recent`, {
        method: "GET",
      });
      setSnaptradeOrders(Array.isArray(data?.orders) ? data.orders : data);
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    }
  }

  async function onSnaptradeSyncSelected() {
    if (!snaptradeAccountId) return;
    try {
      setSnaptradeError(null);
      setSnaptradeStatus(null);
      setSnaptradeSyncing(true);
      if (syncHoldings) await onSnaptradeLoadHoldings();
      if (syncBalances) await onSnaptradeLoadBalances();
      if (syncActivities) await onSnaptradeLoadActivities();
      if (syncOrders) await onSnaptradeLoadOrders();
      if (syncImportTrades) await onSnaptradeImportTrades();
      setSnaptradeStatus(
        L(
          "Sync completed. Review the preview and adjust as needed.",
          "Sincronización completada. Revisa la vista previa y ajusta si es necesario."
        )
      );
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    } finally {
      setSnaptradeSyncing(false);
    }
  }

  async function onSnaptradeImportTrades() {
    if (!snaptradeAccountId) return;
    try {
      setSnaptradeError(null);
      setSnaptradeStatus(null);
      setSnaptradeImporting(true);
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      const token = await getToken();
      if (!token) throw new Error(L("Unauthorized. Please log out and log in again.", "No autorizado."));

      const res = await fetch("/api/broker-import/snaptrade", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: snaptradeAccountId,
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
          broker: "snaptrade",
          comment: "SnapTrade import (30d)",
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.error ?? "SnapTrade import failed");
      }
      setSnaptradeStatus(
        L(
          `Imported ${data?.inserted ?? 0} trades (${data?.updated ?? 0} updated, ${data?.duplicates ?? 0} duplicates).`,
          `Importadas ${data?.inserted ?? 0} operaciones (${data?.updated ?? 0} actualizadas, ${data?.duplicates ?? 0} duplicadas).`
        )
      );
      loadHistory();
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    } finally {
      setSnaptradeImporting(false);
    }
  }

  async function onSnaptradePreviewTrades() {
    if (!snaptradeAccountId) return;
    try {
      setSnaptradeError(null);
      setSnaptradeStatus(null);
      setSnaptradePreviewLoading(true);
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      const token = await getToken();
      if (!token) throw new Error(L("Unauthorized. Please log out and log in again.", "No autorizado."));

      const res = await fetch("/api/broker-import/snaptrade", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: snaptradeAccountId,
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
          broker: "snaptrade",
          comment: "SnapTrade preview (30d)",
          previewOnly: true,
          previewLimit: 200,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.error ?? "SnapTrade preview failed");
      }
      const preview = Array.isArray(data?.preview) ? data.preview : [];
      setSnaptradeTradePreview(preview);
      setSnaptradePreviewMeta({
        total: Number(data?.total ?? preview.length ?? 0),
        inserted: Number(data?.inserted ?? 0),
        updated: Number(data?.updated ?? 0),
        duplicates: Number(data?.duplicates ?? 0),
      });
      const selection: Record<string, boolean> = {};
      for (const row of preview) {
        const hash = row?.trade_hash || row?.tradeHash;
        if (!hash) continue;
        selection[hash] = !row?.is_duplicate;
      }
      setSnaptradePreviewSelection(selection);
      setSnaptradeStatus(
        L(
          `Preview loaded (${preview.length} shown). Select which trades to import.`,
          `Vista previa cargada (${preview.length} mostradas). Selecciona cuáles importar.`
        )
      );
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    } finally {
      setSnaptradePreviewLoading(false);
    }
  }

  async function onSnaptradeImportSelected() {
    if (!snaptradeAccountId) return;
    const hashes = Object.entries(snaptradePreviewSelection)
      .filter(([, checked]) => checked)
      .map(([hash]) => hash);
    if (!hashes.length) {
      setSnaptradeError(L("Select at least one trade to import.", "Selecciona al menos un trade para importar."));
      return;
    }
    try {
      setSnaptradeError(null);
      setSnaptradeStatus(null);
      setSnaptradeImporting(true);
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      const token = await getToken();
      if (!token) throw new Error(L("Unauthorized. Please log out and log in again.", "No autorizado."));

      const res = await fetch("/api/broker-import/snaptrade", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: snaptradeAccountId,
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
          broker: "snaptrade",
          comment: "SnapTrade import (selected)",
          includeTradeHashes: hashes,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.error ?? "SnapTrade import failed");
      }
      setSnaptradeStatus(
        L(
          `Imported ${data?.inserted ?? 0} trades (${data?.updated ?? 0} updated, ${data?.duplicates ?? 0} duplicates).`,
          `Importadas ${data?.inserted ?? 0} operaciones (${data?.updated ?? 0} actualizadas, ${data?.duplicates ?? 0} duplicadas).`
        )
      );
      loadHistory();
    } catch (err: any) {
      setSnaptradeError(err?.message ?? "SnapTrade error");
    } finally {
      setSnaptradeImporting(false);
    }
  }

  async function onWebullConnect() {
    try {
      setWebullError(null);
      setWebullStatus(null);
      setWebullConnecting(true);
      const data = await callWebull("/api/webull/authorize", { method: "POST" });
      const url = data?.url;
      if (!url) {
        throw new Error(L("Missing Webull redirect URL.", "Falta el enlace de conexión de Webull."));
      }
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        window.location.href = url;
        return;
      }
      setWebullStatus(
        L(
          "OAuth window opened. Complete the broker login, then return to refresh accounts.",
          "Ventana OAuth abierta. Completa el login del bróker y vuelve para refrescar cuentas."
        )
      );
    } catch (err: any) {
      setWebullError(err?.message ?? "Webull error");
    } finally {
      setWebullConnecting(false);
    }
  }

  async function onWebullDisconnect() {
    const ok = window.confirm(
      L(
        "This will disconnect Webull and clear stored tokens. Continue?",
        "Esto desconectará Webull y borrará los tokens. ¿Deseas continuar?"
      )
    );
    if (!ok) return;
    try {
      setWebullError(null);
      setWebullStatus(null);
      await callWebull("/api/webull/disconnect", { method: "POST" });
      setWebullAccounts(null);
      setWebullAccountId("");
      setWebullPositions(null);
      setWebullBalances(null);
      setWebullOrders(null);
      setWebullActivities(null);
      setWebullStatus(L("Webull disconnected.", "Webull desconectado."));
    } catch (err: any) {
      setWebullError(err?.message ?? "Webull error");
    }
  }

  async function onWebullLoadAccounts() {
    try {
      setWebullError(null);
      setWebullStatus(null);
      const data = await callWebull("/api/webull/accounts", { method: "GET" });
      const list = Array.isArray(data?.accounts)
        ? data.accounts
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];
      setWebullAccounts(list);
      if (!webullAccountId && list.length > 0) {
        setWebullAccountId(String(list[0]?.id ?? list[0]?.accountId ?? list[0]?.account_id ?? ""));
      }
      setWebullStatus(
        list.length
          ? L(`Loaded ${list.length} account(s).`, `Cargadas ${list.length} cuenta(s).`)
          : L("No accounts found yet.", "Aún no hay cuentas conectadas.")
      );
    } catch (err: any) {
      setWebullError(err?.message ?? "Webull error");
    }
  }

  async function onWebullLoadBalances() {
    if (!webullAccountId) return;
    try {
      setWebullError(null);
      const data = await callWebull(`/api/webull/accounts/${webullAccountId}/balances`, { method: "GET" });
      setWebullBalances(data?.balances ?? data?.data ?? data);
    } catch (err: any) {
      setWebullError(err?.message ?? "Webull error");
    }
  }

  async function onWebullLoadPositions() {
    if (!webullAccountId) return;
    try {
      setWebullError(null);
      const data = await callWebull(`/api/webull/accounts/${webullAccountId}/positions`, { method: "GET" });
      setWebullPositions(data?.positions ?? data?.data ?? data);
    } catch (err: any) {
      setWebullError(err?.message ?? "Webull error");
    }
  }

  async function onWebullLoadOrders(days = 30) {
    if (!webullAccountId) return;
    try {
      setWebullError(null);
      const qs = new URLSearchParams({ days: String(days) });
      const data = await callWebull(`/api/webull/accounts/${webullAccountId}/orders?${qs.toString()}`, {
        method: "GET",
      });
      setWebullOrders(data?.orders ?? data?.data ?? data);
    } catch (err: any) {
      setWebullError(err?.message ?? "Webull error");
    }
  }

  async function onWebullLoadActivities(days = 30) {
    if (!webullAccountId) return;
    try {
      setWebullError(null);
      const qs = new URLSearchParams({ days: String(days) });
      const data = await callWebull(`/api/webull/accounts/${webullAccountId}/activities?${qs.toString()}`, {
        method: "GET",
      });
      setWebullActivities(data?.activities ?? data?.data ?? data);
    } catch (err: any) {
      setWebullError(err?.message ?? "Webull error");
    }
  }

  async function onWebullSyncSelected() {
    if (!webullAccountId) return;
    try {
      setWebullError(null);
      setWebullStatus(null);
      setWebullSyncing(true);
      if (webullSyncHoldings) await onWebullLoadPositions();
      if (webullSyncBalances) await onWebullLoadBalances();
      if (webullSyncActivities) await onWebullLoadActivities();
      if (webullSyncOrders) await onWebullLoadOrders();
      setWebullStatus(
        L(
          "Sync completed. Review the preview and adjust as needed.",
          "Sincronización completada. Revisa la vista previa y ajusta si es necesario."
        )
      );
    } catch (err: any) {
      setWebullError(err?.message ?? "Webull error");
    } finally {
      setWebullSyncing(false);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("snaptrade") === "connected") {
      setActiveImportTab("broker");
      setBrokerSyncProvider("snaptrade");
      onSnaptradeLoadAccounts();
      setSnaptradeStatus(
        L("Connection completed. Loading accounts...", "Conexión completada. Cargando cuentas...")
      );
      window.history.replaceState({}, "", "/import");
    }
    if (params.get("webull") === "connected") {
      setActiveImportTab("broker");
      setBrokerSyncProvider("webull");
      onWebullLoadAccounts();
      setWebullStatus(
        L("Connection completed. Loading accounts...", "Conexión completada. Cargando cuentas...")
      );
      window.history.replaceState({}, "", "/import");
    }
    if (params.get("webull") === "error") {
      setActiveImportTab("broker");
      setBrokerSyncProvider("webull");
      const reason = params.get("reason");
      setWebullError(
        reason
          ? L(`Webull connection failed: ${reason}`, `Falló la conexión a Webull: ${reason}`)
          : L("Webull connection failed.", "Falló la conexión a Webull.")
      );
      window.history.replaceState({}, "", "/import");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ FIX: si escoges el MISMO file, el input no dispara onChange.
  function onPickFileClick() {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }

  function acceptFile(f: File | null) {
    setErrorMsg(null);
    setStatusMsg(null);
    if (!f) return;
    setFile(f);
  }

  function onClearFile() {
    setFile(null);
    setErrorMsg(null);
    setStatusMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    acceptFile(f);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  async function onImport() {
    setErrorMsg(null);
    setStatusMsg(null);

    if (!file) {
    setErrorMsg(L("Please choose a file to import.", "Elige un archivo para importar."));
      return;
    }

    const name = file.name.toLowerCase();
    const okExt = name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls");
    if (!okExt) {
      setErrorMsg(L("Unsupported file type. Please upload CSV / XLS / XLSX.", "Tipo de archivo no compatible. Usa CSV / XLS / XLSX."));
      return;
    }

    try {
      setImporting(true);

      const token = await getToken();
      if (!token) {
        setErrorMsg(L("Unauthorized. Please log out and log in again.", "No autorizado. Cierra sesión e inicia de nuevo."));
        return;
      }

      const form = new FormData();
      form.append("broker", broker);
      form.append("comment", comment.trim());
      form.append("file", file);
      if (broker === "thinkorswim") {
        form.append("sourceTz", sourceTz);
      }

      const res = await fetch("/api/broker-import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setErrorMsg(data?.error ?? L("Import failed. Please verify your export format.", "La importación falló. Verifica el formato del export."));
        return;
      }

      // ✅ NEW response: inserted/updated/duplicates
      const inserted = typeof data?.inserted === "number" ? data.inserted : null;
      const updated = typeof data?.updated === "number" ? data.updated : null;
      const duplicates = typeof data?.duplicates === "number" ? data.duplicates : null;
      const orderEvents =
        typeof data?.orderHistory?.eventsSaved === "number"
          ? data.orderHistory.eventsSaved
          : typeof data?.orderHistory?.events === "number"
            ? data.orderHistory.events
            : null;
      const orderDupes =
        typeof data?.orderHistory?.duplicates === "number"
          ? data.orderHistory.duplicates
          : null;

      const parts: string[] = [];
      if (inserted !== null || updated !== null || duplicates !== null) {
        parts.push(
          isEs
            ? `Trades del statement: ${inserted ?? 0} nuevas, ${updated ?? 0} actualizadas, ${duplicates ?? 0} duplicadas`
            : `Statement trades: ${inserted ?? 0} new, ${updated ?? 0} updated, ${duplicates ?? 0} duplicates`
        );
      }
      if (orderEvents !== null || orderDupes !== null) {
        parts.push(
          isEs
            ? `Historial de órdenes: ${orderEvents ?? 0} nuevas, ${orderDupes ?? 0} duplicadas`
            : `Order history: ${orderEvents ?? 0} new, ${orderDupes ?? 0} duplicates`
        );
      }

      setStatusMsg(
        parts.length
          ? parts.join(" • ")
          : L("Import completed.", "Importación completada.")
      );

      setFile(null);
      setComment("");
      loadHistory();
    } catch (err: any) {
      setErrorMsg(err?.message ?? L("Import failed.", "La importación falló."));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <TopNav />

      <main className="min-h-screen bg-slate-950 text-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/80">Import</div>

              <h1 className="mt-2 text-3xl font-semibold leading-tight">
                {L("Import trades", "Importar operaciones")}
              </h1>

              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                {L(
                  "Choose your broker, upload your export file, and we’ll import everything automatically — no column editing, no manual mapping.",
                  "Elige tu bróker, sube el archivo de exportación y lo importamos automáticamente — sin editar columnas ni mapear manualmente."
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                aria-label={L("Back", "Volver")}
              >
                <ArrowLeft className="h-4 w-4" />
                {L("Back", "Volver")}
              </button>

              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                aria-label={L("Back to dashboard", "Volver al dashboard")}
              >
                <ArrowLeft className="h-4 w-4" />
                {L("Back to dashboard", "Volver al dashboard")}
              </button>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-2">
            <button
              type="button"
              onClick={() => setActiveImportTab("csv")}
              className={[
                "rounded-xl px-4 py-2 text-xs font-semibold transition",
                activeImportTab === "csv"
                  ? "bg-emerald-400 text-slate-950"
                  : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:bg-slate-950/60",
              ].join(" ")}
            >
              {L("CSV Import", "Importar CSV")}
            </button>
            <button
              type="button"
              onClick={() => setActiveImportTab("broker")}
              className={[
                "rounded-xl px-4 py-2 text-xs font-semibold transition",
                activeImportTab === "broker"
                  ? "bg-emerald-400 text-slate-950"
                  : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:bg-slate-950/60",
              ].join(" ")}
            >
              {L("Broker Sync", "Sincronizar bróker")}
            </button>
            <div className="ml-auto text-[11px] text-slate-400">
              {activeImportTab === "csv"
                ? L("Upload broker exports (CSV/XLSX).", "Sube exportaciones del bróker (CSV/XLSX).")
                : brokerSyncProvider === "webull"
                  ? L("Connect and sync via Webull OAuth.", "Conecta y sincroniza via Webull OAuth.")
                  : L("Connect and sync via SnapTrade.", "Conecta y sincroniza con SnapTrade.")}
            </div>
          </div>

          {activeImportTab === "csv" ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Left card */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl">
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-200">{L("Broker", "Bróker")}</label>
                    <select
                      value={broker}
                      onChange={(e) => setBroker(e.target.value as BrokerId)}
                      className="mt-2 w-full rounded-xl bg-slate-950/40 border border-slate-700 px-3 py-2 text-xs outline-none focus:border-emerald-400"
                      disabled={importing}
                    >
                      {BROKERS.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {brokerMeta?.hint ? (isEs ? brokerMeta.hint.es : brokerMeta.hint.en) : ""}
                    </p>
                  </div>

                  {broker === "thinkorswim" && (
                    <div>
                      <label className="text-xs font-semibold text-slate-200">
                        {L("Order history timezone (ToS)", "Zona horaria (Order History)")}
                      </label>
                      <select
                        value={sourceTz}
                        onChange={(e) => setSourceTz(e.target.value)}
                        className="mt-2 w-full rounded-xl bg-slate-950/40 border border-slate-700 px-3 py-2 text-xs outline-none focus:border-emerald-400"
                        disabled={importing}
                      >
                        <option value="America/New_York">America/New_York (ET)</option>
                        <option value="America/Chicago">America/Chicago (CT)</option>
                        <option value="America/Denver">America/Denver (MT)</option>
                        <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                        <option value="UTC">UTC</option>
                      </select>
                      <p className="mt-2 text-[11px] text-slate-400">
                        {L(
                          "Used only for Thinkorswim Account Order History imports.",
                          "Se usa solo para importaciones de Account Order History (ToS)."
                        )}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-slate-200">
                      {L("Comment (optional)", "Comentario (opcional)")}
                    </label>
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={L("e.g., SPX weeklies / morning session", "ej. SPX semanales / sesión de la mañana")}
                      className="mt-2 w-full rounded-xl bg-slate-950/40 border border-slate-700 px-3 py-2 text-xs outline-none focus:border-emerald-400"
                      maxLength={140}
                      disabled={importing}
                    />
                    <p className="mt-2 text-[11px] text-slate-400">
                      {L("One-line note saved with the import batch.", "Nota breve guardada con el lote importado.")}
                    </p>
                  </div>
                </div>

                <div
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  className={[
                    "rounded-2xl border-2 border-dashed p-6 transition",
                    dragOver ? "border-emerald-400/60 bg-emerald-400/5" : "border-slate-700 bg-slate-950/20",
                  ].join(" ")}
                >
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="text-sm font-semibold text-slate-100">
                      {L("Drag & drop your file here", "Arrastra y suelta tu archivo aquí")}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {L("Supported: CSV, XLS, XLSX", "Soporta: CSV, XLS, XLSX")}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={onPickFileClick}
                        className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                        disabled={importing}
                      >
                        {L("Browse file", "Buscar archivo")}
                      </button>

                      {file ? (
                        <button
                          type="button"
                          onClick={onClearFile}
                          className="rounded-xl border border-slate-700 bg-slate-950/30 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-950/50 disabled:opacity-60"
                          disabled={importing}
                        >
                          {L("Clear", "Limpiar")}
                        </button>
                      ) : null}
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xls,.xlsx"
                      className="hidden"
                      onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
                    />

                    {file ? (
                      <div className="mt-4 w-full rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2 text-left">
                        <div className="text-[11px] text-slate-400">{L("Selected file", "Archivo seleccionado")}</div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <div className="truncate text-xs font-semibold text-slate-100">{file.name}</div>
                          <div className="shrink-0 text-[11px] text-slate-400">
                            {(file.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {errorMsg ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {errorMsg}
                  </div>
                ) : null}

                {statusMsg ? (
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
                    {statusMsg}
                  </div>
                ) : null}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={loadHistory}
                    className="rounded-xl border border-slate-700 bg-slate-950/30 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-950/50 disabled:opacity-60"
                    disabled={importing || historyLoading}
                  >
                    {L("Refresh history", "Actualizar historial")}
                  </button>

                  <button
                    type="button"
                    onClick={onImport}
                    className="rounded-xl bg-emerald-400 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                    disabled={importing}
                  >
                    {importing ? L("Importing...", "Importando...") : L("Import", "Importar")}
                  </button>
                </div>
              </div>
            </section>

            {/* Right card */}
            <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl">
              <div className="mb-3">
                <div className="text-xs font-semibold text-slate-100">
                  {L("Import History", "Historial de importaciones")}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {L(
                    "Informational log of your recent imports (time, duration, rows).",
                    "Registro informativo de tus importaciones recientes (hora, duración, filas)."
                  )}
                </p>
              </div>

              {historyLoading ? (
                <div className="text-xs text-slate-400">{L("Loading history...", "Cargando historial...")}</div>
              ) : history.length === 0 ? (
                <div className="text-xs text-slate-400">{L("No history yet.", "Sin historial aún.")}</div>
              ) : (
                <div className="mt-3 max-h-[520px] overflow-y-auto pr-2">
                  <div className="space-y-3">
                    {history.slice(0, 10).map((h) => (
                      <div key={h.id} className="rounded-xl border border-slate-800 bg-slate-950/20 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-slate-100">{h.broker}</div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              {formatDateTime(h.started_at, localeTag)}
                              {h.finished_at ? ` • ${formatDuration(h.duration_ms, localeTag)}` : ""}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {(Number(h.order_history_events ?? 0) > 0 || Number(h.order_history_duplicates ?? 0) > 0) ? (
                              <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
                                {L("Audit-ready", "Listo para auditoría")}
                              </span>
                            ) : null}
                            <StatusPill
                              status={h.status}
                              label={
                                h.status === "success"
                                  ? L("Success", "Éxito")
                                  : h.status === "failed"
                                    ? L("Failed", "Fallido")
                                    : L("Processing", "Procesando")
                              }
                            />
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            {L("Statement Trades", "Trades del statement")}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[11px]">
                            <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-2 py-1">
                              <div className="text-slate-400">{L("Imported", "Importadas")}</div>
                              <div className="font-semibold text-slate-100">{h.imported_rows ?? 0}</div>
                            </div>

                            <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-2 py-1">
                              <div className="text-slate-400">{L("Updated", "Actualizadas")}</div>
                              <div className="font-semibold text-slate-100">{h.updated_rows ?? 0}</div>
                            </div>

                            <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-2 py-1">
                              <div className="text-slate-400">{L("Duplicates", "Duplicados")}</div>
                              <div className="font-semibold text-slate-100">{h.duplicates ?? 0}</div>
                            </div>
                          </div>
                        </div>

                        {typeof h.order_history_events === "number" || typeof h.order_history_duplicates === "number" ? (
                          <div className="mt-3">
                            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                              {L("Order History", "Historial de órdenes")}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-2 py-1">
                                <div className="text-slate-400">{L("Imported", "Importadas")}</div>
                                <div className="font-semibold text-slate-100">{h.order_history_events ?? 0}</div>
                              </div>

                              <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-2 py-1">
                                <div className="text-slate-400">{L("Duplicates", "Duplicados")}</div>
                                <div className="font-semibold text-slate-100">{h.order_history_duplicates ?? 0}</div>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {(Number(h.imported_rows ?? 0) === 0 &&
                          Number(h.updated_rows ?? 0) === 0 &&
                          Number(h.duplicates ?? 0) === 0 &&
                          (Number(h.order_history_events ?? 0) > 0 || Number(h.order_history_duplicates ?? 0) > 0)) ? (
                          <div className="mt-2 text-[11px] text-slate-400">
                            {L(
                              "This batch only affected order history. No statement trades were imported.",
                              "Este batch solo afectó el historial de órdenes. No se importaron trades del statement."
                            )}
                          </div>
                        ) : null}

                        {h.comment ? (
                          <div className="mt-2 text-[11px] text-slate-300">
                            <span className="font-semibold text-slate-200">{L("Note:", "Nota:")}</span>{" "}
                            {h.comment}
                          </div>
                        ) : null}

                        {h.filename ? (
                          <div className="mt-2 truncate text-[11px] text-slate-400">
                            {L("File:", "Archivo:")} {h.filename}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
          ) : null}

          {activeImportTab === "broker" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-2">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {L("Provider", "Proveedor")}
                </div>
                <button
                  type="button"
                  onClick={() => setBrokerSyncProvider("snaptrade")}
                  className={[
                    "rounded-xl px-3 py-2 text-[11px] font-semibold transition",
                    brokerSyncProvider === "snaptrade"
                      ? "bg-emerald-400 text-slate-950"
                      : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:bg-slate-950/60",
                  ].join(" ")}
                >
                  SnapTrade (Beta)
                </button>
                <button
                  type="button"
                  onClick={() => setBrokerSyncProvider("webull")}
                  className={[
                    "rounded-xl px-3 py-2 text-[11px] font-semibold transition",
                    brokerSyncProvider === "webull"
                      ? "bg-emerald-400 text-slate-950"
                      : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:bg-slate-950/60",
                  ].join(" ")}
                >
                  Webull (OAuth)
                </button>
                <div className="ml-auto text-[11px] text-slate-400">
                  {brokerSyncProvider === "webull"
                    ? L("Direct OAuth connection (Webull).", "Conexión OAuth directa (Webull).")
                    : L("Connect via SnapTrade (beta).", "Conexión via SnapTrade (beta).")}
                </div>
              </div>

              {brokerSyncProvider === "snaptrade" ? (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-emerald-200">SnapTrade (Beta)</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {L(
                          "Connect your broker via SnapTrade to test what data we can receive (accounts, holdings, activities).",
                          "Conecta tu bróker via SnapTrade para probar qué datos podemos recibir (cuentas, holdings, actividades)."
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={snaptradeBroker}
                        onChange={(e) => setSnaptradeBroker(e.target.value)}
                        placeholder={L("Broker slug (optional)", "Broker slug (opcional)")}
                        className="w-48 rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                        disabled={snaptradeConnecting}
                      />
                      <button
                        type="button"
                        onClick={onSnaptradeConnect}
                        className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                        disabled={snaptradeConnecting}
                      >
                        {snaptradeConnecting ? L("Connecting...", "Conectando...") : L("Connect broker", "Conectar bróker")}
                      </button>
                      <button
                        type="button"
                        onClick={onSnaptradeLoadAccounts}
                        className="rounded-xl border border-slate-700 bg-slate-950/30 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-950/50"
                        disabled={false}
                      >
                        {L("Refresh accounts", "Refrescar cuentas")}
                      </button>
                      <button
                        type="button"
                        onClick={onSnaptradeReset}
                        className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/20 disabled:opacity-60"
                        disabled={snaptradeResetting}
                      >
                        {snaptradeResetting ? L("Resetting...", "Reiniciando...") : L("Reset link", "Reiniciar enlace")}
                      </button>
                    </div>
                  </div>

                  {showSnaptradeHelp ? (
                    <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">
                            {L(
                              "Important: allow cookies & pop‑ups to complete broker login.",
                              "Importante: permite cookies y pop‑ups para completar el login del bróker."
                            )}
                          </div>
                          <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-100/90">
                            <li>
                              {L(
                                "If the portal stays stuck, open in a new tab and allow cookies for SnapTrade.",
                                "Si el portal se queda pegado, ábrelo en una nueva pestaña y permite cookies para SnapTrade."
                              )}
                            </li>
                            <li>
                              {L(
                                "Safari: Settings → Privacy → temporarily disable “Prevent cross‑site tracking”.",
                                "Safari: Ajustes → Privacidad → desactiva temporalmente “Evitar seguimiento entre sitios”."
                              )}
                            </li>
                            <li>
                              {L(
                                "Chrome: allow third‑party cookies for app.snaptrade.com.",
                                "Chrome: permite cookies de terceros para app.snaptrade.com."
                              )}
                            </li>
                          </ul>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowSnaptradeHelp(false)}
                          className="rounded-lg border border-amber-300/40 px-2 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-400/10"
                        >
                          {L("Hide", "Ocultar")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSnaptradeHelp(true)}
                      className="mt-4 text-[11px] font-semibold text-amber-200/80 hover:text-amber-200"
                    >
                      {L("Show connection tips", "Mostrar tips de conexión")}
                    </button>
                  )}

                  {snaptradeStatus ? (
                    <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
                      {snaptradeStatus}
                    </div>
                  ) : null}

                  {snaptradeError ? (
                    <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      {snaptradeError}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                      <div className="text-xs font-semibold text-slate-100">{L("Accounts", "Cuentas")}</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {L("Select an account, then choose what to sync.", "Selecciona una cuenta y luego elige qué sincronizar.")}
                      </p>
                      <select
                        value={snaptradeAccountId}
                        onChange={(e) => setSnaptradeAccountId(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                        disabled={false}
                      >
                        <option value="">{L("Select account", "Selecciona cuenta")}</option>
                        {(snaptradeAccounts ?? []).map((acc: any) => (
                          <option key={String(acc?.id ?? acc?.accountId ?? Math.random())} value={String(acc?.id ?? acc?.accountId ?? "")}>
                            {String(acc?.name ?? acc?.account_name ?? acc?.institution_name ?? acc?.id ?? "Account")}
                          </option>
                        ))}
                      </select>

                      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="text-[11px] font-semibold text-slate-200">
                          {L("Sync scope", "Qué sincronizar")}
                        </div>
                        <div className="mt-2 grid gap-2 text-[11px] text-slate-200">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={syncHoldings} onChange={(e) => setSyncHoldings(e.target.checked)} />
                            {L("Holdings (open positions)", "Holdings (posiciones abiertas)")}
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={syncBalances} onChange={(e) => setSyncBalances(e.target.checked)} />
                            {L("Balances", "Balances")}
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={syncActivities} onChange={(e) => setSyncActivities(e.target.checked)} />
                            {L("Activities (last 30 days)", "Actividades (últimos 30 días)")}
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={syncOrders} onChange={(e) => setSyncOrders(e.target.checked)} />
                            {L("Recent orders", "Órdenes recientes")}
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={syncImportTrades} onChange={(e) => setSyncImportTrades(e.target.checked)} />
                            {L("Import trades (30d)", "Importar trades (30d)")}
                          </label>
                        </div>
                      </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onSnaptradeSyncSelected}
                    className="rounded-xl bg-emerald-400 px-4 py-2 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                    disabled={!snaptradeAccountId || snaptradeSyncing}
                  >
                    {snaptradeSyncing ? L("Syncing...", "Sincronizando...") : L("Sync selected", "Sincronizar selección")}
                  </button>
                  <button
                    type="button"
                    onClick={onSnaptradePreviewTrades}
                    className="rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-950/50 disabled:opacity-60"
                    disabled={!snaptradeAccountId || snaptradePreviewLoading}
                  >
                    {snaptradePreviewLoading ? L("Loading preview...", "Cargando vista previa...") : L("Preview trades", "Ver trades")}
                  </button>
                  <button
                    type="button"
                    onClick={onSnaptradeImportTrades}
                    className="rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-60"
                    disabled={!snaptradeAccountId || snaptradeImporting}
                  >
                    {snaptradeImporting ? L("Importing...", "Importando...") : L("Import trades only", "Solo importar trades")}
                  </button>
                  <button
                    type="button"
                    onClick={onSnaptradeImportSelected}
                    className="rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-60"
                    disabled={!snaptradeAccountId || snaptradeImporting || !snaptradeTradePreview?.length}
                  >
                    {snaptradeImporting
                      ? L("Importing...", "Importando...")
                      : L(`Import selected (${snaptradeSelectedCount})`, `Importar selección (${snaptradeSelectedCount})`)}
                  </button>
                </div>
              </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                      <div className="text-xs font-semibold text-slate-100">{L("Preview", "Vista previa")}</div>
                      <div className="mt-3 grid gap-3">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                          <div className="text-[11px] font-semibold text-slate-200">
                            {L("Open positions", "Posiciones abiertas")}
                          </div>
                          {snaptradePositions.length ? (
                            <div className="mt-2 overflow-hidden rounded-lg border border-slate-800">
                              <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr] gap-2 bg-slate-950/50 px-2 py-1 text-[10px] text-slate-400">
                                <span>{L("Symbol", "Símbolo")}</span>
                                <span>{L("Qty", "Cant.")}</span>
                                <span>{L("Avg", "Prom.")}</span>
                                <span>{L("Mkt Val", "Val. Mkt")}</span>
                              </div>
                              <div className="max-h-40 overflow-auto">
                                {snaptradePositions.map((pos: any, idx: number) => {
                                  const symbol =
                                    pos?.symbol?.symbol ??
                                    pos?.symbol?.ticker ??
                                    pos?.symbol ??
                                    pos?.instrument?.symbol ??
                                    pos?.instrument?.ticker ??
                                    pos?.ticker ??
                                    pos?.name ??
                                    "—";
                                  const qty = pos?.quantity ?? pos?.qty ?? pos?.units ?? "—";
                                  const avg =
                                    pos?.average_purchase_price ??
                                    pos?.averagePurchasePrice ??
                                    pos?.avg_price ??
                                    pos?.price ??
                                    pos?.avgCost;
                                  const value =
                                    pos?.market_value ??
                                    pos?.marketValue ??
                                    pos?.value ??
                                    pos?.marketValueUsd;
                                  return (
                                    <div
                                      key={`${symbol}-${idx}`}
                                      className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr] gap-2 border-t border-slate-800 px-2 py-1 text-[11px] text-slate-200"
                                    >
                                      <span className="truncate">{String(symbol)}</span>
                                      <span>{String(qty)}</span>
                                      <span>{formatMoney(typeof avg === "number" ? avg : undefined)}</span>
                                      <span>{formatMoney(typeof value === "number" ? value : undefined)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-[11px] text-slate-400">
                              {L("No positions loaded yet.", "Aún no hay posiciones cargadas.")}
                            </div>
                          )}
                        </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[11px] font-semibold text-slate-200">{L("Balances", "Balances")}</div>
                    {snaptradeBalancesSummary ? (
                            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                              <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1">
                                <div className="text-slate-400">{L("Cash", "Efectivo")}</div>
                                <div className="text-slate-100 font-semibold">{formatMoney(snaptradeBalancesSummary.cash)}</div>
                              </div>
                              <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1">
                                <div className="text-slate-400">{L("Buying power", "Poder de compra")}</div>
                                <div className="text-slate-100 font-semibold">{formatMoney(snaptradeBalancesSummary.buyingPower)}</div>
                              </div>
                              <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1">
                                <div className="text-slate-400">{L("Equity", "Equidad")}</div>
                                <div className="text-slate-100 font-semibold">{formatMoney(snaptradeBalancesSummary.equity)}</div>
                              </div>
                            </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-400">
                        {L("No balances loaded yet.", "Aún no hay balances cargados.")}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold text-slate-200">
                        {L("Trades preview (30d)", "Vista previa de trades (30d)")}
                      </div>
                      {snaptradePreviewMeta ? (
                        <div className="text-[10px] text-slate-400">
                          {L(
                            `Total ${snaptradePreviewMeta.total} · New ${snaptradePreviewMeta.inserted} · Existing ${snaptradePreviewMeta.updated}`,
                            `Total ${snaptradePreviewMeta.total} · Nuevos ${snaptradePreviewMeta.inserted} · Existentes ${snaptradePreviewMeta.updated}`
                          )}
                        </div>
                      ) : null}
                    </div>
                    {snaptradeTradePreview && snaptradeTradePreview.length ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-800">
                        <div className="grid grid-cols-[24px_1.1fr_0.6fr_0.6fr_0.6fr_0.8fr] gap-2 bg-slate-950/50 px-2 py-1 text-[10px] text-slate-400">
                          <span></span>
                          <span>{L("Symbol", "Símbolo")}</span>
                          <span>{L("Side", "Lado")}</span>
                          <span>{L("Qty", "Cant.")}</span>
                          <span>{L("Price", "Precio")}</span>
                          <span>{L("Date", "Fecha")}</span>
                        </div>
                        <div className="max-h-56 overflow-auto">
                          {snaptradeTradePreview.map((row: any, idx: number) => {
                            const hash = row?.trade_hash || row?.tradeHash || `${idx}`;
                            const checked = !!snaptradePreviewSelection[hash];
                            const symbol = row?.symbol ?? row?.instrument_symbol ?? row?.contract_code ?? "—";
                            const side = row?.side ?? "—";
                            const qty = row?.qty ?? row?.quantity ?? "—";
                            const price = row?.price ?? row?.avg_price ?? row?.average_price ?? "—";
                            const date = row?.executed_at ? String(row.executed_at).slice(0, 10) : "—";
                            const isDup = row?.is_duplicate;
                            return (
                              <label
                                key={hash}
                                className="grid cursor-pointer grid-cols-[24px_1.1fr_0.6fr_0.6fr_0.6fr_0.8fr] gap-2 border-t border-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-950/60"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setSnaptradePreviewSelection((prev) => ({
                                      ...prev,
                                      [hash]: e.target.checked,
                                    }))
                                  }
                                />
                                <span className="truncate">{String(symbol)}</span>
                                <span className={isDup ? "text-amber-200" : ""}>{String(side)}</span>
                                <span>{String(qty)}</span>
                                <span>{formatMoney(typeof price === "number" ? price : Number(price))}</span>
                                <span className="text-[10px] text-slate-400">{date}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-400">
                        {L(
                          "No trades preview loaded yet. Click “Preview trades” to review before importing.",
                          "Aún no hay vista previa. Presiona “Ver trades” para revisar antes de importar."
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[11px] font-semibold text-slate-200">
                      {L("Activities (digest)", "Actividades (resumen)")}
                    </div>
                    {snaptradeActivitiesPreview.length ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-800">
                        <div className="grid grid-cols-[0.9fr_0.9fr_1.2fr_0.6fr_0.6fr_0.8fr] gap-2 bg-slate-950/50 px-2 py-1 text-[10px] text-slate-400">
                          <span>{L("Date", "Fecha")}</span>
                          <span>{L("Type", "Tipo")}</span>
                          <span>{L("Symbol", "Símbolo")}</span>
                          <span>{L("Qty", "Cant.")}</span>
                          <span>{L("Price", "Precio")}</span>
                          <span>{L("Amount", "Monto")}</span>
                        </div>
                        <div className="max-h-44 overflow-auto">
                          {snaptradeActivitiesPreview.map((row, idx) => (
                            <div
                              key={`${row.symbol}-${idx}`}
                              className="grid grid-cols-[0.9fr_0.9fr_1.2fr_0.6fr_0.6fr_0.8fr] gap-2 border-t border-slate-800 px-2 py-1 text-[11px] text-slate-200"
                            >
                              <span className="text-slate-400">{formatDateShort(row.date)}</span>
                              <span className="truncate">{row.type}</span>
                              <span className="truncate">{row.symbol}</span>
                              <span>{row.qty ?? "—"}</span>
                              <span>{formatMoney(typeof row.price === "number" ? row.price : Number(row.price))}</span>
                              <span>{formatMoney(typeof row.amount === "number" ? row.amount : Number(row.amount))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-400">
                        {L("No activities loaded yet.", "Aún no hay actividades cargadas.")}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[11px] font-semibold text-slate-200">
                      {L("Orders (digest)", "Órdenes (resumen)")}
                    </div>
                    {snaptradeOrdersPreview.length ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-800">
                        <div className="grid grid-cols-[0.9fr_1.2fr_0.7fr_0.6fr_0.6fr_0.8fr] gap-2 bg-slate-950/50 px-2 py-1 text-[10px] text-slate-400">
                          <span>{L("Date", "Fecha")}</span>
                          <span>{L("Symbol", "Símbolo")}</span>
                          <span>{L("Side", "Lado")}</span>
                          <span>{L("Qty", "Cant.")}</span>
                          <span>{L("Price", "Precio")}</span>
                          <span>{L("Status", "Estado")}</span>
                        </div>
                        <div className="max-h-44 overflow-auto">
                          {snaptradeOrdersPreview.map((row, idx) => (
                            <div
                              key={`${row.symbol}-${idx}`}
                              className="grid grid-cols-[0.9fr_1.2fr_0.7fr_0.6fr_0.6fr_0.8fr] gap-2 border-t border-slate-800 px-2 py-1 text-[11px] text-slate-200"
                            >
                              <span className="text-slate-400">{formatDateShort(row.date)}</span>
                              <span className="truncate">{row.symbol}</span>
                              <span>{row.side}</span>
                              <span>{row.qty ?? "—"}</span>
                              <span>{formatMoney(typeof row.price === "number" ? row.price : Number(row.price))}</span>
                              <span className="text-slate-400">{row.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-400">
                        {L("No orders loaded yet.", "Aún no hay órdenes cargadas.")}
                      </div>
                    )}
                  </div>
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-emerald-200">Webull (OAuth)</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {L(
                          "Connect Webull directly using OAuth. Tokens are stored securely and refreshed automatically.",
                          "Conecta Webull directamente con OAuth. Los tokens se guardan de forma segura y se renuevan automáticamente."
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={onWebullConnect}
                        className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                        disabled={webullConnecting}
                      >
                        {webullConnecting ? L("Connecting...", "Conectando...") : L("Connect broker", "Conectar bróker")}
                      </button>
                      <button
                        type="button"
                        onClick={onWebullLoadAccounts}
                        className="rounded-xl border border-slate-700 bg-slate-950/30 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-950/50"
                      >
                        {L("Refresh accounts", "Refrescar cuentas")}
                      </button>
                      <button
                        type="button"
                        onClick={onWebullDisconnect}
                        className="rounded-xl border border-slate-700 bg-slate-950/30 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-950/50"
                      >
                        {L("Disconnect", "Desconectar")}
                      </button>
                    </div>
                  </div>

                  {webullStatus ? (
                    <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
                      {webullStatus}
                    </div>
                  ) : null}

                  {webullError ? (
                    <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      {webullError}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                      <div className="text-xs font-semibold text-slate-100">{L("Accounts", "Cuentas")}</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {L("Select an account, then choose what to sync.", "Selecciona una cuenta y luego elige qué sincronizar.")}
                      </p>
                      <select
                        value={webullAccountId}
                        onChange={(e) => setWebullAccountId(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                      >
                        <option value="">{L("Select account", "Selecciona cuenta")}</option>
                        {(webullAccounts ?? []).map((acc: any) => (
                          <option
                            key={String(acc?.id ?? acc?.accountId ?? acc?.account_id ?? Math.random())}
                            value={String(acc?.id ?? acc?.accountId ?? acc?.account_id ?? "")}
                          >
                            {String(
                              acc?.account_name ??
                                acc?.accountName ??
                                acc?.name ??
                                acc?.accountType ??
                                acc?.brokerage_account_id ??
                                acc?.id ??
                                "Account"
                            )}
                          </option>
                        ))}
                      </select>

                      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="text-[11px] font-semibold text-slate-200">
                          {L("Sync scope", "Qué sincronizar")}
                        </div>
                        <div className="mt-2 grid gap-2 text-[11px] text-slate-200">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={webullSyncHoldings}
                              onChange={(e) => setWebullSyncHoldings(e.target.checked)}
                            />
                            {L("Holdings (open positions)", "Holdings (posiciones abiertas)")}
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={webullSyncBalances}
                              onChange={(e) => setWebullSyncBalances(e.target.checked)}
                            />
                            {L("Balances", "Balances")}
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={webullSyncActivities}
                              onChange={(e) => setWebullSyncActivities(e.target.checked)}
                            />
                            {L("Activities (last 30 days)", "Actividades (últimos 30 días)")}
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={webullSyncOrders}
                              onChange={(e) => setWebullSyncOrders(e.target.checked)}
                            />
                            {L("Recent orders", "Órdenes recientes")}
                          </label>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={onWebullSyncSelected}
                          className="rounded-xl bg-emerald-400 px-4 py-2 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                          disabled={!webullAccountId || webullSyncing}
                        >
                          {webullSyncing ? L("Syncing...", "Sincronizando...") : L("Sync selected", "Sincronizar selección")}
                        </button>
                        <button
                          type="button"
                          onClick={() => onWebullLoadOrders(30)}
                          className="rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-950/50 disabled:opacity-60"
                          disabled={!webullAccountId}
                        >
                          {L("Load recent orders", "Cargar órdenes")}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                      <div className="text-xs font-semibold text-slate-100">{L("Preview", "Vista previa")}</div>
                      <div className="mt-3 grid gap-3">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                          <div className="text-[11px] font-semibold text-slate-200">
                            {L("Open positions", "Posiciones abiertas")}
                          </div>
                          {webullPositionsPreview.length ? (
                            <div className="mt-2 overflow-hidden rounded-lg border border-slate-800">
                              <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr] gap-2 bg-slate-950/50 px-2 py-1 text-[10px] text-slate-400">
                                <span>{L("Symbol", "Símbolo")}</span>
                                <span>{L("Qty", "Cant.")}</span>
                                <span>{L("Avg", "Prom.")}</span>
                                <span>{L("Mkt Val", "Val. Mkt")}</span>
                              </div>
                              <div className="max-h-40 overflow-auto">
                                {webullPositionsPreview.map((pos: any, idx: number) => {
                                  const symbol =
                                    pos?.symbol ??
                                    pos?.ticker ??
                                    pos?.instrument?.symbol ??
                                    pos?.instrument?.ticker ??
                                    pos?.name ??
                                    "—";
                                  const qty = pos?.position ?? pos?.quantity ?? pos?.qty ?? pos?.units ?? "—";
                                  const avg = pos?.avg_price ?? pos?.avgPrice ?? pos?.average_cost ?? pos?.price;
                                  const value = pos?.market_value ?? pos?.marketValue ?? pos?.value ?? pos?.marketValueUsd;
                                  return (
                                    <div
                                      key={`${symbol}-${idx}`}
                                      className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr] gap-2 border-t border-slate-800 px-2 py-1 text-[11px] text-slate-200"
                                    >
                                      <span className="truncate">{String(symbol)}</span>
                                      <span>{String(qty)}</span>
                                      <span>{formatMoney(typeof avg === "number" ? avg : undefined)}</span>
                                      <span>{formatMoney(typeof value === "number" ? value : undefined)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-[11px] text-slate-400">
                              {L("No positions loaded yet.", "Aún no hay posiciones cargadas.")}
                            </div>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                          <div className="text-[11px] font-semibold text-slate-200">{L("Balances", "Balances")}</div>
                          {webullBalancesSummary ? (
                            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                              <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1">
                                <div className="text-slate-400">{L("Cash", "Efectivo")}</div>
                                <div className="text-slate-100 font-semibold">{formatMoney(webullBalancesSummary.cash)}</div>
                              </div>
                              <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1">
                                <div className="text-slate-400">{L("Buying power", "Poder de compra")}</div>
                                <div className="text-slate-100 font-semibold">{formatMoney(webullBalancesSummary.buyingPower)}</div>
                              </div>
                              <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1">
                                <div className="text-slate-400">{L("Equity", "Equidad")}</div>
                                <div className="text-slate-100 font-semibold">{formatMoney(webullBalancesSummary.equity)}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-[11px] text-slate-400">
                              {L("No balances loaded yet.", "Aún no hay balances cargados.")}
                            </div>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                          <div className="text-[11px] font-semibold text-slate-200">
                            {L("Activities (digest)", "Actividades (resumen)")}
                          </div>
                          {webullActivitiesPreview.length ? (
                            <div className="mt-2 overflow-hidden rounded-lg border border-slate-800">
                              <div className="grid grid-cols-[0.9fr_0.9fr_1.2fr_0.6fr_0.6fr_0.8fr] gap-2 bg-slate-950/50 px-2 py-1 text-[10px] text-slate-400">
                                <span>{L("Date", "Fecha")}</span>
                                <span>{L("Type", "Tipo")}</span>
                                <span>{L("Symbol", "Símbolo")}</span>
                                <span>{L("Qty", "Cant.")}</span>
                                <span>{L("Price", "Precio")}</span>
                                <span>{L("Amount", "Monto")}</span>
                              </div>
                              <div className="max-h-44 overflow-auto">
                                {webullActivitiesPreview.map((row, idx) => (
                                  <div
                                    key={`${row.symbol}-${idx}`}
                                    className="grid grid-cols-[0.9fr_0.9fr_1.2fr_0.6fr_0.6fr_0.8fr] gap-2 border-t border-slate-800 px-2 py-1 text-[11px] text-slate-200"
                                  >
                                    <span className="text-slate-400">{formatDateShort(row.date)}</span>
                                    <span className="truncate">{row.type}</span>
                                    <span className="truncate">{row.symbol}</span>
                                    <span>{row.qty ?? "—"}</span>
                                    <span>{formatMoney(typeof row.price === "number" ? row.price : Number(row.price))}</span>
                                    <span>{formatMoney(typeof row.amount === "number" ? row.amount : Number(row.amount))}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-[11px] text-slate-400">
                              {L("No activities loaded yet.", "Aún no hay actividades cargadas.")}
                            </div>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                          <div className="text-[11px] font-semibold text-slate-200">
                            {L("Orders (digest)", "Órdenes (resumen)")}
                          </div>
                          {webullOrdersPreview.length ? (
                            <div className="mt-2 overflow-hidden rounded-lg border border-slate-800">
                              <div className="grid grid-cols-[0.9fr_1.2fr_0.7fr_0.6fr_0.6fr_0.8fr] gap-2 bg-slate-950/50 px-2 py-1 text-[10px] text-slate-400">
                                <span>{L("Date", "Fecha")}</span>
                                <span>{L("Symbol", "Símbolo")}</span>
                                <span>{L("Side", "Lado")}</span>
                                <span>{L("Qty", "Cant.")}</span>
                                <span>{L("Price", "Precio")}</span>
                                <span>{L("Status", "Estado")}</span>
                              </div>
                              <div className="max-h-44 overflow-auto">
                                {webullOrdersPreview.map((row, idx) => (
                                  <div
                                    key={`${row.symbol}-${idx}`}
                                    className="grid grid-cols-[0.9fr_1.2fr_0.7fr_0.6fr_0.6fr_0.8fr] gap-2 border-t border-slate-800 px-2 py-1 text-[11px] text-slate-200"
                                  >
                                    <span className="text-slate-400">{formatDateShort(row.date)}</span>
                                    <span className="truncate">{row.symbol}</span>
                                    <span>{row.side}</span>
                                    <span>{row.qty ?? "—"}</span>
                                    <span>{formatMoney(typeof row.price === "number" ? row.price : Number(row.price))}</span>
                                    <span className="text-slate-400">{row.status}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-[11px] text-slate-400">
                              {L("No orders loaded yet.", "Aún no hay órdenes cargadas.")}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
