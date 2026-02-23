import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";

type MindsetRatings = {
  emotional_balance: number | null;
  impulse_control: number | null;
  setup_quality: number | null;
  probability: number | null;
};

type ChecklistSnapshot = {
  premarket: string[];
  inside: string[];
  after: string[];
  strategy: string[];
  impulses: string[];
  states: string[];
};

type AfterTradeReview = {
  checklist: Record<string, boolean>;
  ratings: {
    execution: number | null;
    patience: number | null;
    clarity: number | null;
  };
  notes: {
    didWell: string;
    improve: string;
  };
};

type NotesPayload = {
  premarket?: string;
  live?: string;
  post?: string;
  entries?: any[];
  exits?: any[];
  costs?: { commissions?: number; fees?: number };
  pnl?: { gross?: number; net?: number };
  mindset?: MindsetRatings;
  checklists?: ChecklistSnapshot;
  after_review?: AfterTradeReview;
  journal_mindset?: MindsetRatings;
  journal_checklists?: ChecklistSnapshot;
  journal_after_review?: AfterTradeReview;
};

type JournalEntryRow = {
  user_id: string;
  account_id: string | null;
  date: string;
  pnl?: number | null;
  notes?: string | null;
  emotion?: string | null;
  tags?: string[] | string | null;
  respected_plan?: boolean | null;
  instrument?: string | null;
  direction?: string | null;
  size?: number | null;
  entry_price?: number | null;
  exit_price?: number | null;
};

type JournalTradeRow = {
  id?: string;
  user_id: string;
  account_id: string | null;
  journal_date: string;
  leg: "entry" | "exit";
  symbol: string;
  side?: string | null;
  premium?: string | null;
  price?: number | null;
  quantity?: number | null;
  time?: string | null;
  kind?: string | null;
  dte?: number | null;
  strategy?: string | null;
};

const CHECKLIST_ITEMS: ChecklistSnapshot = {
  premarket: [
    "News/events checked",
    "Key levels marked",
    "Bias & plan defined",
    "Risk & size set",
    "No‑trade conditions set",
  ],
  inside: [
    "Entry matched setup",
    "Stop placed immediately",
    "Position size respected",
    "Managed per plan",
    "No averaging down",
  ],
  after: [
    "Screenshots saved",
    "Journal updated",
    "Mistakes noted",
    "Lesson captured",
    "Next action defined",
  ],
  strategy: ["A+ setup", "R/R ≥ 2R", "Clear invalidation", "Followed plan", "Entry at level"],
  impulses: ["FOMO", "Revenge trade", "Chased price", "Overtrading", "Moved stop impulsively"],
  states: ["Calm", "Focused", "Confident", "Anxious", "Impatient", "Overconfident"],
};

const CHECKLIST_LABELS: Record<string, string> = {
  "News/events checked": "Noticias/eventos revisados",
  "Key levels marked": "Niveles clave marcados",
  "Bias & plan defined": "Sesgo y plan definidos",
  "Risk & size set": "Riesgo y tamaño definidos",
  "No‑trade conditions set": "Condiciones de no‑trade definidas",
  "Entry matched setup": "Entrada coincidió con el setup",
  "Stop placed immediately": "Stop colocado de inmediato",
  "Position size respected": "Tamaño de posición respetado",
  "Managed per plan": "Gestionado según el plan",
  "No averaging down": "Sin promediar en contra",
  "Screenshots saved": "Capturas guardadas",
  "Journal updated": "Journal actualizado",
  "Mistakes noted": "Errores anotados",
  "Lesson captured": "Lección capturada",
  "Next action defined": "Próxima acción definida",
  "A+ setup": "Setup A+",
  "R/R ≥ 2R": "R/B ≥ 2R",
  "Clear invalidation": "Invalidación clara",
  "Followed plan": "Plan seguido",
  "Entry at level": "Entrada en nivel",
  FOMO: "FOMO",
  "Revenge trade": "Trade de revancha",
  "Chased price": "Perseguí el precio",
  Overtrading: "Sobre‑trading",
  "Moved stop impulsively": "Moví el stop impulsivamente",
  Calm: "Calma",
  Focused: "Enfocado",
  Confident: "Confiado",
  Anxious: "Ansioso",
  Impatient: "Impaciente",
  Overconfident: "Sobreconfiado",
};

const AFTER_REVIEW_ITEMS = [
  { id: "followed_exit_plan", en: "Followed my exit plan", es: "Seguí mi plan de salida" },
  { id: "exit_at_level", en: "Exited at my planned level", es: "Salí en el nivel planificado" },
  { id: "exit_emotion", en: "Exited due to fear/anxiety", es: "Salí por miedo/ansiedad" },
  { id: "moved_stop_no_plan", en: "Moved stop without a plan", es: "Moví el stop sin plan" },
  { id: "let_winner_run", en: "Let the winner run as planned", es: "Dejé correr la ganancia según el plan" },
  { id: "partials_ok", en: "Managed partials correctly", es: "Manejé parciales correctamente" },
  { id: "size_ok", en: "Respected position size", es: "Respeté el tamaño de posición" },
  { id: "fomo_revenge", en: "FOMO or revenge present", es: "Hubo FOMO o revancha" },
  { id: "early_exit", en: "Exited early to lock profits", es: "Salí temprano para asegurar ganancias" },
  { id: "discipline_pressure", en: "Maintained discipline under pressure", es: "Mantuve disciplina bajo presión" },
];

const DEFAULT_MINDSET: MindsetRatings = {
  emotional_balance: 3,
  impulse_control: 3,
  setup_quality: 3,
  probability: 3,
};

const DEFAULT_AFTER_REVIEW: AfterTradeReview = {
  checklist: Object.fromEntries(AFTER_REVIEW_ITEMS.map((item) => [item.id, false])),
  ratings: { execution: 3, patience: 3, clarity: 3 },
  notes: { didWell: "", improve: "" },
};

const EMPTY_CHECKLISTS: ChecklistSnapshot = {
  premarket: [],
  inside: [],
  after: [],
  strategy: [],
  impulses: [],
  states: [],
};

const clampRating = (raw: any) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
};

const normalizeMindset = (raw?: any): MindsetRatings => ({
  emotional_balance: clampRating(raw?.emotional_balance) ?? DEFAULT_MINDSET.emotional_balance,
  impulse_control: clampRating(raw?.impulse_control) ?? DEFAULT_MINDSET.impulse_control,
  setup_quality: clampRating(raw?.setup_quality) ?? DEFAULT_MINDSET.setup_quality,
  probability: clampRating(raw?.probability) ?? DEFAULT_MINDSET.probability,
});

const normalizeAfterReview = (raw?: any): AfterTradeReview => {
  const checklist: Record<string, boolean> = { ...DEFAULT_AFTER_REVIEW.checklist };
  if (raw?.checklist && typeof raw.checklist === "object") {
    for (const item of AFTER_REVIEW_ITEMS) {
      if (item.id in raw.checklist) checklist[item.id] = !!raw.checklist[item.id];
    }
  }
  return {
    checklist,
    ratings: {
      execution: clampRating(raw?.ratings?.execution) ?? DEFAULT_AFTER_REVIEW.ratings.execution,
      patience: clampRating(raw?.ratings?.patience) ?? DEFAULT_AFTER_REVIEW.ratings.patience,
      clarity: clampRating(raw?.ratings?.clarity) ?? DEFAULT_AFTER_REVIEW.ratings.clarity,
    },
    notes: {
      didWell: typeof raw?.notes?.didWell === "string" ? raw.notes.didWell : DEFAULT_AFTER_REVIEW.notes.didWell,
      improve: typeof raw?.notes?.improve === "string" ? raw.notes.improve : DEFAULT_AFTER_REVIEW.notes.improve,
    },
  };
};

const normalizeChecklists = (raw?: any): ChecklistSnapshot => {
  const pick = (v: any) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  return {
    premarket: pick(raw?.premarket),
    inside: pick(raw?.inside),
    after: pick(raw?.after),
    strategy: pick(raw?.strategy),
    impulses: pick(raw?.impulses),
    states: pick(raw?.states),
  };
};

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(date: Date, lang: "en" | "es") {
  return date.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shiftDateSkippingSaturday(date: Date, delta: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  while (next.getDay() === 6) {
    next.setDate(next.getDate() + (delta >= 0 ? 1 : -1));
  }
  return next;
}

async function resolveActiveAccountId(userId: string): Promise<string | null> {
  if (!supabaseMobile || !userId) return null;
  const { data } = await supabaseMobile
    .from("user_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.active_account_id ?? null;
}

function parseNotes(notes?: string | null): NotesPayload {
  if (!notes || typeof notes !== "string") return {};
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object") return parsed as NotesPayload;
    return {};
  } catch {
    return { premarket: notes };
  }
}

export function JournalDateScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useSupabaseUser();
  const [date, setDate] = useState(() => new Date());
  const [premarket, setPremarket] = useState("");
  const [live, setLive] = useState("");
  const [post, setPost] = useState("");
  const [mindset, setMindset] = useState<MindsetRatings>(DEFAULT_MINDSET);
  const [checklists, setChecklists] = useState<ChecklistSnapshot>(EMPTY_CHECKLISTS);
  const [afterReview, setAfterReview] = useState<AfterTradeReview>(DEFAULT_AFTER_REVIEW);
  const [instrument, setInstrument] = useState("");
  const [direction, setDirection] = useState("");
  const [size, setSize] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [emotion, setEmotion] = useState("");
  const [respectedPlan, setRespectedPlan] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<{ net?: number; gross?: number; commissions?: number; fees?: number }>({});
  const [trades, setTrades] = useState<JournalTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const isoDate = toYmd(date);

  const checklistLabel = (item: string) =>
    language === "es" && CHECKLIST_LABELS[item] ? CHECKLIST_LABELS[item] : item;

  const toggleChecklistItem = (category: keyof ChecklistSnapshot, item: string) => {
    setChecklists((prev) => {
      const next = { ...prev };
      const list = new Set(next[category] ?? []);
      if (list.has(item)) list.delete(item);
      else list.add(item);
      next[category] = Array.from(list);
      return next;
    });
  };

  const toggleAfterReviewItem = (id: string) => {
    setAfterReview((prev) => ({
      ...prev,
      checklist: { ...prev.checklist, [id]: !prev.checklist[id] },
    }));
  };

  useEffect(() => {
    let active = true;

    async function loadNotes(isRefresh = false) {
      if (!isRefresh) setLoading(true);
      setError(null);
      setStatus(null);
      try {
        if (!supabaseMobile || !user?.id) return;
        const accountId = await resolveActiveAccountId(user.id);

        let entryQuery = supabaseMobile
          .from("journal_entries")
          .select("date, pnl, notes, emotion, tags, respected_plan, instrument, direction, size, entry_price, exit_price, account_id")
          .eq("user_id", user.id)
          .eq("date", isoDate);
        if (accountId) entryQuery = entryQuery.eq("account_id", accountId);
        const { data: entryData } = await entryQuery.maybeSingle();
        const entry = entryData as JournalEntryRow | null;
        const parsed = parseNotes(entry?.notes ?? "");

        let tradesQuery = supabaseMobile
          .from("journal_trades")
          .select("id, leg, symbol, side, premium, price, quantity, time, kind, dte, strategy, account_id")
          .eq("user_id", user.id)
          .eq("journal_date", isoDate)
          .order("time", { ascending: true });
        if (accountId) tradesQuery = tradesQuery.eq("account_id", accountId);
        const { data: tradeRows } = await tradesQuery;

        if (!active) return;
        const mindsetRaw = parsed.mindset ?? parsed.journal_mindset;
        const checklistsRaw = parsed.checklists ?? parsed.journal_checklists;
        const afterReviewRaw = parsed.after_review ?? parsed.journal_after_review;

        setPremarket(parsed.premarket ?? "");
        setLive(parsed.live ?? "");
        setPost(parsed.post ?? "");
        setMindset(normalizeMindset(mindsetRaw));
        setChecklists(normalizeChecklists(checklistsRaw));
        setAfterReview(normalizeAfterReview(afterReviewRaw));
        setInstrument(entry?.instrument ?? "");
        setDirection(entry?.direction ?? "");
        setSize(entry?.size != null ? String(entry.size) : "");
        setEntryPrice(entry?.entry_price != null ? String(entry.entry_price) : "");
        setExitPrice(entry?.exit_price != null ? String(entry.exit_price) : "");
        setEmotion(entry?.emotion ?? "");
        setRespectedPlan(typeof entry?.respected_plan === "boolean" ? entry.respected_plan : null);
        setSummary({
          net: parsed.pnl?.net ?? entry?.pnl ?? undefined,
          gross: parsed.pnl?.gross,
          commissions: parsed.costs?.commissions,
          fees: parsed.costs?.fees,
        });
        if (Array.isArray(tradeRows) && tradeRows.length > 0) {
          setTrades(tradeRows as JournalTradeRow[]);
        } else {
          const fallbackTrades = [
            ...(parsed.entries || []).map((t: any) => ({
              leg: "entry",
              symbol: String(t.symbol ?? ""),
              side: t.side ?? null,
              premium: t.premium ?? null,
              price: t.price ?? null,
              quantity: t.quantity ?? null,
              time: t.time ?? null,
              kind: t.kind ?? null,
            })),
            ...(parsed.exits || []).map((t: any) => ({
              leg: "exit",
              symbol: String(t.symbol ?? ""),
              side: t.side ?? null,
              premium: t.premium ?? null,
              price: t.price ?? null,
              quantity: t.quantity ?? null,
              time: t.time ?? null,
              kind: t.kind ?? null,
            })),
          ].filter((t) => t.symbol);
          setTrades(fallbackTrades as JournalTradeRow[]);
        }
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load journal.");
      } finally {
        if (!active) return;
        if (!isRefresh) setLoading(false);
      }
    }

    loadNotes();
    return () => {
      active = false;
    };
  }, [isoDate]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      if (!supabaseMobile || !user?.id) return;
      const accountId = await resolveActiveAccountId(user.id);
      let entryQuery = supabaseMobile
        .from("journal_entries")
        .select("date, pnl, notes, emotion, tags, respected_plan, instrument, direction, size, entry_price, exit_price, account_id")
        .eq("user_id", user.id)
        .eq("date", isoDate);
      if (accountId) entryQuery = entryQuery.eq("account_id", accountId);
      const { data: entryData } = await entryQuery.maybeSingle();
      const entry = entryData as JournalEntryRow | null;
      const parsed = parseNotes(entry?.notes ?? "");

      let tradesQuery = supabaseMobile
        .from("journal_trades")
        .select("id, leg, symbol, side, premium, price, quantity, time, kind, dte, strategy, account_id")
        .eq("user_id", user.id)
        .eq("journal_date", isoDate)
        .order("time", { ascending: true });
      if (accountId) tradesQuery = tradesQuery.eq("account_id", accountId);
      const { data: tradeRows } = await tradesQuery;

      const mindsetRaw = parsed.mindset ?? parsed.journal_mindset;
      const checklistsRaw = parsed.checklists ?? parsed.journal_checklists;
      const afterReviewRaw = parsed.after_review ?? parsed.journal_after_review;

      setPremarket(parsed.premarket ?? "");
      setLive(parsed.live ?? "");
      setPost(parsed.post ?? "");
      setMindset(normalizeMindset(mindsetRaw));
      setChecklists(normalizeChecklists(checklistsRaw));
      setAfterReview(normalizeAfterReview(afterReviewRaw));
      setInstrument(entry?.instrument ?? "");
      setDirection(entry?.direction ?? "");
      setSize(entry?.size != null ? String(entry.size) : "");
      setEntryPrice(entry?.entry_price != null ? String(entry.entry_price) : "");
      setExitPrice(entry?.exit_price != null ? String(entry.exit_price) : "");
      setEmotion(entry?.emotion ?? "");
      setRespectedPlan(typeof entry?.respected_plan === "boolean" ? entry.respected_plan : null);
      setSummary({
        net: parsed.pnl?.net ?? entry?.pnl ?? undefined,
        gross: parsed.pnl?.gross,
        commissions: parsed.costs?.commissions,
        fees: parsed.costs?.fees,
      });
      if (Array.isArray(tradeRows) && tradeRows.length > 0) {
        setTrades(tradeRows as JournalTradeRow[]);
      } else {
        const fallbackTrades = [
          ...(parsed.entries || []).map((t: any) => ({
            leg: "entry",
            symbol: String(t.symbol ?? ""),
            side: t.side ?? null,
            premium: t.premium ?? null,
            price: t.price ?? null,
            quantity: t.quantity ?? null,
            time: t.time ?? null,
            kind: t.kind ?? null,
          })),
          ...(parsed.exits || []).map((t: any) => ({
            leg: "exit",
            symbol: String(t.symbol ?? ""),
            side: t.side ?? null,
            premium: t.premium ?? null,
            price: t.price ?? null,
            quantity: t.quantity ?? null,
            time: t.time ?? null,
            kind: t.kind ?? null,
          })),
        ].filter((t) => t.symbol);
        setTrades(fallbackTrades as JournalTradeRow[]);
      }
      setStatus(null);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load journal.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      if (!supabaseMobile || !user?.id) return;
      const accountId = await resolveActiveAccountId(user.id);
      let entryQuery = supabaseMobile
        .from("journal_entries")
        .select("notes")
        .eq("user_id", user.id)
        .eq("date", isoDate);
      if (accountId) entryQuery = entryQuery.eq("account_id", accountId);
      const { data: entryData } = await entryQuery.maybeSingle();
      const existingNotes = parseNotes((entryData as any)?.notes ?? "");
      const toNumOrNull = (value: string) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return n;
      };
      const nextNotes = JSON.stringify({
        ...existingNotes,
        premarket,
        live,
        post,
        mindset,
        checklists,
        after_review: afterReview,
      });
      const entryPatch = {
        notes: nextNotes,
        updated_at: new Date().toISOString(),
        emotion: emotion.trim() ? emotion.trim() : null,
        instrument: instrument.trim() ? instrument.trim() : null,
        direction: direction.trim() ? direction.trim() : null,
        size: toNumOrNull(size),
        entry_price: toNumOrNull(entryPrice),
        exit_price: toNumOrNull(exitPrice),
        respected_plan: respectedPlan === null ? null : respectedPlan,
      };

      if (!entryData) {
        const { error: insErr } = await supabaseMobile
          .from("journal_entries")
          .insert({
            user_id: user.id,
            account_id: accountId ?? null,
            date: isoDate,
            notes: nextNotes,
            emotion: entryPatch.emotion,
            instrument: entryPatch.instrument,
            direction: entryPatch.direction,
            size: entryPatch.size,
            entry_price: entryPatch.entry_price,
            exit_price: entryPatch.exit_price,
            respected_plan: entryPatch.respected_plan,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        if (insErr) throw insErr;
      } else {
        let updQuery = supabaseMobile
          .from("journal_entries")
          .update(entryPatch)
          .eq("user_id", user.id)
          .eq("date", isoDate);
        if (accountId) updQuery = updQuery.eq("account_id", accountId);
        const { error: updErr } = await updQuery;
        if (updErr) throw updErr;
      }
      setStatus(t(language, "Saved", "Guardado"));
    } catch (err: any) {
      setError(err?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenScaffold
      title={t(language, "Journal date", "Journal por fecha")}
      subtitle={t(
        language,
        "Fill your journal on mobile. CSV imports remain on the web.",
        "Llena tu journal en móvil. El CSV se importa en la web."
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      <View style={styles.dateRow}>
        <Pressable style={styles.dateButton} onPress={() => setDate((d) => shiftDateSkippingSaturday(d, -1))}>
          <Text style={styles.dateButtonText}>←</Text>
        </Pressable>
        <View style={styles.dateCard}>
          <Text style={styles.dateLabel}>{formatDateLabel(date, language)}</Text>
          <Text style={styles.dateSub}>{isoDate}</Text>
        </View>
        <Pressable style={styles.dateButton} onPress={() => setDate((d) => shiftDateSkippingSaturday(d, 1))}>
          <Text style={styles.dateButtonText}>→</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading journal…", "Cargando journal…")}</Text>
        </View>
      ) : (
        <>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {status ? <Text style={styles.statusText}>{status}</Text> : null}
          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>{t(language, "Day summary", "Resumen del día")}</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t(language, "Net P&L", "P&L neto")}</Text>
                <Text style={styles.summaryValue}>{summary.net ?? "—"}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t(language, "Gross", "Bruto")}</Text>
                <Text style={styles.summaryValue}>{summary.gross ?? "—"}</Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t(language, "Commissions", "Comisiones")}</Text>
                <Text style={styles.summaryValue}>{summary.commissions ?? "—"}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t(language, "Fees", "Fees")}</Text>
                <Text style={styles.summaryValue}>{summary.fees ?? "—"}</Text>
              </View>
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t(language, "Trades", "Trades")}</Text>
            {trades.length === 0 ? (
              <Text style={styles.sectionHint}>
                {t(language, "No trades recorded for this date.", "No hay trades en esta fecha.")}
              </Text>
            ) : (
              <View style={styles.tradeList}>
                {trades.map((trade, idx) => (
                  <View key={`${trade.leg}-${trade.symbol}-${idx}`} style={styles.tradeCard}>
                    <Text style={styles.tradeTitle}>
                      {trade.leg === "entry" ? t(language, "Entry", "Entrada") : t(language, "Exit", "Salida")} ·{" "}
                      {trade.symbol}
                    </Text>
                    <Text style={styles.tradeMeta}>
                      {trade.side ?? "—"} · {trade.quantity ?? "—"} @ {trade.price ?? "—"} · {trade.time ?? "—"}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t(language, "Trade context", "Contexto del trade")}</Text>
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t(language, "Instrument", "Instrumento")}</Text>
                <TextInput
                  style={styles.input}
                  value={instrument}
                  onChangeText={setInstrument}
                  placeholder={t(language, "Symbol / market", "Símbolo / mercado")}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t(language, "Direction", "Dirección")}</Text>
                <TextInput
                  style={styles.input}
                  value={direction}
                  onChangeText={setDirection}
                  placeholder={t(language, "Long / Short", "Long / Short")}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t(language, "Size", "Tamaño")}</Text>
                <TextInput
                  style={styles.input}
                  value={size}
                  onChangeText={setSize}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t(language, "Entry price", "Precio entrada")}</Text>
                <TextInput
                  style={styles.input}
                  value={entryPrice}
                  onChangeText={setEntryPrice}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t(language, "Exit price", "Precio salida")}</Text>
                <TextInput
                  style={styles.input}
                  value={exitPrice}
                  onChangeText={setExitPrice}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t(language, "Emotion", "Emoción")}</Text>
                <TextInput
                  style={styles.input}
                  value={emotion}
                  onChangeText={setEmotion}
                  placeholder={t(language, "Calm, anxious, etc.", "Calma, ansiedad, etc.")}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t(language, "Respected plan", "Respetó el plan")}</Text>
                <View style={styles.toggleGroup}>
                  <Pressable
                    style={[styles.toggleChip, respectedPlan === true && styles.toggleChipActive]}
                    onPress={() => setRespectedPlan(true)}
                  >
                    <Text style={[styles.toggleText, respectedPlan === true && styles.toggleTextActive]}>
                      {t(language, "Yes", "Sí")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.toggleChip, respectedPlan === false && styles.toggleChipActive]}
                    onPress={() => setRespectedPlan(false)}
                  >
                    <Text style={[styles.toggleText, respectedPlan === false && styles.toggleTextActive]}>
                      {t(language, "No", "No")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t(language, "Premarket", "Premarket")}</Text>
            <TextInput
              style={styles.textarea}
              placeholder={t(language, "Premarket plan, bias, levels…", "Plan premarket, sesgo, niveles…")}
              placeholderTextColor={colors.textMuted}
              value={premarket}
              onChangeText={setPremarket}
              multiline
            />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t(language, "Inside trade", "Inside trade")}</Text>
            <TextInput
              style={styles.textarea}
              placeholder={t(language, "Notes during the trade…", "Notas durante el trade…")}
              placeholderTextColor={colors.textMuted}
              value={live}
              onChangeText={setLive}
              multiline
            />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t(language, "After trade", "After trade")}</Text>
            <TextInput
              style={styles.textarea}
              placeholder={t(language, "Post‑trade review…", "Revisión post‑trade…")}
              placeholderTextColor={colors.textMuted}
              value={post}
              onChangeText={setPost}
              multiline
            />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t(language, "Mindset ratings", "Mindset")}</Text>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t(language, "Emotional balance", "Balance emocional")}</Text>
              <View style={styles.ratingChips}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <Pressable
                    key={`mind-em-${v}`}
                    style={[styles.ratingChip, mindset.emotional_balance === v && styles.ratingChipActive]}
                    onPress={() => setMindset((prev) => ({ ...prev, emotional_balance: v }))}
                  >
                    <Text style={[styles.ratingChipText, mindset.emotional_balance === v && styles.ratingChipTextActive]}>
                      {v}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t(language, "Impulse control", "Control de impulso")}</Text>
              <View style={styles.ratingChips}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <Pressable
                    key={`mind-im-${v}`}
                    style={[styles.ratingChip, mindset.impulse_control === v && styles.ratingChipActive]}
                    onPress={() => setMindset((prev) => ({ ...prev, impulse_control: v }))}
                  >
                    <Text style={[styles.ratingChipText, mindset.impulse_control === v && styles.ratingChipTextActive]}>
                      {v}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t(language, "Setup quality", "Calidad del setup")}</Text>
              <View style={styles.ratingChips}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <Pressable
                    key={`mind-sq-${v}`}
                    style={[styles.ratingChip, mindset.setup_quality === v && styles.ratingChipActive]}
                    onPress={() => setMindset((prev) => ({ ...prev, setup_quality: v }))}
                  >
                    <Text style={[styles.ratingChipText, mindset.setup_quality === v && styles.ratingChipTextActive]}>
                      {v}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t(language, "Probability", "Probabilidad")}</Text>
              <View style={styles.ratingChips}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <Pressable
                    key={`mind-pr-${v}`}
                    style={[styles.ratingChip, mindset.probability === v && styles.ratingChipActive]}
                    onPress={() => setMindset((prev) => ({ ...prev, probability: v }))}
                  >
                    <Text style={[styles.ratingChipText, mindset.probability === v && styles.ratingChipTextActive]}>
                      {v}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t(language, "Checklists", "Checklists")}</Text>
            {(["premarket", "inside", "after"] as const).map((phase) => (
              <View key={phase} style={styles.checklistBlock}>
                <Text style={styles.checklistTitle}>
                  {phase === "premarket"
                    ? t(language, "Premarket checklist", "Checklist premarket")
                    : phase === "inside"
                    ? t(language, "In‑trade checklist", "Checklist en trade")
                    : t(language, "After‑trade checklist", "Checklist post‑trade")}
                </Text>
                {CHECKLIST_ITEMS[phase].map((item) => {
                  const selected = checklists[phase].includes(item);
                  return (
                    <Pressable
                      key={`${phase}-${item}`}
                      style={[styles.checkItem, selected && styles.checkItemActive]}
                      onPress={() => toggleChecklistItem(phase, item)}
                    >
                      <Text style={[styles.checkItemText, selected && styles.checkItemTextActive]}>
                        {selected ? "✓ " : ""}{checklistLabel(item)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={styles.checklistBlock}>
              <Text style={styles.checklistTitle}>{t(language, "Strategy filters", "Filtro de estrategia")}</Text>
              {CHECKLIST_ITEMS.strategy.map((item) => {
                const selected = checklists.strategy.includes(item);
                return (
                  <Pressable
                    key={`strategy-${item}`}
                    style={[styles.checkItem, selected && styles.checkItemActive]}
                    onPress={() => toggleChecklistItem("strategy", item)}
                  >
                    <Text style={[styles.checkItemText, selected && styles.checkItemTextActive]}>
                      {selected ? "✓ " : ""}{checklistLabel(item)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.checklistBlock}>
              <Text style={styles.checklistTitle}>{t(language, "Impulses", "Impulsos")}</Text>
              {CHECKLIST_ITEMS.impulses.map((item) => {
                const selected = checklists.impulses.includes(item);
                return (
                  <Pressable
                    key={`impulse-${item}`}
                    style={[styles.checkItem, selected && styles.checkItemActive]}
                    onPress={() => toggleChecklistItem("impulses", item)}
                  >
                    <Text style={[styles.checkItemText, selected && styles.checkItemTextActive]}>
                      {selected ? "✓ " : ""}{checklistLabel(item)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.checklistBlock}>
              <Text style={styles.checklistTitle}>{t(language, "States", "Estados")}</Text>
              {CHECKLIST_ITEMS.states.map((item) => {
                const selected = checklists.states.includes(item);
                return (
                  <Pressable
                    key={`state-${item}`}
                    style={[styles.checkItem, selected && styles.checkItemActive]}
                    onPress={() => toggleChecklistItem("states", item)}
                  >
                    <Text style={[styles.checkItemText, selected && styles.checkItemTextActive]}>
                      {selected ? "✓ " : ""}{checklistLabel(item)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t(language, "After‑trade review", "Revisión post‑trade")}</Text>
            {AFTER_REVIEW_ITEMS.map((item) => {
              const selected = afterReview.checklist[item.id];
              return (
                <Pressable
                  key={`after-${item.id}`}
                  style={[styles.checkItem, selected && styles.checkItemActive]}
                  onPress={() => toggleAfterReviewItem(item.id)}
                >
                  <Text style={[styles.checkItemText, selected && styles.checkItemTextActive]}>
                    {selected ? "✓ " : ""}{t(language, item.en, item.es)}
                  </Text>
                </Pressable>
              );
            })}
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t(language, "Execution", "Ejecución")}</Text>
              <View style={styles.ratingChips}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <Pressable
                    key={`after-ex-${v}`}
                    style={[styles.ratingChip, afterReview.ratings.execution === v && styles.ratingChipActive]}
                    onPress={() =>
                      setAfterReview((prev) => ({ ...prev, ratings: { ...prev.ratings, execution: v } }))
                    }
                  >
                    <Text style={[styles.ratingChipText, afterReview.ratings.execution === v && styles.ratingChipTextActive]}>
                      {v}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t(language, "Patience", "Paciencia")}</Text>
              <View style={styles.ratingChips}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <Pressable
                    key={`after-pa-${v}`}
                    style={[styles.ratingChip, afterReview.ratings.patience === v && styles.ratingChipActive]}
                    onPress={() => setAfterReview((prev) => ({ ...prev, ratings: { ...prev.ratings, patience: v } }))}
                  >
                    <Text style={[styles.ratingChipText, afterReview.ratings.patience === v && styles.ratingChipTextActive]}>
                      {v}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t(language, "Clarity", "Claridad")}</Text>
              <View style={styles.ratingChips}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <Pressable
                    key={`after-cl-${v}`}
                    style={[styles.ratingChip, afterReview.ratings.clarity === v && styles.ratingChipActive]}
                    onPress={() => setAfterReview((prev) => ({ ...prev, ratings: { ...prev.ratings, clarity: v } }))}
                  >
                    <Text style={[styles.ratingChipText, afterReview.ratings.clarity === v && styles.ratingChipTextActive]}>
                      {v}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Text style={styles.fieldLabel}>{t(language, "Did well", "Lo que hice bien")}</Text>
            <TextInput
              style={styles.textarea}
              placeholder={t(language, "What went well?", "¿Qué salió bien?")}
              placeholderTextColor={colors.textMuted}
              value={afterReview.notes.didWell}
              onChangeText={(value) => setAfterReview((prev) => ({ ...prev, notes: { ...prev.notes, didWell: value } }))}
              multiline
            />
            <Text style={styles.fieldLabel}>{t(language, "Improve", "Mejorar")}</Text>
            <TextInput
              style={styles.textarea}
              placeholder={t(language, "What will you improve?", "¿Qué mejorarás?")}
              placeholderTextColor={colors.textMuted}
              value={afterReview.notes.improve}
              onChangeText={(value) => setAfterReview((prev) => ({ ...prev, notes: { ...prev.notes, improve: value } }))}
              multiline
            />
          </View>
          <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave}>
            <Text style={styles.saveButtonText}>
              {saving ? t(language, "Saving…", "Guardando…") : t(language, "Save journal", "Guardar journal")}
            </Text>
          </Pressable>
        </>
      )}
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    dateButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    dateButtonText: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    dateCard: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: "center",
      gap: 2,
    },
    dateLabel: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
    },
    dateSub: {
      color: colors.textMuted,
      fontSize: 12,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    summaryCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 10,
    },
    summaryRow: {
      flexDirection: "row",
      gap: 8,
    },
    summaryItem: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 4,
    },
    summaryLabel: {
      color: colors.textMuted,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    summaryValue: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
    },
    fieldRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    field: {
      flexGrow: 1,
      flexBasis: "45%",
      gap: 6,
    },
    fieldLabel: {
      color: colors.textMuted,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    input: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 13,
    },
    tradeList: {
      gap: 8,
    },
    tradeCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 4,
    },
    tradeTitle: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
    tradeMeta: {
      color: colors.textMuted,
      fontSize: 12,
    },
    sectionHint: {
      color: colors.textMuted,
      fontSize: 12,
    },
    section: {
      gap: 6,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    textarea: {
      minHeight: 120,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      textAlignVertical: "top",
    },
    toggleGroup: {
      flexDirection: "row",
      gap: 8,
      marginTop: 4,
    },
    toggleChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.surface,
    },
    toggleChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
    },
    toggleText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    toggleTextActive: {
      color: colors.textPrimary,
    },
    ratingRow: {
      gap: 8,
    },
    ratingLabel: {
      color: colors.textMuted,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    ratingChips: {
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
    },
    ratingChip: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: 32,
      alignItems: "center",
    },
    ratingChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.infoSoft,
    },
    ratingChipText: {
      color: colors.textMuted,
      fontWeight: "700",
      fontSize: 12,
    },
    ratingChipTextActive: {
      color: colors.textPrimary,
    },
    checklistBlock: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 6,
    },
    checklistTitle: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 4,
    },
    checkItem: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: colors.card,
    },
    checkItemActive: {
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
    },
    checkItemText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    checkItemTextActive: {
      color: colors.textPrimary,
      fontWeight: "600",
    },
    saveButton: {
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      paddingVertical: 12,
      marginTop: 6,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
    },
    statusText: {
      color: colors.success,
      fontSize: 12,
      fontWeight: "600",
    },
  });
