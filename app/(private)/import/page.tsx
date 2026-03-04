"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TopNav from "@/app/components/TopNav";
import { supabase } from "@/lib/supaBaseClient";
import { useRouter, useSearchParams } from "next/navigation";
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
  imported_rows: number | null; // inserted
  updated_rows: number | null;  // ✅ NEW
  duplicates: number | null;    // skipped (ledger)
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
  const [snaptradeBroker, setSnaptradeBroker] = useState<string>("");
  const [snaptradeImporting, setSnaptradeImporting] = useState(false);
  const [showSnaptradeHelp, setShowSnaptradeHelp] = useState(true);
  const [snaptradeResetting, setSnaptradeResetting] = useState(false);

  const brokerMeta = useMemo(() => BROKERS.find((b) => b.id === broker), [broker]);

  const router = useRouter();
  const searchParams = useSearchParams();

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

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!searchParams) return;
    const flag = searchParams.get("snaptrade");
    if (flag === "connected") {
      onSnaptradeLoadAccounts();
      setSnaptradeStatus(
        L("Connection completed. Loading accounts...", "Conexión completada. Cargando cuentas...")
      );
      router.replace("/import");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
      if (inserted !== null) parts.push(isEs ? `Importadas ${inserted} filas` : `Imported ${inserted} rows`);
      if (duplicates !== null) parts.push(isEs ? `${duplicates} duplicados omitidos` : `${duplicates} duplicates skipped`);
      if (updated !== null) parts.push(isEs ? `${updated} actualizadas` : `${updated} updated`);
      if (orderEvents !== null)
        parts.push(
          isEs
            ? `Ordenes ${orderEvents} (${orderDupes ?? 0} duplicadas)`
            : `Order history ${orderEvents} (${orderDupes ?? 0} duplicates)`
        );

      setStatusMsg(
        parts.length
          ? `${parts.join(" (").replace(/\)\s\(/g, ", ")}).`.replace(/\(\)/g, "")
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
                            {h.order_history_events && h.order_history_events > 0 ? (
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

                        {/* ✅ 3 tiles */}
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-2 py-1">
                            <div className="text-slate-400">{L("Imported", "Importadas")}</div>
                            <div className="font-semibold text-slate-100">{h.imported_rows ?? "—"}</div>
                          </div>

                          <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-2 py-1">
                            <div className="text-slate-400">{L("Updated", "Actualizadas")}</div>
                            <div className="font-semibold text-slate-100">{h.updated_rows ?? "—"}</div>
                          </div>

                          <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-2 py-1">
                            <div className="text-slate-400">{L("Duplicates", "Duplicados")}</div>
                            <div className="font-semibold text-slate-100">{h.duplicates ?? "—"}</div>
                          </div>
                        </div>

                        {h.comment ? (
                          <div className="mt-2 text-[11px] text-slate-300">
                            <span className="font-semibold text-slate-200">{L("Note:", "Nota:")}</span>{" "}
                            {h.comment}
                          </div>
                        ) : null}

                        {typeof h.order_history_events === "number" ? (
                          <div className="mt-2 text-[11px] text-slate-300">
                            <span className="font-semibold text-slate-200">
                              {L("Order history events:", "Eventos de órdenes:")}
                            </span>{" "}
                            {h.order_history_events}
                            {typeof h.order_history_duplicates === "number"
                              ? ` (${L("duplicates", "duplicados")}: ${h.order_history_duplicates})`
                              : ""}
                          </div>
                        ) : null}

                        {h.filename ? (
                          <div className="mt-1 truncate text-[11px] text-slate-400">
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

          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl">
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

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="text-xs font-semibold text-slate-100">{L("Accounts", "Cuentas")}</div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {L("Select an account to pull holdings and activities.", "Selecciona una cuenta para ver holdings y actividades.")}
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

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onSnaptradeLoadHoldings}
                    className="rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-950/50"
                    disabled={!snaptradeAccountId}
                  >
                    {L("Load holdings", "Cargar holdings")}
                  </button>
                  <button
                    type="button"
                    onClick={onSnaptradeLoadBalances}
                    className="rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-950/50"
                    disabled={!snaptradeAccountId}
                  >
                    {L("Load balances", "Cargar balances")}
                  </button>
                  <button
                    type="button"
                    onClick={onSnaptradeLoadActivities}
                    className="rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-950/50"
                    disabled={!snaptradeAccountId}
                  >
                    {L("Load activities (30d)", "Cargar actividades (30d)")}
                  </button>
                  <button
                    type="button"
                    onClick={onSnaptradeLoadOrders}
                    className="rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-950/50"
                    disabled={!snaptradeAccountId}
                  >
                    {L("Load recent orders", "Cargar órdenes recientes")}
                  </button>
                  <button
                    type="button"
                    onClick={onSnaptradeImportTrades}
                    className="rounded-xl bg-emerald-400 px-3 py-2 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                    disabled={!snaptradeAccountId || snaptradeImporting}
                  >
                    {snaptradeImporting ? L("Importing...", "Importando...") : L("Import trades (30d)", "Importar trades (30d)")}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="text-xs font-semibold text-slate-100">{L("Raw data preview", "Vista previa raw")}</div>
                <div className="mt-2 grid gap-3">
                  {snaptradeBalances ? (
                    <pre className="max-h-44 overflow-auto rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-[10px] text-slate-200">
                      {JSON.stringify(snaptradeBalances, null, 2)}
                    </pre>
                  ) : null}
                  {snaptradeOrders ? (
                    <pre className="max-h-44 overflow-auto rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-[10px] text-slate-200">
                      {JSON.stringify(snaptradeOrders, null, 2)}
                    </pre>
                  ) : null}
                  {snaptradeHoldings ? (
                    <pre className="max-h-44 overflow-auto rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-[10px] text-slate-200">
                      {JSON.stringify(snaptradeHoldings, null, 2)}
                    </pre>
                  ) : null}
                  {snaptradeActivities ? (
                    <pre className="max-h-44 overflow-auto rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-[10px] text-slate-200">
                      {JSON.stringify(snaptradeActivities, null, 2)}
                    </pre>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
