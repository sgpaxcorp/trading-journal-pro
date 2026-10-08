"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, Archive, BarChart3, CalendarClock, ChevronRight, CirclePause,
  CirclePlay, Clock3, Database, FileSpreadsheet, FileText, History, ImagePlus, Layers3,
  Loader2, Plus, Search, ShieldCheck, Sparkles, X,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { getOptionFlowBetaCopy } from "@/lib/optionFlowBetaCopy";
import {
  OPTION_FLOW_PROVIDERS, parseOptionFlowFile, rowsForOptionFlowSymbol, sha256File,
  type OptionFlowParseProgress, type OptionFlowProviderId,
} from "@/lib/optionFlowClientParser";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type Lang = "en" | "es";
type WorkspaceTab = "overview" | "timeline" | "expirations" | "contracts" | "open_interest" | "trend" | "analyses" | "evidence";

type Profile = {
  id: string;
  symbol: string;
  status: "active" | "paused" | "archived";
  last_analysis_at?: string | null;
  last_flow_session_date?: string | null;
  current_snapshot?: Record<string, any> | null;
};

type DailyBar = {
  id?: string;
  symbol: string;
  sessionDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose?: number | null;
  volume?: number | null;
};

type Workspace = {
  profile: Profile;
  analyses: any[];
  bars: DailyBar[];
  reviews: any[];
  checkpoints: any[];
  events: any[];
  sources?: any[];
  contractSnapshots?: any[];
  openInterestIntelligence?: Record<string, any> | null;
  oiReconciliations?: any[];
  optionMarketData?: Record<string, any> | null;
  trend?: Record<string, any> | null;
};

type ScreenshotInput = { id: string; name: string; dataUrl: string };

const TABS: Array<{ id: WorkspaceTab; icon: typeof Activity; en: string; es: string }> = [
  { id: "overview", icon: Activity, en: "Overview", es: "Resumen" },
  { id: "timeline", icon: History, en: "Timeline", es: "Historial" },
  { id: "expirations", icon: CalendarClock, en: "Expirations", es: "Expiraciones" },
  { id: "contracts", icon: Layers3, en: "Contracts", es: "Contratos" },
  { id: "open_interest", icon: Database, en: "OI intelligence", es: "Inteligencia OI" },
  { id: "trend", icon: BarChart3, en: "Price trend", es: "Tendencia" },
  { id: "analyses", icon: FileText, en: "Analyses", es: "Análisis" },
  { id: "evidence", icon: ShieldCheck, en: "Evidence", es: "Evidencia" },
];

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function cleanSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9.^=-]/g, "").slice(0, 10);
}

function horizonLabel(value: unknown, lang: Lang) {
  const labels: Record<string, [string, string]> = {
    today: ["Today", "Hoy"],
    next_session: ["Next session", "Próxima sesión"],
    one_week: ["1 week", "1 semana"],
    one_month: ["1 month", "1 mes"],
    three_months: ["3 months", "3 meses"],
    six_months: ["6 months", "6 meses"],
    leaps: ["LEAPS", "LEAPS"],
  };
  const match = labels[String(value ?? "")];
  return match ? match[lang === "es" ? 1 : 0] : "DATA NOT AVAILABLE";
}

function money(value: unknown) {
  if (value == null || value === "") return "DATA NOT AVAILABLE";
  const number = Number(value);
  if (!Number.isFinite(number)) return "DATA NOT AVAILABLE";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", notation: Math.abs(number) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(number) >= 100 ? 0 : 2,
  }).format(number);
}

function compact(value: unknown) {
  if (value == null || value === "") return "DATA NOT AVAILABLE";
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(number)
    : "DATA NOT AVAILABLE";
}

function pct(value: unknown) {
  if (value == null || value === "") return "DATA NOT AVAILABLE";
  const number = Number(value);
  return Number.isFinite(number) ? `${number >= 0 ? "+" : ""}${number.toFixed(2)}%` : "DATA NOT AVAILABLE";
}

function displayDate(value: unknown, lang: Lang) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(lang === "es" ? "es-PR" : "en-US", {
    month: "short", day: "numeric", year: "numeric",
  }).format(date);
}

function evidenceDateKey(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function biasTone(value: unknown) {
  const bias = String(value ?? "").toLowerCase();
  if (bias.includes("bull")) return "border-emerald-400/35 bg-emerald-400/10 text-emerald-200";
  if (bias.includes("bear")) return "border-rose-400/35 bg-rose-400/10 text-rose-200";
  return "border-sky-400/30 bg-sky-400/10 text-sky-200";
}

async function compressedScreenshotDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1_800 / bitmap.width, 1_800 / bitmap.height);
    let quality = 0.88;
    let result = "";
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the screenshot.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      result = canvas.toDataURL("image/jpeg", quality);
      if (result.length <= 800_000) return result;
      quality = Math.max(0.58, quality - 0.08);
      scale *= 0.84;
    }
    if (!result || result.length > 900_000) throw new Error("The screenshot is too large after compression.");
    return result;
  } finally {
    bitmap.close();
  }
}

function Metric({ label, value, tone = "text-slate-50" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 border-l border-slate-800 pl-3 first:border-l-0 first:pl-0">
      <p className="text-[9px] font-semibold uppercase text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export default function OptionFlowIntelligenceCenter() {
  const { user } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale) as Lang;
  const isEs = lang === "es";
  const betaCopy = getOptionFlowBetaCopy(lang);
  const bypassPaywall = ["1", "true"].includes(String(process.env.NEXT_PUBLIC_OPTIONFLOW_BYPASS ?? "").toLowerCase());
  const L = useCallback((en: string, es: string) => (isEs ? es : en), [isEs]);

  const [checking, setChecking] = useState(true);
  const [entitled, setEntitled] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingOi, setRefreshingOi] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [provider, setProvider] = useState<OptionFlowProviderId>("unusualwhales");
  const [sourceSessionDate, setSourceSessionDate] = useState(todayKey);
  const [notes, setNotes] = useState("");
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Array<Record<string, unknown>>>([]);
  const [detectedSymbols, setDetectedSymbols] = useState<string[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotInput[]>([]);
  const [parseProgress, setParseProgress] = useState<OptionFlowParseProgress>({ percent: 0, scanned: 0, accepted: 0 });
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const authenticatedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error(L("Your session expired. Sign in again.", "Tu sesión expiró. Inicia sesión nuevamente."));
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(url, { ...init, headers, cache: "no-store" });
  }, [L]);

  const loadProfiles = useCallback(async (preferredId?: string | null) => {
    if (!user?.id || (!entitled && !bypassPaywall)) return null;
    setLoadingProfiles(true);
    try {
      const response = await authenticatedFetch("/api/option-flow/profiles");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || L("Could not load profiles.", "No se pudieron cargar los perfiles."));
      const next: Profile[] = Array.isArray(body.profiles) ? body.profiles : [];
      setProfiles(next);
      const nextId = preferredId && next.some((item) => item.id === preferredId)
        ? preferredId
        : selectedId && next.some((item) => item.id === selectedId) ? selectedId : next[0]?.id ?? null;
      setSelectedId(nextId);
      setNotice("");
      return nextId;
    } catch (error: any) {
      setProfiles([]);
      setSelectedId(null);
      setNotice(error?.message || L("Could not load profiles.", "No se pudieron cargar los perfiles."));
      return null;
    } finally {
      setLoadingProfiles(false);
    }
  }, [authenticatedFetch, bypassPaywall, entitled, L, selectedId, user?.id]);

  const loadWorkspace = useCallback(async (profileId: string) => {
    setLoadingWorkspace(true);
    try {
      const response = await authenticatedFetch(`/api/option-flow/profiles?profileId=${encodeURIComponent(profileId)}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || L("Could not load the profile.", "No se pudo cargar el perfil."));
      setWorkspace(body.workspace ?? null);
    } catch (error: any) {
      setNotice(error?.message || L("Could not load the profile.", "No se pudo cargar el perfil."));
      setWorkspace(null);
    } finally {
      setLoadingWorkspace(false);
    }
  }, [authenticatedFetch, L]);

  useEffect(() => {
    let alive = true;
    async function checkAccess() {
      if (!user?.id) { if (alive) setChecking(false); return; }
      if (bypassPaywall) { if (alive) { setEntitled(true); setChecking(false); } return; }
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      const response = token ? await fetch("/api/smart-tools/access?feature=option_flow", {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null) : null;
      const body = response ? await response.json().catch(() => ({})) : {};
      if (alive) { setEntitled(Boolean(body?.allowed)); setChecking(false); }
    }
    void checkAccess();
    return () => { alive = false; };
  }, [bypassPaywall, user?.id]);

  useEffect(() => {
    if (!checking && (entitled || bypassPaywall)) void loadProfiles();
    // loadProfiles intentionally runs once after the access gate resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bypassPaywall, checking, entitled]);

  useEffect(() => {
    if (selectedId) void loadWorkspace(selectedId);
    else setWorkspace(null);
  }, [selectedId, loadWorkspace]);

  const filteredProfiles = useMemo(() => {
    const needle = cleanSymbol(query);
    return needle ? profiles.filter((profile) => profile.symbol.includes(needle)) : profiles;
  }, [profiles, query]);
  const latestAnalysis = workspace?.analyses?.[0] ?? null;
  const latestAgent = latestAnalysis?.agent_output ?? {};
  const latestSnapshot = latestAnalysis?.deterministic_snapshot ?? {};
  const latestDataQuality = latestAnalysis?.data_quality ?? {};
  const latestThesisUpdate = latestAgent?.thesisUpdate ?? {};
  const latestBar = workspace?.bars?.at(-1) ?? null;
  const priorBar = workspace?.bars?.at(-2) ?? null;
  const dayChange = latestBar && priorBar ? ((latestBar.close - priorBar.close) / priorBar.close) * 100 : null;
  const flowDates = useMemo(() => new Set((workspace?.analyses ?? []).map((item) => item.source_session_date)), [workspace?.analyses]);
  const chartBars = useMemo(() => (workspace?.bars ?? []).slice(-120), [workspace?.bars]);
  const detectedEvidenceWindow = useMemo(() => {
    const dates = Array.from(new Set(
      parsedRows
        .map((row) => evidenceDateKey(row.date ?? row.timestamp ?? row.datetime))
        .filter((value): value is string => Boolean(value))
    )).sort();
    return dates.length
      ? { startDate: dates[0], endDate: dates.at(-1) ?? dates[0], sessionCount: dates.length }
      : null;
  }, [parsedRows]);

  function resetForm(profileSymbol?: string) {
    setSymbol(cleanSymbol(profileSymbol ?? ""));
    setProvider("unusualwhales");
    setSourceSessionDate(todayKey()); setNotes(""); setDataFile(null); setParsedRows([]);
    setDetectedSymbols([]); setScreenshots([]); setParseProgress({ percent: 0, scanned: 0, accepted: 0 }); setNotice("");
  }

  function openNewAnalysis(profileSymbol?: string) {
    resetForm(profileSymbol); setModalOpen(true);
  }

  async function handleDataFile(file: File | null) {
    setDataFile(file); setParsedRows([]); setDetectedSymbols([]); setParseProgress({ percent: 0, scanned: 0, accepted: 0 });
    if (!file) return;
    try {
      const parsed = await parseOptionFlowFile(file, provider, setParseProgress);
      setParsedRows(parsed.rows); setDetectedSymbols(parsed.detectedSymbols);
      if (!symbol && parsed.detectedSymbols.length === 1) setSymbol(parsed.detectedSymbols[0]);
    } catch (error: any) {
      setNotice(error?.message || L("Could not read the file.", "No se pudo leer el archivo.")); setDataFile(null);
    }
  }

  async function handleScreenshots(files: FileList | null) {
    if (!files?.length) return;
    try {
      const incoming = Array.from(files).slice(0, Math.max(0, 4 - screenshots.length));
      const mapped = await Promise.all(incoming.map(async (file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        name: file.name, dataUrl: await compressedScreenshotDataUrl(file),
      })));
      setScreenshots((current) => [...current, ...mapped].slice(0, 4));
    } catch { setNotice(L("One screenshot could not be read.", "No se pudo leer uno de los screenshots.")); }
  }

  async function runAnalysis() {
    const target = cleanSymbol(symbol);
    if (!target) { setNotice(L("Enter the company ticker.", "Escribe el ticker de la compañía.")); return; }
    if (!dataFile && !screenshots.length) { setNotice(L("Add a CSV, XLSX, or screenshot.", "Añade un CSV, XLSX o screenshot.")); return; }
    const rows = dataFile ? rowsForOptionFlowSymbol(parsedRows, target) : [];
    if (dataFile && !rows.length) { setNotice(L(`No ${target} rows were found in this file.`, `No se encontraron filas de ${target}.`)); return; }
    setSubmitting(true); setNotice("");
    try {
      const sourceFile = dataFile ? {
        name: dataFile.name, size: dataFile.size, mimeType: dataFile.type, sha256: await sha256File(dataFile),
      } : null;
      const response = await authenticatedFetch("/api/option-flow/analyze", {
        method: "POST",
        body: JSON.stringify({
          provider, underlying: target,
          sourceSessionDate, analystNotes: notes, rows,
          screenshotDataUrls: screenshots.map((item) => item.dataUrl), sourceFile, language: lang,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || L("The analysis could not be completed.", "No se pudo completar el análisis."));
      setModalOpen(false); setTab("overview");
      const nextId = await loadProfiles(String(body.profileId ?? ""));
      if (nextId) { setSelectedId(nextId); await loadWorkspace(nextId); }
      const newRows = body?.dataQuality?.newUniqueRows ?? "—";
      const repeatedRows = body?.dataQuality?.repeatedRows ?? "—";
      setNotice(L(
        `${target} saved as version ${body.analysisVersion}: ${newRows} new, ${repeatedRows} repeated.`,
        `${target} guardado como versión ${body.analysisVersion}: ${newRows} nuevos, ${repeatedRows} repetidos.`
      ));
    } catch (error: any) {
      setNotice(error?.message || L("The analysis could not be completed.", "No se pudo completar el análisis."));
    } finally { setSubmitting(false); }
  }

  async function setProfileStatus(status: "active" | "paused" | "archived") {
    if (!workspace?.profile?.id) return;
    try {
      const response = await authenticatedFetch("/api/option-flow/profiles", {
        method: "PATCH", body: JSON.stringify({ profileId: workspace.profile.id, status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Update failed.");
      if (status === "archived") { setSelectedId(null); setWorkspace(null); await loadProfiles(); }
      else {
        setWorkspace((current) => current ? { ...current, profile: { ...current.profile, status } } : current);
        setProfiles((current) => current.map((item) => item.id === workspace.profile.id ? { ...item, status } : item));
      }
    } catch (error: any) { setNotice(error?.message || L("Could not update the profile.", "No se pudo actualizar el perfil.")); }
  }

  async function refreshOpenInterest() {
    if (!workspace?.profile?.id || !optionMarketData.configured || refreshingOi) return;
    setRefreshingOi(true); setNotice("");
    try {
      const response = await authenticatedFetch("/api/option-flow/open-interest", {
        method: "POST",
        body: JSON.stringify({ profileId: workspace.profile.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || L("OI refresh failed.", "Falló la actualización de OI."));
      await loadWorkspace(workspace.profile.id);
      setNotice(L(
        `${body.snapshotsSaved ?? 0} contract snapshots refreshed.`,
        `${body.snapshotsSaved ?? 0} snapshots de contratos actualizados.`
      ));
    } catch (error: any) {
      setNotice(error?.message || L("OI refresh failed.", "Falló la actualización de OI."));
    } finally {
      setRefreshingOi(false);
    }
  }

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></main>;
  }

  if (!entitled && !bypassPaywall) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="mx-auto max-w-4xl px-4 py-10">
          <section className="border border-emerald-500/30 bg-slate-900/75 p-7">
            <p className="text-[10px] font-semibold uppercase text-emerald-300">{betaCopy.badge}</p>
            <h1 className="mt-3 text-2xl font-semibold">{betaCopy.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{betaCopy.description}</p>
            <Link href="/help/option-flow" className="mt-6 inline-flex border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-emerald-400">
              {betaCopy.learnMore}
            </Link>
          </section>
        </div>
      </main>
    );
  }

  const trend = workspace?.trend ?? {};
  const oiIntelligence = workspace?.openInterestIntelligence ?? {};
  const oiCoverage = oiIntelligence?.coverage ?? {};
  const oiTotals = oiIntelligence?.totals ?? {};
  const oiContracts = Array.isArray(oiIntelligence?.contracts) ? oiIntelligence.contracts : [];
  const optionMarketData = workspace?.optionMarketData ?? {};
  const oiThesisUpdate = workspace?.profile?.current_snapshot?.openInterestThesisUpdate ?? workspace?.oiReconciliations?.[0]?.ai_interpretation ?? null;
  const evidenceStrength = latestAgent?.evidenceStrength ?? "insufficient";
  const expirations = Array.isArray(latestSnapshot?.expirations) ? latestSnapshot.expirations : [];
  const timeline = workspace ? [
    ...(workspace.analyses ?? []).map((item) => ({ ...item, kind: "analysis", date: item.created_at })),
    ...(workspace.reviews ?? []).map((item) => ({ ...item, kind: "review", date: item.session_date })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 80) : [];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="mx-auto w-full max-w-[1720px] px-3 py-4 sm:px-5 lg:px-7">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" /> {L("Option Flow Intelligence", "Inteligencia de Option Flow")}
            </div>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{L("Flow Research Center", "Centro de análisis de flujo")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400 md:inline-flex md:items-center md:gap-2">
              <Clock3 className="h-3.5 w-3.5 text-emerald-300" />
              {L("6:00 PM close · 8:15 AM OI", "6:00 PM cierre · 8:15 AM OI")}
            </span>
            <button type="button" onClick={() => openNewAnalysis(workspace?.profile?.symbol)} className="inline-flex min-h-10 items-center gap-2 bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300">
              <Plus className="h-4 w-4" /> {L("Add flow", "Añadir flow")}
            </button>
          </div>
        </header>

        {notice ? (
          <div className="mt-3 flex items-start justify-between gap-3 border border-sky-400/25 bg-sky-400/8 px-3 py-2 text-xs text-sky-100">
            <span>{notice}</span>
            <button type="button" aria-label={L("Dismiss", "Cerrar")} onClick={() => setNotice("")}><X className="h-4 w-4" /></button>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="border border-slate-800 bg-slate-900/55 lg:min-h-[720px]">
            <div className="border-b border-slate-800 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase text-slate-400">{L("Company profiles", "Perfiles de compañías")}</p>
                <span className="text-[10px] text-slate-500">{profiles.length}</span>
              </div>
              <label className="mt-3 flex items-center gap-2 border border-slate-800 bg-slate-950/70 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-slate-500" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={L("Find ticker", "Buscar ticker")} className="min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-600" />
              </label>
            </div>
            <div className="flex gap-2 overflow-x-auto p-2 lg:block lg:max-h-[640px] lg:space-y-1 lg:overflow-y-auto">
              {loadingProfiles ? <Loader2 className="m-4 h-4 w-4 animate-spin text-slate-500" /> : null}
              {filteredProfiles.map((profile) => {
                const selected = profile.id === selectedId;
                return (
                  <button key={profile.id} type="button" onClick={() => setSelectedId(profile.id)} className={`min-w-[185px] border p-3 text-left transition lg:w-full ${selected ? "border-emerald-400/45 bg-emerald-400/10" : "border-transparent bg-slate-950/35 hover:border-slate-700"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-base font-semibold text-white">{profile.symbol}</span>
                      <span className={`h-2 w-2 rounded-full ${profile.status === "active" ? "bg-emerald-300" : "bg-amber-300"}`} />
                    </div>
                    <p className="mt-1 truncate text-[10px] text-slate-500">
                      {`${L("Full-spectrum", "Análisis integral")} · ${horizonLabel(profile.current_snapshot?.horizon, lang)}`}
                    </p>
                    <p className="mt-2 text-[10px] text-slate-400">{displayDate(profile.last_analysis_at, lang)}</p>
                  </button>
                );
              })}
              {!loadingProfiles && !filteredProfiles.length ? <p className="p-4 text-xs text-slate-500">{L("No profiles yet.", "Aún no hay perfiles.")}</p> : null}
            </div>
          </aside>

          {loadingWorkspace ? (
            <section className="flex min-h-[520px] items-center justify-center border border-slate-800 bg-slate-900/45"><Loader2 className="h-6 w-6 animate-spin text-emerald-300" /></section>
          ) : !workspace ? (
            <section className="flex min-h-[520px] items-center justify-center border border-slate-800 bg-slate-900/45 p-6">
              <div className="max-w-md text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center border border-emerald-400/35 bg-emerald-400/10 text-emerald-300"><Activity className="h-6 w-6" /></div>
                <h2 className="mt-5 text-xl font-semibold">{L("Create your first flow profile", "Crea tu primer perfil de flujo")}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{L("Choose a ticker and add its first evidence file.", "Selecciona un ticker y añade su primer archivo de evidencia.")}</p>
                <button type="button" onClick={() => openNewAnalysis()} className="mt-6 inline-flex min-h-11 items-center gap-2 bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-300"><Plus className="h-4 w-4" />{L("New analysis", "Nuevo análisis")}</button>
              </div>
            </section>
          ) : (
            <section className="min-w-0 border border-slate-800 bg-slate-900/45">
              <div className="border-b border-slate-800 p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-sky-400/30 bg-sky-400/10 text-lg font-bold text-sky-100">{workspace.profile.symbol.slice(0, 3)}</div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold">{workspace.profile.symbol}</h2>
                        <span className={`border px-2 py-1 text-[9px] font-semibold uppercase ${biasTone(latestAgent?.flowBias ?? latestSnapshot?.flowBias)}`}>{String(latestAgent?.flowBias ?? latestSnapshot?.flowBias ?? "insufficient data").replaceAll("_", " ")}</span>
                        <span className="border border-slate-700 px-2 py-1 text-[9px] uppercase text-slate-400">{workspace.profile.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{L("Persistent flow profile", "Perfil persistente de flujo")} · {workspace.analyses.length} {L("analyses", "análisis")}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:min-w-[520px]">
                    <Metric label={L("Latest close", "Último cierre")} value={latestBar ? money(latestBar.close) : "DATA NOT AVAILABLE"} />
                    <Metric label={L("Daily move", "Movimiento diario")} value={dayChange == null ? "DATA NOT AVAILABLE" : pct(dayChange)} tone={dayChange == null ? "text-slate-300" : dayChange >= 0 ? "text-emerald-300" : "text-rose-300"} />
                    <Metric label={L("Evidence", "Evidencia")} value={String(evidenceStrength).replaceAll("_", " ")} />
                    <Metric label={L("Last flow", "Último flow")} value={workspace.profile.last_flow_session_date ?? "—"} />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => openNewAnalysis(workspace.profile.symbol)} className="inline-flex min-h-9 items-center gap-2 bg-emerald-400 px-3 py-2 text-[11px] font-semibold text-slate-950 hover:bg-emerald-300"><Plus className="h-3.5 w-3.5" />{L("Add new flow", "Añadir flow nuevo")}</button>
                  <button type="button" onClick={() => void setProfileStatus(workspace.profile.status === "active" ? "paused" : "active")} className="inline-flex min-h-9 items-center gap-2 border border-slate-700 px-3 py-2 text-[11px] text-slate-200 hover:border-sky-400">
                    {workspace.profile.status === "active" ? <CirclePause className="h-3.5 w-3.5" /> : <CirclePlay className="h-3.5 w-3.5" />}
                    {workspace.profile.status === "active" ? L("Pause tracking", "Pausar seguimiento") : L("Resume tracking", "Reanudar seguimiento")}
                  </button>
                  <button type="button" title={L("Archive profile", "Archivar perfil")} onClick={() => void setProfileStatus("archived")} className="inline-flex h-9 w-9 items-center justify-center border border-slate-700 text-slate-400 hover:border-rose-400 hover:text-rose-300"><Archive className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              <div className="border-b border-slate-800 px-2 pt-2 sm:px-4">
                <div className="flex overflow-x-auto">
                  {TABS.map((item) => {
                    const Icon = item.icon;
                    return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`flex min-h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-[11px] ${tab === item.id ? "border-emerald-300 text-emerald-200" : "border-transparent text-slate-500 hover:text-slate-200"}`}><Icon className="h-3.5 w-3.5" />{isEs ? item.es : item.en}</button>;
                  })}
                </div>
              </div>

              <div className="p-4 sm:p-5">
                {tab === "overview" ? (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
                    <div className="space-y-4">
                      <div className="border border-slate-800 bg-slate-950/45 p-4">
                        <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase text-slate-400">{L("Daily price context", "Contexto diario de precio")}</p><span className="text-[10px] text-slate-500">{chartBars.at(-1)?.sessionDate ?? "—"}</span></div>
                        <div className="mt-3 h-[260px] w-full">
                          {chartBars.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={chartBars} margin={{ top: 10, right: 6, left: -16, bottom: 0 }}>
                                <defs><linearGradient id="flowClose" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.3} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient></defs>
                                <CartesianGrid stroke="#172033" strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="sessionDate" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={32} tickFormatter={(value) => String(value).slice(5)} />
                                <YAxis domain={["auto", "auto"]} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value).toFixed(0)}`} />
                                <Tooltip contentStyle={{ background: "#07101f", border: "1px solid #263449", borderRadius: 0, fontSize: 11 }} formatter={(value) => [money(value), L("Close", "Cierre")]} labelStyle={{ color: "#94a3b8" }} />
                                <Area type="monotone" dataKey="close" stroke="#34d399" strokeWidth={2} fill="url(#flowClose)" />
                                {chartBars.filter((bar) => flowDates.has(bar.sessionDate)).map((bar) => <ReferenceDot key={bar.sessionDate} x={bar.sessionDate} y={bar.close} r={4} fill="#38bdf8" stroke="#07101f" strokeWidth={2} />)}
                              </AreaChart>
                            </ResponsiveContainer>
                          ) : <div className="flex h-full items-center justify-center text-xs text-slate-500">{L("Price history loads with daily close tracking.", "El historial de precio carga con el seguimiento diario.")}</div>}
                        </div>
                      </div>
                      <div className="border border-slate-800 bg-slate-950/45 p-4">
                        <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase text-emerald-300">{L("Latest intelligence read", "Última lectura de inteligencia")}</p><span className="text-[10px] text-slate-500">v{latestAnalysis?.version ?? "—"}</span></div>
                        <h3 className="mt-3 text-lg font-semibold text-white">{latestAgent?.summary ?? L("No completed analysis yet.", "Aún no hay un análisis completado.")}</h3>
                        <div className="mt-4 border border-slate-700 bg-slate-900/65 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[9px] font-semibold uppercase text-slate-400">{L("Thesis change", "Cambio de tesis")}</p>
                            <span className={`border px-2 py-1 text-[9px] font-semibold ${
                              latestThesisUpdate.classification === "STRENGTHENED"
                                ? "border-emerald-400/35 text-emerald-200"
                                : latestThesisUpdate.classification === "WEAKENED"
                                  ? "border-rose-400/35 text-rose-200"
                                  : "border-slate-600 text-slate-300"
                            }`}>
                              {String(latestThesisUpdate.classification ?? "INSUFFICIENT_EVIDENCE").replaceAll("_", " ")}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-300">{latestThesisUpdate.currentRead ?? "DATA NOT AVAILABLE"}</p>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                            <div><p className="text-slate-500">{L("Coverage", "Cobertura")}</p><p className="mt-1 text-slate-200">{latestDataQuality.evidencePeriodStart ?? "—"} · {latestDataQuality.evidencePeriodEnd ?? "—"}</p></div>
                            <div><p className="text-slate-500">{L("Sessions", "Sesiones")}</p><p className="mt-1 text-slate-200">{latestDataQuality.evidenceSessionCount ?? "—"}</p></div>
                            <div><p className="text-slate-500">{L("New events", "Eventos nuevos")}</p><p className="mt-1 text-emerald-300">{latestDataQuality.newUniqueRows ?? "—"}</p></div>
                            <div><p className="text-slate-500">{L("Repeated", "Repetidos")}</p><p className="mt-1 text-amber-300">{latestDataQuality.repeatedRows ?? "—"}</p></div>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="border border-slate-800 bg-slate-900/60 p-3"><p className="text-[9px] font-semibold uppercase text-sky-300">{L("Horizon read", "Lectura del horizonte")}</p><p className="mt-2 text-xs leading-5 text-slate-300">{latestAgent?.horizonRead?.interpretation ?? "DATA NOT AVAILABLE"}</p></div>
                          <div className="border border-slate-800 bg-slate-900/60 p-3"><p className="text-[9px] font-semibold uppercase text-violet-300">{L("Accumulation", "Acumulación")}</p><p className="mt-2 text-xs leading-5 text-slate-300">{latestAgent?.accumulation?.classification ?? "DATA NOT AVAILABLE"}</p></div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="border border-sky-400/25 bg-sky-400/5 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-semibold uppercase text-sky-300">{L("Open-interest evidence", "Evidencia de Open Interest")}</p>
                          <span className={`border px-2 py-1 text-[9px] ${optionMarketData.configured ? "border-emerald-400/35 text-emerald-200" : "border-amber-400/35 text-amber-200"}`}>
                            {optionMarketData.configured ? L("automatic", "automático") : L("imports only", "solo imports")}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div><p className="text-[9px] uppercase text-slate-500">{L("OI effective date", "Fecha efectiva OI")}</p><p className="mt-1 text-sm font-semibold text-white">{oiIntelligence.asOfDate ?? "DATA NOT AVAILABLE"}</p></div>
                          <div><p className="text-[9px] uppercase text-slate-500">{L("Comparable contracts", "Contratos comparables")}</p><p className="mt-1 text-sm font-semibold text-white">{oiCoverage.contractsWithComparableOpenInterest ?? 0}</p></div>
                          <div><p className="text-[9px] uppercase text-slate-500">{L("Confirmed net change", "Cambio neto confirmado")}</p><p className="mt-1 text-sm font-semibold text-white">{compact(oiTotals.confirmedOpenInterestChange)}</p></div>
                          <div><p className="text-[9px] uppercase text-slate-500">{L("Verified contracts", "Contratos verificados")}</p><p className="mt-1 text-sm font-semibold text-white">{oiCoverage.verifiedContracts ?? 0}</p></div>
                        </div>
                        <p className="mt-3 text-[10px] leading-4 text-slate-400">{L(
                          "OI updates after overnight clearing. An increase does not identify who is long or short.",
                          "El OI se actualiza después de la consolidación nocturna. Un aumento no identifica quién está long o short."
                        )}</p>
                        {oiThesisUpdate ? <div className="mt-3 border-t border-sky-400/15 pt-3"><p className="text-[9px] font-semibold uppercase text-sky-200">{String(oiThesisUpdate.classification ?? "INSUFFICIENT_EVIDENCE").replaceAll("_", " ")}</p><p className="mt-1 text-[10px] leading-4 text-slate-300">{oiThesisUpdate.currentRead ?? oiThesisUpdate.headline ?? "DATA NOT AVAILABLE"}</p></div> : null}
                        <button type="button" onClick={() => setTab("open_interest")} className="mt-3 inline-flex items-center gap-2 text-[10px] font-semibold text-sky-200 hover:text-sky-100">
                          {L("Open OI intelligence", "Abrir inteligencia OI")} <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="border border-rose-400/25 bg-rose-400/5 p-4">
                        <p className="text-[10px] font-semibold uppercase text-rose-300">{L("Contradiction check", "Revisión de contradicción")}</p>
                        <p className="mt-3 text-sm font-semibold leading-5 text-slate-100">{latestAgent?.contradiction?.strongestAlternativeExplanation ?? "DATA NOT AVAILABLE"}</p>
                        <p className="mt-3 text-xs leading-5 text-slate-400">{latestAgent?.contradiction?.whatWouldDisproveCurrentRead ?? "DATA NOT AVAILABLE"}</p>
                      </div>
                      <div className="border border-slate-800 bg-slate-950/45 p-4">
                        <p className="text-[10px] font-semibold uppercase text-slate-400">{L("Horizon follow-up", "Seguimiento del horizonte")}</p>
                        <div className="mt-3 space-y-2">
                          {(workspace.checkpoints ?? []).slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2 text-xs"><span className="text-slate-300">{item.checkpoint_date}</span><span className={item.status === "complete" ? "text-emerald-300" : "text-amber-300"}>{String(item.classification ?? item.status).replaceAll("_", " ")}</span></div>)}
                          {!workspace.checkpoints?.length ? <p className="text-xs text-slate-500">{L("No checkpoints yet.", "Aún no hay checkpoints.")}</p> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {tab === "timeline" ? (
                  <div className="space-y-3">
                    {timeline.map((item) => <div key={`${item.kind}-${item.id}`} className="grid gap-2 border border-slate-800 bg-slate-950/40 p-3 sm:grid-cols-[140px_1fr_auto]"><div><p className="text-[9px] font-semibold uppercase text-slate-500">{item.kind === "analysis" ? L("Flow analysis", "Análisis de flow") : L("6 PM review", "Revisión 6 PM")}</p><p className="mt-1 text-xs text-slate-300">{displayDate(item.date, lang)}</p></div><p className="text-xs leading-5 text-slate-300">{item.kind === "analysis" ? item.agent_output?.summary ?? "DATA NOT AVAILABLE" : item.agent_interpretation?.summary ?? item.material_reasons?.join(" · ") ?? L("No material change.", "Sin cambio material.")}</p><span className={`self-start border px-2 py-1 text-[9px] ${item.kind === "analysis" ? biasTone(item.agent_output?.flowBias) : item.is_material ? "border-amber-400/30 text-amber-200" : "border-slate-700 text-slate-500"}`}>{item.kind === "analysis" ? `v${item.version}` : item.is_material ? L("material", "material") : L("routine", "rutina")}</span></div>)}
                  </div>
                ) : null}

                {tab === "expirations" ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {expirations.map((item: any, index: number) => <div key={`${item.expiry}-${index}`} className="border border-slate-800 bg-slate-950/40 p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">{item.expiry ?? "DATA NOT AVAILABLE"}</h3><span className="text-[10px] uppercase text-slate-500">{item.tenor ?? "—"}</span></div><p className="mt-2 text-xs text-slate-400">{item.notes ?? item.keyTakeaways?.join(" ") ?? "DATA NOT AVAILABLE"}</p><div className="mt-3 space-y-2">{(item.strikes ?? []).slice(0, 8).map((strike: any, strikeIndex: number) => <div key={`${strike.strike}-${strikeIndex}`} className="grid grid-cols-4 gap-2 border-t border-slate-800 pt-2 text-[10px]"><span className="text-white">${strike.strike ?? "—"} {strike.type ?? ""}</span><span className="text-slate-400">{strike.side ?? "—"}</span><span className="text-slate-400">{money(strike.premiumTotal)}</span><span className="text-right text-slate-500">{strike.prints ?? 0} prints</span></div>)}</div></div>)}
                    {!expirations.length ? <p className="text-xs text-slate-500">{L("No verified expiration groups in the latest analysis.", "No hay grupos de expiración verificados en el último análisis.")}</p> : null}
                  </div>
                ) : null}

                {tab === "contracts" ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-left text-[11px]"><thead className="border-b border-slate-800 text-[9px] uppercase text-slate-500"><tr><th className="px-2 py-3">{L("Date", "Fecha")}</th><th className="px-2 py-3">{L("Contract", "Contrato")}</th><th className="px-2 py-3">{L("Expiry", "Expira")}</th><th className="px-2 py-3">Strike</th><th className="px-2 py-3">Side</th><th className="px-2 py-3">{L("Observed price", "Precio observado")}</th><th className="px-2 py-3">Premium</th><th className="px-2 py-3">OI</th></tr></thead><tbody>{(workspace.events ?? []).map((item) => <tr key={item.id} className="border-b border-slate-900 text-slate-300"><td className="px-2 py-3">{item.source_session_date}</td><td className="px-2 py-3 font-medium text-white">{item.contract_symbol ?? "—"}</td><td className="px-2 py-3">{item.expiry ?? "—"}</td><td className="px-2 py-3">{item.strike ?? "—"} {item.option_type ?? ""}</td><td className="px-2 py-3">{item.aggressor_side ?? "—"}</td><td className="px-2 py-3">{money(item.observed_contract_price)}</td><td className="px-2 py-3">{money(item.premium)}</td><td className="px-2 py-3">{compact(item.open_interest)}</td></tr>)}</tbody></table>
                    {!workspace.events?.length ? <p className="p-4 text-xs text-slate-500">{L("No normalized contracts yet.", "Aún no hay contratos normalizados.")}</p> : null}
                  </div>
                ) : null}

                {tab === "open_interest" ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="text-[10px] font-semibold uppercase text-sky-300">{L("Contract positioning ledger", "Registro de posicionamiento por contrato")}</p><p className="mt-1 text-xs text-slate-500">{optionMarketData.message ?? L("Source status unavailable.", "Estado de fuente no disponible.")}</p></div>
                      <button type="button" disabled={!optionMarketData.configured || refreshingOi} onClick={() => void refreshOpenInterest()} className="inline-flex min-h-9 items-center justify-center gap-2 border border-sky-400/35 px-3 text-[10px] font-semibold text-sky-100 disabled:cursor-not-allowed disabled:opacity-40">
                        {refreshingOi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}{L("Refresh market snapshot", "Actualizar snapshot de mercado")}
                      </button>
                    </div>
                    <div className="grid gap-3 border border-slate-800 bg-slate-950/45 p-4 sm:grid-cols-2 xl:grid-cols-6">
                      <Metric label={L("Effective OI date", "Fecha efectiva OI")} value={oiIntelligence.asOfDate ?? "DATA NOT AVAILABLE"} />
                      <Metric label={L("Tracked contracts", "Contratos rastreados")} value={String(oiCoverage.contractsTracked ?? 0)} />
                      <Metric label={L("Comparable", "Comparables")} value={String(oiCoverage.contractsWithComparableOpenInterest ?? 0)} />
                      <Metric label={L("Net OI change", "Cambio neto OI")} value={compact(oiTotals.confirmedOpenInterestChange)} />
                      <Metric label={L("Source-reported change", "Cambio reportado") } value={compact(oiTotals.reportedOpenInterestChange)} />
                      <Metric label={L("Automatic source", "Fuente automática")} value={optionMarketData.configured ? String(optionMarketData.provider ?? "configured") : L("Not connected", "No conectada")} tone={optionMarketData.configured ? "text-emerald-300" : "text-amber-300"} />
                    </div>

                    <div className="border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-[10px] leading-5 text-amber-100/80">
                      {L(
                        "OI is an overnight consolidated count. Price and OI dates are stored separately. OI alone cannot prove direction, buyer/seller identity, or whether a specific print opened a position.",
                        "El OI es un conteo consolidado durante la noche. Las fechas de precio y OI se guardan por separado. El OI por sí solo no prueba dirección, identidad de comprador/vendedor ni que un print específico abrió una posición."
                      )}
                    </div>

                    {oiThesisUpdate ? (
                      <div className="grid gap-3 border border-sky-400/25 bg-sky-400/5 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                        <div><p className="text-[9px] font-semibold uppercase text-sky-300">{L("OI thesis reconciliation", "Reconciliación OI de tesis")}</p><p className="mt-2 text-sm font-semibold text-white">{String(oiThesisUpdate.classification ?? "INSUFFICIENT_EVIDENCE").replaceAll("_", " ")}</p></div>
                        <div><p className="text-xs leading-5 text-slate-300">{oiThesisUpdate.currentRead ?? oiThesisUpdate.headline ?? "DATA NOT AVAILABLE"}</p><p className="mt-2 text-[10px] leading-4 text-slate-500">{(oiThesisUpdate.uncertainty ?? []).slice(0, 2).join(" · ")}</p></div>
                      </div>
                    ) : null}

                    <div className="overflow-x-auto border border-slate-800">
                      <table className="w-full min-w-[1120px] text-left text-[11px]">
                        <thead className="border-b border-slate-800 bg-slate-950/60 text-[9px] uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-3">{L("Contract", "Contrato")}</th>
                            <th className="px-3 py-3">{L("OI as of", "OI efectivo")}</th>
                            <th className="px-3 py-3">OI</th>
                            <th className="px-3 py-3">Δ OI</th>
                            <th className="px-3 py-3">Δ OI %</th>
                            <th className="px-3 py-3">{L("Contract price", "Precio contrato")}</th>
                            <th className="px-3 py-3">Δ {L("price", "precio")}</th>
                            <th className="px-3 py-3">Vol/OI</th>
                            <th className="px-3 py-3">{L("Relationship", "Relación")}</th>
                            <th className="px-3 py-3">{L("Evidence", "Evidencia")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {oiContracts.map((item: any) => (
                            <tr key={item.contractSymbol} className="border-b border-slate-900 text-slate-300">
                              <td className="px-3 py-3 font-medium text-white">{item.contractSymbol}</td>
                              <td className="px-3 py-3">{item.openInterestAsOfDate ?? "DATA NOT AVAILABLE"}</td>
                              <td className="px-3 py-3">{compact(item.openInterest)}</td>
                              <td className={`px-3 py-3 font-semibold ${Number(item.openInterestChange) > 0 ? "text-emerald-300" : Number(item.openInterestChange) < 0 ? "text-rose-300" : "text-slate-400"}`}>{item.openInterestChange == null ? "DATA NOT AVAILABLE" : `${Number(item.openInterestChange) > 0 ? "+" : ""}${compact(item.openInterestChange)}`}</td>
                              <td className="px-3 py-3">{pct(item.openInterestChangePct)}</td>
                              <td className="px-3 py-3">{money(item.price)}</td>
                              <td className="px-3 py-3">{pct(item.priceChangePct)}</td>
                              <td className="px-3 py-3">{item.volumeToOpenInterest == null ? "DATA NOT AVAILABLE" : `${Number(item.volumeToOpenInterest).toFixed(2)}x`}</td>
                              <td className="px-3 py-3 text-sky-200">{String(item.relationship ?? "insufficient_evidence").replaceAll("_", " ")}</td>
                              <td className="px-3 py-3"><span className={`border px-2 py-1 text-[9px] ${item.evidenceQuality === "verified" ? "border-emerald-400/30 text-emerald-200" : item.evidenceQuality === "reported" ? "border-sky-400/30 text-sky-200" : "border-amber-400/30 text-amber-200"}`}>{String(item.evidenceQuality ?? "insufficient").toUpperCase()}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!oiContracts.length ? <p className="p-5 text-xs text-slate-500">{L("No contract-level OI evidence is available yet. Upload a source containing OI or connect the automatic market-data provider.", "Aún no hay evidencia OI por contrato. Sube una fuente que contenga OI o conecta el proveedor automático de market data.")}</p> : null}
                    </div>

                    {(workspace.oiReconciliations ?? []).length ? (
                      <div className="border border-slate-800 bg-slate-950/35 p-4">
                        <p className="text-[10px] font-semibold uppercase text-slate-400">{L("Morning reconciliations", "Reconciliaciones matutinas")}</p>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {(workspace.oiReconciliations ?? []).slice(0, 9).map((item) => <div key={item.id} className="border-l-2 border-sky-400/40 pl-3"><p className="text-xs text-white">{item.effective_session_date}</p><p className="mt-1 text-[9px] uppercase text-slate-500">{String(item.status ?? "pending").replaceAll("_", " ")}</p></div>)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {tab === "trend" ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      [L("5-day return", "Retorno 5 días"), pct(trend.fiveSessionReturnPct)],
                      [L("20-day return", "Retorno 20 días"), pct(trend.twentySessionReturnPct)],
                      [L("60-day return", "Retorno 60 días"), pct(trend.sixtySessionReturnPct)],
                      ["ATR 14", money(trend.atr14)], ["SMA 5", money(trend.sma5)], ["SMA 20", money(trend.sma20)], ["SMA 50", money(trend.sma50)],
                      [L("Volume vs 20D", "Volumen vs 20D"), trend.volumeRatio20 == null ? "DATA NOT AVAILABLE" : `${Number(trend.volumeRatio20).toFixed(2)}x`],
                      [L("20D high", "Máximo 20D"), money(trend.twentySessionHigh)], [L("20D low", "Mínimo 20D"), money(trend.twentySessionLow)],
                      [L("Realized vol", "Volatilidad realizada"), pct(trend.realizedVolatility20Pct)],
                      [L("Close location", "Ubicación del cierre"), trend.closeLocationValue == null ? "DATA NOT AVAILABLE" : Number(trend.closeLocationValue).toFixed(2)],
                    ].map(([label, value]) => <div key={label} className="border border-slate-800 bg-slate-950/45 p-4"><p className="text-[9px] font-semibold uppercase text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-white">{value}</p></div>)}
                  </div>
                ) : null}

                {tab === "analyses" ? (
                  <div className="space-y-3">{(workspace.analyses ?? []).map((item) => <div key={item.id} className="grid gap-3 border border-slate-800 bg-slate-950/40 p-4 text-left sm:grid-cols-[80px_170px_1fr_auto]"><span className="text-sm font-semibold text-emerald-300">v{item.version}</span><div><p className="text-[9px] uppercase text-slate-500">{item.agent_output?.horizonRead?.analysisMode === "comprehensive" ? `${L("Full-spectrum", "Análisis integral")} · ${horizonLabel(item.agent_output?.horizonRead?.horizon, lang)}` : L("Legacy analysis", "Análisis anterior")}</p><p className="mt-1 text-xs text-slate-300">{item.data_quality?.evidencePeriodStart ?? item.source_session_date} · {item.data_quality?.evidencePeriodEnd ?? item.source_session_date}</p><p className="mt-1 text-[9px] text-slate-500">{item.data_quality?.newUniqueRows ?? "—"} {L("new", "nuevos")} · {item.data_quality?.repeatedRows ?? "—"} {L("repeated", "repetidos")}</p></div><div><p className="text-xs leading-5 text-slate-300">{item.agent_output?.summary ?? "DATA NOT AVAILABLE"}</p><p className="mt-2 text-[9px] font-semibold text-sky-300">{String(item.agent_output?.thesisUpdate?.classification ?? "INSUFFICIENT_EVIDENCE").replaceAll("_", " ")}</p></div><ChevronRight className="h-4 w-4 text-slate-600" /></div>)}</div>
                ) : null}

                {tab === "evidence" ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {(workspace.sources ?? []).map((item) => <div key={item.id} className="border border-slate-800 bg-slate-950/45 p-4"><div className="flex items-center gap-3">{item.source_type === "screenshot" ? <ImagePlus className="h-4 w-4 text-sky-300" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-300" />}<div className="min-w-0"><p className="truncate text-sm font-medium text-white">{item.file_name ?? item.source_type}</p><p className="mt-1 text-[10px] text-slate-500">{item.provider ?? "—"} · {item.source_session_date ?? "—"} · {item.row_count ?? 0} rows</p></div></div><p className="mt-3 break-all text-[9px] text-slate-600">SHA-256 · {item.content_sha256 ?? "DATA NOT AVAILABLE"}</p></div>)}
                    {!workspace.sources?.length ? <p className="text-xs text-slate-500">{L("No source manifest available.", "No hay manifiesto de fuentes disponible.")}</p> : null}
                  </div>
                ) : null}
              </div>
            </section>
          )}
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-800 bg-slate-900 px-4 py-4 sm:px-6">
              <div><p className="text-[9px] font-semibold uppercase text-emerald-300">{L("New evidence", "Evidencia nueva")}</p><h2 className="mt-1 text-xl font-semibold">{L("Run flow analysis", "Ejecutar análisis de flow")}</h2></div>
              <button type="button" onClick={() => !submitting && setModalOpen(false)} aria-label={L("Close", "Cerrar")} className="flex h-9 w-9 items-center justify-center border border-slate-700 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="border border-emerald-400/30 bg-emerald-400/8 p-3">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <div><p className="text-xs font-semibold text-emerald-100">{L("Full-spectrum analysis", "Análisis integral")}</p><p className="mt-1 text-[10px] leading-4 text-slate-400">{L("The agent reviews every dated flow, expiration, OI observation, and underlying OHLC session, then suggests the monitoring horizon supported by the evidence.", "El agente revisa todos los flows fechados, expiraciones, observaciones de OI y sesiones OHLC del activo, y luego sugiere el horizonte de seguimiento respaldado por la evidencia.")}</p></div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="text-[9px] font-semibold uppercase text-slate-500">Ticker</span><input value={symbol} onChange={(event) => setSymbol(cleanSymbol(event.target.value))} placeholder="PLTR" className="mt-1 h-11 w-full border border-slate-700 bg-slate-950 px-3 text-sm font-semibold uppercase outline-none focus:border-emerald-400" /></label>
                  {detectedEvidenceWindow ? (
                    <div className="border border-emerald-400/30 bg-emerald-400/8 px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase text-emerald-300">{L("Detected evidence period", "Período detectado")}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">{detectedEvidenceWindow.startDate} · {detectedEvidenceWindow.endDate}</p>
                      <p className="mt-1 text-[9px] text-slate-400">{detectedEvidenceWindow.sessionCount} {L("market dates found; no manual flow date is needed.", "fechas de mercado encontradas; no necesitas escoger una fecha de flow.")}</p>
                    </div>
                  ) : (
                    <label className="block"><span className="text-[9px] font-semibold uppercase text-slate-500">{L("Fallback date", "Fecha de respaldo")}</span><input type="date" value={sourceSessionDate} onChange={(event) => setSourceSessionDate(event.target.value)} className="mt-1 h-11 w-full border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-emerald-400" /><span className="mt-1 block text-[9px] leading-4 text-slate-500">{L("Dates inside the evidence are detected automatically. This date is used only when a row or screenshot has no verifiable date.", "Las fechas dentro de la evidencia se detectan automáticamente. Esta fecha solo se usa cuando una fila o screenshot no tiene fecha verificable.")}</span></label>
                  )}
                </div>
                <label className="block"><span className="text-[9px] font-semibold uppercase text-slate-500">Provider</span><select value={provider} onChange={(event) => setProvider(event.target.value as OptionFlowProviderId)} className="mt-1 h-11 w-full border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-emerald-400">{OPTION_FLOW_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                <label className="block"><span className="text-[9px] font-semibold uppercase text-slate-500">{L("Analyst notes", "Notas del analista")}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={3000} className="mt-1 w-full resize-none border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400" placeholder={L("Optional context not present in the files", "Contexto opcional que no está en los archivos")} /></label>
              </div>

              <div className="space-y-4">
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => void handleDataFile(event.target.files?.[0] ?? null)} />
                <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(event) => void handleScreenshots(event.target.files)} />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-28 flex-col items-center justify-center border border-dashed border-slate-600 bg-slate-950/40 p-3 text-center hover:border-emerald-400"><FileSpreadsheet className="h-5 w-5 text-emerald-300" /><span className="mt-2 text-xs font-semibold">CSV / XLSX</span><span className="mt-1 text-[9px] text-slate-500">2,000 rows max</span></button>
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="flex min-h-28 flex-col items-center justify-center border border-dashed border-slate-600 bg-slate-950/40 p-3 text-center hover:border-sky-400"><ImagePlus className="h-5 w-5 text-sky-300" /><span className="mt-2 text-xs font-semibold">Screenshots</span><span className="mt-1 text-[9px] text-slate-500">4 images max</span></button>
                </div>
                {dataFile ? <div className="border border-slate-700 bg-slate-950/55 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-medium">{dataFile.name}</p><p className="mt-1 text-[10px] text-slate-500">{parseProgress.accepted} {L("rows", "filas")} · {detectedSymbols.join(", ") || L("ticker not detected", "ticker no detectado")}</p></div><button type="button" onClick={() => void handleDataFile(null)} aria-label={L("Remove file", "Remover archivo")}><X className="h-4 w-4 text-slate-500" /></button></div>{parseProgress.percent > 0 && parseProgress.percent < 100 ? <div className="mt-3 h-1 bg-slate-800"><div className="h-full bg-emerald-400" style={{ width: `${parseProgress.percent}%` }} /></div> : null}</div> : null}
                {screenshots.length ? <div className="grid grid-cols-3 gap-2">{screenshots.map((item) => <div key={item.id} className="relative aspect-video overflow-hidden border border-slate-700 bg-slate-950"><img src={item.dataUrl} alt={item.name} className="h-full w-full object-cover" /><button type="button" onClick={() => setScreenshots((current) => current.filter((shot) => shot.id !== item.id))} aria-label={L("Remove image", "Remover imagen")} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center bg-slate-950/90 text-slate-200"><X className="h-3 w-3" /></button></div>)}</div> : null}
                <div className="border border-slate-800 bg-slate-950/45 p-4"><p className="text-[9px] font-semibold uppercase text-slate-500">{L("Analysis controls", "Controles del análisis")}</p><div className="mt-3 space-y-2 text-[11px] text-slate-300"><p className="flex items-center justify-between"><span>Ticker</span><strong>{cleanSymbol(symbol) || "—"}</strong></p><p className="flex items-center justify-between"><span>{L("Scope", "Alcance")}</span><strong>{L("All evidence", "Toda la evidencia")}</strong></p><p className="flex items-center justify-between"><span>{L("Horizon", "Horizonte")}</span><strong>{L("Agent inferred", "Inferido por el agente")}</strong></p><p className="flex items-center justify-between"><span>{L("Inputs", "Entradas")}</span><strong>{(dataFile ? 1 : 0) + screenshots.length}</strong></p></div></div>
              </div>
            </div>
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-800 bg-slate-900 px-4 py-4 sm:px-6"><p className="hidden max-w-lg text-[10px] leading-4 text-slate-500 sm:block">{L("Observed data stays separate from AI interpretation. Missing values remain DATA NOT AVAILABLE.", "Los datos observados permanecen separados de la interpretación de IA. Los valores faltantes permanecen como DATA NOT AVAILABLE.")}</p><button type="button" onClick={() => void runAnalysis()} disabled={submitting || (!dataFile && !screenshots.length)} className="mr-20 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45 sm:ml-auto sm:mr-0 sm:w-auto">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{submitting ? L("Running agents…", "Ejecutando agentes…") : L("Run analysis", "Ejecutar análisis")}</button></div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
