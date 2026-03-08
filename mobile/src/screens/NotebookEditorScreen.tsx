import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRoute } from "@react-navigation/native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { InkField } from "../components/InkField";
import type { InkDrawing } from "../components/inkTypes";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { apiGet } from "../lib/api";

const PAGES_TABLE = "ntj_notebook_pages";
const FREE_NOTES_TABLE = "ntj_notebook_free_notes";

type RouteParams = {
  kind: "page" | "free";
  id: string;
  title?: string;
};

type NotebookInkPayload = {
  mode?: "text" | "ink";
  drawing?: InkDrawing | null;
};

type AccountsResponse = {
  activeAccountId: string | null;
};

async function fetchActiveAccountId(): Promise<string | null> {
  try {
    const res = await apiGet<AccountsResponse>("/api/trading-accounts/list");
    return res.activeAccountId ?? null;
  } catch {
    return null;
  }
}

export function NotebookEditorScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useSupabaseUser();
  const route = useRoute<any>();
  const { kind, id, title } = (route?.params ?? {}) as RouteParams;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"text" | "ink">("text");
  const [ink, setInk] = useState<InkDrawing | null>(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!supabaseMobile || !user?.id || !kind || !id) return;
      setLoading(true);
      setError(null);
      try {
        const accountId = await fetchActiveAccountId();

        if (kind === "page") {
          let query = supabaseMobile
            .from(PAGES_TABLE)
            .select("id, content, ink, account_id")
            .eq("id", id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (accountId) query = query.eq("account_id", accountId);
          const { data } = await query;
          if (!active) return;
          const inkPayload = (data as any)?.ink as NotebookInkPayload | null;
          setContent((data as any)?.content ?? "");
          setMode(inkPayload?.mode === "ink" ? "ink" : "text");
          setInk(inkPayload?.drawing ?? null);
        } else {
          let query = supabaseMobile
            .from(FREE_NOTES_TABLE)
            .select("entry_date, content, ink, account_id")
            .eq("entry_date", id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (accountId) query = query.eq("account_id", accountId);
          const { data } = await query;
          if (!active) return;
          const inkPayload = (data as any)?.ink as NotebookInkPayload | null;
          setContent((data as any)?.content ?? "");
          setMode(inkPayload?.mode === "ink" ? "ink" : "text");
          setInk(inkPayload?.drawing ?? null);
        }
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load notebook.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [kind, id, user?.id]);

  async function handleSave() {
    if (!supabaseMobile || !user?.id || !kind || !id) return;
    setSaving(true);
    setError(null);
    try {
      const accountId = await fetchActiveAccountId();
      const inkPayload: NotebookInkPayload = {
        mode,
        drawing: mode === "ink" ? ink : null,
      };

      if (kind === "page") {
        let query = supabaseMobile
          .from(PAGES_TABLE)
          .update({
            content,
            ink: inkPayload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", user.id);
        if (accountId) query = query.eq("account_id", accountId);
        const { error: updateErr } = await query;
        if (updateErr) throw updateErr;
      } else {
        let query = supabaseMobile
          .from(FREE_NOTES_TABLE)
          .update({
            content,
            ink: inkPayload,
            updated_at: new Date().toISOString(),
          })
          .eq("entry_date", id)
          .eq("user_id", user.id);
        if (accountId) query = query.eq("account_id", accountId);
        const { error: updateErr } = await query;
        if (updateErr) throw updateErr;
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenScaffold
      title={title ?? t(language, "Notebook entry", "Nota")}
      subtitle={t(
        language,
        "Write with text or ink. Ink saves as strokes.",
        "Escribe con texto o tinta. La tinta se guarda como trazos."
      )}
      scrollable
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading…", "Cargando…")}</Text>
        </View>
      ) : (
        <>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <InkField
            label={t(language, "Notebook", "Notebook")}
            mode={mode}
            onModeChange={setMode}
            textValue={content}
            onTextChange={setContent}
            inkValue={ink}
            onInkChange={setInk}
            placeholder={t(language, "Write your note…", "Escribe tu nota…")}
            height={320}
          />
          <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave}>
            <Text style={styles.saveButtonText}>
              {saving ? t(language, "Saving…", "Guardando…") : t(language, "Save note", "Guardar nota")}
            </Text>
          </Pressable>
        </>
      )}
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
    },
    saveButton: {
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      paddingVertical: 12,
      marginTop: 10,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
  });
